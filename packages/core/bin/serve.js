'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

const AUDIO_EXTS = ['.webm', '.m4a', '.mp3', '.ogg', '.wav', '.mp4'];

module.exports = function serve(config) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const pkgDir    = path.join(__dirname, '..');
  const PORT      = config.port || 3000;

  // Inject slide manifest into player.html so the player knows the deck
  const slidesJson   = JSON.stringify(config.slides);
  const labelsJson   = JSON.stringify(config.labels || config.slides.map(s => s.replace('.html', '')));
  const nameJson     = JSON.stringify(config.name || 'presentation');
  const titleJson    = JSON.stringify(config.title || config.name || 'presentation');
  const disabledJson = JSON.stringify(config.disabled || []);
  let repo = config.repo || null;
  if (!repo) {
    try {
      const remote = execSync('git remote get-url origin', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
      const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (m) repo = m[1] + '/' + m[2];
    } catch (_) {}
  }
  const configSnippet = `<script>
window.FUCKSLIDES_SLIDES    = ${slidesJson};
window.FUCKSLIDES_LABELS    = ${labelsJson};
window.FUCKSLIDES_NAME      = ${nameJson};
window.FUCKSLIDES_TITLE     = ${titleJson};
window.FUCKSLIDES_DISABLED  = ${disabledJson};
window.FUCKSLIDES_REPO      = ${JSON.stringify(repo)};
window.FUCKSLIDES_GATEWAY   = ${JSON.stringify(config.gateway || null)};
</script>`;

  const playerTemplate = fs.readFileSync(path.join(pkgDir, 'player.html'), 'utf8');
  const playerHtml     = playerTemplate
    .replace(/<title>[^<]*<\/title>/, `<title>${config.title || config.name || 'Presentation'}</title>`)
    .replace('</head>', configSnippet + '\n</head>');

  // Inject slide manifest into each slide too (for standalone keyboard nav)
  function injectSlideManifest(html) {
    const tag = `<script>window.FUCKSLIDES_SLIDES=${slidesJson};</script>`;
    return html.includes('</head>') ? html.replace('</head>', tag + '\n</head>') : html;
  }

  const cfgPath   = ['fslides.config.js', 'fuckslides.config.js']
    .map(f => path.join(cwd, f)).find(p => fs.existsSync(p)) || path.join(cwd, 'fslides.config.js');
  const notesPath = path.join(cwd, 'notes.json');
  const recDir    = path.join(slidesDir, 'recordings');

  // Map of slide file -> relative recording URL. One recording per slide;
  // if multiple extensions exist for the same base, the newest mtime wins.
  function scanRecordings() {
    const map = {};
    if (!fs.existsSync(recDir)) return map;
    const best = {};
    for (const f of fs.readdirSync(recDir)) {
      const ext = path.extname(f).toLowerCase();
      if (!AUDIO_EXTS.includes(ext)) continue;
      const base = path.basename(f, ext);
      const mtime = fs.statSync(path.join(recDir, f)).mtimeMs;
      if (!best[base] || mtime > best[base].mtime) best[base] = { file: f, mtime };
    }
    for (const base of Object.keys(best)) map[base + '.html'] = 'recordings/' + best[base].file;
    return map;
  }

  function removeRecordings(slideFile) {
    if (!fs.existsSync(recDir)) return;
    const base = path.basename(slideFile, '.html');
    for (const f of fs.readdirSync(recDir)) {
      const ext = path.extname(f).toLowerCase();
      if (AUDIO_EXTS.includes(ext) && path.basename(f, ext) === base) {
        fs.unlinkSync(path.join(recDir, f));
      }
    }
  }

  // ── Live reload ────────────────────────────────────────────────────────────
  // Watches slidesDir (+ fuckslides.config.js) and pushes an SSE 'reload' event
  // to every connected player tab so edits show up without restarting `serve`
  // or manually refreshing the browser.
  const sseClients = new Set();

  function broadcastReload() {
    for (const res of sseClients) {
      res.write('event: reload\ndata: {}\n\n');
    }
  }

  let reloadDebounce = null;
  function scheduleReload() {
    clearTimeout(reloadDebounce);
    // Coalesce the burst of fs events a single editor save can fire (write + rename).
    reloadDebounce = setTimeout(broadcastReload, 120);
  }

  function watchPath(target, recursive) {
    if (!fs.existsSync(target)) return;
    try {
      fs.watch(target, { recursive }, () => scheduleReload());
    } catch (e) {
      // Recursive watching isn't supported on all platforms (e.g. older Linux
      // kernels via Node's inotify backend). Fall back to a flat watch so
      // top-level slide edits still trigger a reload.
      if (recursive && e.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
        try { fs.watch(target, () => scheduleReload()); } catch (_) {}
      }
    }
  }

  watchPath(slidesDir, true);
  watchPath(cfgPath, false);

  const allCommentsCache = { data: null, at: 0 };

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];

    if (req.method === 'GET' && urlPath === '/api/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/source') {
      const fileParam = new URL(req.url, 'http://localhost').searchParams.get('file');
      if (!fileParam) { res.writeHead(400); res.end('Missing file param'); return; }
      const target = path.join(slidesDir, path.basename(fileParam));
      if (!fs.existsSync(target)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(target, 'utf8'));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/save') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { file, content } = JSON.parse(body);
          const target = path.join(slidesDir, path.basename(file));
          fs.writeFileSync(target, content, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/save-order') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { slides: newSlides, labels: newLabels, disabled: newDisabled } = JSON.parse(body);
          let src = fs.readFileSync(cfgPath, 'utf8');
          const fmt = arr => '[\n    ' + arr.map(s => `'${s.replace(/'/g, "\\'")}'`).join(',\n    ') + ',\n  ]';
          src = src.replace(/slides:\s*\[[^\]]*\]/, `slides: ${fmt(newSlides)}`);
          src = src.replace(/labels:\s*\[[^\]]*\]/, `labels: ${fmt(newLabels)}`);
          if (newDisabled !== undefined) {
            const disabledFmt = `disabled: ${fmt(newDisabled)}`;
            if (/disabled\s*:/.test(src)) {
              src = src.replace(/disabled:\s*\[[^\]]*\]/, disabledFmt);
            } else {
              src = src.replace(/};/, `  ${disabledFmt},\n};`);
            }
            config.disabled = newDisabled;
          }
          fs.writeFileSync(cfgPath, src, 'utf8');
          config.slides = newSlides;
          config.labels  = newLabels;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/available-slides') {
      try {
        const allHtml = fs.readdirSync(slidesDir)
          .filter(f => f.endsWith('.html') && f !== 'index.html')
          .sort();
        const available = allHtml.filter(f => !config.slides.includes(f));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(available));
      } catch (e) {
        res.writeHead(500); res.end('[]');
      }
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/notes') {
      const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '{}';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(notes);
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/save-notes') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { file, notes } = JSON.parse(body);
          let all = {};
          if (fs.existsSync(notesPath)) {
            try { all = JSON.parse(fs.readFileSync(notesPath, 'utf8')); } catch(_) {}
          }
          if (notes.trim() === '') delete all[file];
          else all[file] = notes;
          fs.writeFileSync(notesPath, JSON.stringify(all, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // ── All comments across the deck (panel inbox) ──
    if (req.method === 'GET' && urlPath === '/api/all-comments') {
      if (!repo) { res.writeHead(501); res.end('{}'); return; }
      if (allCommentsCache.data && Date.now() - allCommentsCache.at < 20000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(allCommentsCache.data);
        return;
      }
      try {
        const listJson = execSync(
          `gh issue list --repo ${repo} --state open --search ${JSON.stringify('in:title "\ud83d\udcac Slide:"')} --json number,title,body,author,createdAt,url --limit 100`,
          { encoding: 'utf8', stdio: 'pipe' });
        const issues = JSON.parse(listJson).filter(i => i.title.startsWith('\ud83d\udcac Slide: '));
        const bySlide = {};
        for (const issue of issues) {
          const file = issue.title.slice('\ud83d\udcac Slide: '.length).trim();
          let comments = [];
          if (issue.body && issue.body.trim()) {
            comments.push({ user: { login: issue.author.login }, body: issue.body, created_at: issue.createdAt, html_url: issue.url });
          }
          try {
            const cJson = execSync(`gh api repos/${repo}/issues/${issue.number}/comments --paginate`, { encoding: 'utf8', stdio: 'pipe' });
            comments = comments.concat(JSON.parse(cJson));
          } catch (_) {}
          bySlide[file] = { issue: { number: issue.number, html_url: issue.url }, comments };
        }
        const payload = JSON.stringify({ bySlide });
        allCommentsCache.data = payload;
        allCommentsCache.at = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(payload);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message).split('\n')[0] }));
      }
      return;
    }

    // ── Comments (gh CLI-backed: works for private repos with local auth) ──
    if (req.method === 'GET' && urlPath === '/api/comments') {
      const file = new URL(req.url, 'http://localhost').searchParams.get('file');
      if (!repo || !file) { res.writeHead(repo ? 400 : 501); res.end('{}'); return; }
      try {
        const title = '\ud83d\udcac Slide: ' + path.basename(file);
        const listJson = execSync(
          `gh issue list --repo ${repo} --state open --search ${JSON.stringify('in:title "' + title + '"')} --json number,title,body,author,createdAt,url`,
          { encoding: 'utf8', stdio: 'pipe' });
        const issues = JSON.parse(listJson);
        const issue = issues.find(i => i.title === title) || null;
        let comments = [];
        if (issue) {
          if (issue.body && issue.body.trim()) {
            comments.push({ user: { login: issue.author.login }, body: issue.body, created_at: issue.createdAt, html_url: issue.url });
          }
          const cJson = execSync(`gh api repos/${repo}/issues/${issue.number}/comments --paginate`, { encoding: 'utf8', stdio: 'pipe' });
          comments = comments.concat(JSON.parse(cJson));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ issue: issue ? { number: issue.number, html_url: issue.url } : null, comments }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'gh failed: ' + String(e.message).split('\n')[0] }));
      }
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/comment') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        if (!repo) { res.writeHead(501); res.end('{}'); return; }
        try {
          const { file, text } = JSON.parse(body);
          const title = '\ud83d\udcac Slide: ' + path.basename(file);
          const listJson = execSync(
            `gh issue list --repo ${repo} --state open --search ${JSON.stringify('in:title "' + title + '"')} --json number,title`,
            { encoding: 'utf8', stdio: 'pipe' });
          const existing = JSON.parse(listJson).find(i => i.title === title);
          const tmp = path.join(require('os').tmpdir(), 'fslides-comment-' + Date.now() + '.md');
          fs.writeFileSync(tmp, text, 'utf8');
          if (existing) {
            execSync(`gh issue comment ${existing.number} --repo ${repo} --body-file ${JSON.stringify(tmp)}`, { encoding: 'utf8', stdio: 'pipe' });
          } else {
            execSync(`gh issue create --repo ${repo} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(tmp)}`, { encoding: 'utf8', stdio: 'pipe' });
          }
          fs.unlinkSync(tmp);
          allCommentsCache.data = null;   // new comment → panel refetch
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e.message).split('\n')[0] }));
        }
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/recordings') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scanRecordings()));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/save-recording') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const file = params.get('file');
      const ext  = (params.get('ext') || 'webm').replace(/[^a-z0-9]/gi, '');
      if (!file || !AUDIO_EXTS.includes('.' + ext)) {
        res.writeHead(400); res.end('Bad file or ext'); return;
      }
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
          removeRecordings(path.basename(file));          // overwrite semantics
          const base   = path.basename(file, '.html');
          const target = path.join(recDir, base + '.' + ext);
          fs.writeFileSync(target, Buffer.concat(chunks));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, url: 'recordings/' + base + '.' + ext }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/delete-recording') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { file } = JSON.parse(body);
          removeRecordings(path.basename(file));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (urlPath === '/' || urlPath === '/player.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(playerHtml);
      return;
    }

    if (urlPath === '/presenter') {
      const presenterPath = path.join(pkgDir, 'presenter.html');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(presenterPath).pipe(res);
      return;
    }

    if (urlPath === '/js/fuckslides.js') {
      const jsPath = path.join(pkgDir, 'js', 'fuckslides.js');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(jsPath).pipe(res);
      return;
    }

    if (urlPath === '/logo.png') {
      const logoPath = path.join(pkgDir, 'logo.png');
      if (!fs.existsSync(logoPath)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(logoPath).pipe(res);
      return;
    }

    const filePath = path.join(slidesDir, urlPath);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404); res.end('Not found'); return;
    }

    const ext = path.extname(filePath);
    if (ext === '.html') {
      const html = injectSlideManifest(fs.readFileSync(filePath, 'utf8'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n  ❌  Port ${PORT} is already in use.\n  Run: lsof -ti :${PORT} | xargs kill -9\n`);
    } else console.error(e);
    process.exit(1);
  });

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  fuckSlides · "${config.name || 'presentation'}"\n  ${url}\n`);
    try { execSync(`open "${url}"`); } catch(e) {}
  });
};
