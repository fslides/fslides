'use strict';

// fslides verify — re-check every claim in the deck before it's presented.
//
//   cited claims    (data-cite="s1")  the cited page is re-fetched live through
//                   Exa /contents (maxAgeHours: 0) and every number in the
//                   claim must still appear on it; old publish dates → stale
//   uncited claims  (numbers with no data-cite) are fact-checked with Exa
//                   /answer; supporting sources are suggested (--add adds them
//                   to sources.json)
//
// Writes .fslides/verify.json (player badges + Sources panel), stamps
// status/checked into sources.json, and research/verify.md for humans.
// --ci exits 1 on broken / changed / unsupported claims (--strict: stale too).

const fs   = require('fs');
const path = require('path');
const S    = require('./sources');
const { createClient, exaFlags } = require('./exa');

function flag(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}

const short = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const when  = d => (d ? String(d).slice(0, 10) : 'unknown date');

module.exports = async function verify(config, args = []) {
  const cwd       = process.cwd();
  const slidesDir = path.join(cwd, config.slidesDir || 'slides');
  const only      = flag(args, '--slide');
  const staleDays = +flag(args, '--stale-days', 548);   // ~18 months
  const maxAnswers = args.includes('--no-answer') ? 0 : +flag(args, '--max-answers', 20);
  const ci        = args.includes('--ci');
  const strict    = args.includes('--strict');
  const addFound  = args.includes('--add');
  const disabled  = new Set(config.disabled || []);
  const exa       = createClient({ cwd, ...exaFlags(args) });
  const sources   = S.loadSources(cwd);
  const now       = Date.now();

  const files = config.slides.filter(f => (only ? f === only || f === only + '.html' : !disabled.has(f)));
  if (!files.length) { console.error(`\n  ❌  No slide matches ${only}\n`); process.exit(1); }

  // 1. claims per slide
  const perSlide = {};
  const usedIds = new Set();
  for (const file of files) {
    const p = path.join(slidesDir, file);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, 'utf8');
    const cited = S.citedClaims(html);
    cited.forEach(c => c.ids.forEach(id => usedIds.add(id)));
    perSlide[file] = { cited, uncited: S.uncitedClaims(html) };
  }

  console.log(`\n  fslides verify — ${files.length} slide(s), ${usedIds.size} cited source(s)${exa.dryRun ? ' (dry run)' : ''}\n`);

  // 2. live re-fetch of every cited source
  const page = {};          // id → { text, published, live }
  const unknown = [...usedIds].filter(id => !sources[id]);
  const ids = [...usedIds].filter(id => sources[id]);
  const byUrl = new Map(ids.map(id => [S.normUrl(sources[id].url), id]));
  const take = (res, live) => {
    if (!res) return;
    for (const r of res.results || []) {
      const id = byUrl.get(S.normUrl(r.url)) || byUrl.get(S.normUrl(r.id || ''));
      if (id && r.text && !page[id]) page[id] = { text: r.text, published: r.publishedDate, title: r.title, live };
    }
  };
  for (let i = 0; i < ids.length; i += 10) {
    const urls = ids.slice(i, i + 10).map(id => sources[id].url);
    try { take(await exa.contents(urls, { text: { maxCharacters: 120000 }, maxAgeHours: 0, livecrawlTimeout: 15000 }), true); }
    catch (e) { console.log(`  ! live fetch failed: ${e.message}`); }
  }
  // pages that wouldn't livecrawl: fall back to Exa's indexed copy
  const missing = ids.filter(id => !page[id]);
  if (missing.length && !exa.dryRun) {
    try { take(await exa.contents(missing.map(id => sources[id].url), { text: { maxCharacters: 120000 } }), false); } catch (_) {}
  }

  // 3. judge sources and cited claims
  const srcState = {};
  const today = S.today();
  for (const id of ids) {
    const s = sources[id], pg = page[id];
    const published = s.published || (pg && pg.published && String(pg.published).slice(0, 10));
    const ageDays = published ? (now - Date.parse(published)) / 864e5 : null;
    srcState[id] = {
      status: exa.dryRun ? 'unchecked' : !pg ? 'broken' : ageDays != null && ageDays > staleDays ? 'stale' : 'ok',
      checked: today, live: pg ? pg.live : false, published,
    };
  }

  const report = { at: new Date().toISOString(), staleDays, sources: {}, slides: {}, claims: {} };
  const issuesMd = [], suggestMd = [];
  let answersUsed = 0;
  const tally = { cited: 0, ok: 0, stale: 0, changed: 0, broken: 0, uncited: 0, supported: 0, unsupported: 0, unchecked: 0 };

  for (const file of Object.keys(perSlide)) {
    const { cited, uncited } = perSlide[file];
    const counts = { cited: cited.length, ok: 0, stale: 0, changed: 0, broken: 0, uncited: uncited.length, supported: 0, unsupported: 0 };
    const notes = [];

    for (const c of cited) {
      tally.cited++;
      const known = c.ids.filter(id => sources[id]);
      c.ids.filter(id => !sources[id]).forEach(id => notes.push(`data-cite="${id}" is not in sources.json`));
      if (exa.dryRun || !known.length) continue;
      const reachable = known.filter(id => page[id]);
      if (!reachable.length) {
        counts.broken++; tally.broken++;
        notes.push(`"${short(c.text, 60)}" — source unreachable (${known.map(id => sources[id].publisher).join(', ')})`);
        continue;
      }
      const missingNums = c.numbers.filter(n => !reachable.some(id => S.findNumber(page[id].text, n)));
      if (missingNums.length) {
        counts.changed++; tally.changed++;
        known.forEach(id => { if (srcState[id].status === 'ok' || srcState[id].status === 'stale') srcState[id].status = 'changed'; });
        notes.push(`${missingNums.map(n => '"' + n + '"').join(', ')} not found on ${reachable.map(id => sources[id].publisher).join(', ')} — "${short(c.text, 60)}"`);
      } else if (known.some(id => srcState[id].status === 'stale')) {
        counts.stale++; tally.stale++;
        const old = known.find(id => srcState[id].status === 'stale');
        notes.push(`${old} (${sources[old].publisher}) published ${when(srcState[old].published)} — older than ${Math.round(staleDays / 30)} months`);
      } else {
        counts.ok++; tally.ok++;
        // keep the exact passage the number came from
        for (const id of known) {
          if (!sources[id].quote && c.numbers[0]) { const q = S.findNumber(page[id].text, c.numbers[0]); if (q) sources[id].quote = S.clean(q).slice(0, 400); }
        }
      }
    }

    for (const u of uncited) {
      tally.uncited++;
      if (answersUsed >= maxAnswers) { tally.unchecked++; counts.unchecked = (counts.unchecked || 0) + 1; continue; }
      answersUsed++;
      let ans;
      try {
        ans = await exa.answer(`Fact-check this claim from a presentation: "${u.text}". Is it accurate? State the correct figure and its primary source in one or two sentences.`, { text: true });
      } catch (e) { notes.push(`could not check "${short(u.text, 60)}": ${e.message}`); continue; }
      if (!ans) continue;   // dry run
      const hay = [ans.answer || '', ...(ans.citations || []).map(c => c.text || '')].join('\n');
      const hit = u.numbers.every(n => S.findNumber(hay, n));
      const cite = (ans.citations || []).find(c => u.numbers.some(n => S.findNumber(c.text || '', n))) || (ans.citations || [])[0];
      if (hit && cite) {
        counts.supported++; tally.supported++;
        let id = null;
        if (addFound) id = S.addSource(sources, cite, { quote: S.findNumber(cite.text || '', u.numbers[0]) || '' });
        suggestMd.push(`- **${file}** — "${short(u.text, 120)}"\n  supported by [${cite.title || cite.url}](${cite.url})${id ? ` → added as \`${id}\`, mark it with \`data-cite="${id}"\`` : ' — `--add` puts it in sources.json'}`);
        notes.push(`uncited "${short(u.text, 50)}" — support found: ${S.publisher(cite.url)}${id ? ' (' + id + ')' : ''}`);
      } else {
        counts.unsupported++; tally.unsupported++;
        notes.push(`uncited "${short(u.text, 50)}" — Exa did not confirm it: ${short(S.clean(ans.answer || ''), 140)}`);
      }
    }

    report.slides[file] = counts;
    if (notes.length) { report.claims[file] = notes; issuesMd.push(`### ${file}\n` + notes.map(n => `- ${n}`).join('\n')); }
    const flagged = counts.stale + counts.changed + counts.broken + counts.unsupported;
    const mark = flagged ? (counts.broken || counts.changed ? '✗' : '!') : counts.unchecked ? '·' : '✓';
    console.log(`  ${mark} ${file.padEnd(28)} ${counts.cited} cited · ${counts.uncited} uncited${flagged ? ' · ' + flagged + ' to fix' : ''}${counts.unchecked ? ' · ' + counts.unchecked + ' unchecked' : ''}`);
    notes.forEach(n => console.log(`      ${n}`));
  }

  for (const id of unknown) console.log(`  ! data-cite="${id}" has no entry in sources.json`);

  if (exa.dryRun) { exa.report(); return; }

  // 4. persist
  for (const [id, st] of Object.entries(srcState)) {
    report.sources[id] = { status: st.status, checked: st.checked, live: st.live };
    Object.assign(sources[id], { status: st.status, checked: st.checked });
    if (!sources[id].published && st.published) sources[id].published = st.published;
  }
  S.saveState(cwd, 'verify', report);
  if (Object.keys(sources).length) S.saveSources(cwd, sources);

  const md = [
    `# Verify — ${today}`,
    '',
    `${Object.keys(perSlide).length} slides · ${tally.cited} cited claims (${tally.ok} ok, ${tally.stale} stale, ${tally.changed} changed, ${tally.broken} broken) · ${tally.uncited} uncited numbers (${tally.supported} supported, ${tally.unsupported} not confirmed${tally.unchecked ? `, ${tally.unchecked} not checked — raise --max-answers` : ''})`,
    '',
    `Sources: ${Object.entries(srcState).map(([id, s]) => `${id} ${s.status}`).join(' · ') || 'none cited yet'}`,
    '',
    issuesMd.length ? '## Issues\n\n' + issuesMd.join('\n\n') : '## Issues\n\nNone.',
    '',
    suggestMd.length ? '## Uncited claims Exa could support\n\n' + suggestMd.join('\n') : '',
    '',
  ].join('\n');
  fs.mkdirSync(path.join(cwd, 'research'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'research', 'verify.md'), md, 'utf8');

  console.log(`\n  ${tally.ok}/${tally.cited} cited claims hold · ${tally.stale} stale · ${tally.changed} changed · ${tally.broken} broken · ${tally.unsupported} uncited not confirmed`);
  console.log('  → research/verify.md · .fslides/verify.json (badges in fslides serve)');
  exa.report();
  console.log('');

  if (ci && (tally.broken || tally.changed || tally.unsupported || (strict && tally.stale))) process.exit(1);
};
