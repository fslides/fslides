'use strict';

// fslides tailor --company "Acme" [--domain acme.com] — one deck, per audience.
//
// 1. Exa company search + last-90-days news → research/audience.md (sources
//    added to sources.json so slides can cite "you just raised…")
// 2. every data-fill="key" in the deck is answered for that company with Exa
//    /answer + a structured output → tailor.json
//
// The runtime fills data-fill elements from tailor.json; serve, build and
// export bake the values in. Describe keys in fslides.config.js:
//   tailor: { useCase: 'the Exa use case most relevant to them', … }
// The element's own text is the fallback when no value is set.

const fs   = require('fs');
const path = require('path');
const S    = require('./sources');
const { createClient, exaFlags } = require('./exa');

function flag(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}

const human = k => k.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

function fillKeys(config, slidesDir) {
  const keys = new Map();   // key → fallback text
  for (const f of config.slides) {
    const p = path.join(slidesDir, f);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, 'utf8');
    const re = /<([a-z][a-z0-9]*)\b[^>]*\bdata-fill=(["'])([^"']+)\2[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html))) if (!keys.has(m[3])) keys.set(m[3], S.clean(m[4].replace(/<[^>]+>/g, ' ')));
  }
  return keys;
}

module.exports = async function tailor(config, args = []) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const company   = flag(args, '--company');
  const domain    = flag(args, '--domain');
  if (!company) {
    console.error('\n  Usage: fslides tailor --company "Acme" [--domain acme.com] [--dry-run]\n');
    process.exit(1);
  }
  const exa     = createClient({ cwd, ...exaFlags(args) });
  const descs   = (config.tailor && typeof config.tailor === 'object') ? config.tailor : {};
  const keys    = fillKeys(config, slidesDir);
  const sources = S.loadSources(cwd);
  const who     = company + (domain ? ` (${domain})` : '');

  console.log(`\n  fslides tailor — ${who} · ${keys.size} data-fill key(s)\n`);

  // 1. who they are, and what just happened to them
  const profile = await exa.search(domain && domain !== company ? `${company} ${domain}` : company, {
    type: 'auto', category: 'company', numResults: 3,
    ...(domain ? { includeDomains: [domain] } : {}),
    contents: { summary: { query: `What does ${company} do: products, customers, size, industry, headquarters, funding` }, highlights: { maxCharacters: 500 } },
  });
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const news = await exa.search(`${company} news`, {
    type: 'auto', category: 'news', numResults: 8, startPublishedDate: since,
    contents: { highlights: { maxCharacters: 400 } },
  });

  // 2. one structured answer for every fill key (Exa allows 10 fields per schema)
  const auto = [...keys.keys()].filter(k => k !== 'company' && k !== 'domain');
  const answers = {};
  let answerCites = [];
  for (let i = 0; i < auto.length; i += 10) {
    const batch = auto.slice(i, i + 10);
    const schema = { type: 'object', properties: Object.fromEntries(batch.map(k => [k, {
      type: 'string',
      description: `${descs[k] || human(k)}. Short enough for a slide: at most 12 words. Example of the expected form: "${keys.get(k)}".`,
    }])) };
    const a = await exa.answer(`For a sales presentation to ${who}, fill in these fields about ${company}: ${batch.map(k => descs[k] || human(k)).join('; ')}.`, {
      outputSchema: schema,
      systemPrompt: 'Answer only from sources about this specific company. Keep each field to slide length. If unknown, return an empty string.',
    });
    if (!a) continue;
    let obj = a.answer;
    if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch (_) { obj = {}; } }
    Object.assign(answers, obj || {});
    answerCites = answerCites.concat(a.citations || []);
  }

  if (exa.dryRun) { exa.report(); return; }

  const prof = (profile.results || [])[0];
  const newsItems = (news.results || []).map(r => ({ ...r, id: S.addSource(sources, r) }));
  answerCites.forEach(c => S.addSource(sources, c));
  S.saveSources(cwd, sources);

  const existing = S.loadTailor(cwd);
  const fills = { ...existing, company, ...(domain ? { domain } : {}) };
  for (const [k, v] of Object.entries(answers)) if (typeof v === 'string' && v.trim()) fills[k] = v.trim();
  fills._audience = { company, domain: domain || null, at: S.today() };
  S.writeJson(S.tailorPath(cwd), fills);

  const md = [
    `# Audience: ${who}`,
    '',
    `_${S.today()} · Exa company search + news since ${since.slice(0, 10)}_`,
    '',
    '## Who they are',
    '',
    prof ? `${S.clean(prof.summary || (prof.highlights || [])[0] || '')}\n\nSource: [${prof.title || prof.url}](${prof.url})` : '_No company profile found — pass --domain._',
    '',
    '## Recent news',
    '',
    ...(newsItems.length ? newsItems.map(r => `- **${r.id}** [${(r.title || r.url).trim()}](${r.url}) — ${S.publisher(r.url)}${r.publishedDate ? ' · ' + String(r.publishedDate).slice(0, 10) : ''}${(r.highlights || [])[0] ? `\n  > ${S.clean(r.highlights[0]).slice(0, 260)}` : ''}`) : ['_Nothing in the last 90 days._']),
    '',
    '## Fills (tailor.json)',
    '',
    ...(keys.size ? [...keys.keys()].map(k => `- \`${k}\`: ${fills[k] != null ? fills[k] : `_(unset — slide shows "${keys.get(k)}")_`}`) : ['_No data-fill elements in the deck yet. Mark text with data-fill="key"._']),
    '',
    '## Openers worth considering',
    '',
    '- Reference the most recent news item above on the first or second slide (cite it).',
    '- Map the strongest use case to their product, in their words.',
    '',
  ].join('\n');
  fs.mkdirSync(path.join(cwd, 'research'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'research', 'audience.md'), md, 'utf8');

  for (const k of keys.keys()) console.log(`  ${fills[k] != null ? '✓' : '·'} ${k.padEnd(18)} ${fills[k] != null ? fills[k] : '(fallback: ' + keys.get(k) + ')'}`);
  console.log(`\n  ${newsItems.length} recent news item(s) → research/audience.md · tailor.json`);
  console.log('  fslides serve shows the filled deck; fslides export / build bake the values in.');
  exa.report();
  console.log('');
};
