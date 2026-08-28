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
   `fslides scaffold` tags every deck repo with the `fslides` topic and files
   an issue in your `<org>/fslides-enrollment` repo. A workflow you own fires
   on that issue, validates the repo (in your org, carries the topic), enrolls
   it, and closes the issue — comments are live within about a minute of
   scaffold, and every enrollment leaves an issue as its audit record. A
   scheduled sweep catches anything that missed the event path. Nobody files
   a ticket, and nobody but your workflow touches the app installation. See
   `enroll.yml` below.

   Note the failure domain: only *inline comments* wait on enrollment.
   Creating, sharing (`fslides share`), editing and viewing decks never
   involve the app.

3. **Self-host the gateway (optional, strictest).**
   Deploy `packages/gateway` on your own infra with a GitHub App **owned by
   your org** ("Only this account"), and set each deck's `gateway:` to it.
   No third party is in the auth path at all.

4. **Disable the broad-scope tier.**
   Set `DISABLE_OAUTH=1` on the gateway. The classic OAuth flow (repo-scope,
   non-expiring tokens) then returns 404 and cannot be used, configured or
   not. Enterprise deployments should always set this.

## Reference enrollment workflow

Lives in `<org>/fslides-enrollment`, a repo the security team owns. Two
triggers, one job:

- **`issues: opened`** — the instant path. `fslides scaffold` files
  `enroll: <org>/<repo>` the moment a deck is created; the workflow
  validates and enrolls within seconds, then closes the issue (your audit
  trail: one issue per enrollment, with requester and timestamp).
- **`schedule`** — the sweeper. Catches repos tagged by hand or created
  while the event path was unavailable.

The token needs org-level installation admin (fine-grained); it lives in
this repo's secrets, never in deck repos. Validation is explicit: a repo is
enrolled only if it exists in your org **and** carries the `fslides` topic —
an issue naming anything else is closed with a refusal comment.

The workflow: [`docs/enroll-decks.yml`](./enroll-decks.yml) — copy it into
`<org>/fslides-enrollment/.github/workflows/` and set `ORG`, `APP_SLUG` and
the `ORG_ADMIN_TOKEN` secret.

```yaml
# <org>/fslides-enrollment/.github/workflows/enroll-decks.yml
name: Enroll fslides decks
on:
  issues: { types: [opened] }
  schedule: [{ cron: '0 * * * *' }]     # hourly sweep; the issue path is the fast lane
  workflow_dispatch: {}

permissions:
  issues: write                          # close/comment enrollment issues

jobs:
  enroll:
    runs-on: ubuntu-latest
    steps:
      - name: Enroll deck repos
        env:
          GH_TOKEN: ${{ secrets.ORG_ADMIN_TOKEN }}   # fine-grained, org installation admin
          ISSUE_TOKEN: ${{ github.token }}
          ORG: your-org
          APP_SLUG: fslides                            # or your self-hosted app slug
          EVENT: ${{ github.event_name }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
        run: |
          set -euo pipefail
          INSTALLATION_ID=$(gh api "orgs/$ORG/installations" \
            --jq ".installations[] | select(.app_slug == \"$APP_SLUG\") | .id")

          enroll_repo() {  # $1 = repo id
            gh api -X PUT "user/installations/$INSTALLATION_ID/repositories/$1"
          }
          say() {  # comment + close the triggering issue
            [ "$EVENT" = "issues" ] || return 0
            GH_TOKEN="$ISSUE_TOKEN" gh issue comment "$ISSUE_NUMBER" -R "$GITHUB_REPOSITORY" -b "$1"
            GH_TOKEN="$ISSUE_TOKEN" gh issue close "$ISSUE_NUMBER" -R "$GITHUB_REPOSITORY"
          }

          if [ "$EVENT" = "issues" ]; then
            # instant path: validate "enroll: org/repo" from the issue title
            REPO_FULL=$(echo "$ISSUE_TITLE" | sed -n 's/^enroll: *//p')
            case "$REPO_FULL" in "$ORG"/*) ;; *) say "❌ not an $ORG repo — refused"; exit 0;; esac
            INFO=$(gh api "repos/$REPO_FULL" --jq '{id: .id, topics: .topics}' 2>/dev/null) \
              || { say "❌ repo not found — refused"; exit 0; }
            echo "$INFO" | grep -q '"fslides"' \
              || { say "❌ repo is not tagged fslides — refused"; exit 0; }
            enroll_repo "$(echo "$INFO" | sed -n 's/.*"id": *\([0-9]*\).*/\1/p')"
            say "✅ enrolled — slide comments are live on $REPO_FULL"
          else
            # sweep: enroll every tagged repo not yet in the installation
            ENROLLED=$(gh api --paginate "user/installations/$INSTALLATION_ID/repositories" \
              --jq '.repositories[].id' | sort)
            TAGGED=$(gh api --paginate "search/repositories?q=org:$ORG+topic:fslides" \
              --jq '.items[].id' | sort)
            for repo_id in $(comm -13 <(echo "$ENROLLED") <(echo "$TAGGED")); do
              enroll_repo "$repo_id" && echo "enrolled repo id $repo_id"
            done
          fi
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
| "comments unavailable" on a fresh deck | enrollment issue still processing (~1 min), or deck tagged by hand between sweeps | check the enrollment issue, wait for the hourly sweep, or paste a fine-grained PAT (Issues R/W on that repo) in the player |
| Collaborator invite blocked | org collaborator policy | org owners allow member invites, or share via a team |
| Private deck won't load for an invitee | invite not yet accepted | accept the GitHub invite email first |
