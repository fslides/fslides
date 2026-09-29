'use strict';

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync } = require('child_process');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// ── GitHub helpers ──────────────────────────────────────────────────────────

function parseGithubUrl(input) {
  const m = input.match(/github\.com[/:]([^/]+)\/([^/\s]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

function resolveGithubRepo(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) { console.error(`❌  Couldn't parse GitHub URL: ${url}`); process.exit(1); }
  const cacheDir = path.join(os.homedir(), '.fuckslides-hub', parsed.owner, parsed.repo);
  if (fs.existsSync(cacheDir)) {
    console.log(`  ↻  Pulling  ${parsed.owner}/${parsed.repo} …`);
    try { execSync(`git -C "${cacheDir}" pull --ff-only`, { stdio: 'inherit' }); } catch (_) {}
  } else {
    console.log(`  ⬇  Cloning  ${parsed.owner}/${parsed.repo} …`);
    fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
    execSync(`git clone "https://github.com/${parsed.owner}/${parsed.repo}.git" "${cacheDir}"`, { stdio: 'inherit' });
  }
  return cacheDir;
}

// ── Discovery ───────────────────────────────────────────────────────────────
// Scans one level deep for directories containing fuckslides.config.js or index.html.

const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build', '.cache']);

function discoverEntries(scanDir) {
  if (!fs.existsSync(scanDir)) return [];
  return fs.readdirSync(scanDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map(e => {
      const dirPath = path.join(scanDir, e.name);
      const hasConfig = fs.existsSync(path.join(dirPath, 'fuckslides.config.js'));
      const hasIndex  = fs.existsSync(path.join(dirPath, 'index.html'));
      return (hasConfig || hasIndex) ? { folderName: e.name, dirPath, hasConfig } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.folderName.localeCompare(a.folderName)); // newest-first for date-prefixed names
}

// ── Build a presentation from a discovered entry ────────────────────────────

const HUB_BTN_SCRIPT = (hubUrl) => `
<script>
(function() {
  var HUB = ${JSON.stringify(hubUrl)};
  function inject() {
    var nav = document.getElementById('preso-nav');
    if (!nav || document.getElementById('btn-hub')) return;
    var btn = document.createElement('a');
    btn.id = 'btn-hub'; btn.href = HUB; btn.target = '_top'; btn.title = 'Back to Hub';
    btn.style.cssText = 'display:flex;align-items:center;gap:4px;text-decoration:none;font-family:Inter,-apple-system,sans-serif;font-size:0.68rem;font-weight:700;letter-spacing:0.04em;color:rgba(255,255,255,0.45);padding:0 0.5rem;height:30px;border-radius:20px;white-space:nowrap;cursor:pointer;transition:color 0.15s,background 0.15s;';
    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L6 8l4 5"/></svg>Hub';
    btn.addEventListener('mouseenter', function() { btn.style.color='#38BDF8'; btn.style.background='rgba(56,189,248,0.1)'; });
    btn.addEventListener('mouseleave', function() { btn.style.color='rgba(255,255,255,0.45)'; btn.style.background='transparent'; });
    var sep = document.createElement('div'); sep.className = 'nav-sep';
    nav.insertBefore(sep, nav.firstChild);
    nav.insertBefore(btn, nav.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
</script>`;

function buildPresentation(entry, hubUrl, pkgDir) {
  const { folderName, dirPath, hasConfig } = entry;

  if (!hasConfig) {
    const indexHtml  = fs.readFileSync(path.join(dirPath, 'index.html'), 'utf8');
    const titleMatch = indexHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    return {
      slug:       folderName,
      label:      titleMatch ? titleMatch[1] : folderTitle(folderName),
      firstSlide: 'index.html',
      slidesDir:  dirPath,
      playerHtml: indexHtml,
      slidesJson: '[]',
      standalone: true,
    };
  }

  const configPath = path.join(dirPath, 'fuckslides.config.js');
  try {
    delete require.cache[require.resolve(configPath)];
    const config = require(configPath);

    const slidesJson   = JSON.stringify(config.slides);
    const labelsJson   = JSON.stringify(config.labels || config.slides.map(s => s.replace('.html', '')));
    const disabledJson = JSON.stringify(config.disabled || []);

    const snippet = `<script>
window.FUCKSLIDES_SLIDES    = ${slidesJson};
window.FUCKSLIDES_LABELS    = ${labelsJson};
window.FUCKSLIDES_NAME      = ${JSON.stringify(config.name || 'presentation')};
window.FUCKSLIDES_TITLE     = ${JSON.stringify(config.title || config.name || 'presentation')};
window.FUCKSLIDES_DISABLED  = ${disabledJson};
window.FUCKSLIDES_DENSITY   = ${JSON.stringify(config.density || null)};
window.FUCKSLIDES_HUB_URL   = ${JSON.stringify(hubUrl)};
</script>${HUB_BTN_SCRIPT(hubUrl)}`;

    const playerHtml = fs.readFileSync(path.join(pkgDir, 'player.html'), 'utf8')
      .replace('</head>', snippet + '\n</head>');

    return {
      slug:       folderName,
      label:      config.title || config.name || folderTitle(folderName),
      firstSlide: config.slides[0] || '',
      slidesDir:  path.join(dirPath, config.slidesDir || 'slides'),
      playerHtml,
      slidesJson,
      standalone: false,
    };
  } catch (_) {
    return null;
  }
}

function injectManifest(html, slidesJson) {
  const tag = `<script>window.FUCKSLIDES_SLIDES=${slidesJson};</script>`;
  return html.includes('</head>') ? html.replace('</head>', tag + '\n</head>') : html;
}

// ── Title helpers ───────────────────────────────────────────────────────────

function folderTitle(name) {
  return name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Hub shell page ──────────────────────────────────────────────────────────

const THUMB_W     = 192;
const THUMB_H     = Math.round(THUMB_W * 720 / 1280);
const THUMB_SCALE = THUMB_W / 1280;

function buildHubShell(titleMain, titleSub, presentations) {
  const sidebarItems = presentations.map((p, i) => `
        <div class="preso-item${i === 0 ? ' active' : ''}" data-slug="${escHtml(p.slug)}" data-idx="${i}">
          <div class="preso-thumb" style="width:${THUMB_W}px;height:${THUMB_H}px;">
            <div class="thumb-inner">
              <iframe src="/${escHtml(p.slug)}/${escHtml(p.firstSlide)}" scrolling="no" tabindex="-1" loading="${i < 4 ? 'eager' : 'lazy'}"></iframe>
            </div>
          </div>
          <div class="preso-label">${escHtml(p.label)}</div>
        </div>`).join('\n');

  const firstSlug = presentations[0] ? presentations[0].slug : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(titleMain)}${titleSub ? ' · ' + escHtml(titleSub) : ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100vh; overflow: hidden; background: #0A0E1A; font-family: 'Inter', -apple-system, sans-serif; -webkit-font-smoothing: antialiased; color: #fff; }
    #shell { display: flex; flex-direction: column; width: 100%; height: 100vh; }
    #hub-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; z-index: 10; background: rgba(10,14,26,0.98); border-bottom: 1px solid rgba(255,255,255,0.07); }
    #btn-sidebar-toggle { width: 44px; height: 44px; flex-shrink: 0; border: none; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); transition: color 0.15s, background 0.15s; border-right: 1px solid rgba(255,255,255,0.06); }
    #btn-sidebar-toggle:hover { color: #fff; background: rgba(255,255,255,0.06); }
    #hub-header-title { display: flex; align-items: baseline; gap: 0.45rem; padding: 0 1rem; white-space: nowrap; overflow: hidden; }
    .ht-main { font-size: 0.82rem; font-weight: 800; letter-spacing: -0.01em; color: #fff; }
    .ht-sep  { font-size: 0.75rem; color: rgba(255,255,255,0.2); }
    .ht-sub  { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.35); }
    #hub-body { flex: 1; display: flex; overflow: hidden; }
    #sidebar { width: 220px; flex-shrink: 0; background: #080C18; border-right: 1px solid rgba(255,255,255,0.06); overflow-y: auto; overflow-x: hidden; transition: width 0.22s cubic-bezier(0.2,0,0.2,1), opacity 0.22s ease; }
    #sidebar.collapsed { width: 0; opacity: 0; }
    #sidebar::-webkit-scrollbar { width: 4px; }
    #sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    #sidebar-list { padding: 10px 0; display: flex; flex-direction: column; gap: 2px; }
    .preso-item { padding: 10px 14px; cursor: pointer; border-left: 2px solid transparent; transition: background 0.12s, border-color 0.12s; }
    .preso-item:hover { background: rgba(255,255,255,0.04); }
    .preso-item.active { background: rgba(56,189,248,0.07); border-left-color: #38BDF8; }
    .preso-thumb { border-radius: 6px; overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.06); background: #050D1A; }
    .preso-item.active .preso-thumb { border-color: rgba(56,189,248,0.3); box-shadow: 0 0 0 1px rgba(56,189,248,0.15); }
    .thumb-inner { width: 1280px; height: 720px; transform: scale(${THUMB_SCALE.toFixed(6)}); transform-origin: top left; pointer-events: none; }
    .thumb-inner iframe { width: 1280px; height: 720px; border: none; display: block; }
    .preso-label { margin-top: 7px; font-size: 0.72rem; font-weight: 600; line-height: 1.35; color: rgba(255,255,255,0.5); word-break: break-word; }
    .preso-item.active .preso-label { color: rgba(255,255,255,0.9); }
    #hub-main { flex: 1; position: relative; background: #22242C; overflow: hidden; }
    #preso-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
<div id="shell">
  <header id="hub-header">
    <button id="btn-sidebar-toggle" title="Toggle sidebar (S)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
    </button>
    <div id="hub-header-title">
      <span class="ht-main">${escHtml(titleMain)}</span>
      ${titleSub ? `<span class="ht-sep">·</span><span class="ht-sub">${escHtml(titleSub)}</span>` : ''}
    </div>
  </header>
  <div id="hub-body">
    <aside id="sidebar">
      <div id="sidebar-list">
${sidebarItems}
      </div>
    </aside>
    <main id="hub-main">
      ${firstSlug ? `<iframe id="preso-frame" src="/${escHtml(firstSlug)}/"></iframe>` : '<p style="color:rgba(255,255,255,0.2);padding:2rem">No presentations found.</p>'}
    </main>
  </div>
</div>
<script>
(function() {
  var frame = document.getElementById('preso-frame');
  var sidebar = document.getElementById('sidebar');
  document.querySelectorAll('.preso-item').forEach(function(item) {
    item.addEventListener('click', function() {
      document.querySelectorAll('.preso-item').forEach(function(i) { i.classList.remove('active'); });
      item.classList.add('active');
      if (frame) frame.src = '/' + item.dataset.slug + '/';
    });
  });
  document.getElementById('btn-sidebar-toggle').addEventListener('click', function() {
    sidebar.classList.toggle('collapsed');
  });
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 's' || e.key === 'S') sidebar.classList.toggle('collapsed');
  });
})();
</script>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Main ────────────────────────────────────────────────────────────────────

module.exports = function hub(input) {
  let repoDir;

  if (!input) {
    repoDir = process.cwd();
  } else if (input.startsWith('https://github.com') || input.startsWith('git@github.com')) {
    repoDir = resolveGithubRepo(input);
  } else {
    repoDir = path.resolve(input);
  }

  const hubConfigPath = path.join(repoDir, 'fuckslides.hub.js');
  if (!fs.existsSync(hubConfigPath)) {
    console.error(`\n  ❌  No fuckslides.hub.js found in ${repoDir}\n`);
    process.exit(1);
  }

  delete require.cache[require.resolve(hubConfigPath)];
  const hubConfig = require(hubConfigPath);

  const hubPort  = hubConfig.port || 3000;
  const hubUrl   = `http://localhost:${hubPort}`;
  const pkgDir   = path.join(__dirname, '..');
  const scanDir  = path.resolve(repoDir, hubConfig.scan || '.');

  // Derive header title
  const repoName = folderTitle(path.basename(repoDir));
  const scanName = hubConfig.scan ? folderTitle(path.basename(hubConfig.scan)) : null;
  const [titleMain, titleSub] = (function() {
    if (hubConfig.title) {
      const sep = hubConfig.title.includes('—') ? '—' : hubConfig.title.includes('·') ? '·' : null;
      if (sep) return hubConfig.title.split(sep).map(s => s.trim());
    }
    return [repoName, scanName];
  })();

  console.log(`\n  fuckSlides Hub · "${titleMain}${titleSub ? ' · ' + titleSub : ''}"`);
  console.log(`  Scanning  ${scanDir}\n`);

  // ── Request handler ──────────────────────────────────────────────────────
  // Hub index rebuilt on every request → browser refresh = fresh discovery.
  // Presentation files served directly from their folder.

  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];

    // Hub shell — rebuild on every request so refresh picks up new presentations
    if (urlPath === '/' || urlPath === '') {
      const entries       = discoverEntries(scanDir);
      const presentations = entries.map(e => buildPresentation(e, hubUrl, pkgDir)).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(buildHubShell(titleMain, titleSub, presentations));
      return;
    }

    // Shared package assets
    if (urlPath === '/js/fuckslides.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(path.join(pkgDir, 'js', 'fuckslides.js')).pipe(res);
      return;
    }
    if (urlPath === '/logo.png') {
      const p = path.join(pkgDir, 'logo.png');
      if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(p).pipe(res);
      return;
    }

    // /<slug>[/<file>]  — resolve slug to folder, build presentation on-the-fly
    const parts   = urlPath.split('/').filter(Boolean);
    const slug    = parts[0];
    const dirPath = path.join(scanDir, slug);

    if (!fs.existsSync(dirPath)) { res.writeHead(404); res.end('Not found'); return; }

    const hasConfig = fs.existsSync(path.join(dirPath, 'fuckslides.config.js'));
    const hasIndex  = fs.existsSync(path.join(dirPath, 'index.html'));
    if (!hasConfig && !hasIndex) { res.writeHead(404); res.end('Not found'); return; }

    const preso = buildPresentation({ folderName: slug, dirPath, hasConfig }, hubUrl, pkgDir);
    if (!preso) { res.writeHead(500); res.end('Could not build presentation'); return; }

    // /<slug>  or  /<slug>/  → serve player / standalone page
    if (parts.length === 1) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(preso.playerHtml);
      return;
    }

    // /<slug>/<file>  → serve from slidesDir
    const subPath  = parts.slice(1).join('/');
    const filePath = path.join(preso.slidesDir, subPath);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }

    const ext = path.extname(filePath);
    if (ext === '.html') {
      const html = injectManifest(fs.readFileSync(filePath, 'utf8'), preso.slidesJson);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error(`\n  ❌  Port ${hubPort} in use. Run: lsof -ti :${hubPort} | xargs kill -9\n`);
    else console.error(e);
    process.exit(1);
  });

  server.listen(hubPort, () => {
    console.log(`  Hub ready  →  ${hubUrl}\n`);
    try { execSync(`open "${hubUrl}"`); } catch (_) {}
  });
};
