'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You convert presentation slide images into fuckSlides HTML files.

fuckSlides is a no-bullshit HTML presentation framework. Every slide is a standalone HTML file fixed at 1280×720px.

ABSOLUTE RULES
- Output ONLY the complete HTML file. No markdown fences, no explanation, nothing else.
- html and body must be exactly: width:1280px; height:720px; overflow:hidden;
- Always end with this exact line before </body>:  <script src="/js/fuckslides.js"></script>
- Always include Google Fonts in <head>:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
- Add -webkit-font-smoothing: antialiased to body

DESIGN SYSTEM
Background: #0d0f14 unless the original slide is clearly light/white, then use #f8f8f8
Dot-grid overlay (always present):
  body::before {
    content:''; position:fixed; inset:0; pointer-events:none;
    background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
Accent color: extract the dominant brand color from the slide image. Default: #38BDF8
Titles: Inter, font-weight:900, letter-spacing:-0.04em, line-height:1.1
Labels / eyebrows: Inter or JetBrains Mono, font-weight:700, letter-spacing:0.14em, text-transform:uppercase, small (10–12px)
Code / mono elements: JetBrains Mono
Cards: background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:24px 28px;
Entrance animation — apply to every content element with staggered delays:
  @keyframes fade-up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
  Each element starts at opacity:0, uses animation: fade-up 0.5s ease forwards, delays stepping from 0.05s to ~0.5s

CONTENT FIDELITY
- Reproduce ALL visible text exactly as it appears
- Match the layout intent: centered → flexbox center; grid of cards → CSS grid; left column + right column → two-column grid
- Match the visual hierarchy: large headlines stay large, small captions stay small
- Preserve the original color palette and accent colors as closely as possible
- For logos or images you cannot reproduce, use a labelled placeholder div
- For charts or diagrams, recreate them with CSS/SVG — do not leave them blank`;

// ─── PDF → array of PNG Buffers ───────────────────────────────────────────────

async function pdfToImages(pdfPath) {
  const { PDFDocument } = require('pdf-lib');
  const puppeteer       = require('puppeteer');

  const pdfBytes = fs.readFileSync(pdfPath);
  const srcDoc   = await PDFDocument.load(pdfBytes);
  const total    = srcDoc.getPageCount();
  console.log(`  📄  ${total} page${total > 1 ? 's' : ''} found in ${path.basename(pdfPath)}`);

  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-import-'));
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const buffers = [];
  for (let i = 0; i < total; i++) {
    // Extract single page so Chrome's PDF viewer fills the viewport cleanly
    const single  = await PDFDocument.create();
    const [copied] = await single.copyPages(srcDoc, [i]);
    single.addPage(copied);
    const singleBytes = await single.save();

    const tmpPdf = path.join(tmpDir, `page-${i}.pdf`);
    fs.writeFileSync(tmpPdf, singleBytes);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    await page.goto(`file://${tmpPdf}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 700));
    buffers.push(await page.screenshot({ type: 'png' }));
    await page.close();
  }

  await browser.close();
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}

  return buffers;
}

// ─── Image Buffer → fuckSlides HTML ──────────────────────────────────────────

async function imageToHTML(imageBuffer, mimeType, client, index, total) {
  process.stdout.write(`  [${index + 1}/${total}] Converting slide…`);

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4096,
    system:     SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type:   'image',
          source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') },
        },
        { type: 'text', text: 'Convert this slide to a complete fuckSlides HTML file.' },
      ],
    }],
  });

  let html = response.content[0].text.trim();
  // Strip accidental markdown fences
  html = html.replace(/^```html\s*/i, '').replace(/\s*```$/, '');

  process.stdout.write(' ✅\n');
  return html;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

module.exports = async function importSlides(args) {
  if (!args || args.length === 0) {
    console.error('Usage: fuckslides import <file.pdf>');
    console.error('       fuckslides import slide1.png slide2.png ...');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY is not set.');
    console.error('    export ANTHROPIC_API_KEY=sk-ant-...\n');
    process.exit(1);
  }

  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch (_) {
    console.error('\n❌  @anthropic-ai/sdk is not installed in this project.');
    console.error('    npm install @anthropic-ai/sdk\n');
    process.exit(1);
  }

  const client   = new Anthropic({ apiKey });
  const cwd      = process.cwd();
  const slidesDir = path.join(cwd, 'slides');

  // Resolve and validate input files
  const inputPaths = args.map(a => path.resolve(cwd, a));
  for (const p of inputPaths) {
    if (!fs.existsSync(p)) {
      console.error(`❌  File not found: ${p}`);
      process.exit(1);
    }
  }

  // Collect { buffer, mimeType } for every slide
  const images = [];
  for (const p of inputPaths) {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.pdf') {
      console.log();
      const bufs = await pdfToImages(p);
      bufs.forEach(b => images.push({ buffer: b, mimeType: 'image/png' }));
    } else if (ext === '.png') {
      images.push({ buffer: fs.readFileSync(p), mimeType: 'image/png' });
    } else if (ext === '.jpg' || ext === '.jpeg') {
      images.push({ buffer: fs.readFileSync(p), mimeType: 'image/jpeg' });
    } else if (ext === '.webp') {
      images.push({ buffer: fs.readFileSync(p), mimeType: 'image/webp' });
    } else {
      console.error(`❌  Unsupported file type: ${ext}  (supported: pdf, png, jpg, webp)`);
      process.exit(1);
    }
  }

  if (images.length === 0) {
    console.error('❌  No slides to convert.');
    process.exit(1);
  }

  console.log(`\n🎨  Converting ${images.length} slide${images.length > 1 ? 's' : ''} with Claude…\n`);
  fs.mkdirSync(slidesDir, { recursive: true });

  const slideFiles = [];
  for (let i = 0; i < images.length; i++) {
    const { buffer, mimeType } = images[i];
    const html     = await imageToHTML(buffer, mimeType, client, i, images.length);
    const filename = `slide-${String(i + 1).padStart(2, '0')}.html`;
    fs.writeFileSync(path.join(slidesDir, filename), html);
    slideFiles.push(filename);
  }

  // Write fuckslides.config.js (create or overwrite)
  const name    = path.basename(cwd);
  const labels  = slideFiles.map((_, i) => `Slide ${i + 1}`);
  const config  = `module.exports = {
  name: '${name}',

  slides: ${JSON.stringify(slideFiles, null, 4).replace(/\n/g, '\n  ')},

  labels: ${JSON.stringify(labels, null, 4).replace(/\n/g, '\n  ')},
};
`;
  fs.writeFileSync(['fslides.config.js','fuckslides.config.js'].map(x => path.join(cwd, x)).find(p => fs.existsSync(p)) || path.join(cwd, 'fslides.config.js'), config);

  console.log(`
✅  ${slideFiles.length} slide${slideFiles.length > 1 ? 's' : ''} imported into slides/

  fuckslides serve
`);
};
