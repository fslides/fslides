'use strict';

const puppeteer   = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const GLOBAL_INJECT = `
  document.getAnimations().forEach(a => { try { a.finish(); } catch(e) {} });
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
`;

const WIDTH  = 1280;
const HEIGHT = 720;

async function launchBrowser() {
  const launchOpts = { headless: true };

  // Allow users to point Puppeteer at an existing Chrome install. Useful when
  // the bundled-Chrome download was skipped or unavailable (corporate proxies,
  // restricted-network CI runners, sandboxed environments, etc.).
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  try {
    return await puppeteer.launch(launchOpts);
  } catch (err) {
    console.error('\n❌  Failed to launch Chrome.\n');
    console.error(err.message + '\n');
    console.error('Troubleshooting:');
    console.error('  • If Puppeteer\'s bundled-Chrome download was skipped or blocked,');
    console.error('    point Puppeteer at an existing Chrome with PUPPETEER_EXECUTABLE_PATH,');
    console.error('    e.g.:');
    console.error('      export PUPPETEER_EXECUTABLE_PATH="$(which google-chrome)"            # Linux');
    console.error('      export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # macOS');
    console.error('  • Or re-run npm install with PUPPETEER_SKIP_DOWNLOAD=false to fetch');
    console.error('    the bundled Chrome.\n');
    process.exit(1);
  }
}

module.exports = async function exportPdf(config, opts = {}) {
  const cwd      = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const outFile   = path.join(cwd, config.name ? `${config.name}.pdf` : 'presentation.pdf');
  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-pdf-'));
  const overrides = config.pdfOverrides || {};

  console.log('\nLaunching browser…\n');
  const browser  = await launchBrowser();
  const pdfPaths = [];

  for (let i = 0; i < config.slides.length; i++) {
    const file    = config.slides[i];
    const dcfg    = config.density, ddef = dcfg && (typeof dcfg === 'object' ? (dcfg.default || 3) : typeof dcfg === 'number' ? dcfg : 3);
    const dforce  = opts.density || null;       // --density N: one level for every slide
    const dlev    = dcfg || dforce ? { force: dforce, def: ddef || 3 } : null;
    const url     = `file://${path.join(slidesDir, file)}` + (dforce ? `?density=${dforce}` : '');
    const tmpPdf  = path.join(tmpDir, `slide-${String(i).padStart(3, '0')}.pdf`);
    const override = overrides[file] || {};
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${config.slides.length}] ${file}`);

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    if (dlev) await page.evaluateOnNewDocument(({ force, def }) => {
      // file:// pages can't load /js/fuckslides.js: apply the slide's own
      // <html data-density> (or the forced / default level) before slide scripts run
      const r = []; for (let a = 1; a <= 5; a++) for (let k = 1; k <= 5; k++) { if (k > a) r.push(`html[data-density="${a}"] [data-d="${k}"]`); if (k < a) r.push(`html[data-density="${a}"] [data-dmax="${k}"]`); }
      const apply = () => { const h = document.documentElement; if (!h) return false;
        const L = force || +h.getAttribute('data-density') || def;
        window.FUCKSLIDES_DENSITY_LEVEL = L; h.dataset.density = L; h.style.setProperty('--density', L);
        const st = document.createElement('style'); st.textContent = r.join(',') + '{display:none!important}'; h.appendChild(st); return true; };
      if (!apply()) new MutationObserver((_, o) => { if (apply()) o.disconnect(); }).observe(document, { childList: true });
    }, dlev);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.evaluate(GLOBAL_INJECT + (override.extra || ''));
      await new Promise(r => setTimeout(r, 2000 + (override.wait || 0)));

      await page.pdf({
        path: tmpPdf, width: `${WIDTH}px`, height: `${HEIGHT}px`,
        printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      pdfPaths.push(tmpPdf);
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗ (${err.message.split('\n')[0]})`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n  Merging…');
  const merged = await PDFDocument.create();
  for (const p of pdfPaths) {
    const doc   = await PDFDocument.load(fs.readFileSync(p));
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(pg => merged.addPage(pg));
  }
  fs.writeFileSync(outFile, await merged.save());

  pdfPaths.forEach(p => fs.unlinkSync(p));
  fs.rmdirSync(tmpDir);

  const size = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✅  ${path.basename(outFile)} — ${pdfPaths.length} slides, ${size} MB\n    ${outFile}\n`);
};
