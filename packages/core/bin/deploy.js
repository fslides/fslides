'use strict';

// fslides deploy — build the deck and publish it to fslides.dev/@owner/repo.
// Auth: locally, the gh CLI token (the gateway verifies push access);
// in GitHub Actions, an OIDC token (aud=fslides.dev) minted by the runner.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2',
};

function detectRepo(cwd, config) {
  if (config.repo) return config.repo;
  try {
    const remote = execSync('git remote get-url origin', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (m) return m[1] + '/' + m[2];
  } catch (_) {}
  return null;
}

async function getActionsOIDC() {
  const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const reqTok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!reqUrl || !reqTok) return null;
  const r = await fetch(reqUrl + '&audience=fslides.dev', {
    headers: { Authorization: 'Bearer ' + reqTok },
  });
  if (!r.ok) return null;
  return (await r.json()).value;
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

module.exports = async function deploy(config) {
  const cwd     = process.cwd();
  const gateway = (config.gateway || 'https://api.fslides.dev').replace(/\/$/, '');
  const repo    = detectRepo(cwd, config);
  if (!repo) {
    console.error('\n  ❌  No repo — set `repo: "owner/name"` in the config or add a git remote.\n');
    process.exit(1);
  }

  // token: Actions OIDC in CI, gh CLI locally
  let token = await getActionsOIDC();
  if (!token) {
    try { token = execSync('gh auth token', { encoding: 'utf8', stdio: 'pipe' }).trim(); }
    catch (_) {
      console.error('\n  ❌  No credentials. Locally: gh auth login. In CI: grant `id-token: write`.\n');
      process.exit(1);
    }
  }

  // build into a temp dir
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fslides-deploy-'));
  console.log('\n  Building…');
  require('./build')(config, outDir);

  const files = walk(outDir, outDir, []);
  console.log(`  Deploying ${files.length} file(s) to decks.fslides.dev/${repo} …`);

  let done = 0, failed = 0;
  const queue = files.slice();
  async function worker() {
    while (queue.length) {
      const rel = queue.shift();
      const body = fs.readFileSync(path.join(outDir, rel));
      const ct = TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream';
      const r = await fetch(`${gateway}/publish/${repo}/${rel.split(path.sep).join('/')}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': ct },
        body,
      });
      if (!r.ok) {
        failed++;
        console.error(`  ✗ ${rel} — ${r.status} ${await r.text().catch(() => '')}`);
      } else {
        done++;
        if (done % 10 === 0 || done === files.length) process.stdout.write(`  ${done}/${files.length}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  fs.rmSync(outDir, { recursive: true, force: true });

  if (failed) {
    console.error(`\n  ❌  ${failed} file(s) failed — deck may be partially deployed.\n`);
    process.exit(1);
  }
  console.log(`\n  ✓  Live: https://decks.fslides.dev/${repo}/\n`);
};
