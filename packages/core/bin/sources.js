'use strict';

// sources.json — the deck's citation registry, committed next to notes.json.
//
//   { "s1": { "url": "https://…", "title": "…", "publisher": "gartner.com",
//             "published": "2025-08-26", "quote": "…exact passage…",
//             "added": "2026-10-21", "checked": "2026-10-21", "status": "ok" } }
//
// Slides point at entries with data-cite="s1" (space/comma separated for
// several). The runtime turns that into a superscript marker + hover card and
// level-5 footnotes. tailor.json holds per-audience values for data-fill="key".
// .fslides/ holds local-only state (cache, verify / fresh reports).

const fs   = require('fs');
const path = require('path');

const today = () => new Date().toISOString().slice(0, 10);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const sourcesPath = cwd => path.join(cwd, 'sources.json');
const tailorPath  = cwd => path.join(cwd, 'tailor.json');
const statePath   = (cwd, name) => path.join(cwd, '.fslides', name + '.json');

const loadSources = cwd => readJson(sourcesPath(cwd), {});
const saveSources = (cwd, s) => writeJson(sourcesPath(cwd), s);
const loadTailor  = cwd => readJson(tailorPath(cwd), {});
const loadState   = (cwd, name) => readJson(statePath(cwd, name), null);
const saveState   = (cwd, name, d) => writeJson(statePath(cwd, name), d);

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$|^gclid$/.test(k)) x.searchParams.delete(k);
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + (x.search || '')).toLowerCase();
  } catch (_) { return String(u).toLowerCase(); }
}

function publisher(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return ''; }
}

function nextId(sources) {
  let n = 0;
  for (const k of Object.keys(sources)) { const m = k.match(/^s(\d+)$/); if (m) n = Math.max(n, +m[1]); }
  return 's' + (n + 1);
}

// add an Exa result (or { url, title, … }) — deduped by URL, returns the id
function addSource(sources, r, extra = {}) {
  const key = normUrl(r.url);
  let id = Object.keys(sources).find(k => normUrl(sources[k].url) === key);
  const quote = extra.quote || (r.highlights && r.highlights[0]) || '';
  if (!id) {
    id = nextId(sources);
    sources[id] = {
      url: r.url,
      title: (r.title || '').trim() || publisher(r.url),
      publisher: publisher(r.url),
      ...(r.publishedDate || r.published ? { published: String(r.publishedDate || r.published).slice(0, 10) } : {}),
      ...(r.author ? { author: r.author } : {}),
      ...(quote ? { quote: clean(quote).slice(0, 400) } : {}),
      added: today(),
    };
  } else if (quote && !sources[id].quote) {
    sources[id].quote = clean(quote).slice(0, 400);
  }
  return id;
}

// ── slide text & claims ──────────────────────────────────────────────────────

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', times: '×', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(c) ? m : String.fromCodePoint(c); }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const clean = s => decode(String(s)).replace(/\s+/g, ' ').trim();

function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ');
}

// visible text as lines (one per block element)
function slideLines(html) {
  return stripNoise(html)
    .replace(/<\/?(div|p|h[1-6]|li|ul|ol|section|article|header|footer|tr|td|th|table|blockquote|figcaption|figure|br|main|aside)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n').map(clean).filter(Boolean);
}

function slideTitle(html) {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1].replace(/<[^>]+>/g, ' ')) : '';
}

// numbers worth checking: 40%, $8.4B, 2.4×, 1.4T, 450ms, 3x, 12pp, 10,000+
const NUM_RE = /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:[KMBT]\b|bn\b|million\b|billion\b|trillion\b)?\+?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|×|x\b|pp\b|ms\b|[KMBT]\b\+?|bn\b|million\b|billion\b|trillion\b)|\b\d{1,3}(?:,\d{3})+\+?)/gi;

// cited claims: every element carrying data-cite, with its text and ids
function citedClaims(html) {
  const out = [];
  const re = /<([a-z][a-z0-9]*)\b([^>]*?)\bdata-cite=(["'])([^"']*)\3([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  const body = stripNoise(html);
  while ((m = re.exec(body))) {
    const ids = m[4].split(/[\s,]+/).filter(Boolean);
    const text = clean(m[6].replace(/<[^>]+>/g, ' '));
    out.push({ ids, text, numbers: (text.match(NUM_RE) || []).map(s => s.trim()) });
  }
  return out;
}

// uncited numeric claims: lines with a number, minus anything inside data-cite
function uncitedClaims(html) {
  const without = stripNoise(html).replace(/<([a-z][a-z0-9]*)\b[^>]*\bdata-cite=(["'])[^"']*\2[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const lines = slideLines(without);
  const out = [];
  lines.forEach((line, i) => {
    const nums = line.match(NUM_RE);
    if (!nums) return;
    // a bare stat ("40%") usually has its meaning in the next line
    const ctx = line.length < 24 && lines[i + 1] ? line + ' ' + lines[i + 1] : line;
    out.push({ text: ctx.slice(0, 280), numbers: nums.map(s => s.trim()) });
  });
  return out;
}

// regex that finds a claim number in source text, tolerant to formatting:
// "40%" ↔ "40 percent", "$8.4B" ↔ "8.4 billion", "2.4×" ↔ "2.4x" / "2.4 times"
const UNIT = {
  '%': '\\s?(?:%|percent|per cent)',
  '×': '\\s?(?:×|x|times|-fold)', x: '\\s?(?:×|x|times|-fold)',
  pp: '\\s?(?:pp|percentage points?|points?)',
  ms: '\\s?(?:ms|milliseconds?)',
  k: '\\s?(?:k|thousand)', thousand: '\\s?(?:k|thousand)',
  m: '\\s?(?:m|mn|million)', million: '\\s?(?:m|mn|million)',
  b: '\\s?(?:b|bn|billion)', bn: '\\s?(?:b|bn|billion)', billion: '\\s?(?:b|bn|billion)',
  t: '\\s?(?:t|tn|trillion)', trillion: '\\s?(?:t|tn|trillion)',
};
function numberPattern(token) {
  const m = token.match(/(\d[\d,]*(?:\.\d+)?)\s?(%|×|x|pp|ms|k|m|b|t|bn|thousand|million|billion|trillion)?/i);
  if (!m) return null;
  const digits = m[1].replace(/,/g, '');
  const [int, dec] = digits.split('.');
  const intRe = int.length > 3 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',?') : int;
  const numRe = intRe + (dec ? '[.,]' + dec : '(?:[.,]0+)?');
  const unit = m[2] ? UNIT[m[2].toLowerCase()] || UNIT[m[2]] : '';
  return new RegExp('(?<![\\d.,])' + numRe + (unit ? '(?:' + unit + ')' : '(?![\\d])'), 'i');
}

function findNumber(text, token) {
  const re = numberPattern(token);
  if (!re) return null;
  const m = re.exec(text);
  if (!m) return null;
  const a = Math.max(0, m.index - 160), b = Math.min(text.length, m.index + m[0].length + 160);
  return (a ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}

// ── tailor fills ────────────────────────────────────────────────────────────

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// bake tailor.json values into data-fill elements (no nested same-tag children)
function applyFills(html, fills) {
  if (!fills || !Object.keys(fills).length) return html;
  return html.replace(/<([a-z][a-z0-9]*)\b([^>]*?\bdata-fill=(["'])([^"']+)\3[^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, q, key, inner) => {
    const v = fills[key];
    if (v == null || typeof v === 'object') return m;
    return `<${tag}${attrs.replace(/\s*data-filled=(["'])[^"']*\1/, '')} data-filled="1">${escHtml(v)}</${tag}>`;
  });
}

// ── what the player + slides get ────────────────────────────────────────────

// sources merged with the latest local verify status (verify.json wins over
// the committed status, so a just-run verify shows up without a commit)
function deckSources(cwd) {
  const sources = loadSources(cwd);
  const verify = loadState(cwd, 'verify');
  if (verify && verify.sources) {
    for (const [id, v] of Object.entries(verify.sources)) if (sources[id]) Object.assign(sources[id], { status: v.status, checked: v.checked });
  }
  return sources;
}

// the cite + fill runtime block of fuckslides.js, for file:// renders
// (pdf / editable) where the slide's /js/fuckslides.js can't load
function citeRuntime() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'fuckslides.js'), 'utf8');
  const m = src.match(/\/\*<fslides-cite>\*\/([\s\S]*?)\/\*<\/fslides-cite>\*\//);
  return m ? m[1] : '';
}

const safeJson = v => JSON.stringify(v).replace(/<\/(script)/gi, '<\\/$1');

module.exports = {
  today, readJson, writeJson, normUrl, publisher, clean,
  loadSources, saveSources, loadTailor, loadState, saveState, sourcesPath, tailorPath, statePath,
  addSource, slideLines, slideTitle, citedClaims, uncitedClaims, numberPattern, findNumber, NUM_RE,
  applyFills, deckSources, citeRuntime, safeJson, escHtml,
};
