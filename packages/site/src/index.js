'use strict';

// fslides.dev — static site (assets) + hosted decks at decks.fslides.dev.
//
// Decks are rendered on the fly from GitHub: nothing is stored. The worker
// fetches the deck's config from raw.githubusercontent.com, assembles the
// player at the edge (same injection as `fslides build`), and proxies
// slides/assets/recordings straight from the repo. `git push` IS publishing —
// no CI, no build step, live within the cache window (~60s).
//
// Decks live on their own origin: user JS must never share the app origin
// (dashboard tokens live in fslides.dev localStorage).

import JSON5 from 'json5';
import PLAYER from './vendor/player.html';
import RUNTIME from './vendor/fuckslides.js.txt';
import LOGO from './vendor/logo.png';
import PROFILE from './profile.html';

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf',
  woff2: 'font/woff2', md: 'text/markdown; charset=utf-8', ico: 'image/x-icon',
};

const NO_STORE = { 'Cache-Control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'decks.fslides.dev') return serveDeck(request, url, env);

    // legacy /@owner/repo on the app origin → redirect to the deck origin
    if (url.pathname.startsWith('/@')) {
      return Response.redirect('https://decks.fslides.dev/' + url.pathname.slice(2) + url.search, 301);
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
      return Response.redirect('https://decks.fslides.dev/' + seg.join('/') +
        (url.pathname.endsWith('/') ? '/' : '') + url.search, 301);
    }

    return asset;
  },
};

async function serveDeck(request, url, env) {
  const { pathname } = url;

  // player + slides reference these absolutely; serve them origin-wide so
  // every deck runs the latest runtime without any per-deck copies
  if (pathname === '/js/fuckslides.js') {
    return new Response(RUNTIME, { headers: { 'Content-Type': TYPES.js, 'Cache-Control': 'public, max-age=300' } });
  }
  if (pathname === '/logo.png') {
    return new Response(LOGO, { headers: { 'Content-Type': TYPES.png, 'Cache-Control': 'public, max-age=86400' } });
  }
  if (pathname === '/' || pathname === '/favicon.ico') {
    return Response.redirect('https://fslides.dev' + (pathname === '/' ? '/' : pathname), 302);
  }

  const parts = pathname.slice(1).split('/').filter(Boolean);
  const owner = parts.shift();
  const repo = parts.shift();
  if (!owner || !repo) return new Response('Decks live at decks.fslides.dev/owner/repo/', { status: 404, headers: NO_STORE });
  const key = parts.join('/');
  if (decodeURIComponent(key).includes('..')) return new Response('Bad path', { status: 400, headers: NO_STORE });

  // launch posture: hosted decks are allowlist-only (env PUBLISHERS,
  // comma-separated owners; '*' opens it up — pair with quotas first)
  const publishers = (env.PUBLISHERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!publishers.includes('*') && !publishers.includes(owner.toLowerCase())) {
    return new Response('Hosted decks are invite-only for now — ask at https://github.com/fslides/fslides/issues', { status: 403, headers: NO_STORE });
  }

  // deck root without trailing slash → redirect so relative URLs resolve
  if (!key && !pathname.endsWith('/')) {
    return Response.redirect(url.origin + pathname + '/', 301);
  }

  const config = await loadConfig(owner, repo);
  if (config instanceof Response) return config;

  const playerName = (config.name || repo) + '.html';
  const isPlayer = !key || key === playerName ||
    (key === 'index.html' && !(config.slides || []).includes('index.html'));

  if (isPlayer) {
    const nr = await raw(owner, repo, 'notes.json', 60);
    let notes = '{}';
    if (nr.ok) { const t = await nr.text(); try { JSON.parse(t); notes = t; } catch (_) {} }
    const html = renderPlayer(owner, repo, config, notes);
    if (request.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': TYPES.html } });
    return new Response(html, { headers: { 'Content-Type': TYPES.html, 'Cache-Control': 'public, max-age=60' } });
  }

  // slides / assets / recordings — the deck's slides dir is the URL root,
  // mirroring the layout `fslides build` emits
  const repoPath = (config.slidesDir || 'slides') + '/' + key;
  const ext = key.split('.').pop().toLowerCase();

  if (request.method === 'HEAD') {
    // existence check (the player probes recordings this way) — an LFS
    // pointer at the path means the real file exists on the media CDN
    const r = await raw(owner, repo, repoPath, 300, 'HEAD');
    return new Response(null, { status: r.ok ? 200 : 404, headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' } });
  }

  let r = await raw(owner, repo, repoPath, 300);
  if (!r.ok) return new Response('Not found', { status: r.status === 404 ? 404 : 502, headers: NO_STORE });

  // Git LFS: raw serves a small text pointer — fetch the real bytes from
  // GitHub's media CDN instead
  const clen = parseInt(r.headers.get('Content-Length') || '0', 10);
  if (clen > 0 && clen < 400) {
    const peek = await r.clone().text();
    if (peek.startsWith('version https://git-lfs')) {
      r = await fetch(`https://media.githubusercontent.com/media/${owner}/${repo}/HEAD/${repoPath}`,
        { cf: { cacheTtl: 3600, cacheEverything: true } });
      if (!r.ok) return new Response('Not found', { status: 404, headers: NO_STORE });
    }
  }

  return new Response(r.body, {
    headers: {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === 'html' ? 'public, max-age=60' : 'public, max-age=300',
    },
  });
}

function raw(owner, repo, path, ttl, method) {
  return fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`, {
    method: method || 'GET',
    // misses stay short-lived so a fresh `git push` shows up fast
    cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ttl, '404': 15, '500-599': 0 } },
  });
}

// deck configs are literal objects (`module.exports = { … }`) — parsed with
// JSON5, never executed. Computed configs work locally but can't be hosted.
async function loadConfig(owner, repo) {
  let found = null;
  for (const name of ['fslides.config.js', 'fuckslides.config.js']) {
    const r = await raw(owner, repo, name, 60);
    if (r.ok) { found = { name, src: await r.text() }; break; }
  }
  if (!found) {
    return new Response('Not an fslides deck — no fslides.config.js found (public repos only).', { status: 404, headers: NO_STORE });
  }
  const m = found.src.match(/module\.exports\s*=\s*([\s\S]*)$/);
  const body = m && m[1].trim().replace(/;\s*$/, '');
  try {
    return JSON5.parse(body);
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
