'use strict';

// fslides deepen [slide …] — cited material for density levels 4 and 5.
//
// For each slide, Exa researches what the level-3 slide says and returns
// candidates: level 4 = supporting context (one sentence each), level 5 =
// caveats, methodology, footnote-grade detail. Every candidate carries a
// source id in sources.json. Written to research/deepen/<slide>.json — the
// author or agent picks what to add as data-d="4" / data-d="5" elements.

const fs   = require('fs');
const path = require('path');
const S    = require('./sources');
const { createClient, exaFlags } = require('./exa');

const SCHEMA = {
  type: 'object',
  properties: {
    level4: {
      type: 'array',
      description: '3–5 pieces of supporting context a curious viewer would want next: one sentence each, at most 22 words, concrete and sourced.',
      items: { type: 'object', properties: { text: { type: 'string' }, sourceUrl: { type: 'string' } } },
    },
    level5: {
      type: 'array',
      description: '2–4 footnote-grade details: methodology, caveats, definitions, counter-evidence. At most 30 words each, sourced.',
      items: { type: 'object', properties: { text: { type: 'string' }, sourceUrl: { type: 'string' } } },
    },
  },
};

const SYSTEM = 'You find supporting detail for one presentation slide. Return facts only, each from a real source you cite. Never restate what the slide already says. Prefer primary sources and recent dates. Never invent numbers.';

// level-3 text: drop elements that only show at 4+
function coreText(html) {
  const without = html.replace(/<([a-z][a-z0-9]*)\b[^>]*\bdata-d=["'][45]["'][^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return S.slideLines(without).join(' · ');
}

module.exports = async function deepen(config, args = []) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const disabled  = new Set(config.disabled || []);
  const wanted    = args.filter(a => !a.startsWith('--')).map(a => (a.endsWith('.html') ? a : a + '.html'));
  const files     = wanted.length ? config.slides.filter(f => wanted.includes(f)) : config.slides.filter(f => !disabled.has(f));
  const exa       = createClient({ cwd, ...exaFlags(args) });
  const deck      = config.title || config.name || '';

  if (!files.length) { console.error(`\n  ❌  No slide matches ${wanted.join(', ')}\n`); process.exit(1); }
  if (!wanted.length && files.length > 8 && !args.includes('--all') && !exa.dryRun) {
    console.error(`\n  ${files.length} slides ≈ $${(files.length * 0.012).toFixed(2)}. Name slides (fslides deepen 04-context-bill) or pass --all.\n`);
    process.exit(1);
  }

  console.log(`\n  fslides deepen — ${files.length} slide(s)\n`);
  const sources = S.loadSources(cwd);
  const outDir = path.join(cwd, 'research', 'deepen');

  for (const file of files) {
    const html  = fs.readFileSync(path.join(slidesDir, file), 'utf8');
    const title = S.slideTitle(html);
    const text  = coreText(html).slice(0, 700);
    const query = `${title || file}${deck ? ' (' + deck + ')' : ''}: supporting evidence, context and caveats for — ${text}`;

    let res;
    try {
      res = await exa.research(query.slice(0, 1500), { depth: 'lite', numResults: 8, outputSchema: SCHEMA, systemPrompt: SYSTEM });
    } catch (e) { console.log(`  ✗ ${file}: ${e.message}`); continue; }
    if (!res) continue;   // dry run

    const results = res.results || [];
    let out = res.output && res.output.content;
    if (typeof out === 'string') { try { out = JSON.parse(out); } catch (_) { out = {}; } }
    out = out || {};
    const grounding = (res.output && res.output.grounding) || [];

    const cite = (item, field) => {
      let url = item.sourceUrl;
      if (!url) { const g = grounding.find(x => x.field && x.field.startsWith(field)); url = g && g.citations && g.citations[0] && g.citations[0].url; }
      if (!url) return null;
      const r = results.find(x => S.normUrl(x.url) === S.normUrl(url)) || { url };
      return S.addSource(sources, r);
    };
    const pack = (arr, lvl) => (arr || []).map((it, i) => ({ text: it.text, cite: cite(it, `${lvl}[${i}]`) })).filter(x => x.text);
    const level4 = pack(out.level4, 'level4'), level5 = pack(out.level5, 'level5');

    fs.mkdirSync(outDir, { recursive: true });
    const base = file.replace(/\.html$/, '');
    S.writeJson(path.join(outDir, base + '.json'), { slide: file, title, at: S.today(), query, level4, level5 });

    console.log(`  ✓ ${file.padEnd(28)} ${level4.length} × level 4 · ${level5.length} × level 5`);
    for (const [lvl, list] of [[4, level4], [5, level5]]) {
      for (const c of list.slice(0, 2)) console.log(`      <p data-d="${lvl}"${c.cite ? ` data-cite="${c.cite}"` : ''}>${c.text.length > 80 ? c.text.slice(0, 79) + '…' : c.text}</p>`);
    }
  }

  if (exa.dryRun) { exa.report(); return; }
  S.saveSources(cwd, sources);
  console.log(`\n  → research/deepen/*.json · sources.json (${Object.keys(sources).length} sources)`);
  console.log('  Pick what earns its place; add it as data-d="4" / data-d="5" with the data-cite shown.');
  exa.report();
  console.log('');
};
