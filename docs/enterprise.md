# fslides in an enterprise GitHub org

How to run fslides inside a company org (decks shared between employees)
with the tightest possible security posture. Written for the security team
as much as for deck authors.

## What touches what

| Concern | Mechanism | Access involved |
|---|---|---|
| Authoring, publishing | git + the fslides CLI | the author's own credentials |
| Viewing a deck | fslides.dev serves straight from the repo | the viewer's repo access (private decks need sign-in) |
| Sharing a deck | `fslides share <user>` → repo collaborator invite | the deck owner's own `gh` auth — **no app involved** |
| Inline slide comments | GitHub issues on the deck repo, via the fslides GitHub App | **Issues: Read & Write — the app's only permission** |

The app never reads code. Comment tokens are user-to-server and expire in
about 8 hours. The gateway (one stateless Cloudflare Worker) stores nothing.

## Recommended org setup

1. **Install the app with "Only select repositories".**
   The app's world is exactly the deck repos, nothing else.

2. **Let a workflow you own do the enrollment.**
   `fslides scaffold` tags every deck repo with the `fslides` topic. A small
   scheduled Action — owned, audited and revocable by the security team —
   adds topic-tagged repos to the app installation. New decks become
   commentable within the schedule interval; nobody files a ticket. See
   `enroll.yml` below.

3. **Self-host the gateway (optional, strictest).**
   Deploy `packages/gateway` on your own infra with a GitHub App **owned by
   your org** ("Only this account"), and set each deck's `gateway:` to it.
   No third party is in the auth path at all.

4. **Disable the broad-scope tier.**
   Set `DISABLE_OAUTH=1` on the gateway. The classic OAuth flow (repo-scope,
   non-expiring tokens) then returns 404 and cannot be used, configured or
   not. Enterprise deployments should always set this.

## Reference enrollment workflow

Runs on a schedule with an org-admin token (fine-grained: Administration
read/write on the installation), finds repos tagged `fslides`, and adds any
missing ones to the app installation.

```yaml
# .github/workflows/enroll-decks.yml — lives in a repo the security team owns
name: Enroll fslides decks
on:
  schedule: [{ cron: '*/30 * * * *' }]
  workflow_dispatch: {}

permissions: {}

jobs:
  enroll:
    runs-on: ubuntu-latest
    steps:
      - name: Add topic-tagged repos to the fslides app installation
        env:
          GH_TOKEN: ${{ secrets.ORG_ADMIN_TOKEN }}   # fine-grained, org admin
          ORG: your-org
          APP_SLUG: fslides                           # or your self-hosted app slug
        run: |
          set -euo pipefail
          INSTALLATION_ID=$(gh api "orgs/$ORG/installations" \
            --jq ".installations[] | select(.app_slug == \"$APP_SLUG\") | .id")
          ENROLLED=$(gh api --paginate "user/installations/$INSTALLATION_ID/repositories" \
            --jq '.repositories[].id' | sort)
          TAGGED=$(gh api --paginate "search/repositories?q=org:$ORG+topic:fslides" \
            --jq '.items[].id' | sort)
          for repo_id in $(comm -13 <(echo "$ENROLLED") <(echo "$TAGGED")); do
            gh api -X PUT "user/installations/$INSTALLATION_ID/repositories/$repo_id"
            echo "enrolled repo id $repo_id"
          done
```

Notes for review:
- The token needs org-level installation admin; scope it fine-grained and
  keep it in the security team's repo secrets, not the deck repos.
- The workflow is the *only* privileged piece, and it is yours: pause it,
  narrow the search query, or add an allowlist of repo prefixes at will.
- Removal is manual by design — un-enrolling a repo is a deliberate act.

## The failure modes users will actually see

| Symptom | Cause | Answer |
|---|---|---|
| "comments unavailable" on a fresh deck | repo not yet enrolled (workflow interval) | wait for the next enroll run, or paste a fine-grained PAT (Issues R/W on that repo) in the player |
| Collaborator invite blocked | org collaborator policy | org owners allow member invites, or share via a team |
| Private deck won't load for an invitee | invite not yet accepted | accept the GitHub invite email first |
