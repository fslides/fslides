'use strict';

const puppeteer    = require('puppeteer');
const { execSync } = require('child_process');
const fs  = require('fs');
const os  = require('os');
const path = require('path');

const WIDTH    = 1280;
const HEIGHT   = 720;
const SCALE    = 2;
const FPS      = 20;
const DURATION = 13000;

// Optional flags anywhere on the command line:
//   --fps=N         capture/playback frame rate (default 20)
//   --duration=N    capture length in seconds (or ms if > 1000)
function parseFlags(argv) {
  const flags = {};
  for (const a of argv) {
    let m = /^--fps=(\d+(?:\.\d+)?)$/.exec(a);
    if (m) flags.fps = parseFloat(m[1]);
    m = /^--duration=(\d+(?:\.\d+)?)$/.exec(a);
    if (m) {
      const v = parseFloat(m[1]);
      flags.duration = v > 1000 ? v : v * 1000;
    }
    m = /^--scale=([12])$/.exec(a);
    if (m) flags.scale = parseInt(m[1], 10);
  }
  return flags;
}

module.exports = async function exportGif(config, slideArg) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');

  if (!slideArg || slideArg.startsWith('--')) {
    console.error('Usage: fuckslides gif <slide.html> [--fps=30] [--duration=13] [--scale=1]');
    process.exit(1);
  }

  const flags    = parseFlags(process.argv);
  const fps      = flags.fps || FPS;
  const duration = flags.duration || DURATION;
  const scale    = flags.scale || SCALE;

  const slideFile = path.isAbsolute(slideArg) ? slideArg : path.join(slidesDir, slideArg);
  const outFile   = path.join(cwd, path.basename(slideArg, '.html') + '.gif');
  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-gif-'));

  console.log(`\nLaunching browser…\n`);
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: scale });
  await page.goto(`file://${slideFile}`, { waitUntil: 'domcontentloaded' });

  const interval    = 1000 / fps;
  const totalFrames = Math.round(duration / interval);

  console.log(`  Capturing ${totalFrames} frames at ${fps}fps (${duration / 1000}s)\n`);

  // Drift-corrected capture: each frame aims for start + i*interval, so
  // screenshot time doesn't stretch the real sampling period. The actual
  // elapsed time is measured and the GIF is encoded at the *effective*
  // frame rate, so playback always matches real time even if capture
  // can't keep up with the requested fps.
  const start = Date.now();
  let last = start;
  for (let i = 0; i < totalFrames; i++) {
    const raw  = await page.screenshot({ type: 'png' });
    const shot = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    fs.writeFileSync(path.join(tmpDir, `frame-${String(i).padStart(4, '0')}.png`), shot);
    last = Date.now();
    process.stdout.write(`\r  [${String(i + 1).padStart(3)}/${totalFrames}] captured`);
    if (i < totalFrames - 1) {
      const target = start + (i + 1) * interval;
      const wait   = target - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
  }

  await browser.close();

  const elapsed      = last - start;
  const effectiveFps = elapsed > 0 ? ((totalFrames - 1) * 1000) / elapsed : fps;
  const encodeFps    = Math.min(50, Math.max(1, effectiveFps));

  console.log(`\n\n  Captured ${totalFrames} frames in ${(elapsed / 1000).toFixed(1)}s → encoding at ${encodeFps.toFixed(1)}fps with gifski…\n`);

  execSync(
    `gifski --fps ${encodeFps.toFixed(2)} --quality 100 -W ${WIDTH * scale} -H ${HEIGHT * scale} --output "${outFile}" "${tmpDir}"/frame-*.png`,
    { shell: true, stdio: 'inherit' }
  );

  fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f)));
  fs.rmdirSync(tmpDir);

  const size = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✅  ${path.basename(outFile)} — ${size} MB\n    ${outFile}\n`);
};
