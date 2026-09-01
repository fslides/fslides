'use strict';

const fs   = require('fs');
const path = require('path');

const MIME_MAP = {
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// Inline all relative src="..." and url("...") references as base64 data URIs.
// slideDir is the directory containing the slide HTML file.
function inlineAssets(html, slideDir) {
  // src="..." and src='...' — skip http/https/data/# references
  html = html.replace(/\bsrc=["']([^"']+)["']/g, (match, ref) => {
    if (/^(https?:|data:|#|\/\/)/.test(ref)) return match;
    const abs = path.resolve(slideDir, ref);
    if (!fs.existsSync(abs)) return match;
    const ext  = path.extname(abs).toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const b64  = fs.readFileSync(abs).toString('base64');
    return `src="data:${mime};base64,${b64}"`;
  });

  // url("...") and url('...') inside CSS
  html = html.replace(/url\(["']?([^"')]+)["']?\)/g, (match, ref) => {
    if (/^(https?:|data:|#|\/\/)/.test(ref)) return match;
    const abs = path.resolve(slideDir, ref);
    if (!fs.existsSync(abs)) return match;
    const ext  = path.extname(abs).toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const b64  = fs.readFileSync(abs).toString('base64');
    return `url("data:${mime};base64,${b64}")`;
  });

  return html;
}

function inlineIframes(html, baseDir) {
  return html.replace(/<iframe\b([^>]*?)\bsrc=(["'])([^"'#][^"']*)\2([^>]*)>/gi, (m, before, q, src, after) => {
    if (src.startsWith('data:') || /^https?:\/\//.test(src) || src.startsWith('//')) return m;
    const abs = path.resolve(baseDir, src);
    if (!fs.existsSync(abs)) return m;
    let content = fs.readFileSync(abs, 'utf8');
    content = inlineAssets(content, path.dirname(abs));
    const srcdoc = content.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<iframe${before}srcdoc="${srcdoc}"${after}>`;
  });
}

module.exports = async function exportPresentation(config, outputPath) {
  const cwd      = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const pkgDir   = path.join(__dirname, '..');
  const out      = outputPath || path.join(cwd, (config.name || 'presentation') + '.html');

  // Inline fuckslides.js (needed both in player and in each slide srcdoc)
  const fsJsPath = path.join(pkgDir, 'js', 'fuckslides.js');
  const fsJs = fs.existsSync(fsJsPath) ? fs.readFileSync(fsJsPath, 'utf8') : '';

  // Read all slide HTML and inline their local assets
  const slideContents = {};
  for (const slide of config.slides) {
    const p = path.join(slidesDir, slide);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      let content = inlineAssets(inlineIframes(raw, slidesDir), slidesDir);

      // Inline <link rel="stylesheet" href="..."> → <style> blocks.
      // inlineAssets handles src= and url() but not href= on link elements.
      content = content.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/gi,
        (match, href) => {
          if (/^(https?:|data:|#|\/\/)/.test(href)) return match;
          const abs = path.resolve(slidesDir, href);
          if (!fs.existsSync(abs)) return match;
          return `<style>\n${fs.readFileSync(abs, 'utf8')}\n</style>`;
        }
      );

      // Inline <script src="/js/fuckslides.js"> — absolute path, skipped by
      // inlineAssets. Each slide srcdoc needs its own copy to fire reveal
      // animations and relay keydown events to the parent player.
      if (fsJs) {
        content = content.replace(
          /<script\s+src=["']\/js\/fuckslides\.js["']\s*><\/script>/g,
          `<script>${fsJs}<\/script>`
        );
      }

      slideContents[slide] = content;
    }
  }

  // Logo as base64 data URI
  const logoPath = path.join(pkgDir, 'logo.png');
  const logoDat = fs.existsSync(logoPath)
    ? 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
    : '';

  // Read player template
  let html = fs.readFileSync(path.join(pkgDir, 'player.html'), 'utf8');

  function safeJson(val) {
    return JSON.stringify(val).replace(/<\/(script)/gi, '<\\/$1');
  }

  const snippet = `<script>
window.FUCKSLIDES_SLIDES    = ${safeJson(config.slides)};
window.FUCKSLIDES_LABELS    = ${safeJson(config.labels || config.slides.map(s => s.replace('.html','')))};
window.FUCKSLIDES_NAME      = ${safeJson(config.name || 'presentation')};
window.FUCKSLIDES_TITLE     = ${safeJson(config.title || config.name || 'presentation')};
window.FUCKSLIDES_DISABLED  = ${safeJson(config.disabled || [])};
window.FUCKSLIDES_EXPORT    = true;
window.FUCKSLIDES_CONTENTS  = ${safeJson(slideContents)};
</script>`;

  const deckTitle = (config.title || config.name || 'Presentation')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${deckTitle}</title>`)
    .replace('</head>', snippet + '\n</head>');

  // Inline fuckslides.js and remove external src reference
  if (fsJs) html = html.replace(/<script src="\/js\/fuckslides\.js"><\/script>/g, `<script>${fsJs}<\/script>`);

  // Swap logo src to data URI
  if (logoDat) html = html.replace(/src="\/logo\.png"/g, `src="${logoDat}"`);

  fs.writeFileSync(out, html, 'utf8');

  const size = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`\n  ✓  Exported → ${path.relative(cwd, out)}  (${size} KB)\n  Open in any browser — no server needed.\n`);

  return out;
};
