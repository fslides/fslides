'use strict';

// fslides fresh — has the world moved since the deck's facts were checked?
//
// Default: every cited claim is searched again, restricted to pages published
// after the last check (--since YYYY-MM-DD overrides), skipping sources the
// deck already has. One search per claim (≈ $0.007), cached per date.
//
// --monitors --webhook https://…  turns each cited claim into a daily Exa
//   Monitor (Exa delivers to the webhook; ids saved in .fslides/monitors.json)
// --monitors                       later: collect the monitors' runs instead
//
// Writes research/fresh.md and .fslides/fresh.json — `fslides serve` shows a
// banner with the count and marks the affected slides.

const fs   = require('fs');
const path = require('path');
const S    = require('./sources');
const { createClient, exaFlags } = require('./exa');

function flag(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}

function lastChecked(cwd, sources) {
  const dates = Object.values(sources).map(s => s.checked).filter(Boolean).sort();
  const prev = S.loadState(cwd, 'fresh');
  const v = S.loadState(cwd, 'verify');
  const cands = [dates[dates.length - 1], prev && prev.at && prev.at.slice(0, 10), v && v.at && v.at.slice(0, 10)].filter(Boolean).sort();
  return cands[cands.length - 1] || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
}

module.exports = async function fresh(config, args = []) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const disabled  = new Set(config.disabled || []);
  const exa       = createClient({ cwd, ...exaFlags(args) });
  const sources   = S.loadSources(cwd);
  const since     = flag(args, '--since') || lastChecked(cwd, sources);
  const max       = +flag(args, '--max', 20);
  const known     = new Set(Object.values(sources).map(s => S.normUrl(s.url)));

  // cited claims, deduped across slides
  const claims = new Map();   // text → { text, slides, ids }
  for (const f of config.slides) {
    if (disabled.has(f)) continue;
    const p = path.join(slidesDir, f);
    if (!fs.existsSync(p)) continue;
    for (const c of S.citedClaims(fs.readFileSync(p, 'utf8'))) {
      if (c.text.length < 8) continue;
      const cur = claims.get(c.text) || { text: c.text, slides: [], ids: c.ids };
      if (!cur.slides.includes(f)) cur.slides.push(f);
      claims.set(c.text, cur);
    }
  }
  const list = [...claims.values()].slice(0, max);
  if (!list.length) {
    console.log('\n  No cited claims yet — mark claims with data-cite (fslides research collects sources).\n');
    return;
  }

  const query = c => {
    const s = sources[c.ids[0]];
    return `${c.text}${s && s.publisher ? ' (' + s.publisher.replace(/\.\w+$/, '') + ')' : ''}`;
  };

  // ── Monitors mode ──
  if (args.includes('--monitors')) {
    const webhook = flag(args, '--webhook');
    const store = S.loadState(cwd, 'monitors') || { monitors: [] };
    if (webhook) {
      console.log(`\n  Creating ${list.length} daily Exa Monitor(s) → ${webhook}\n`);
      for (const c of list) {
        if (store.monitors.some(m => m.claim === c.text)) { console.log(`  · exists  ${c.text.slice(0, 70)}`); continue; }
        const m = await exa.createMonitor({
          name: `fslides · ${config.name || 'deck'} · ${c.slides[0]}`.slice(0, 120),
          search: { query: query(c), numResults: 5, contents: { highlights: { maxCharacters: 400 } } },
          trigger: { type: 'interval', period: '1d' },
          webhook: { url: webhook, events: ['monitor.run.completed'] },
          metadata: { deck: String(config.name || ''), slide: c.slides[0] },
        });
        if (!m) continue;
        store.monitors.push({ id: m.id, claim: c.text, slides: c.slides, created: S.today() });
        console.log(`  ✓ ${m.id}  ${c.text.slice(0, 70)}`);
      }
      if (exa.dryRun) { exa.report(); return; }
      S.saveState(cwd, 'monitors', store);
      console.log(`\n  → .fslides/monitors.json — run \`fslides fresh --monitors\` later to pull their results.`);
      console.log('  Monitor runs bill to your Exa account daily ($15 / 1k runs). Delete them in the Exa dashboard.\n');
      return;
    }
    if (!store.monitors.length) { console.error('\n  ❌  No monitors yet. Create them with --monitors --webhook https://your-endpoint\n'); process.exit(1); }
    const items = [];
    for (const m of store.monitors) {
      const runs = await exa.listRuns(m.id, 10);
      if (!runs) continue;
      for (const run of runs.data || []) {
        if (run.completedAt && run.completedAt.slice(0, 10) < since) continue;
        for (const r of (run.output && run.output.results) || []) {
          if (known.has(S.normUrl(r.url))) continue;
          items.push({ slides: m.slides, claim: m.claim, url: r.url, title: r.title, published: r.publishedDate, highlight: (r.highlights || [])[0] || '' });
        }
      }
    }
    if (exa.dryRun) { exa.report(); return; }
    return write(cwd, since, items, exa, 'Exa Monitors');
  }

  // ── Default: date-filtered re-search ──
  console.log(`\n  fslides fresh — ${list.length} cited claim(s), new pages since ${since}\n`);
  const items = [];
  for (const c of list) {
    let res;
    try {
      res = await exa.search(query(c), {
        type: 'auto', numResults: 5,
        startPublishedDate: new Date(since).toISOString(),
        contents: { highlights: { query: c.text, maxCharacters: 400 } },
      });
    } catch (e) { console.log(`  ✗ ${c.text.slice(0, 60)}: ${e.message}`); continue; }
    if (!res) continue;
    const fresh = (res.results || []).filter(r => !known.has(S.normUrl(r.url)));
    for (const r of fresh) items.push({ slides: c.slides, claim: c.text, url: r.url, title: r.title, published: r.publishedDate, highlight: (r.highlights || [])[0] || '' });
    console.log(`  ${fresh.length ? '●' : '·'} ${c.slides[0].padEnd(28)} ${fresh.length} new · ${c.text.slice(0, 60)}`);
  }
  if (exa.dryRun) { exa.report(); return; }
  write(cwd, since, items, exa, 'Exa search');
};

function write(cwd, since, items, exa, how) {
  S.saveState(cwd, 'fresh', { at: new Date().toISOString(), since, items });
  const byClaim = new Map();
  for (const it of items) { const k = it.claim; if (!byClaim.has(k)) byClaim.set(k, []); byClaim.get(k).push(it); }
  const md = [
    `# Fresh — ${S.today()}`,
    '',
    `_${how} · pages published since ${since} · ${items.length} new across ${byClaim.size} claim(s)_`,
    '',
    items.length ? 'Read each one. If it changes a number, update the slide, add the page with `fslides research` or by hand in sources.json, and re-run `fslides verify`.' : 'Nothing new. The deck\'s claims still stand on their sources.',
    '',
  ];
  for (const [claim, its] of byClaim) {
    md.push(`## ${its[0].slides.join(', ')}`, '', `> ${claim}`, '');
    for (const it of its) {
      md.push(`- [${(it.title || it.url).trim()}](${it.url}) — ${S.publisher(it.url)}${it.published ? ' · ' + String(it.published).slice(0, 10) : ''}`);
      if (it.highlight) md.push(`  > ${S.clean(it.highlight).slice(0, 300)}`);
    }
    md.push('');
  }
  fs.mkdirSync(path.join(cwd, 'research'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'research', 'fresh.md'), md.join('\n'), 'utf8');
  console.log(`\n  ${items.length} new page(s) → research/fresh.md · .fslides/fresh.json (banner in fslides serve)`);
  exa.report();
  console.log('');
}
