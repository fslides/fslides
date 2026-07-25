'use strict';

// fslides build — emit a deployable folder: the full player (notes, voice-over
// playback, comments) plus every slide and asset, loaded via relative URLs.
// This is the workflow-friendly counterpart to `export` (one giant file) and
// `publish` (gh-pages branch): point GitHub Pages / Netlify / S3 at the
// output directory and everything works.
//
// Direction credited to PR #3 by @jlind23 — same goal, now emitting the real
// player instead of a parallel presenter.

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AUDIO_EXTS = ['.webm', '.m4a', '.mp3', '.ogg', '.wav', '.mp4'];
const SKIP_DIRS  = new Set(['node_modules', '.git', '.github']);

function detectRepo(cwd, config) {
  if (config.repo) return config.repo;
  try {
    const remote = execSync('git remote get-url origin', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (m) return m[1] + '/' + m[2];
  } catch (_) {}
  return null;
}

function scanRecordings(recDir) {
  const map = {};
  if (!fs.existsSync(recDir)) return map;
  const best = {};
  for (const f of fs.readdirSync(recDir)) {
    const ext = path.extname(f).toLowerCase();
    if (!AUDIO_EXTS.includes(ext)) continue;
    const base  = path.basename(f, ext);
    const mtime = fs.statSync(path.join(recDir, f)).mtimeMs;
    if (!best[base] || mtime > best[base].mtime) best[base] = { file: f, mtime };
  }
  for (const base of Object.keys(best)) map[base + '.html'] = 'recordings/' + best[base].file;
  return map;
}

function copyTree(src, dest, outDirAbs, stats) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    if (s === outDirAbs) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyTree(s, path.join(dest, entry.name), outDirAbs, stats);
    } else {
      if (entry.name === 'package.json' || entry.name === 'package-lock.json') continue;
      const d = path.join(dest, entry.name);
      if (entry.name.endsWith('.html')) {
        // slides reference /js/fuckslides.js absolutely, which 404s when the
        // deck is served from a subpath — rewrite to a relative reference
        const html = fs.readFileSync(s, 'utf8')
          .replace(/src=["']\/js\/fuckslides\.js["']/g, 'src="js/fuckslides.js"');
        fs.writeFileSync(d, html, 'utf8');
      } else {
        fs.copyFileSync(s, d);
      }
      stats.files++;
    }
  }
}

module.exports = function build(config, outArg) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const pkgDir    = path.join(__dirname, '..');
  const outDir    = path.resolve(cwd, outArg || 'dist');
  const name      = config.name || 'presentation';

  if (outDir === cwd || outDir === slidesDir) {
    console.error('\n  ❌  Output directory must not be the deck directory itself. Use e.g. `fslides build dist`.\n');
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });

  // 1. copy slides + assets (+ recordings) with relative-path fixes
  const stats = { files: 0 };
  copyTree(slidesDir, outDir, outDir, stats);

  // 2. slide runtime for the rewritten relative reference
  fs.mkdirSync(path.join(outDir, 'js'), { recursive: true });
  fs.copyFileSync(path.join(pkgDir, 'js', 'fuckslides.js'), path.join(outDir, 'js', 'fuckslides.js'));

  // 3. assemble the player
  const notesPath  = path.join(cwd, 'notes.json');
  const notesDat   = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '{}';
  const recordings = scanRecordings(path.join(slidesDir, 'recordings'));
  const repo       = detectRepo(cwd, config);

  const snippet = `<script>
window.FUCKSLIDES_SLIDES     = ${JSON.stringify(config.slides)};
window.FUCKSLIDES_LABELS     = ${JSON.stringify(config.labels || config.slides.map(s => s.replace('.html', '')))};
window.FUCKSLIDES_NAME       = ${JSON.stringify(name)};
window.FUCKSLIDES_TITLE      = ${JSON.stringify(config.title || name)};
window.FUCKSLIDES_DISABLED   = ${JSON.stringify(config.disabled || [])};
window.FUCKSLIDES_NOTES      = ${notesDat};
window.FUCKSLIDES_RECORDINGS = ${JSON.stringify(recordings)};
window.FUCKSLIDES_REPO       = ${JSON.stringify(repo)};
window.FUCKSLIDES_GATEWAY    = ${JSON.stringify(config.gateway || null)};
window.FUCKSLIDES_NAV        = ${JSON.stringify(config.nav || [])};
window.FUCKSLIDES_SELECTION  = ${JSON.stringify(config.selection !== false)};
</script>`;

  const fsJs = fs.readFileSync(path.join(pkgDir, 'js', 'fuckslides.js'), 'utf8');
  const logoPath = path.join(pkgDir, 'logo.png');
  const logoDat  = fs.existsSync(logoPath) && fs.statSync(logoPath).size < 100 * 1024
    ? 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
    : '';

  let html = fs.readFileSync(path.join(pkgDir, 'player.html'), 'utf8');
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${config.title || name}</title>`)
    .replace('</head>', snippet + '\n</head>')
    .replace(/<script src="\/js\/fuckslides\.js"><\/script>/g, `<script>${fsJs}</script>`);
  if (logoDat) html = html.replace(/src="\/logo\.png"/g, `src="${logoDat}"`);
  else html = html.replace(/<img class="nav-logo"[^>]*>/g, '');

  // player at <name>.html, and at index.html when no slide claims that name
  fs.writeFileSync(path.join(outDir, name + '.html'), html, 'utf8');
  let entry = name + '.html';
  if (!config.slides.includes('index.html')) {
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
    entry = 'index.html';
  }

  const rel = path.relative(cwd, outDir);
  console.log(`\n  ✓  Built ${rel}/ — ${stats.files} asset(s), player at ${rel}/${entry}`);
  if (Object.keys(recordings).length) console.log(`     ${Object.keys(recordings).length} voice-over recording(s) included`);
  if (repo) console.log(`     comments wired to github.com/${repo}`);
  console.log(`     Deploy the folder anywhere static — GitHub Pages, Netlify, S3.\n`);
};
