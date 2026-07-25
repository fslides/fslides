# fslides — Roadmap

> **Vision.** Slides-as-code for developers — and **the slide tool for agents**.
> Decks are git repos; slides are HTML; publishing is a static folder on GitHub
> Pages. The CLI is the primary creation interface for humans and agents alike;
> the web is for viewing, reviewing, and discovering. The SaaS layer (fslides.dev)
> sells identity and convenience — never lock-in. The engine stays open source.
>
> **Architecture principle.** Decks stay static and self-sufficient. Server-side
> capability lives in one small authenticated **gateway**, not in deck hosting.

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
