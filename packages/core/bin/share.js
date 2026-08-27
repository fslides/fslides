'use strict';

// fslides share — grant a teammate access to the deck's repo.
//
//   fslides share                       list people (collaborators + pending invites)
//   fslides share <user>                invite with edit access (push)
//   fslides share <user> --view         invite read-only (pull)
//   fslides share <user> --admin        invite with admin (can share onward)
//   fslides share <user> --remove       revoke access / cancel a pending invite
//
// Auth rides the gh CLI (the caller's own GitHub identity) — no fslides app
// permission is involved. Viewing a private deck on fslides.dev follows repo
// access, so an invite is the complete sharing action.

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

function die(msg) {
  console.error('\n  ❌  ' + msg + '\n');
  process.exit(1);
}

// The deck's repo: fslides.config.js `repo:` first, git remote as fallback.
function detectRepo(cwd) {
  for (const f of ['fslides.config.js', 'fuckslides.config.js']) {
    const p = path.join(cwd, f);
    if (fs.existsSync(p)) {
      try {
        const cfg = require(p);
        if (cfg.repo) return cfg.repo;
      } catch (_) {}
    }
  }
  try {
    const url = sh('git remote get-url origin');
    const m = url.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    if (m) return m[1] + '/' + m[2];
  } catch (_) {}
  return null;
}

module.exports = function share(args) {
  try { sh('gh auth status'); }
  catch (_) { die('GitHub CLI not authenticated. Run: gh auth login'); }

  const repo = detectRepo(process.cwd());
  if (!repo) die('No deck repo found. Run from a deck directory (fslides.config.js with `repo:`) or a git checkout.');

  const flags = new Set(args.filter(a => a.startsWith('--')));
  const user  = args.find(a => !a.startsWith('--'));

  // ── no user: list who has access ──
  if (!user) {
    let collabs = [], invites = [];
    try { collabs = JSON.parse(sh(`gh api "repos/${repo}/collaborators?affiliation=direct&per_page=100"`)); } catch (_) {}
    try { invites = JSON.parse(sh(`gh api "repos/${repo}/invitations?per_page=100"`)); } catch (_) {}
    console.log(`\n  ${repo}\n`);
    if (!collabs.length && !invites.length) {
      console.log('  Not shared with anyone yet.  fslides share <github-user>\n');
      return;
    }
    for (const c of collabs) {
      const role = c.permissions?.admin ? 'admin' : c.permissions?.push ? 'edit' : 'view';
      console.log(`  ${c.login.padEnd(24)} ${role}`);
    }
    for (const inv of invites) {
      console.log(`  ${(inv.invitee?.login || '?').padEnd(24)} ${inv.permissions || 'edit'} (invite pending)`);
    }
    console.log('');
    return;
  }

  // ── --remove: revoke or cancel pending ──
  if (flags.has('--remove')) {
    try {
      sh(`gh api -X DELETE "repos/${repo}/collaborators/${user}"`);
      console.log(`\n  ✓  ${user} removed from ${repo}\n`);
    } catch (_) {
      // maybe it was still a pending invite
      try {
        const invites = JSON.parse(sh(`gh api "repos/${repo}/invitations?per_page=100"`));
        const inv = invites.find(i => i.invitee && i.invitee.login.toLowerCase() === user.toLowerCase());
        if (!inv) throw new Error('no access and no pending invite');
        sh(`gh api -X DELETE "repos/${repo}/invitations/${inv.id}"`);
        console.log(`\n  ✓  pending invite for ${user} cancelled\n`);
      } catch (e) {
        die(`Couldn't remove ${user}: ` + (e.message || e));
      }
    }
    return;
  }

  // ── invite ──
  const permission = flags.has('--admin') ? 'admin' : flags.has('--view') ? 'pull' : 'push';
  const label = { admin: 'admin (can share onward)', push: 'edit', pull: 'view' }[permission];
  let out;
  try {
    out = sh(`gh api -X PUT "repos/${repo}/collaborators/${user}" -f permission=${permission}`);
  } catch (e) {
    const msg = (e.stderr || e.message || '');
    if (/404/.test(msg)) die(`GitHub user "${user}" not found, or you lack admin on ${repo}.`);
    if (/403/.test(msg)) die(`GitHub refused the invite (org policy?): ${msg.split('\n')[0]}`);
    die('Invite failed: ' + msg.split('\n')[0]);
  }

  // 204 = already a collaborator (role updated); JSON body = fresh invitation
  const pending = out && out.includes('"id"');
  console.log(`
  ✓  ${user} → ${label} on ${repo}${pending ? '  (invite sent — pending their accept)' : ''}

     They can watch the deck at its fslides.dev URL${permission === 'pull' ? '' : ', edit slides, and comment'}.
`);
};
