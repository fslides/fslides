'use strict';
// Shared helpers: resolve puppeteer and the deck config from the current directory.
const path = require('path'), fs = require('fs');
const { createRequire } = require('module');

exports.deck = function () {
  const cwd = process.cwd();
  const cfgPath = ['fslides.config.js', 'fuckslides.config.js'].map(f => path.join(cwd, f)).find(fs.existsSync);
  if (!cfgPath) { console.error('Run this from a deck directory (fslides.config.js not found).'); process.exit(1); }
  const config = require(cfgPath);
  const req = createRequire(path.join(cwd, 'package.json'));
  let puppeteer;
  try { puppeteer = req('puppeteer'); } catch (_) {
    try { puppeteer = req(path.join(path.dirname(require.resolve('fslides/package.json', { paths: [cwd] })), 'node_modules/puppeteer')); } catch (e) {
      console.error('puppeteer not found. Run `npm install` in the deck directory.'); process.exit(1); }
  }
  return { cwd, config, puppeteer };
};

exports.args = function () {
  const a = process.argv.slice(2), o = { files: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--density') o.density = +a[++i];
    else if (a[i] === '--over') o.over = +a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--url') o.url = a[++i];
    else o.files.push(a[i]);
  }
  return o;
};

exports.launch = function (puppeteer) {
  const opts = { headless: true };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  return puppeteer.launch(opts);
};

exports.base = (config, o) => (o.url || `http://localhost:${config.port || 3000}`).replace(/\/$/, '');
exports.slides = (config, o) => o.files.length ? o.files : config.slides.filter(s => !(config.disabled || []).includes(s));
