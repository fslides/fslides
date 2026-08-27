'use strict';

// fslides gateway — api.fslides.dev
//
// The single server-side component in the fslides architecture. Decks stay
// static (GitHub Pages, S3, anywhere); this worker only brokers identity:
//
//   GET /auth/login?origin=<deck-origin>           → redirect to GitHub App authorize
//   GET /auth/login?flow=oauth&origin=<deck-origin> → redirect to OAuth App (repo scope)
//   GET /auth/callback?code&state                  → exchange code, hand the token to
//                                                    the opener window via postMessage
//   GET /healthz                                   → ok
//
// Two flows:
//   default (GitHub App) — issues:write only; used for comments on public decks.
//   flow=oauth (OAuth App) — repo:read; used for one-click private-deck sign-in.
//     Classic tokens don't expire; expiresAt sent as Date.now()+30d.
//     Requires OAUTH_CLIENT_ID var + OAUTH_CLIENT_SECRET secret.
//     Missing → /auth/login?flow=oauth returns 503 'oauth tier not configured'.
//
// Secrets (wrangler secret put …): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
//                                   OAUTH_CLIENT_SECRET
// Vars: OAUTH_CLIENT_ID (placeholder; set in wrangler.toml or dashboard)
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
      return new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (url.pathname === '/auth/login' || url.pathname === '/auth/install') {
      const origin = url.searchParams.get('origin') || '';
      const flow   = url.searchParams.get('flow')   || '';
      if (!originAllowed(origin, env)) {
        return new Response('Origin not allowed', { status: 400, headers: NO_STORE });
      }

      // OAuth App flow: classic repo-scope token, one-click for personal/non-enterprise.
      if (flow === 'oauth') {
        // Enterprise hard-off: DISABLE_OAUTH=1 removes the broad-scope tier
        // entirely — the gateway then only ever brokers the GitHub App flow
        // (issues-only, expiring user tokens).
        if (env.DISABLE_OAUTH) {
          return new Response('oauth tier disabled', { status: 404, headers: NO_STORE });
        }
        if (!env.OAUTH_CLIENT_ID) {
          return new Response('oauth tier not configured', { status: 503, headers: NO_STORE });
        }
        const state = await signState({ origin, flow: 'oauth', exp: Date.now() + 10 * 60 * 1000 }, env.GITHUB_CLIENT_SECRET);
        const gh = new URL('https://github.com/login/oauth/authorize');
        gh.searchParams.set('client_id', env.OAUTH_CLIENT_ID);
        gh.searchParams.set('scope', 'repo');
        gh.searchParams.set('state', state);
        return new Response(null, { status: 302, headers: { 'Location': gh.toString(), 'Cache-Control': 'no-store' } });
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
      return new Response(null, { status: 302, headers: { 'Location': gh.toString(), 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/auth/callback') {
      const code  = url.searchParams.get('code');
      const state = await verifyState(url.searchParams.get('state'), env.GITHUB_CLIENT_SECRET);
      if (!code || !state) {
        return new Response('Invalid or expired auth state', { status: 400, headers: NO_STORE });
      }
      const isOAuthFlow = state.flow === 'oauth';
      const clientId     = isOAuthFlow ? env.OAUTH_CLIENT_ID     : env.GITHUB_CLIENT_ID;
      const clientSecret = isOAuthFlow ? env.OAUTH_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const data = await r.json();
      if (!data.access_token) {
        return new Response('Token exchange failed: ' + (data.error_description || data.error || 'unknown'), { status: 502, headers: NO_STORE });
      }
      // Classic OAuth App tokens don't expire — treat as 30 days for cookie/storage purposes.
      // GitHub App tokens carry expires_in; default to 8 h if absent.
      const expiresAt = isOAuthFlow
        ? Date.now() + 30 * 24 * 3600 * 1000
        : (data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 8 * 3600 * 1000);

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

    return new Response('fslides gateway — see https://github.com/fslides/fslides', { status: 404 });
  },
};

