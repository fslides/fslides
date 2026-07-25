'use strict';

const fs   = require('fs');
const path = require('path');

// Apply a designed template: replace slides/ with the template's and patch
// the config's slides/labels from its manifest. Shared with scaffold.
function applyTemplate(destDir, templateName, slidesSubdir) {
  const tdir = path.join(__dirname, '..', 'templates', templateName);
  if (!fs.existsSync(tdir)) {
    const avail = fs.readdirSync(path.join(__dirname, '..', 'templates'));
    console.error(`❌  Unknown template "${templateName}". Available: ${avail.join(', ')} (or omit --template for the minimal default).`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(tdir, 'manifest.json'), 'utf8'));
  const slidesDir = path.join(destDir, slidesSubdir);
  for (const f of fs.readdirSync(slidesDir)) {
    if (f.endsWith('.html')) fs.unlinkSync(path.join(slidesDir, f));
  }
  for (const f of manifest.slides) {
    fs.copyFileSync(path.join(tdir, f), path.join(slidesDir, f));
  }
  const cfgPath = ['fslides.config.js', 'fuckslides.config.js']
    .map(f => path.join(destDir, f)).find(p => fs.existsSync(p));
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  const fmt = arr => "[\n    " + arr.map(x => `'${x}'`).join(',\n    ') + ",\n  ]";
  cfg = cfg.replace(/slides:\s*\[[^\]]*\]/, 'slides: ' + fmt(manifest.slides));
  cfg = cfg.replace(/labels:\s*\[[^\]]*\]/, 'labels: ' + fmt(manifest.labels));
  fs.writeFileSync(cfgPath, cfg, 'utf8');
  return manifest;
}

module.exports = function create(name, templateName) {
  if (!name) { console.error('Usage: fuckslides create <name> [--template charcoal|paper|minimal]'); process.exit(1); }
  // designed by default — 'minimal' gives the bare canvas
  templateName = templateName === 'minimal' ? null : (templateName || 'charcoal');

  const dest = path.resolve(process.cwd(), name);
  if (fs.existsSync(dest)) { console.error(`❌  Directory "${name}" already exists.`); process.exit(1); }

  const tmpl = path.join(__dirname, '..', 'template');

  function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  copyDir(tmpl, dest);
  if (templateName) applyTemplate(dest, templateName, 'slides');

  // Patch package.json name
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = name;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  console.log(`
✅  Created presentation: ${name}

  cd ${name}
  npm install
  fuckslides serve
`);
};

module.exports.applyTemplate = applyTemplate;
