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
