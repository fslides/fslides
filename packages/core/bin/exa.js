'use strict';

// Exa client — the one place fslides talks to https://api.exa.ai.
// Bring-your-own-key (EXA_API_KEY), local only: the key never leaves the
// machine and never reaches a browser. Every POST is cached on disk under
// .fslides/cache/ (keyed by endpoint + body) so re-running research / verify
// is free, and --dry-run prints the calls and an estimated cost instead.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const API = 'https://api.exa.ai';

// USD per request (exa.ai/pricing). Contents bill per page per content type.
const PRICE = {
  'search:auto': 0.007, 'search:fast': 0.007, 'search:instant': 0.007, 'search:neural': 0.007, 'search:keyword': 0.007,
  'search:lite': 0.004, 'search:deep-lite': 0.012, 'search:deep': 0.012, 'search:deep-reasoning': 0.012,
  extraResult: 0.001,   // per result above 10
  contents:    0.001,   // per page per content type
  answer:      0.005,
  monitorRun:  0.015,
};

const KEY_HELP = '\n❌  EXA_API_KEY is not set.\n\n    fslides uses your own Exa key, locally — get one at https://dashboard.exa.ai/api-keys, then:\n    export EXA_API_KEY=...\n\n    (or pass --dry-run to see the calls and estimated cost without one)\n';

function estimate(endpoint, body) {
  body = body || {};
  if (endpoint === '/search') {
    let c = PRICE['search:' + (body.type || 'auto')] ?? PRICE['search:auto'];
    const n = body.numResults || 10;
    if (n > 10) c += (n - 10) * PRICE.extraResult;
    return c;
  }
  if (endpoint === '/contents') {
    const types = ['text', 'highlights', 'summary'].filter(k => body[k]).length || 1;
    return (body.urls || []).length * types * PRICE.contents;
  }
  if (endpoint === '/answer') return PRICE.answer;
  return 0;
}

function hasKey() { return !!process.env.EXA_API_KEY; }

// opts: { cwd, dryRun, cache (default true), quiet, throwOnMissingKey }
function createClient(opts = {}) {
  const cwd      = opts.cwd || process.cwd();
  const key      = opts.key || process.env.EXA_API_KEY;
  const dryRun   = !!opts.dryRun;
  const useCache = opts.cache !== false;
  const cacheDir = path.join(cwd, '.fslides', 'cache');
  const stats    = { requests: 0, cached: 0, estimated: 0, billed: 0, planned: [] };

  if (!key && !dryRun) {
    if (opts.throwOnMissingKey) { const e = new Error('EXA_API_KEY is not set'); e.code = 'NO_KEY'; throw e; }
    console.error(KEY_HELP);
    process.exit(1);
  }

  async function call(method, endpoint, body, { cache = useCache } = {}) {
    const hash = crypto.createHash('sha1').update(method + ' ' + endpoint + ' ' + JSON.stringify(body || null)).digest('hex');
    const file = path.join(cacheDir, hash + '.json');
    if (cache && method === 'POST' && fs.existsSync(file)) {
      try { const hit = JSON.parse(fs.readFileSync(file, 'utf8')); stats.cached++; return hit; } catch (_) {}
    }

    const est = estimate(endpoint, body);
    if (dryRun) {
      const what = body ? (body.query || (body.urls ? body.urls.length + ' url(s)' : body.name || '')) : '';
      stats.planned.push({ endpoint, type: body && body.type, what: String(what).slice(0, 90), est });
      stats.estimated += est;
      return null;
    }

    const res = await fetch(API + endpoint, {
      method,
      headers: { 'x-api-key': key, 'content-type': 'application/json', 'user-agent': 'fslides' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = { error: text }; }
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : (data.message || text);
      const err = new Error(`Exa ${endpoint} → ${res.status}: ${String(msg).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }

    stats.requests++;
    stats.estimated += est;
    if (data.costDollars && typeof data.costDollars.total === 'number') stats.billed += data.costDollars.total;
    if (cache && method === 'POST') {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    }
    return data;
  }

  return {
    dryRun,
    stats,

    // POST /search — type: auto | fast | lite | deep-lite | deep
    search(query, o = {}) {
      const { cache, ...rest } = o;
      return call('POST', '/search', { query, ...rest }, { cache: cache ?? useCache });
    },

    // POST /contents — maxAgeHours: 0 forces a livecrawl and is never cached
    contents(urls, o = {}) {
      const { cache, ...rest } = o;
      return call('POST', '/contents', { urls, ...rest }, { cache: rest.maxAgeHours === 0 ? false : (cache ?? useCache) });
    },

    // POST /answer — cited answer to a question
    answer(query, o = {}) {
      const { cache, ...rest } = o;
      return call('POST', '/answer', { query, ...rest }, { cache: cache ?? useCache });
    },

    // deep search with a structured output — grounded, per-field citations
    research(query, o = {}) {
      const { depth = 'deep', outputSchema, systemPrompt, additionalQueries, numResults = 10, contents, ...rest } = o;
      const body = {
        type: depth === 'fast' ? 'auto' : depth === 'lite' ? 'deep-lite' : 'deep',
        numResults,
        contents: contents || { highlights: { maxCharacters: 600 }, text: { maxCharacters: 2000 } },
        ...rest,
      };
      if (body.type !== 'auto') {
        if (outputSchema) body.outputSchema = outputSchema;
        if (systemPrompt) body.systemPrompt = systemPrompt;
        if (additionalQueries && additionalQueries.length) body.additionalQueries = additionalQueries.slice(0, 10);
      }
      return call('POST', '/search', { query, ...body });
    },

    // Monitors — scheduled searches. Exa requires a webhook to create one.
    createMonitor(body) { return call('POST', '/monitors', body, { cache: false }); },
    listRuns(id, limit = 10) { return call('GET', `/monitors/${encodeURIComponent(id)}/runs?limit=${limit}`, null, { cache: false }); },

    report() {
      if (opts.quiet) return;
      if (dryRun) {
        console.log(`\n  Dry run — ${stats.planned.length} Exa call(s) would be made${stats.cached ? ` (${stats.cached} served from cache)` : ''}:`);
        for (const p of stats.planned) console.log(`    ${p.endpoint}${p.type ? ' [' + p.type + ']' : ''}  ${p.what}  ≈ $${p.est.toFixed(3)}`);
        console.log(`  Estimated total: ≈ $${stats.estimated.toFixed(3)}\n`);
        return;
      }
      const cost = stats.billed || stats.estimated;
      console.log(`  Exa: ${stats.requests} request(s)${stats.cached ? `, ${stats.cached} from cache` : ''} — ${stats.billed ? '' : '≈ '}$${cost.toFixed(3)}`);
    },
  };
}

// shared flag parsing for the Exa-backed commands
function exaFlags(args) {
  return {
    dryRun: args.includes('--dry-run'),
    cache:  !args.includes('--no-cache'),
  };
}

module.exports = { createClient, estimate, exaFlags, hasKey, PRICE, KEY_HELP };
