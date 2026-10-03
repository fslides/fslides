#!/usr/bin/env node
'use strict';
// Screenshot slides at density 1..5 and assemble one contact strip per slide.
// Usage (from the deck dir, with `fslides serve` running): node strip.js [slide.html ...] [--out DIR] [--url URL]
const path = require('path'), fs = require('fs');
const { deck, args, launch, base, slides } = require('./lib');
const { config, puppeteer } = deck(), o = args();
const out = o.out || '/tmp/fslides-verify', url = base(config, o), list = slides(config, o);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await launch(puppeteer), p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  let errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  for (const f of list) {
    const name = f.replace(/\.html$/, ''); errs = [];
    for (let L = 1; L <= 5; L++) {
      try { await p.goto(`${url}/${f}?density=${L}`, { waitUntil: 'load', timeout: 20000 }); } catch (_) {}
      await new Promise(r => setTimeout(r, +(process.env.WAIT || 2200)));
      await p.screenshot({ path: path.join(out, `${name}-${L}.png`) });
    }
    const html = `<body style="margin:0;background:#555;display:grid;grid-template-columns:repeat(3,640px);gap:6px;padding:6px;font:14px sans-serif;color:#fff">` +
      [1, 2, 3, 4, 5].map(L => `<div><img src="${name}-${L}.png" width=640 height=360><br>${name} · density ${L}</div>`).join('') + '</body>';
    fs.writeFileSync(path.join(out, `${name}.html`), html);
    const q = await b.newPage(); await q.setViewport({ width: 1944, height: 760 });
    await q.goto('file://' + path.join(out, `${name}.html`)); await new Promise(r => setTimeout(r, 300));
    await q.screenshot({ path: path.join(out, `${name}-strip.png`) }); await q.close();
    console.log(`${name}-strip.png${errs.length ? '  ERRORS: ' + errs.join(' | ') : ''}`);
  }
  console.log('→ ' + out); await b.close();
})();
