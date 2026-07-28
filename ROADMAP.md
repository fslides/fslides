# fslides — Roadmap

> **Vision.** Slides-as-code for developers — and **the slide tool for agents**.
> Decks are git repos; slides are HTML; publishing is a static folder on GitHub
> Pages. The CLI is the primary creation interface for humans and agents alike;
> the web is for viewing, reviewing, and discovering. The SaaS layer (fslides.dev)
> sells identity and convenience — never lock-in. The engine stays open source.
>
> **Architecture principle (rev. 2026-07-24).** Git is the source of truth —
> and the only storage. **decks.fslides.dev is the stage**: decks render on
> the fly at `decks.fslides.dev/owner/repo`, assembled at the edge straight
> from the repo on every request. `git push` is publishing; there is no
> deploy step, no CI, no bucket. GitHub Pages remains possible via
> `fslides build`, but is no longer the default path. The gateway stays the
> single server-side component; decks live on their own origin, isolated
> from app tokens.

**Domain:** `fslides.dev` — purchased 2026-07-23. (`fslides.com` optional later.)

---

## Release train — ship 0.5.0 (now)

Everything merged on main but unpublished:

- [x] `npm publish` 0.5.0 (2026-07-23)
- Fixed labeled top toolbar (no auto-hide outside fullscreen), instant tooltips with shortcuts, Presenter view removed
- Selection infrastructure: hover highlight, click select, marquee multi-select, right-click context menu, background-size guard
- Anchored comments (Google-Slides-style pins), deck-wide comment inbox with navigate-and-open, deck-wide badge
- `fslides build` (deployable folder, real player) · `fslides scaffold` (repo + Pages + LFS + comments wiring)
- Live reload (SSE) · self-contained export fixes · localStorage sandbox shim · PDF `PUPPETEER_EXECUTABLE_PATH` (community PRs #2 #6 #7 #8)
- [ ] After publish: bump both observability-team decks; consider replacing their `build-player.js` with `fslides build` in CI

## Phase 0 — Stake the ground

- [x] Buy domain → **fslides.dev** (2026-07-23)
- [x] GitHub org `fslides` created; repo transferred and renamed → `fslides/fslides`; GitHub App transferred to the org (2026-07-24) — consent screen now reads "fslides by fslides"
- [x] Create **GitHub App** "fslides" (2026-07-23) — permissions: `issues: read/write` only, installable per-repo. (GitHub App, not OAuth App: per-repo install, minimal scope, comments post *as the user* via user-to-server tokens.)
- [x] DNS: fslides.dev zone on Cloudflare; `api.fslides.dev` live (worker custom domain); root + decks. reserved

## Phase 1 — The gateway (`api.fslides.dev`)

The single server-side component. Cloudflare Workers (stateless, ~free, global).

- [x] Worker built (`packages/gateway/`): OAuth login/callback with HMAC-signed state, origin allow-list, postMessage token hand-off — *needs GitHub App creds + deploy*
- [x] No proxy needed: player calls api.github.com directly with the user token (CORS-open) — worker stays stateless and tiny
- [x] Player: "Sign in with GitHub" replaces the PAT prompt (PAT stays as fallback); tokens expire and self-evict
- [x] Config: `gateway:` plumbed through serve/build/scaffold (scaffold defaults to api.fslides.dev)
- [x] **Deployed** (2026-07-23): GitHub App created, fslides.dev on Cloudflare (autumn/darwin NS), worker live at api.fslides.dev with secrets — healthz ok, OAuth redirect verified
- [x] Live proof: bahaaldine.github.io/test-deck runs 0.5.0 with gateway + repo wired
- [ ] Install the fslides GitHub App on deck repos (github.com/apps/fslides → Install) — required for user tokens to write issues
- [ ] Private-repo decks (elastic/observability-team): needs the app installed on the elastic org (org-owner approval) — park until needed
- Result: decks on plain GitHub Pages get full interactive commenting with zero deck-side infrastructure

## Phase 2 — fslides.dev front door

- [x] Landing live at **fslides.dev** (2026-07-24) — a 6-slide fslides deck served as Worker static assets (`packages/site`), comments wired to fslides/fslides via the gateway; www works too
- [x] Docs page live at fslides.dev/docs (quickstart, slides, player, narration, comments, commands, contributing) — 2026-07-24
- [x] Template gallery live at fslides.dev/templates — `charcoal` + `paper` designed starters, `--template` flag on create/scaffold (2026-07-24)
- [ ] Signed-in dashboard: list your decks (repos containing `fuckslides.config.js`), link to live Pages
- [ ] Docs: quickstart, recording/narration guide, commenting guide, contributor guide (incl. git-lfs note)

**Design system:** `packages/site/slides/ui.css` ("terminal precision": mono-forward, 12-14px, hairline borders, dense rows) — applied to dashboard/docs/templates 2026-07-24 after Baha rejected the first-pass look as too big/crude/not dev-likable. Landing deck slides keep large type (correct for slides); align them to this identity in a future pass.

## Phase 2.5 — Hosted decks (decks.fslides.dev/owner/repo) — SHIPPED 2026-07-24
Decided 2026-07-24; re-architected same day from R2 storage to render-on-the-fly
after Baha asked why storage was needed at all. Nothing is stored:
- [x] Site worker renders decks from GitHub at request time — fetches the config
      (JSON5-parsed literal, never executed) + notes.json from raw.githubusercontent,
      assembles the player at the edge, proxies slides/assets/recordings (LFS
      pointers resolved via media.githubusercontent). `git push` IS publishing —
      no CI, no build, no storage, live ≤60s (404s cached 15s)
- [x] Player hosted mode: server injects `RECORDINGS = null`, player discovers
      recordings via HEAD probes (.webm/.mp4/.m4a per slide)
- [x] Own origin decks.fslides.dev — user JS can never read fslides.dev
      localStorage (dashboard tokens); /@owner/repo on the app origin 301s over
- [x] Abuse posture: PUBLISHERS owner allowlist (env, currently bahaaldine+fslides;
      `*` + per-owner quotas is the path to opening up). No storage = no storage abuse
- [x] Scaffold: no workflow at all anymore (repo is live on first push); summary,
      README, dashboard, site copy all point at decks.fslides.dev
- [x] Constraint (documented in the 422 error): hosted configs must be literal
      objects; public repos only (issues-only app can't read private contents)
- E2E-verified in headless Chrome against bahaaldine/test-deck: player boots,
  slides render, arrows navigate, recording probe finds cover.webm
- [x] Public profiles (2026-07-25): `fslides.dev/{login}` mirrors the GitHub
      profile UX — avatar/bio/meta + live deck thumbnails (topic:fslides via
      GitHub search, fetched client-side so rate limits are per-viewer).
      Light/dark follows the viewer's clock (7–19h → light) with a remembered
      toggle. `fslides.dev/owner/repo` 301s to decks.fslides.dev (pretty
      shareable URLs; decks still execute on the isolated origin). Real assets
      always win over profile routes — profiles fill the 404 space
- [x] Profile IS the dashboard (2026-07-25, Baha's call): one page — visitors
      see public decks; the signed-in owner sees private decks too (via app
      installations), visibility filter, and the new-deck section. Ported from
      the old dashboard: search ('/' shortcut), recent/a→z sort, grid/list
      toggle. /dashboard/ now just signs you in and redirects to /{login}.
      Type scale raised ~20% after Baha flagged small fonts (second time —
      keep mono UI text ≥0.88rem)
- [x] Private decks + share + numbers (2026-07-25):
      · Private viewing: deck worker falls back to the GitHub contents API
        with the viewer's token when raw 404s — GitHub IS the ACL. Token is
        an HttpOnly cookie on the deck origin (set via POST /-/session after
        a one-popup sign-in interstitial), so deck JS can never read it.
        Private responses are Cache-Control: private, never edge-cached; LFS
        resolves via media CDN with auth. ⚠ REQUIRES Baha to add
        Contents: Read-only to the GitHub App and approve on installations
      · Share v2 (same day): full people management in the popover — invite
        by username with view (pull) / edit (push) role, change roles, remove
        collaborators, see/cancel pending invitations. ⚠ Needs the app's
        Administration: Read & write permission (Baha action); degrades to
        the manage-on-GitHub link without it. Contents:read added & approved;
        private viewing E2E-verified against bahaaldine/secret-deck (gate,
        player via API, Cache-Control: private, bogus token 404)
      · Player transition blink fixed: the fade veil now holds until the new
        slide's load event (700ms fallback) instead of dropping after 2 rAFs;
        iframe + veil backgrounds set to #0d0f14 so nothing white can flash
      · Numbers on cards/rows: ⑂ forks, ★ stars, 💬 open comment threads;
        owner mode adds 👥 shared-with (collaborators via Link-header count)
      · Thumbnails zoom-crop to the slide's central region (~1.6×) so
        preview text is readable instead of a 4×-shrunk full slide
      · 404 page (Baha's ask): the logo is the top of a barbed-wire bat —
        the bat swings in and bonks the zero crooked; "swing and a miss"
        terminal copy, MISS statusline. Served for HTML requests that fall
        through profiles/redirects on fslides.dev (status 404, no-store);
        unknown-GitHub-user profiles get their own bat page ("no decks to
        swing at") — and fixed the [hidden]-vs-display:flex bug that left
        the empty profile skeleton visible behind the 404 text
      · GitHub-parity account UX (2026-07-25): avatar in the nav everywhere —
        player website-mode nav (landing + all deck-site pages) and profile —
        with a dropdown: your profile (~/decks), github, sign out; "sign in"
        button when logged out
      · Landing hero v3: self-typing terminal demo (curl one-liner → ✓ repo
        → ▶ live URL, looping), breathing orange glow, drifting embers,
        $-wordmark with caret
      · Two-layer chrome (Baha rejected the crammed single bar): website mode
        gets a dedicated site bar (wordmark, nav links, + new deck CTA,
        account) ABOVE the deck toolbar, which keeps only presentation
        controls; logo/title dedup'd, stage math offsets 52px, fullscreen
        hides both layers. Plain decks keep the single toolbar
      · Brand truth (2026-07-26, Baha's call): the software is FUCKSLIDES —
        fslides is the package/domain name. Hero carries "short for
        f[uck]slides" with the profanity blurred until hover ("the bat on
        the logo is not decorative"); docs intro gets the f*ckslides line.
        The barbed-bat mark now lives everywhere: hero (floating, glowing),
        every site bar, favicons; /logo.png served on both origins

## Phase 2.6 — Skeleton placeholders (2026-07-27)
- [x] Loading state on `fslides.dev/{login}` replaced with a full-layout skeleton:
      sidebar (avatar block, name/login/bio/meta/link bars) + 4-card deck grid,
      each card with a 16:9 thumbnail placeholder, name bar, description lines,
      and footer bar. Shimmer animation (`skel-shimmer`) sweeps a subtle brand-orange
      highlight (9% mix with `--panel2`) left-to-right at 1.8s. All colors are CSS
      custom properties — dark and light themes work automatically. Responsive at
      ≤860px: sidebar goes horizontal (110px avatar + text alongside), matching the
      real layout's mobile breakpoint. Skeleton disappears the moment the GitHub API
      resolves (`loading.hidden = true`).

## Phase 2.9 — Monorepo deck support (2026-07-27, issue #13)
- [x] `.fslides` manifest at the repo root opts a repo into multi-deck mode:
      `{ "decks": ["obs-preso", "talks/k8s-2024"] }`. Root-config single-deck
      repos are fully unchanged — no manifest = no change in behavior.
- [x] Worker ({owner}.fslides.dev): manifest-based URL routing. Probes `.fslides`
      when the path has segments beyond repo; longest-prefix match maps
      `/{repo}/subpath/` to the sub-deck's config + assets. Root requests on
      manifest-only repos redirect to the first listed deck. Manifest cached 60 s,
      misses cached 15 s — same as existing config 404s.
- [x] Profile (fslides.dev/{login}): `getRepoDecks()` replaces `isDeck()`. Topic
      repos and public non-topic repos are probed for `.fslides`; manifest present →
      N cards surfaced (one per listed path, name = last path segment). Owner mode
      and public profile both expand monorepo repos. Single-deck repos yield one card,
      unchanged. Private monorepo sub-decks are not yet expanded (raw probe requires
      auth; deferred).
- [x] `fslides-monorepo` CLI skill (claude/issue-13-20260727-0603): scans the
      working tree for sub-deck configs and writes the `.fslides` manifest —
      the migration path for existing repos.

## Phase 2.8 — Open hosting with reputation isolation (2026-07-27, Baha's call)
Invite-only is a launch posture, not a product. Adopted the github.io model:
- [x] Owner subdomains: decks serve at {owner}.fslides.dev/{repo} (wildcard
      route on the zone; first-level = free Universal SSL). decks.fslides.dev
      and fslides.dev/owner/repo 301 to the new scheme; owner root redirects
      to their fslides.dev profile
- [x] PUBLISHERS allowlist DELETED — any repo carrying an fslides config
      renders. Opt-in = the config itself; attackers can only burn their own
      subdomain
- [x] Abuse killswitch: env DENYLIST (comma owners or owner/repo) → 410;
      one commit to main disables an abuser
- [x] Report path: /-/report?deck=owner/repo on the app origin → prefilled
      GitHub abuse issue; linked from every deck's H cheatsheet footer
- [x] All deck responses X-Robots-Tag: noindex (decks are for sharing, not SEO)
- [ ] Public Suffix List: PR adding fslides.dev (private section) — once
      merged + propagated, browsers/Safe Browsing treat each owner subdomain
      as an independent site (blast radius = one owner, like github.io)
- [ ] BAHA (DNS, Cloudflare dash → fslides.dev → DNS): wildcard record
      (Type A, name `*`, IPv4 192.0.2.1, Proxied ON) + later a TXT record
      `_psl` pointing at the PSL PR URL. security@fslides.dev live (2026-07-28).
- Backlog: rate limiting rules, proactive Safe Browsing monitoring

## Phase 2.7 — Issue-driven development (2026-07-26, Baha's process)
Prompting in a terminal doesn't scale and isn't traceable. The loop now:
1. Baha files a GitHub issue (any device) — the issue body IS the prompt;
   mention @claude (or put it in the title)
2. claude-code-action runs Claude Code in CI: implements on a branch,
   opens a PR linked to the issue, replies in-thread
3. Iterations are comments: "@claude …" on the issue/PR re-runs it
4. Staging: every PR gets a Cloudflare version-preview URL commented on
   the PR (app-origin pages; decks-origin logic only runs on real domains)
5. Merge to main → production deploy (site/gateway, path-filtered)
- [x] .github/workflows/{claude,preview,deploy}.yml committed
- [x] Setup complete & E2E-proven 2026-07-27: issue #9 → @claude implemented
      → PR #10 → staging URL in PR comment → verified serving the change.
      Auth: OAuth token from Baha's subscription (works — early 401s were
      token-delivery bugs, not the token; procedure: run `claude setup-token`
      in a real terminal, copy the token, Claude verifies it in a sandbox
      HOME before setting the secret). Deploys: plain `npx wrangler@4`
      (wrangler-action was flaky). Previews needed account-level
      previews_enabled=true on the worker (set via API) + URL constructed
      from Version ID when wrangler omits it
- @claude trust gate: only OWNER/MEMBER/COLLABORATOR can trigger (public
  repo safe — strangers can't spend the subscription)
- Backlog: previews for decks-origin behavior; screenshot bot on PRs

## Phase 2.8 — Open hosting with reputation isolation (2026-07-27, Baha's call)
Invite-only is a launch posture, not a product. Adopted the github.io model:
- [x] Owner subdomains: decks serve at {owner}.fslides.dev/{repo} (wildcard
      route on the zone; first-level = free Universal SSL). decks.fslides.dev
      and fslides.dev/owner/repo 301 to the new scheme; owner root redirects
      to their fslides.dev profile
- [x] PUBLISHERS allowlist DELETED — any repo carrying an fslides config
      renders. Opt-in = the config itself; attackers can only burn their own
      subdomain
- [x] Abuse killswitch: env DENYLIST (comma owners or owner/repo) → 410;
      one commit to main disables an abuser
- [x] Report path: /-/report?deck=owner/repo on the app origin → prefilled
      GitHub abuse issue; linked from every deck's H cheatsheet footer
- [x] All deck responses X-Robots-Tag: noindex (decks are for sharing, not SEO)
- [x] Wildcard route / gateway conflict fixed (2026-07-28, issue #20): the
      *.fslides.dev/* wildcard was beating the gateway's custom domain on
      api.fslides.dev. Fixed by adding an explicit zone route in
      packages/gateway/wrangler.toml so the gateway wins. Defense in depth in
      the site worker: added auth/login/gateway/ftp/smtp/imap to RESERVED; a
      reserved-subdomain request that reaches the app-origin branch now returns
      the bat 404 instead of pretty-URL-redirecting (e.g. /auth/login → auth.fslides.dev)
- [ ] Public Suffix List: PR adding fslides.dev (private section) — once
      merged + propagated, browsers/Safe Browsing treat each owner subdomain
      as an independent site (blast radius = one owner, like github.io)
- [ ] BAHA (DNS, Cloudflare dash → fslides.dev → DNS): wildcard record
      (Type A, name `*`, IPv4 192.0.2.1, Proxied ON) + later a TXT record
      `_psl` pointing at the PSL PR URL. security@fslides.dev live (2026-07-28).
- Backlog: rate limiting rules, proactive Safe Browsing monitoring

## Phase 2.10 — Two-tier private-deck sign-in (2026-07-28, issue #24)
- [x] Gateway: classic OAuth App flow alongside the GitHub App.
      `/auth/login?flow=oauth&origin=…` → 302 to github.com/login/oauth/authorize
      with `scope=repo`; same HMAC state scheme, `flow` carried inside the payload.
      Callback branches on `state.flow`: OAuth App uses OAUTH_CLIENT_ID/SECRET,
      classic tokens sent with expiresAt = now+30d. Missing OAUTH_CLIENT_ID → 503
      'oauth tier not configured'. OAUTH_CLIENT_ID added as a [vars] placeholder
      in wrangler.toml; OAUTH_CLIENT_SECRET is a wrangler secret (Baha sets both
      after creating the OAuth App). GitHub App flow (comments) unchanged.
- [x] Site interstitial: primary [ sign in with github to view ] button now opens
      the oauth flow (repo-read, one click). Token-paste remains the secondary path.
- [x] Enterprise guidance page: when a viewer HAS a session token but the fetch
      still fails (org likely restricts OAuth Apps), render a styled page instead
      of plain text. Three options: (a) token-paste form, (b) ask an org admin to
      approve fslides (links /apps/fslides/installations/new), (c) "or maybe you
      simply don't have access." Terminal styling, orange accents, text ≥0.9rem.
- [x] VERIFIED in production 2026-07-28: one-click OAuth sign-in renders a
      private deck end-to-end (incognito). Classic OAuth App
      Ov23liTBpJrvbFFyAelL; secret validated against GitHub's token endpoint.
      Auth-redirect cache poisoning from the #20 outage fixed (#26/#27:
      cache-busted every sign-in URL + no-store on gateway redirects).

## Phase 3 — Paid tier (only after 1–2 real teams use it)

Candidates, unvalidated:
- Hosted narration/video storage (replaces the LFS dance)
- Slide-level view analytics
- Team spaces / SSO for enterprises
- Custom domains for decks
- Hosted AI authoring (productize agents.md + skill)

---

## Backlog (not scheduled, don't lose)

**AI-native authoring** *(Bento-inspired analysis, 2026-07-22)* — SHIPPED 2026-07-24
- [x] `docs/agents.md` — served at fslides.dev/agents.md
- [x] Claude Code plugin (`/plugin marketplace add fslides/fslides` → `fslides-deck` skill)

**Player**
- Morph transitions: elements sharing `data-morph` ids FLIP-animate across slides (the Bento flagship; big visual payoff)
- Narration "full autopilot": optional auto-advance when a slide's narration ends
- Rebuild a proper speaker view (the old Presenter was removed 2026-07-23 — unclear + broken; teleprompter covers recording, Notes covers presenting, but a dual-screen view has real value)
- Comment thread states: resolve / reopen (map to issue close/reopen or a label)
- Live comment updates (gateway webhook → SSE) — after Phase 1

**Recording**
- Safari records mp4; Chrome webm — consider optional transcode for maximum compat
- Countdown (3-2-1) option before recording starts

**Scaffold**
- Auto-wire commenting on scaffold via GitHub App device flow: first run prints a one-time code (enable "Device Flow" on the app), token cached in ~/.config/fslides, then `PUT /user/installations/{id}/repositories/{repo_id}` adds each new repo to a selective installation automatically. (gh CLI tokens can't touch installation APIs — 403, verified 2026-07-24.) Not needed for "All repositories" installs, which remain the recommended default.

**Distribution**
- [x] `curl -fsSL fslides.dev/install | sh` installer (v1 wraps npm) — leads all CTAs (2026-07-24)
- Standalone binaries (Node SEA or bun-compiled) via GitHub Releases; installer auto-detects and skips the Node prerequisite
- Homebrew tap once binaries exist

**Housekeeping**
- [x] Renamed config to `fslides.config.js` (legacy read forever); scaffold/create/templates write the new name (2026-07-24)
- [x] scaffold sets git identity from the gh account when missing (2026-07-24)
- [x] README rewritten for the fslides/fslides era (2026-07-24)
- Note for contributors: `git-lfs` required to fetch narration in cloned decks
- npm publish requires interactive 2FA; local installs of fresh versions need `--min-release-age=0` (global 7-day cooldown is intentional)

---

*Working rhythm: features land on `main` continuously; publishes are batched.
This file is the single source of truth for what's next — update it in the same
commit as the work it describes.*
