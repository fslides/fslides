'use strict';

// fslides.dev — static site (assets) + hosted decks at {owner}.fslides.dev.
//
// Decks are rendered on the fly from GitHub: nothing is stored. The worker
// fetches the deck's config from raw.githubusercontent.com, assembles the
// player at the edge (same injection as `fslides build`), and proxies
// slides/assets/recordings straight from the repo. `git push` IS publishing —
// no CI, no build step, live within the cache window (~60s).
//
// Reputation isolation (the github.io model): every owner gets their own
// subdomain, and fslides.dev is submitted to the Public Suffix List, so
// browsers/Safe Browsing treat each owner as an independent site — one
// abuser burns their own subdomain, never the platform. Open to any repo
// that opts in by carrying an fslides config; env.DENYLIST (comma-separated
// owners or owner/repo) is the abuse killswitch; every deck response is
// noindex; /-/report on the app origin routes abuse reports to GitHub.

import JSON5 from 'json5';
import PLAYER from './vendor/player.html';
import RUNTIME from './vendor/fuckslides.js.txt';
import LOGO from './vendor/logo.png';
import PROFILE from './profile.html';
import NOTFOUND from './notfound.html';

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf',
  woff2: 'font/woff2', md: 'text/markdown; charset=utf-8', ico: 'image/x-icon',
};

const NO_STORE = { 'Cache-Control': 'no-store' };

const RESERVED = new Set([
  'www', 'api', 'decks', 'app', 'staging', 'mail', 'admin', 'status',
  'docs', 'cdn', 'assets', 'preview', 'blog', 'shop', 'support',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // legacy deck origin → permanent redirect to owner subdomains
    if (host === 'decks.fslides.dev') {
      const parts = url.pathname.slice(1).split('/').filter(Boolean);
      if (parts.length >= 1 && /^[A-Za-z0-9-]+$/.test(parts[0])) {
        const owner = parts.shift().toLowerCase();
        return Response.redirect(`https://${owner}.fslides.dev/` + parts.join('/') +
          (url.pathname.endsWith('/') && parts.length ? '/' : '') + url.search, 301);
      }
      return Response.redirect('https://fslides.dev/', 302);
    }

    // owner subdomains serve decks: {owner}.fslides.dev/{repo}/…
    const sub = host.match(/^([a-z0-9-]+)\.fslides\.dev$/);
    if (sub && !RESERVED.has(sub[1])) {
      return serveDeck(request, url, env, sub[1]);
    }

    // ── app origin (fslides.dev / www) ──

    if (url.pathname === '/logo.png' || url.pathname === '/favicon.ico') {
      return new Response(LOGO, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    }

    // abuse reports → prefilled GitHub issue (GitHub is the moderation surface)
    if (url.pathname === '/-/report') {
      const deck = (url.searchParams.get('deck') || '').slice(0, 100).replace(/[^\w./-]/g, '');
      const owner = deck.split('/')[0] || '';
      const rest = deck.split('/').slice(1).join('/');
      const title = encodeURIComponent('[abuse] deck report: ' + deck);
      const body = encodeURIComponent(
        'Deck: https://' + owner + '.fslides.dev/' + rest +
        '\nRepo: https://github.com/' + deck +
        '\n\nWhat is wrong with this deck?\n\n');
      return Response.redirect(
        `https://github.com/fslides/fslides/issues/new?title=${title}&labels=abuse&body=${body}`, 302);
    }

    // legacy /@owner/repo on the app origin → owner subdomain
    if (url.pathname.startsWith('/@')) {
      const seg = url.pathname.slice(2).split('/').filter(Boolean);
      const owner = (seg.shift() || '').toLowerCase();
      return Response.redirect(`https://${owner}.fslides.dev/` + seg.join('/') + url.search, 301);
    }

    // app origin: real assets win; profiles and pretty deck URLs fill the
    // 404 space, GitHub-style (fslides.dev/owner → profile,
    // fslides.dev/owner/repo → the deck, redirected to its own origin)
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    const seg = url.pathname.slice(1).split('/').filter(Boolean);
    if (seg.length && /^[A-Za-z0-9-]+$/.test(seg[0])) {
      if (seg.length === 1) {
        return new Response(PROFILE, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
        });
      }
      const owner = seg.shift().toLowerCase();
      return Response.redirect(`https://${owner}.fslides.dev/` + seg.join('/') +
        (url.pathname.endsWith('/') ? '/' : '') + url.search, 301);
    }

    // everything else struck out — swing the bat
    if ((request.headers.get('Accept') || '').includes('text/html')) {
      return new Response(NOTFOUND, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return asset;
  },
};

async function serveDeck(request, url, env, owner) {
  const { pathname } = url;

  // viewer session for private decks — HttpOnly so deck JS (user code)
  // can never read the token; requests carry it silently
  if (pathname === '/-/session' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const t = body && body.token;
    if (!t || !/^[A-Za-z0-9_.\-\/+=]+$/.test(t)) return new Response('bad token', { status: 400, headers: NO_STORE });
    const maxAge = Math.max(60, Math.min(28800, Math.floor(((body.expiresAt || 0) - Date.now()) / 1000) || 28800));
    return new Response('ok', {
      headers: {
        'Set-Cookie': `fs_t=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
        ...NO_STORE,
      },
    });
  }
  const viewerToken = ((request.headers.get('Cookie') || '').match(/(?:^|;\s*)fs_t=([^;]+)/) || [])[1] || '';

  // player + slides reference these absolutely; serve them origin-wide so
  // every deck runs the latest runtime without any per-deck copies
  if (pathname === '/js/fuckslides.js') {
    return new Response(RUNTIME, { headers: { 'Content-Type': TYPES.js, 'Cache-Control': 'public, max-age=300' } });
  }
  if (pathname === '/logo.png') {
    return new Response(LOGO, { headers: { 'Content-Type': TYPES.png, 'Cache-Control': 'public, max-age=86400' } });
  }
  if (pathname === '/favicon.ico') {
    return Response.redirect('https://fslides.dev/favicon.ico', 302);
  }

  const parts = pathname.slice(1).split('/').filter(Boolean);
  const repo = parts.shift();
  if (!repo) {
    // owner root: their public profile lives on the app origin
    return Response.redirect('https://fslides.dev/' + owner, 302);
  }
  if (decodeURIComponent(parts.join('/')).includes('..')) return new Response('Bad path', { status: 400, headers: NO_STORE });

  // abuse killswitch: env.DENYLIST is comma-separated owners or owner/repo
  const deny = (env.DENYLIST || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (deny.includes(owner) || deny.includes(owner + '/' + repo.toLowerCase())) {
    return new Response('This deck has been disabled following an abuse report. Appeal: https://github.com/fslides/fslides/issues',
      { status: 410, headers: NO_STORE });
  }

  // Monorepo: probe the .fslides manifest to resolve sub-deck routing.
  // /{repo}/obs-preso/slide.html → deckSubPath='obs-preso', key='slide.html'
  // Single-deck repos skip this when parts is empty; manifest 404s are cached 15 s.
  let manifest = null;
  let deckSubPath = '';
  let key = '';
  if (parts.length > 0) {
    manifest = await loadManifest(owner, repo, viewerToken);
    if (manifest && Array.isArray(manifest.decks) && manifest.decks.length > 0) {
      const sorted = manifest.decks
        .map(d => d.split('/').filter(Boolean))
        .sort((a, b) => b.length - a.length); // longest prefix first
      for (const dp of sorted) {
        if (parts.length >= dp.length && parts.slice(0, dp.length).join('/') === dp.join('/')) {
          deckSubPath = dp.join('/');
          key = parts.slice(dp.length).join('/');
          break;
        }
      }
    }
    if (!deckSubPath) key = parts.join('/');
  }

  // deck root without trailing slash → redirect so relative URLs resolve
  if (!key && !pathname.endsWith('/')) {
    return Response.redirect(url.origin + pathname + '/', 301);
  }

  const loaded = await loadConfig(owner, repo, viewerToken, deckSubPath);
  if (!loaded) {
    // Manifest-only repo with no root config: redirect to first listed sub-deck
    if (!deckSubPath && !key) {
      if (!manifest) manifest = await loadManifest(owner, repo, viewerToken);
      if (manifest && Array.isArray(manifest.decks) && manifest.decks.length > 0) {
        const first = manifest.decks[0].split('/').filter(Boolean).join('/');
        return Response.redirect(`${url.origin}/${repo}/${first}/`, 302);
      }
    }
    // maybe private: offer sign-in (GitHub is the ACL — access follows the
    // repo). With a token and still nothing: truly missing or no access.
    if (!viewerToken) return interstitial(owner, repo);
    return new Response('Not found — or your GitHub account has no access to ' + owner + '/' + repo + '.',
      { status: 404, headers: NO_STORE });
  }
  if (loaded instanceof Response) return loaded;
  const { config, deckPrivate } = loaded;
  // per-viewer content must never sit in a shared cache
  const cc = (pub) => deckPrivate ? 'private, max-age=30' : pub;

  const playerName = (config.name || repo) + '.html';
  const isPlayer = !key || key === playerName ||
    (key === 'index.html' && !(config.slides || []).includes('index.html'));

  if (isPlayer) {
    const notesPath = deckSubPath ? deckSubPath + '/notes.json' : 'notes.json';
    const nf = await fetchFile(owner, repo, notesPath, 60, viewerToken);
    let notes = '{}';
    if (nf.resp.ok) { const t = await nf.resp.text(); try { JSON.parse(t); notes = t; } catch (_) {} }
    const html = renderPlayer(owner, repo, config, notes);
    if (request.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': TYPES.html, 'X-Robots-Tag': 'noindex' } });
    return new Response(html, { headers: { 'Content-Type': TYPES.html, 'Cache-Control': cc('public, max-age=60'), 'X-Robots-Tag': 'noindex' } });
  }

  // slides / assets / recordings — the deck's slides dir is the URL root,
  // mirroring the layout `fslides build` emits
  const deckPrefix = deckSubPath ? deckSubPath + '/' : '';
  const repoPath = deckPrefix + (config.slidesDir || 'slides') + '/' + key;
  const ext = key.split('.').pop().toLowerCase();

  if (request.method === 'HEAD' && !deckPrivate) {
    // existence check (the player probes recordings this way) — an LFS
    // pointer at the path means the real file exists on the media CDN
    const r = await raw(owner, repo, repoPath, 300, 'HEAD');
    return new Response(null, { status: r.ok ? 200 : 404, headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' } });
  }

  let { resp: r, private: viaApi } = await fetchFile(owner, repo, repoPath, 300, deckPrivate ? viewerToken : '');
  if (!r.ok) return new Response('Not found', { status: r.status === 404 ? 404 : 502, headers: NO_STORE });

  // Git LFS: raw serves a small text pointer — fetch the real bytes from
  // GitHub's media CDN instead
  const clen = parseInt(r.headers.get('Content-Length') || '0', 10);
  if (clen > 0 && clen < 400) {
    const peek = await r.clone().text();
    if (peek.startsWith('version https://git-lfs')) {
      r = await fetch(`https://media.githubusercontent.com/media/${owner}/${repo}/HEAD/${repoPath}`,
        viaApi
          ? { headers: { Authorization: 'Bearer ' + viewerToken } }
          : { cf: { cacheTtl: 3600, cacheEverything: true } });
      if (!r.ok) return new Response('Not found', { status: 404, headers: NO_STORE });
    }
  }

  const out = new Response(request.method === 'HEAD' ? null : r.body, {
    status: 200,
    headers: {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': cc(ext === 'html' ? 'public, max-age=60' : 'public, max-age=300'),
      'X-Robots-Tag': 'noindex',
    },
  });
  return out;
}

// fslides-styled sign-in gate for possibly-private decks: the popup auth
// posts back, the page stores the token as an HttpOnly cookie via
// /-/session, then reloads — after that GitHub decides what the viewer sees
function interstitial(owner, repo) {
  const who = (owner + '/' + repo).replace(/[&<>"]/g, '');
  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${who} — fslides</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  body { background:#0d0f14; color:rgba(232,234,240,0.75); min-height:100vh; margin:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;
    font-family:'JetBrains Mono',monospace; font-size:1rem; text-align:center; padding:20px; }
  .big { color:#e8eaf0; font-size:1.15rem; font-weight:700; }
  .big b { color:#F05000; }
  button { font-family:inherit; font-size:1rem; color:#F05000; background:none;
    border:1px solid rgba(255,255,255,0.15); padding:11px 20px; cursor:pointer; }
  button:hover { border-color:#F05000; }
  .note { font-size:0.85rem; color:rgba(232,234,240,0.4); }
</style></head><body>
  <div class="big"><b>${who}</b> — this deck may be private</div>
  <button id="b" style="display:none">[ sign in with github to view ]</button>
  <div class="note" id="n" style="display:none">access follows the GitHub repo — if you can see it there, you can see it here</div>
<script>
  var G='https://api.fslides.dev';
  function showBtn(){document.getElementById('b').style.display='';document.getElementById('n').style.display='';}
  // Reuse an existing GitHub session from localStorage before prompting again.
  (function(){
    var t=localStorage.getItem('fs-gh-token');
    var exp=parseInt(localStorage.getItem('fs-gh-token-exp')||'0',10);
    if(t&&(!exp||Date.now()<exp)){
      fetch('/-/session',{method:'POST',body:JSON.stringify({token:t,expiresAt:exp||null})})
        .then(function(){location.reload();}).catch(showBtn);
      return;
    }
    showBtn();
  })();
  document.getElementById('b').addEventListener('click',function(){
    var w=640,h=780,x=(screen.width-w)/2,y=(screen.height-h)/2;
    window.open(G+'/auth/login?origin='+encodeURIComponent(location.origin),'fslides-auth',
      'width='+w+',height='+h+',left='+x+',top='+y);
  });
  window.addEventListener('message',function(e){
    if(e.origin!==new URL(G).origin||!e.data||e.data.type!=='fslides-auth')return;
    fetch('/-/session',{method:'POST',body:JSON.stringify({token:e.data.token,expiresAt:e.data.expiresAt})})
      .then(function(){location.reload();});
  });
</script></body></html>`, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

function raw(owner, repo, path, ttl, method) {
  return fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`, {
    method: method || 'GET',
    // misses stay short-lived so a fresh `git push` shows up fast
    cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ttl, '404': 15, '500-599': 0 } },
  });
}

// private fallback: the GitHub contents API with the viewer's own token —
// GitHub is the ACL. Never edge-cached (per-viewer content).
function apiRaw(owner, repo, path, token) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github.raw+json',
      'User-Agent': 'fslides-decks',
    },
  });
}

// raw first (fast, cached); if the repo is private and a viewer is signed
// in, retry through the API. Returns { resp, private }.
async function fetchFile(owner, repo, path, ttl, token) {
  const r = await raw(owner, repo, path, ttl);
  if (r.ok || !token) return { resp: r, private: false };
  if (r.status !== 404) return { resp: r, private: false };
  return { resp: await apiRaw(owner, repo, path, token), private: true };
}

// .fslides manifest at the repo root opts a repo into monorepo mode.
// Returns null on missing/invalid; cached 60 s (misses cached 15 s by raw()).
async function loadManifest(owner, repo, token) {
  const f = await fetchFile(owner, repo, '.fslides', 60, token);
  if (!f.resp.ok) return null;
  try { return JSON5.parse(await f.resp.text()); } catch (_) { return null; }
}

// deck configs are literal objects (`module.exports = { … }`) — parsed with
// JSON5, never executed. Computed configs work locally but can't be hosted.
async function loadConfig(owner, repo, token, deckSubPath) {
  const prefix = deckSubPath ? deckSubPath + '/' : '';
  let found = null;
  for (const name of ['fslides.config.js', 'fuckslides.config.js']) {
    const f = await fetchFile(owner, repo, prefix + name, 60, token);
    if (f.resp.ok) { found = { name, src: await f.resp.text(), deckPrivate: f.private }; break; }
  }
  if (!found) return null;
  const m = found.src.match(/module\.exports\s*=\s*([\s\S]*)$/);
  const body = m && m[1].trim().replace(/;\s*$/, '');
  try {
    return { config: JSON5.parse(body), deckPrivate: found.deckPrivate };
  } catch (e) {
    return new Response(
      `Could not render ${found.name}: hosted configs must be a literal object (module.exports = { … }) — no requires, no computed values.\n\n${e.message}`,
      { status: 422, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE } });
  }
}

function renderPlayer(owner, repo, config, notes) {
  const name = config.name || repo;
  const snippet = `<script>
window.FUCKSLIDES_SLIDES     = ${JSON.stringify(config.slides || [])};
window.FUCKSLIDES_LABELS     = ${JSON.stringify(config.labels || (config.slides || []).map(s => s.replace('.html', '')))};
window.FUCKSLIDES_NAME       = ${JSON.stringify(name)};
window.FUCKSLIDES_TITLE      = ${JSON.stringify(config.title || name)};
window.FUCKSLIDES_DISABLED   = ${JSON.stringify(config.disabled || [])};
window.FUCKSLIDES_NOTES      = ${notes};
window.FUCKSLIDES_RECORDINGS = null;
window.FUCKSLIDES_REPO       = ${JSON.stringify(owner + '/' + repo)};
window.FUCKSLIDES_GATEWAY    = ${JSON.stringify(config.gateway || 'https://api.fslides.dev')};
window.FUCKSLIDES_NAV        = ${JSON.stringify(config.nav || [])};
window.FUCKSLIDES_SELECTION  = ${JSON.stringify(config.selection !== false)};
</script>`;
  return PLAYER
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(config.title || name)}</title>`)
    .replace('</head>', snippet + '\n</head>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
