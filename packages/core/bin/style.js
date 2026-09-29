'use strict';

// Styles: reusable design systems for decks, packaged as agent skills.
//
// A style is a directory:
//   style.json   { name, description, assets: [...], starter: { slides, labels } }
//   SKILL.md     the design brief an agent follows (frontmatter name/description)
//   assets/      shared CSS/JS/fonts, copied to <slidesDir>/style/
//   slides/      starter + reference slides (optional)
//
// Resolution order for a style reference: a path on disk, then the user
// registry (~/.fslides/styles/<name>), then styles bundled with fslides.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REGISTRY = path.join(os.homedir(), '.fslides', 'styles');
const BUILTIN = path.join(__dirname, '..', 'styles');

function die(msg) { console.error('❌  ' + msg); process.exit(1); }

function readStyle(dir) {
  const f = path.join(dir, 'style.json');
  if (!fs.existsSync(f)) return null;
  const meta = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!meta.name) die(`${f} is missing "name".`);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) die(`${dir} has style.json but no SKILL.md.`);
  return Object.assign({ assets: [], dir }, meta);
}

function resolveStyle(ref) {
  if (!ref) die('Missing style name or path.');
  const asPath = path.resolve(process.cwd(), ref);
  for (const dir of [asPath, path.join(REGISTRY, ref), path.join(BUILTIN, ref)]) {
    const s = fs.existsSync(dir) && readStyle(dir);
    if (s) return s;
  }
  const known = listStyles().map(s => s.name);
  die(`Unknown style "${ref}".${known.length ? ' Available: ' + known.join(', ') + '.' : ''} Add one with: fslides style add <path|git-url>`);
}

function listStyles() {
  const out = [], seen = new Set();
  for (const [root, origin] of [[REGISTRY, 'installed'], [BUILTIN, 'built-in']]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      const s = readStyle(path.join(root, d));
      if (s && !seen.has(s.name)) { seen.add(s.name); out.push(Object.assign(s, { origin })); }
    }
  }
  return out;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// fslides style add <path | git-url[#subdir]>
function add(src) {
  if (!src) die('Usage: fslides style add <path | git-url[#subdir]>');
  let dir = src, tmp = null;
  if (/^(https?:\/\/|git@)/.test(src)) {
    const [url, sub] = src.split('#');
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fslides-style-'));
    try { execFileSync('git', ['clone', '--depth', '1', url, tmp], { stdio: 'inherit' }); }
    catch (_) { die(`Could not clone ${url}.`); }
    dir = sub ? path.join(tmp, sub) : tmp;
  } else dir = path.resolve(process.cwd(), src);
  const s = readStyle(dir);
  if (!s) die(`${dir} is not a style (no style.json).`);
  const dest = path.join(REGISTRY, s.name);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(dir, dest);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✅  Installed style "${s.name}" → ${dest}\n    Use it: fslides create <deck> --style ${s.name}   (or: fslides style use ${s.name} in a deck)`);
}

function list() {
  const all = listStyles();
  if (!all.length) { console.log('No styles yet. Add one with: fslides style add <path|git-url>'); return; }
  const w = Math.max(...all.map(s => s.name.length));
  for (const s of all) console.log(`  ${s.name.padEnd(w)}  ${s.description || ''}  [${s.origin}]`);
}

// Apply a style to a deck: assets → <slidesDir>/style/, brief → .claude/skills/,
// `style` recorded in the config. With { starter: true } the style's starter
// slides replace the deck's slides.
function apply(deckDir, ref, opts = {}) {
  const s = resolveStyle(ref);
  const cfgPath = ['fslides.config.js', 'fuckslides.config.js'].map(f => path.join(deckDir, f)).find(p => fs.existsSync(p));
  if (!cfgPath) die('No fslides.config.js found. Run this from a deck directory.');
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  const sd = /slidesDir:\s*['"]([^'"]+)['"]/.exec(cfg);
  const slidesDir = path.join(deckDir, sd ? sd[1] : 'slides');

  const assetDir = path.join(slidesDir, 'style');
  fs.mkdirSync(assetDir, { recursive: true });
  const assetsSrc = path.join(s.dir, 'assets');
  if (fs.existsSync(assetsSrc)) copyDir(assetsSrc, assetDir);

  // The brief becomes a project skill, so any agent working in the deck follows it.
  const skillDir = path.join(deckDir, '.claude', 'skills', `fslides-style-${s.name}`);
  fs.rmSync(skillDir, { recursive: true, force: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(path.join(s.dir, 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
  const ref2 = path.join(s.dir, 'slides');
  if (fs.existsSync(ref2)) copyDir(ref2, path.join(skillDir, 'reference'));

  if (opts.starter && s.starter && s.starter.slides && s.starter.slides.length) {
    for (const f of fs.readdirSync(slidesDir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(slidesDir, f));
    for (const f of s.starter.slides) fs.copyFileSync(path.join(s.dir, 'slides', f), path.join(slidesDir, f));
    const fmt = arr => '[\n    ' + arr.map(x => `'${String(x).replace(/'/g, "\\'")}'`).join(',\n    ') + ',\n  ]';
    cfg = cfg.replace(/slides:\s*\[[^\]]*\]/, 'slides: ' + fmt(s.starter.slides));
    cfg = cfg.replace(/labels:\s*\[[^\]]*\]/, 'labels: ' + fmt(s.starter.labels || s.starter.slides));
  }

  if (/^\s*style:\s*['"][^'"]*['"],?/m.test(cfg)) cfg = cfg.replace(/^(\s*)style:\s*['"][^'"]*['"],?/m, `$1style: '${s.name}',`);
  else cfg = cfg.replace(/module\.exports\s*=\s*\{/, `module.exports = {\n  style: '${s.name}',`);
  fs.writeFileSync(cfgPath, cfg, 'utf8');
  return s;
}

function use(ref) {
  const s = apply(process.cwd(), ref, { starter: false });
  console.log(`✅  Applied style "${s.name}"
    assets  → <slidesDir>/style/  (link style/… from your slides)
    brief   → .claude/skills/fslides-style-${s.name}/SKILL.md
    Agents working in this deck will now follow the ${s.name} style.`);
}

module.exports = function style(args) {
  const [sub, arg] = args;
  if (sub === 'add') return add(arg);
  if (sub === 'list' || !sub) return list();
  if (sub === 'use') return use(arg);
  die('Usage: fslides style list | add <path|git-url[#subdir]> | use <name|path>');
};
module.exports.apply = apply;
module.exports.resolveStyle = resolveStyle;
