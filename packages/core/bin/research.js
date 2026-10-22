'use strict';

// fslides research "<topic>" — a cited brief to write slides from.
//
//   --depth deep (default)  Exa deep search with a structured output: summary,
//                           key facts with figures, angles — every field grounded
//   --depth fast            one auto search, brief built from highlights
//   --num N  --domains a.com,b.com  --since YYYY-MM-DD  --out <slug>
//
// Every result lands in sources.json (deduped by URL) so slides can cite it
// with data-cite="sN". The brief goes to research/<slug>.md. Exa writes facts,
// never slide design — the agent or author turns the brief into slides.

const fs   = require('fs');
const path = require('path');
const S    = require('./sources');
const { createClient, exaFlags } = require('./exa');

function flag(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}
const VALUE_FLAGS = new Set(['--depth', '--num', '--domains', '--since', '--out', '--category']);

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'research';
const fmtDate = d => (d ? String(d).slice(0, 10) : '');

const SCHEMA = {
  type: 'object',
  properties: {
    summary:  { type: 'string', description: 'A neutral 3–5 sentence overview of the topic as of today.' },
    keyFacts: {
      type: 'array',
      description: 'The 6–12 most presentation-worthy facts: prefer hard numbers, dated, from primary sources.',
      items: {
        type: 'object',
        properties: {
          fact:      { type: 'string', description: 'One sentence, the number first when there is one.' },
          figure:    { type: 'string', description: 'The headline number exactly as the source states it, e.g. 40% or $8.4B. Empty if none.' },
          sourceUrl: { type: 'string', description: 'URL of the primary source for this fact.' },
          published: { type: 'string', description: 'Publication date of that source, YYYY-MM-DD.' },
        },
      },
    },
    angles: { type: 'array', items: { type: 'string' }, description: '3–5 narrative angles or tensions a presenter could build a slide around.' },
  },
};

const SYSTEM = 'You research facts for a presentation. Prefer primary sources (research firms, filings, official announcements) over aggregators. Quote figures exactly as published, with dates. Never invent numbers.';

module.exports = async function research(args = []) {
  const cwd   = process.cwd();
  const topic = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1])).join(' ').trim();
  if (!topic) {
    console.error('\n  Usage: fslides research "<topic>" [--depth fast|deep] [--num 10] [--domains a.com,b.com] [--since YYYY-MM-DD] [--out slug] [--dry-run]\n');
    process.exit(1);
  }
  const depth   = flag(args, '--depth', 'deep');
  const num     = +flag(args, '--num', 10);
  const domains = flag(args, '--domains');
  const since   = flag(args, '--since');
  const slug    = slugify(flag(args, '--out', topic));
  const exa     = createClient({ cwd, ...exaFlags(args) });

  const filters = {};
  if (domains) filters.includeDomains = domains.split(',').map(s => s.trim()).filter(Boolean);
  if (since) filters.startPublishedDate = new Date(since).toISOString();
  if (flag(args, '--category')) filters.category = flag(args, '--category');

  console.log(`\n  fslides research — "${topic}" (${depth})\n`);
  const res = depth === 'fast'
    ? await exa.search(topic, { type: 'auto', numResults: num, contents: { highlights: { maxCharacters: 600 }, summary: { query: topic } }, ...filters })
    : await exa.research(topic, { depth, numResults: num, outputSchema: SCHEMA, systemPrompt: SYSTEM, ...filters });

  if (exa.dryRun) { exa.report(); return; }

  const sources = S.loadSources(cwd);
  const results = res.results || [];
  const idOf = new Map();
  for (const r of results) idOf.set(S.normUrl(r.url), S.addSource(sources, r));

  // structured output (deep) — content may arrive as an object or a JSON string
  let out = res.output && res.output.content;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch (_) { out = { summary: out }; } }
  out = out || {};
  const grounding = (res.output && res.output.grounding) || [];

  const citeFor = (url, title, published) => {
    if (!url) return null;
    const k = S.normUrl(url);
    if (!idOf.has(k)) idOf.set(k, S.addSource(sources, { url, title, publishedDate: published }));
    return idOf.get(k);
  };

  const facts = (out.keyFacts || []).map((f, i) => {
    let id = citeFor(f.sourceUrl, '', f.published);
    if (!id) {
      const g = grounding.find(x => x.field === `keyFacts[${i}]` || x.field === `keyFacts[${i}].fact` || x.field === `keyFacts.${i}.fact`);
      const c = g && g.citations && g.citations[0];
      if (c) id = citeFor(c.url, c.title);
    }
    if (id && f.figure && !sources[id].quote) {
      const r = results.find(x => S.normUrl(x.url) === S.normUrl(sources[id].url));
      const q = r && S.findNumber([r.text || '', ...(r.highlights || [])].join('\n'), f.figure);
      if (q) sources[id].quote = S.clean(q).slice(0, 400);
    }
    return { ...f, id };
  });
  const summaryCites = [...new Set(grounding.filter(g => /^summary/.test(g.field)).flatMap(g => (g.citations || []).map(c => citeFor(c.url, c.title))))].filter(Boolean);

  S.saveSources(cwd, sources);

  const srcLine = id => {
    const s = sources[id];
    return `${s.publisher}${s.published ? ', ' + s.published : ''}`;
  };
  const md = [
    `# Research: ${topic}`,
    '',
    `_${S.today()} · Exa ${depth === 'fast' ? 'search' : depth + ' search'} · ${results.length} sources · cite with \`data-cite="sN"\` (ids in sources.json)_`,
    '',
  ];
  if (out.summary) md.push('## Summary', '', out.summary + (summaryCites.length ? ' ' + summaryCites.map(id => `[${id}]`).join('') : ''), '');
  if (facts.length) {
    md.push('## Key facts', '');
    for (const f of facts) md.push(`- ${f.figure ? `**${f.figure}** — ` : ''}${f.fact}${f.id ? ` [${f.id}] _${srcLine(f.id)}_` : ' _(no source returned — do not use unverified)_'}`);
    md.push('');
  }
  if (out.angles && out.angles.length) md.push('## Angles', '', ...out.angles.map(a => `- ${a}`), '');
  md.push('## Sources', '');
  for (const r of results) {
    const id = idOf.get(S.normUrl(r.url));
    md.push(`- **${id}** [${(r.title || r.url).trim()}](${r.url}) — ${S.publisher(r.url)}${r.publishedDate ? ' · ' + fmtDate(r.publishedDate) : ''}`);
    const hl = (r.highlights || [])[0] || r.summary;
    if (hl) md.push(`  > ${S.clean(hl).slice(0, 300)}`);
  }
  md.push('');

  const dir = path.join(cwd, 'research');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, slug + '.md');
  fs.writeFileSync(file, md.join('\n'), 'utf8');

  console.log(`  ${facts.length ? facts.length + ' key facts · ' : ''}${results.length} sources → sources.json (${Object.keys(sources).length} total)`);
  console.log(`  → ${path.relative(cwd, file)}`);
  console.log('  Cite a claim on a slide: <span data-cite="s1">40%</span> — then `fslides verify` before presenting.');
  exa.report();
  console.log('');
};
