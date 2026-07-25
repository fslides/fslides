'use strict';

// fslides gateway — api.fslides.dev
//
// The single server-side component in the fslides architecture. Decks stay
// static (GitHub Pages, S3, anywhere); this worker only brokers identity:
//
//   GET /auth/login?origin=<deck-origin>   → redirect to GitHub App authorize
//   GET /auth/callback?code&state          → exchange code, hand the token to
//                                            the opener window via postMessage
//   GET /healthz                           → ok
//
// The player opens /auth/login in a popup. After GitHub authorizes, the
// callback page posts { type: 'fslides-auth', token, expiresAt } to the deck
// window and closes itself. The player then talks to api.github.com directly
// (CORS-open) with the user-to-server token — comments read/write with the
// user's identity, scoped by the GitHub App's issues-only permission and its
// per-repo installations. No token ever persists server-side.
//
// Secrets (wrangler secret put …): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
// Optional var: ALLOWED_ORIGIN_SUFFIXES (comma-separated, e.g. ".github.io,localhost")

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
const NO_STORE = { 'Cache-Control': 'no-store' };

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signState(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return body + '.' + sig;
}

async function verifyState(state, secret) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expect = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  if (expect !== sig) return null;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (json.exp < Date.now()) return null;
    return json;
  } catch (_) { return null; }
}

function originAllowed(origin, env) {
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname; } catch (_) { return false; }
  const suffixes = (env.ALLOWED_ORIGIN_SUFFIXES || '.github.io,localhost,127.0.0.1')
    .split(',').map(s => s.trim()).filter(Boolean);
  return suffixes.some(sfx => host === sfx.replace(/^\./, '') || host.endsWith(sfx));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname === '/auth/login' || url.pathname === '/auth/install') {
      const origin = url.searchParams.get('origin') || '';
      if (!originAllowed(origin, env)) {
        return new Response('Origin not allowed', { status: 400, headers: NO_STORE });
      }
      const state = await signState({ origin, exp: Date.now() + 10 * 60 * 1000 }, env.GITHUB_CLIENT_SECRET);
      let gh;
      if (url.pathname === '/auth/install') {
        // Installation flow doubles as sign-up: the user installs the app
        // (choosing repos or "all"), and because the app requests OAuth
        // during installation, GitHub authorizes them in the same flow and
        // returns to our callback with a code — install + sign-in in one.
        gh = new URL('https://github.com/apps/' + (env.APP_SLUG || 'fslides') + '/installations/new');
        gh.searchParams.set('state', state);
      } else {
        gh = new URL('https://github.com/login/oauth/authorize');
        gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
        gh.searchParams.set('state', state);
      }
      return Response.redirect(gh.toString(), 302);
    }

    if (url.pathname === '/auth/callback') {
      const code  = url.searchParams.get('code');
      const state = await verifyState(url.searchParams.get('state'), env.GITHUB_CLIENT_SECRET);
      if (!code || !state) {
        return new Response('Invalid or expired auth state', { status: 400, headers: NO_STORE });
      }
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await r.json();
      if (!data.access_token) {
        return new Response('Token exchange failed: ' + (data.error_description || data.error || 'unknown'), { status: 502, headers: NO_STORE });
      }
      const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 8 * 3600 * 1000;

      // Hand the token to the deck window and close. postMessage is pinned to
      // the exact origin that initiated login (signed into state).
      const page = `<!DOCTYPE html><html><body style="background:#111318;color:#9aa;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>Signed in — returning to your deck…</p>
<script>
  (function () {
    var msg = { type: 'fslides-auth', token: ${JSON.stringify(data.access_token)}, expiresAt: ${expiresAt} };
    if (window.opener) {
      window.opener.postMessage(msg, ${JSON.stringify(state.origin)});
      setTimeout(function () { window.close(); }, 400);
    } else {
      document.body.innerHTML = '<p>Return to your deck and try again.</p>';
    }
  })();
</script></body></html>`;
      return new Response(page, { status: 200, headers: HTML_HEADERS });
    }

    // ── hosted decks: PUT /publish/{owner}/{repo}/{path…} ──
    // Local: Authorization: Bearer <gh token> — gateway verifies push access.
    // CI:    Authorization: Bearer <Actions OIDC JWT (aud=fslides.dev)> —
    //        gateway verifies the signature and the repository claim.
    if (url.pathname.startsWith('/publish/') && request.method === 'PUT') {
      const parts = url.pathname.slice('/publish/'.length).split('/');
      const owner = parts.shift(), repo = parts.shift();
      const key = parts.join('/');
      if (!owner || !repo || !key || key.includes('..')) {
        return new Response('Bad path', { status: 400, headers: NO_STORE });
      }
      const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!auth) return new Response('Missing token', { status: 401, headers: NO_STORE });

      // launch posture: hosted decks are allowlist-only (env PUBLISHERS,
      // comma-separated owners; '*' opens it up — pair with quotas first)
      const publishers = (env.PUBLISHERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (!publishers.includes('*') && !publishers.includes(owner.toLowerCase())) {
        return new Response('Hosted decks are invite-only for now — ask at https://github.com/fslides/fslides/issues', { status: 403, headers: NO_STORE });
      }

      // per-file cap: fits narration video, blocks bulk dumping
      const len = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (!len || len > 100 * 1024 * 1024) {
        return new Response('File too large (100MB max per file)', { status: 413, headers: NO_STORE });
      }

      const allowed = await canPublish(auth, owner, repo);
      if (!allowed) return new Response('Not authorized for ' + owner + '/' + repo, { status: 403, headers: NO_STORE });

      const ct = request.headers.get('Content-Type') || 'application/octet-stream';
      await env.DECKS.put(`${owner}/${repo}/${key}`.toLowerCase(), request.body, {
        httpMetadata: { contentType: ct, cacheControl: 'public, max-age=60' },
      });
      return new Response(JSON.stringify({ ok: true, url: `https://decks.fslides.dev/${owner}/${repo}/${key}` }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...NO_STORE },
      });
    }

    return new Response('fslides gateway — see https://github.com/fslides/fslides', { status: 404 });
  },
};

// push-verified GitHub token OR verified Actions OIDC for owner/repo
async function canPublish(token, owner, repo) {
  // Actions OIDC JWTs have two dots and a decodable header
  if (token.split('.').length === 3) {
    try {
      const claims = await verifyActionsOIDC(token);
      return claims && String(claims.repository).toLowerCase() === (owner + '/' + repo).toLowerCase();
    } catch (_) { return false; }
  }
  // plain GitHub token: must see the repo with push permission
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'fslides-gateway' },
    });
    if (!r.ok) return false;
    const data = await r.json();
    return !!(data.permissions && (data.permissions.push || data.permissions.admin));
  } catch (_) { return false; }
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function verifyActionsOIDC(jwt) {
  const [h, p, sig] = jwt.split('.');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  if (claims.iss !== 'https://token.actions.githubusercontent.com') return null;
  if (claims.aud !== 'fslides.dev') return null;
  if (claims.exp * 1000 < Date.now()) return null;

  const jwks = await (await fetch('https://token.actions.githubusercontent.com/.well-known/jwks')).json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64urlToBytes(sig),
    new TextEncoder().encode(h + '.' + p));
  return ok ? claims : null;
}
