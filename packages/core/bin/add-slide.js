'use strict';

const fs   = require('fs');
const path = require('path');

const TEMPLATES = {

  title: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Title</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; display: flex; align-items: center; justify-content: center; }
    body::before { content: ''; position: fixed; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .slide { text-align: center; position: relative; z-index: 1; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #38BDF8; margin-bottom: 20px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    h1 { font-size: 80px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; opacity: 0; animation: fade-up 0.5s ease forwards 0.15s; }
    h1 em { font-style: normal; color: #38BDF8; }
    .sub { margin-top: 20px; font-size: 22px; font-weight: 400; color: rgba(255,255,255,0.45); opacity: 0; animation: fade-up 0.5s ease forwards 0.3s; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="eyebrow">Eyebrow Label</div>
    <h1>Your <em>Title</em><br>Goes Here</h1>
    <div class="sub">Supporting subtitle or context</div>
  </div>
</body></html>`,

  stat: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Stat</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; }
    body::before { content: ''; position: fixed; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .slide { width: 1280px; height: 720px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; position: relative; z-index: 1; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #38BDF8; margin-bottom: 24px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; width: 960px; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-top: 2px solid #38BDF8; border-radius: 12px; padding: 28px 32px; opacity: 0; }
    .card:nth-child(1) { animation: fade-up 0.5s ease forwards 0.2s; }
    .card:nth-child(2) { animation: fade-up 0.5s ease forwards 0.32s; }
    .card:nth-child(3) { animation: fade-up 0.5s ease forwards 0.44s; }
    .num { font-size: 56px; font-weight: 900; letter-spacing: -0.04em; color: #38BDF8; line-height: 1; }
    .label { margin-top: 8px; font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.4; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="eyebrow">Key Numbers</div>
    <div class="grid">
      <div class="card"><div class="num">99%</div><div class="label">first stat label</div></div>
      <div class="card"><div class="num">10×</div><div class="label">second stat label</div></div>
      <div class="card"><div class="num">3 days</div><div class="label">third stat label</div></div>
    </div>
  </div>
</body></html>`,

  quote: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Quote</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; display: flex; align-items: center; justify-content: center; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .quote-wrap { max-width: 900px; text-align: center; }
    .quote-mark { font-size: 120px; line-height: 0.5; color: #38BDF8; opacity: 0.3; font-family: Georgia, serif; margin-bottom: 16px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    blockquote { font-size: 36px; font-weight: 300; line-height: 1.45; letter-spacing: -0.01em; color: rgba(255,255,255,0.88); opacity: 0; animation: fade-up 0.5s ease forwards 0.2s; }
    .attribution { margin-top: 32px; font-size: 14px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); opacity: 0; animation: fade-up 0.5s ease forwards 0.4s; }
    .attribution span { color: #38BDF8; }
  </style>
</head>
<body>
  <div class="quote-wrap">
    <div class="quote-mark">"</div>
    <blockquote>The quote goes here. Make it punchy, make it count, make it land.</blockquote>
    <div class="attribution"><span>First Last</span> · Title, Company</div>
  </div>
</body></html>`,

  split: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Split</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; }
    body::before { content: ''; position: fixed; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .slide { display: grid; grid-template-columns: 1fr 1fr; height: 720px; }
    .left { display: flex; flex-direction: column; justify-content: center; padding: 64px 56px 64px 80px; position: relative; z-index: 1; }
    .right { display: flex; align-items: center; justify-content: center; background: rgba(56,189,248,0.04); border-left: 1px solid rgba(56,189,248,0.1); position: relative; z-index: 1; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #38BDF8; margin-bottom: 18px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    h1 { font-size: 52px; font-weight: 900; letter-spacing: -0.035em; line-height: 1.05; margin-bottom: 20px; opacity: 0; animation: fade-up 0.5s ease forwards 0.15s; }
    h1 em { font-style: normal; color: #38BDF8; }
    .body { font-size: 17px; line-height: 1.6; color: rgba(255,255,255,0.55); opacity: 0; animation: fade-up 0.5s ease forwards 0.28s; }
    .right-content { font-size: 100px; opacity: 0; animation: fade-up 0.5s ease forwards 0.35s; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="left">
      <div class="eyebrow">Section</div>
      <h1>Left side<br><em>heading</em></h1>
      <p class="body">Supporting text goes here. Explain the key insight in two or three sentences. Keep it tight.</p>
    </div>
    <div class="right">
      <div class="right-content">✦</div>
    </div>
  </div>
</body></html>`,

  bullets: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Bullets</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; }
    body::before { content: ''; position: fixed; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    .slide { width: 1280px; height: 720px; display: flex; flex-direction: column; padding: 64px 80px; position: relative; z-index: 1; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #38BDF8; margin-bottom: 14px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    h1 { font-size: 52px; font-weight: 900; letter-spacing: -0.035em; line-height: 1.05; margin-bottom: 40px; opacity: 0; animation: fade-up 0.5s ease forwards 0.15s; }
    h1 em { font-style: normal; color: #38BDF8; }
    .list { display: flex; flex-direction: column; gap: 18px; }
    .item { display: flex; align-items: flex-start; gap: 16px; opacity: 0; }
    .item:nth-child(1) { animation: fade-up 0.45s ease forwards 0.3s; }
    .item:nth-child(2) { animation: fade-up 0.45s ease forwards 0.42s; }
    .item:nth-child(3) { animation: fade-up 0.45s ease forwards 0.54s; }
    .item:nth-child(4) { animation: fade-up 0.45s ease forwards 0.66s; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #38BDF8; flex-shrink: 0; margin-top: 10px; box-shadow: 0 0 10px rgba(56,189,248,0.5); }
    .item-text { font-size: 22px; line-height: 1.45; color: rgba(255,255,255,0.85); }
    .item-text strong { color: #fff; font-weight: 700; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="eyebrow">Key Points</div>
    <h1>What you need<br>to <em>know</em></h1>
    <div class="list">
      <div class="item"><span class="dot"></span><span class="item-text"><strong>First point.</strong> Supporting context in normal weight after the bold hook.</span></div>
      <div class="item"><span class="dot"></span><span class="item-text"><strong>Second point.</strong> Keep each item to one or two lines maximum.</span></div>
      <div class="item"><span class="dot"></span><span class="item-text"><strong>Third point.</strong> End with the punchline or the action item.</span></div>
    </div>
  </div>
</body></html>`,

  cover: `<html lang="en"><head>
  <meta charset="UTF-8"><title>Cover</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; background: #0d0f14; color: #fff; display: flex; align-items: center; justify-content: center; }
    .bg { position: fixed; inset: 0; background: radial-gradient(ellipse at 20% 50%, rgba(56,189,248,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 40%, rgba(168,85,247,0.09) 0%, transparent 55%), #0d0f14; }
    body::before { content: ''; position: fixed; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; z-index: 1; }
    @keyframes fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
    .slide { text-align: center; position: relative; z-index: 2; }
    .tag { display: inline-flex; align-items: center; gap: 6px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.2); border-radius: 100px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #38BDF8; margin-bottom: 28px; opacity: 0; animation: fade-up 0.5s ease forwards 0.05s; }
    h1 { font-size: 88px; font-weight: 900; letter-spacing: -0.045em; line-height: 0.96; opacity: 0; animation: fade-up 0.55s ease forwards 0.18s; }
    h1 em { font-style: normal; color: #38BDF8; }
    .meta { margin-top: 28px; font-size: 15px; color: rgba(255,255,255,0.35); opacity: 0; animation: fade-up 0.5s ease forwards 0.38s; }
    .meta span { color: rgba(255,255,255,0.55); font-weight: 600; }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="slide">
    <div class="tag">Your Company · 2025</div>
    <h1>Presentation<br><em>Title Here</em></h1>
    <div class="meta"><span>Your Name</span> · Role · Date</div>
  </div>
</body></html>`,

};

const TEMPLATE_NAMES = Object.keys(TEMPLATES).join(', ');

module.exports = function addSlide(slideName, templateName) {
  if (!slideName) {
    console.error(`\n  Usage: fuckslides add-slide <name> [--template <type>]\n  Templates: ${TEMPLATE_NAMES}\n`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const cfgPath = ['fslides.config.js','fuckslides.config.js'].map(x => path.join(cwd, x)).find(p => fs.existsSync(p)) || path.join(cwd, 'fslides.config.js');
  if (!require('fs').existsSync(cfgPath)) {
    console.error('❌  No fuckslides.config.js found. Run from a presentation directory.');
    process.exit(1);
  }

  const tpl = templateName || 'title';
  if (!TEMPLATES[tpl]) {
    console.error(`❌  Unknown template "${tpl}". Available: ${TEMPLATE_NAMES}`);
    process.exit(1);
  }

  const config = require(cfgPath);
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const fileName = slideName.endsWith('.html') ? slideName : slideName + '.html';
  const filePath = path.join(slidesDir, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`❌  ${fileName} already exists.`);
    process.exit(1);
  }

  fs.writeFileSync(filePath, TEMPLATES[tpl], 'utf8');

  // Add to config
  let src = fs.readFileSync(cfgPath, 'utf8');
  const label = slideName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const fmt = arr => '[\n    ' + arr.map(s => `'${s}'`).join(',\n    ') + ',\n  ]';
  const newSlides = [...config.slides, fileName];
  const newLabels = [...(config.labels || config.slides.map(s => s.replace('.html',''))), label];
  src = src.replace(/slides:\s*\[[^\]]*\]/, `slides: ${fmt(newSlides)}`);
  if (/labels\s*:/.test(src)) src = src.replace(/labels:\s*\[[^\]]*\]/, `labels: ${fmt(newLabels)}`);
  fs.writeFileSync(cfgPath, src, 'utf8');

  console.log(`\n  ✓  Created slides/${fileName}  (template: ${tpl})\n  Added to fuckslides.config.js\n`);
};
