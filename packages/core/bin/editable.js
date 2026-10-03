'use strict';

// Editable export: rebuilds every slide from native PowerPoint objects (text boxes with real
// runs, rectangles, lines, pictures) instead of one screenshot per slide. Google Slides converts
// a native .pptx into native Slides objects, so `fslides gslides` uploads it to Drive as a deck.
//
// How: each slide is loaded in headless Chrome at 1280×720, the DOM is walked once, and every
// painted thing becomes a primitive with its exact box from the layout engine. Things PowerPoint
// cannot express (svg, canvas, img, gradients) are captured alone, transparent, as pictures.

const puppeteer = require('puppeteer');
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const WIDTH = 1280, HEIGHT = 720;
const PX = 1 / 96;          // px → inches (LAYOUT_WIDE is 13.333 × 7.5 in = 1280 × 720 px)
const PT = 0.75;            // px → points

// ── In-page extraction ────────────────────────────────────────────────────────
// Runs inside the slide. Returns { bg, items[] } in paint order; pictures carry a data-fsx id
// so Node can screenshot them in isolation afterwards.
function extract() {
  const W = 1280, H = 720;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE']);
  const PIC = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'PICTURE', 'OBJECT', 'EMBED']);
  const BOXFORM = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
  const CHROME = '.fs-nav, #fs-fullscreen, .fs-toast, [data-fs-chrome]';   // fslides runtime UI, not slide content

  const rgba = s => {
    const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1; if (!(a > 0)) return null;
    return { hex: p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(), a };
  };
  const first = f => (f || '').split(',')[0].replace(/["']/g, '').trim();
  const num = v => parseFloat(v) || 0;

  // 1. Materialize ::before / ::after as real spans so they get a layout box.
  const st = document.createElement('style');
  st.textContent = '[data-fs-np]::before,[data-fs-np]::after{content:none!important}';
  document.head.appendChild(st);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (SKIP.has(el.tagName) || PIC.has(el.tagName.toUpperCase()) || el.closest('svg')) continue;
    let made = false;
    for (const pe of ['::before', '::after']) {
      const pcs = getComputedStyle(el, pe), c = pcs.content;
      if (!c || c === 'none' || c === 'normal' || pcs.display === 'none') continue;
      const span = document.createElement('span');
      // copy the settled computed style; animations and transitions would restart on the new element
      for (let i = 0; i < pcs.length; i++) { const k = pcs[i]; if (k !== 'content' && !/^(animation|transition)/.test(k)) span.style.setProperty(k, pcs.getPropertyValue(k)); }
      span.style.setProperty('animation', 'none', 'important'); span.style.setProperty('transition', 'none', 'important');
      const q = /^["'](.*)["']$/.exec(c);
      span.textContent = q ? q[1].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))) : '';
      span.setAttribute('data-fs-pseudo', '');
      if (pe === '::before') el.insertBefore(span, el.firstChild); else el.appendChild(span);
      made = true;
    }
    if (made) el.setAttribute('data-fs-np', '');
  }

  const items = []; let pid = 0, order = 0;
  const onSlide = r => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
  const box = r => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const isInline = (el, cs) => cs.display === 'inline' && !PIC.has(el.tagName.toUpperCase()) && !BOXFORM.has(el.tagName);

  function shapeOf(el, cs, r, z, op) {
    const fill = rgba(cs.backgroundColor);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => ({ w: num(cs['border' + s + 'Width']), c: rgba(cs['border' + s + 'Color']), s: cs['border' + s + 'Style'] }))
      .map(b => (b.w > 0 && b.c && b.s !== 'none' && b.s !== 'hidden') ? b : null);
    const uni = sides.every(b => b && sides[0] && b.w === sides[0].w && b.c.hex === sides[0].c.hex);
    const rad = Math.min(num(cs.borderTopLeftRadius), r.width / 2, r.height / 2);
    const round = rad >= 1;
    const ellipse = /50%/.test(cs.borderTopLeftRadius) || (round && rad >= Math.min(r.width, r.height) / 2 - .5 && Math.abs(r.width - r.height) < 1);
    if (fill || uni) items.push({ t: 'shape', ...box(r), fill, line: uni ? sides[0] : null, rad: ellipse ? 0 : rad, ellipse, z, o: order++, op });
    if (!uni) sides.forEach((b, i) => { if (!b) return;
      const L = i === 0 ? { x1: r.left, y1: r.top + b.w / 2, x2: r.right, y2: r.top + b.w / 2 }
        : i === 1 ? { x1: r.right - b.w / 2, y1: r.top, x2: r.right - b.w / 2, y2: r.bottom }
        : i === 2 ? { x1: r.left, y1: r.bottom - b.w / 2, x2: r.right, y2: r.bottom - b.w / 2 }
        : { x1: r.left + b.w / 2, y1: r.top, x2: r.left + b.w / 2, y2: r.bottom };
      items.push({ t: 'line', ...L, c: b.c, w: b.w, dash: b.s === 'dashed' ? 'dash' : b.s === 'dotted' ? 'sysDot' : null, z, o: order++, op }); });
  }

  function runStyle(el) {
    const cs = getComputedStyle(el), c = rgba(cs.color);
    const a = el.closest('a[href]');
    return { color: c ? c.hex : '000000', ca: c ? c.a : 1, size: num(cs.fontSize), wt: +cs.fontWeight || 400, bold: (+cs.fontWeight || 400) >= 600, italic: cs.fontStyle === 'italic',
      font: first(cs.fontFamily), ls: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing), tt: cs.textTransform,
      u: /underline/.test(cs.textDecorationLine), sup: cs.verticalAlign === 'super' || el.tagName === 'SUP', sub: cs.verticalAlign === 'sub' || el.tagName === 'SUB',
      href: a ? a.href : null, lh: cs.lineHeight === 'normal' ? num(cs.fontSize) * 1.2 : num(cs.lineHeight), ws: cs.whiteSpace };
  }

  // Inline content of a block → runs + the union of their rects.
  function collect(el, runs, rects, z, op, st) {
    st = st || {};
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        if (!n.data.trim() && !/\S/.test(n.data) && !runs.length) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const rs = Array.from(rg.getClientRects()).filter(onSlide);
        if (!rs.length) continue;
        rects.push(...rs);
        const s = runStyle(n.parentElement);
        const tx = t => { t = /pre/.test(s.ws) ? t : t.replace(/\s+/g, ' ');
          if (s.tt === 'uppercase') return t.toUpperCase(); if (s.tt === 'lowercase') return t.toLowerCase();
          if (s.tt === 'capitalize') return t.replace(/\b\w/g, m => m.toUpperCase()); return t; };
        // Keep the browser's own line breaks: other apps measure fonts a little differently and
        // would re-wrap. Each word is measured; a word that starts lower starts a new line.
        const d = n.data, re = /\S+/g, k0 = runs.length; let m, from = 0;
        while ((m = re.exec(d))) {
          const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
          const q = wr.getClientRects()[0]; if (!q) continue;
          if (st.top == null) st.top = q.top;
          else if (q.top > st.top + q.height * 0.5) {
            const before = d.slice(from, m.index);
            if (before.trim()) runs.push({ text: tx(before).replace(/\s+$/, ''), ...s });
            else if (runs.length && runs[runs.length - 1].text) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
            runs.push({ br: true });
            from = m.index; st.top = q.top;
          }
        }
        const rest = d.slice(from);
        if (rest) runs.push({ text: tx(rest), ...s });
        if (s.ls) { const cv = (collect.cv = collect.cv || document.createElement('canvas').getContext('2d'));
          const cs2 = getComputedStyle(n.parentElement); cv.font = `${cs2.fontStyle} ${cs2.fontWeight} ${cs2.fontSize} ${cs2.fontFamily}`;
          const t = tx(d).trim(), w0 = cv.measureText(t).width; if (w0 > 0) for (let k = k0; k < runs.length; k++) if (runs[k].text != null) runs[k].fit = Math.max(.6, (w0 + s.ls * t.length) / w0); }
      } else if (n.nodeType === 1) {
        if (SKIP.has(n.tagName) || n.hasAttribute('data-fs-done')) continue;
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (n.tagName === 'BR') { runs.push({ br: true }); st.top = null; continue; }
        if (!isInline(n, cs)) continue;                // walked as its own block
        const ir = Array.from(n.getClientRects()).filter(onSlide);
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && ir.length) {   // gradient highlights on inline text
          n.setAttribute('data-fsx', ++pid);
          ir.forEach(r => items.push({ t: 'pic', id: pid, ...box(r), z, o: order++, op, mode: 'self' }));
        }
        if (rgba(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some(s => num(cs['border' + s + 'Width']) > 0 && rgba(cs['border' + s + 'Color'])))
          ir.forEach(r => shapeOf(n, cs, r, z, op));
        collect(n, runs, rects, z, op, st);
      }
    }
  }

  function walk(el, z, op) {
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag) || (el.matches && el.matches(CHROME))) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    op *= +cs.opacity; if (op < 0.04) return;
    if (cs.position !== 'static' && cs.zIndex !== 'auto') z = +cs.zIndex;
    const r = el.getBoundingClientRect();
    const hidden = cs.visibility === 'hidden';

    if (PIC.has(tag)) {
      // svg content may overflow its box (overflow:visible labels): capture the painted extent
      let b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      if (tag === 'SVG') for (const c of el.querySelectorAll('*')) { const q = c.getBoundingClientRect(); if (q.width > 0 || q.height > 0) {
        b.l = Math.min(b.l, q.left); b.t = Math.min(b.t, q.top); b.r = Math.max(b.r, q.right); b.b = Math.max(b.b, q.bottom); } }
      const R = { left: b.l, top: b.t, right: b.r, bottom: b.b, width: b.r - b.l, height: b.b - b.t };
      if (!hidden && onSlide(R)) { el.setAttribute('data-fsx', ++pid); items.push({ t: 'pic', id: pid, ...box(R), z, o: order++, op, mode: 'all' }); }
      return; }
    if (!hidden && onSlide(r)) {
      if (cs.backgroundImage && cs.backgroundImage !== 'none') { el.setAttribute('data-fsx', ++pid); items.push({ t: 'pic', id: pid, ...box(r), z, o: order++, op, mode: 'self' }); }
      if (el !== document.body && el !== document.documentElement) shapeOf(el, cs, r, z, op);
    }
    if (BOXFORM.has(tag)) {   // form controls: their value as text
      const v = tag === 'SELECT' ? (el.selectedOptions[0] || {}).text : tag === 'BUTTON' ? el.innerText : el.value;
      if (v && onSlide(r) && !hidden) items.push({ t: 'text', ...box(r), runs: [{ text: v, ...runStyle(el) }], align: tag === 'BUTTON' ? 'center' : 'left', valign: 'middle', z, o: order++, op, single: true, pad: [num(cs.paddingLeft), num(cs.paddingRight)] });
      if (tag !== 'BUTTON') return;
      el.setAttribute('data-fs-done', ''); return;
    }
    // text owned directly by this block
    if (!hidden) {
      const runs = [], rects = [];
      collect(el, runs, rects, z, op);
      while (runs.length && !runs[0].br && !runs[0].text.trim()) runs.shift();
      if (runs.length) {
        runs[0].text = runs[0].text && runs[0].text.replace(/^\s+/, '');
        const last = runs[runs.length - 1]; if (last.text) last.text = last.text.replace(/\s+$/, '');
        const L = Math.min(...rects.map(q => q.left)), T = Math.min(...rects.map(q => q.top)), R = Math.max(...rects.map(q => q.right)), B = Math.max(...rects.map(q => q.bottom));
        const tops = new Set(rects.map(q => Math.round(q.top / 4)));
        let align = cs.textAlign; if (align === 'start' || align === 'justify') align = 'left'; if (align === 'end') align = 'right';
        if (runs.some(q => q.text && q.text.trim()))
          items.push({ t: 'text', x: L, y: T, w: R - L, h: B - T, runs, align, valign: 'top', single: tops.size === 1 && !runs.some(q => q.br), z, o: order++, op });
      }
    }
    for (const c of el.children) {
      const ccs = getComputedStyle(c);
      if (c.tagName !== 'BR' && !isInline(c, ccs)) walk(c, z, op);
      else if (isInline(c, ccs)) walkInlineBlocks(c, z, op);
    }
  }
  // block-level descendants nested inside inline elements (rare) still get walked
  function walkInlineBlocks(el, z, op) { for (const c of el.children) { const cs = getComputedStyle(c); if (isInline(c, cs)) walkInlineBlocks(c, z, op); else if (c.tagName !== 'BR') walk(c, z, op); } }

  const bcs = getComputedStyle(document.body), hcs = getComputedStyle(document.documentElement);
  const bg = rgba(bcs.backgroundColor) || rgba(hcs.backgroundColor) || { hex: 'FFFFFF', a: 1 };
  walk(document.body, 0, 1);
  items.sort((a, b) => (a.z - b.z) || (a.o - b.o));
  return { bg, items };
}

// Show only one picture element (and its subtree, or only its own background) for a transparent capture.
function isolate(id, mode) {
  let s = document.getElementById('fs-iso');
  if (!s) { s = document.createElement('style'); s.id = 'fs-iso'; document.head.appendChild(s); }
  const sel = `[data-fsx="${id}"]`;
  s.textContent = id == null ? '' :
    `html,body{background:transparent!important}body *{visibility:hidden!important}${sel}{visibility:visible!important}` +
    (mode === 'all' ? `${sel} *{visibility:visible!important}`
      // background only: its own text stays editable as a text box, so keep it out of the picture
      : `${sel}{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important}`);
}

// Density: same mechanics as `fslides pdf` (file:// pages cannot load /js/fuckslides.js)
function densityScript(config, force) {
  const dcfg = config.density, def = dcfg && (typeof dcfg === 'object' ? (dcfg.default || 3) : typeof dcfg === 'number' ? dcfg : 3);
  if (!dcfg && !force) return null;
  return { force: force || null, def: def || 3 };
}

async function buildEditable(config, opts = {}) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const outFile   = opts.out || path.join(cwd, (config.name || 'presentation') + '.pptx');
  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-edit-'));
  const overrides = config.pdfOverrides || {};
  const disabled  = new Set(config.disabled || []);
  const notesFile = path.join(cwd, 'notes.json');
  const notes     = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
  const dlev      = densityScript(config, opts.density);
  const files     = config.slides.filter(f => !disabled.has(f));

  const launch = { headless: true };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  console.log('\nLaunching browser…\n');
  let browser = await puppeteer.launch(launch);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title  = config.title || config.name || 'presentation';
  const stats = { text: 0, shape: 0, line: 0, pic: 0 };

  for (let i = 0, retried = false; i < files.length; i++) {
    const file = files[i], override = overrides[file] || {};
    if (!retried) process.stdout.write(`  [${String(i + 1).padStart(2)}/${files.length}] ${file}`);
    if (!browser.connected) browser = await puppeteer.launch(launch);
    const page = await browser.newPage();
    let slide = null;
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
    if (dlev) await page.evaluateOnNewDocument(({ force, def }) => {
      const r = []; for (let a = 1; a <= 5; a++) for (let k = 1; k <= 5; k++) { if (k > a) r.push(`html[data-density="${a}"] [data-d="${k}"]`); if (k < a) r.push(`html[data-density="${a}"] [data-dmax="${k}"]`); }
      const apply = () => { const h = document.documentElement; if (!h) return false;
        const L = force || +h.getAttribute('data-density') || def;
        window.FUCKSLIDES_DENSITY_LEVEL = L; h.dataset.density = L; h.style.setProperty('--density', L);
        const st = document.createElement('style'); st.textContent = r.join(',') + '{display:none!important}'; h.appendChild(st); return true; };
      if (!apply()) new MutationObserver((_, o) => { if (apply()) o.disconnect(); }).observe(document, { childList: true });
    }, dlev);
    try {
      await page.goto(`file://${path.join(slidesDir, file)}`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate('document.fonts && document.fonts.ready');
      await page.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));` + (override.extra || ''));
      await new Promise(r => setTimeout(r, (opts.wait || 3000) + (override.wait || 0)));
      // freeze at the final frame: finished animations keep their end state (fill-mode forwards),
      // endless ones are paused where they are, transitions stop
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;caret-color:transparent!important}' });
      await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch (e) { a.pause(); } }));
      const { bg, items } = await page.evaluate(extract);

      slide = pptx.addSlide();
      slide.background = { color: bg.hex };
      for (const it of items) {
        const tr = Math.round((1 - (it.op == null ? 1 : it.op)) * 100);
        if (it.t === 'pic') {
          await page.evaluate(isolate, it.id, it.mode);
          const x = Math.max(0, it.x), y = Math.max(0, it.y), w = Math.min(WIDTH, it.x + it.w) - x, h = Math.min(HEIGHT, it.y + it.h) - y;
          if (w < 1 || h < 1) continue;
          const png = path.join(tmpDir, `s${i}-p${it.id}.png`);
          await page.screenshot({ path: png, clip: { x, y, width: w, height: h }, omitBackground: true });
          slide.addImage({ path: png, x: x * PX, y: y * PX, w: w * PX, h: h * PX, transparency: tr || undefined });
          stats.pic++;
        } else if (it.t === 'shape') {
          const o = { x: it.x * PX, y: it.y * PX, w: it.w * PX, h: it.h * PX };
          o.fill = it.fill ? { color: it.fill.hex, transparency: Math.round((1 - it.fill.a * (it.op ?? 1)) * 100) } : { type: 'none' };
          o.line = it.line ? { color: it.line.c.hex, width: it.line.w * PT, transparency: Math.round((1 - it.line.c.a * (it.op ?? 1)) * 100) } : { type: 'none' };
          if (it.ellipse) slide.addShape(pptx.ShapeType.ellipse, o);
          else if (it.rad) slide.addShape(pptx.ShapeType.roundRect, { ...o, rectRadius: it.rad * PX });
          else slide.addShape(pptx.ShapeType.rect, o);
          stats.shape++;
        } else if (it.t === 'line') {
          const x = Math.min(it.x1, it.x2), y = Math.min(it.y1, it.y2);
          slide.addShape(pptx.ShapeType.line, { x: x * PX, y: y * PX, w: Math.abs(it.x2 - it.x1) * PX, h: Math.abs(it.y2 - it.y1) * PX,
            line: { color: it.c.hex, width: it.w * PT, dashType: it.dash || 'solid', transparency: Math.round((1 - it.c.a * (it.op ?? 1)) * 100) } });
          stats.line++;
        } else if (it.t === 'text') {
          const runs = []; let brk = false;
          it.runs.forEach((r, k) => {
            if (r.br) { brk = true; return; }
            if (!r.text) return;
            // named weights ("Inter SemiBold") so Slides keeps 500/600/800/900 instead of rounding to bold
            const WN = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 500: 'Medium', 600: 'SemiBold', 800: 'ExtraBold', 900: 'Black' };
            const wn = WN[Math.round((r.wt || 400) / 100) * 100];
            const o = { fontFace: wn ? `${r.font} ${wn}` : r.font, fontSize: Math.round(r.size * PT * 10) / 10, color: r.color, bold: !wn && r.wt >= 700, italic: r.italic };
            // Slides has no character spacing: tighten negative tracking by sizing the run down instead
            if (r.ls && opts.target === 'gslides') { if (r.ls < 0 && r.fit) o.fontSize = Math.round(o.fontSize * r.fit * 10) / 10; }
            else if (r.ls) o.charSpacing = Math.round(r.ls * PT * 10) / 10;
            if (r.u) o.underline = { style: 'sng' };
            if (r.sup) o.superscript = true; if (r.sub) o.subscript = true;
            if (r.href) o.hyperlink = { url: r.href };
            const ta = Math.round((1 - r.ca * (it.op ?? 1)) * 100); if (ta > 0) o.transparency = ta;
            if (brk && runs.length) o.softBreakBefore = true;
            brk = false;
            runs.push({ text: brk ? r.text : r.text, options: o });
          });
          if (!runs.length) continue;
          const tr0 = it.runs.filter(r => !r.br), big = Math.max(...tr0.map(r => r.size));
          const lh = Math.max(...tr0.map(r => r.lh || r.size * 1.2));
          // fonts render a little wider outside Chrome: give boxes room so lines do not re-wrap
          // Line breaks are explicit, and Slides always wraps at the box edge: give every box
          // room to grow on its free side so a slightly wider font never re-wraps a line.
          let x = it.x, w = it.w;
          const grow = Math.max(24, it.w * .3);
          if (it.align === 'center') { const g = Math.min(grow / 2, x, WIDTH - (x + w)); x -= g; w += 2 * g; }
          else if (it.align === 'right') { const g = Math.min(grow, x); x -= g; w += g; }
          else w = Math.min(w + grow, Math.max(w, WIDTH - x));
          const o = { x: x * PX, y: it.y * PX, w: w * PX, h: Math.max(it.h, lh) * PX, margin: 0, align: it.align, valign: it.valign || 'top',
            lineSpacingMultiple: Math.round(lh / (big * 1.21) * 100) / 100, fontSize: Math.round(big * PT * 10) / 10,
            paraSpaceBefore: 0, paraSpaceAfter: 0, fit: 'none', wrap: false };
          if (it.pad) { o.x = it.x * PX; o.w = it.w * PX; o.margin = [0, it.pad[1] * PT, 0, it.pad[0] * PT]; o.lineSpacingMultiple = undefined; }
          slide.addText(runs, o);
          stats.text++;
        }
      }
      await page.evaluate(isolate, null);
      if (notes[file]) slide.addNotes(String(notes[file]));
      console.log(` ✓ ${items.length} objects`);
      retried = false;
    } catch (err) {
      // Chrome occasionally drops a page on long runs: relaunch and redo the slide once
      if (!retried && !browser.connected) {
        if (slide) pptx._slides.pop();
        retried = true; i--; continue;
      }
      console.log(` ✗ (${err.message.split('\n')[0]})`);
      retried = false;
    } finally {
      try { await page.close(); } catch (_) {}
    }
  }
  try { await browser.close(); } catch (_) {}
  await pptx.writeFile({ fileName: outFile });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  const size = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✅  ${path.basename(outFile)} — ${files.length} slides, editable: ${stats.text} text boxes, ${stats.shape} shapes, ${stats.line} lines, ${stats.pic} pictures · ${size} MB\n    ${outFile}\n`);
  return outFile;
}

// ── Google Slides: upload the native .pptx to Drive and let Drive convert it ─────────────────
function googleToken() {
  if (process.env.GOOGLE_OAUTH_TOKEN) return process.env.GOOGLE_OAUTH_TOKEN.trim();
  try { return execSync('gcloud auth print-access-token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return null; }
}

async function uploadToSlides(file, title) {
  const token = googleToken();
  const manual = () => {
    console.log('  To open it in Google Slides without uploading from here:');
    console.log('    drive.google.com → New → File upload → right-click the .pptx → Open with → Google Slides');
    console.log('  To upload from here, sign in once with Drive access:');
    console.log('    gcloud auth login --enable-gdrive-access     (or set GOOGLE_OAUTH_TOKEN)\n');
  };
  if (!token) { console.log('\n  No Google credentials found.'); manual(); return null; }
  const boundary = 'fslides' + Date.now();
  const meta = JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.presentation' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`),
    fs.readFileSync(file), Buffer.from(`\r\n--${boundary}--`)]);
  console.log('  Uploading to Google Drive and converting to Google Slides…');
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.log(`\n  ✗ Drive upload failed (${r.status}): ${(d.error && d.error.message) || 'unknown error'}`);
    if (r.status === 401 || r.status === 403) manual();
    return null;
  }
  console.log(`\n✅  Google Slides: ${d.webViewLink}\n    Private to your account until you share it.\n`);
  return d.webViewLink;
}

module.exports = { buildEditable, uploadToSlides };
