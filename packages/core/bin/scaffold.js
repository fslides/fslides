'use strict';

// fslides scaffold <name> — one command from nothing to a contributable,
// published deck:
//   1. creates a GitHub repo (via the gh CLI)
//   2. populates it: template slides, config (with repo wired for comments),
//      package.json, README, and a Pages workflow that runs `fslides build`
//   3. enables GitHub Pages (workflow build) and pushes
// The result: teammates clone and edit slides like code, viewers watch the
// deck on Pages, and slide comments land in the repo's issues.

const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function die(msg) {
  console.error('\n  ❌  ' + msg + '\n');
  process.exit(1);
}

module.exports = function scaffold(name, opts = {}) {
  if (!name) die('Usage: fslides scaffold <name> [--private] [--org <org>]');
  if (!/^[a-z0-9._-]+$/i.test(name)) die('Repo name must be a valid GitHub repo name (letters, digits, . _ -).');

  const dir = path.resolve(process.cwd(), name);
  if (fs.existsSync(dir)) die(`Directory ${name}/ already exists.`);

  // gh CLI is the auth layer — require it up front
  let ghUser;
  try { ghUser = sh('gh api user --jq .login'); }
  catch (_) { die('GitHub CLI not authenticated. Install gh and run: gh auth login'); }

  const owner = opts.org || ghUser;
  const repo  = `${owner}/${name}`;
  const pkgDir = path.join(__dirname, '..');
  const version = require(path.join(pkgDir, 'package.json')).version;

  console.log(`\n  Scaffolding ${repo}…\n`);

  // ── 1. local files ──
  fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });

  // template slides — the cover must NOT be named index.html, so the built
  // player can own the root URL on Pages
  const tplSlides = path.join(pkgDir, 'template', 'slides');
  for (const f of fs.readdirSync(tplSlides)) {
    const dest = f === 'index.html' ? 'cover.html' : f;
    fs.copyFileSync(path.join(tplSlides, f), path.join(dir, 'slides', dest));
  }

  fs.writeFileSync(path.join(dir, 'fslides.config.js'), `module.exports = {
  name: '${name}',
  title: '${name}',
  repo: '${repo}',            // powers slide comments (GitHub issues)
  gateway: 'https://api.fslides.dev',   // sign-in broker for commenting on the published deck
  slidesDir: 'slides',

  slides: [
    'cover.html',
  ],

  labels: [
    'Cover',
  ],
};
`, 'utf8');

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    private: true,
    scripts: {
      serve:  'fslides serve',
      build:  'fslides build _site',
      pdf:    'fslides pdf',
    },
    devDependencies: { fslides: '^' + version },
  }, null, 2) + '\n', 'utf8');

  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n_site/\n.DS_Store\n', 'utf8');

  // Git LFS for narration recordings, when available — re-recorded takes go
  // to LFS storage instead of accumulating in every clone's history
  let hasLfs = false;
  try { sh('git lfs version'); hasLfs = true; } catch (_) {}
  if (hasLfs) {
    fs.writeFileSync(path.join(dir, '.gitattributes'),
`# Narration recordings — Git LFS keeps re-recorded takes out of clone history
slides/recordings/*.webm filter=lfs diff=lfs merge=lfs -text
slides/recordings/*.m4a  filter=lfs diff=lfs merge=lfs -text
slides/recordings/*.mp4  filter=lfs diff=lfs merge=lfs -text
slides/recordings/*.mp3  filter=lfs diff=lfs merge=lfs -text
`, 'utf8');
  }

  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'deploy.yml'), `name: Deploy deck to fslides.dev

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write   # OIDC — the gateway verifies the repository claim

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npx fslides deploy
`, 'utf8');

  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}

A [fslides](https://github.com/fslides/fslides) presentation. Every slide is an HTML file in \`slides/\` — edit them like code.

**Watch it:** https://fslides.dev/@${repo}/ (deployed automatically on every push to \`main\`)

## Contribute

\`\`\`bash
git clone https://github.com/${repo}.git
cd ${name}
npm install
npm run serve        # opens the deck locally with the full player
\`\`\`

- **Edit a slide:** change the HTML in \`slides/\`, the browser live-reloads.
- **Add a slide:** \`npx fslides add-slide my-slide\`, then register it in \`fslides.config.js\`.
- **Comment on a slide:** press \`K\` in the player (or the 💬 button) — comments live in this repo's [issues](https://github.com/${repo}/issues), one per slide.
- **Speaker notes:** press \`N\` in the player; notes save to \`notes.json\`.
- **Record narration:** \`npm run serve\`, hit the mic button — audio or camera, saved under \`slides/recordings/\` and playable on the published deck.

Send a PR when you're happy.
`, 'utf8');

  // designed by default — 'minimal' gives the bare canvas
  const tpl = opts.template === 'minimal' ? null : (opts.template || 'charcoal');
  if (tpl) {
    require('./create').applyTemplate(dir, tpl, 'slides');
  }

  // ── 2. git + GitHub repo ──
  const vis = opts.private ? '--private' : '--public';
  try {
    sh('git init -b main', { cwd: dir });
    if (hasLfs) { try { sh('git lfs install --local', { cwd: dir }); } catch (_) {} }
    // fresh machines may have no git identity — fall back to the gh account
    try { sh('git config user.name', { cwd: dir }); }
    catch (_) {
      try {
        const u = JSON.parse(sh('gh api user'));
        sh(`git config user.name ${JSON.stringify(u.name || u.login)}`, { cwd: dir });
        sh(`git config user.email ${JSON.stringify(u.email || (u.login + '@users.noreply.github.com'))}`, { cwd: dir });
      } catch (_) {}
    }
    sh('git add -A', { cwd: dir });
    sh('git commit -m "scaffold: new fslides deck"', { cwd: dir });
    console.log(`  Creating GitHub repo (${opts.private ? 'private' : 'public'})…`);
    sh(`gh repo create ${repo} ${vis} --source . --remote origin --push`, { cwd: dir });
    try { sh(`gh repo edit ${repo} --add-topic fslides`, { cwd: dir }); } catch (_) {}   // dashboard deck signal
  } catch (e) {
    die('Repo creation failed: ' + (e.stderr || e.message));
  }


  console.log(`
  ✓  ${repo} is live.

     Repo:     https://github.com/${repo}
     Live:     https://fslides.dev/@${repo}/   (first deploy running now)
     Comments: press K in the player → issues on the repo

     One-time (skip if the fslides app is installed with "All repositories"):
     enable commenting on this repo → https://github.com/apps/fslides/installations/new

     cd ${name} && npm install && npm run serve
`);
};
