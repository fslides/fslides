# fslides — project instructions

fslides (real name: **FUCKSLIDES** — provocative on purpose, the logo is the
top of a barbed-wire baseball bat) is slides-as-code: decks are GitHub repos,
each slide is a plain HTML file, pushes are deploys, agents are first-class
users. `fslides` is the npm package and domain alias; brand copy uses
`f[uck]slides` with the profanity blurred until hover.

## Source of truth
- `ROADMAP.md` is the source of truth. Update it **in the same commit** as
  any feature/architecture work.

## Architecture (read before touching)

**Core principle:** Git is the only storage. Nothing is stored server-side.

- `packages/core` — The npm package (`fslides`). CLI (`bin/cli.js`) + player
  (`player.html`, one file with inline script) + runtime (`js/fuckslides.js`)
- `packages/site` — `fslides.dev`: a Cloudflare Worker (`src/index.js`)
  serving static assets, profile pages (`src/profile.html`), the 404
  (`src/notfound.html`), and rendering hosted decks on the fly from GitHub at
  `{owner}.fslides.dev/{repo}`. Nothing stored; `git push` publishes.
- `packages/gateway` — `api.fslides.dev`: Cloudflare Worker brokering GitHub
  OAuth for comments and private-deck access. Stateless.

**Site routing (owner subdomains):**
1. `decks.fslides.dev` → 301 to `{owner}.fslides.dev/{repo}`
2. `{owner}.fslides.dev` (non-reserved) → `serveDeck()` — renders from GitHub on the fly
3. `fslides.dev` → static assets; `/{login}` profile pages; `/{owner}/{repo}` → 301 to owner subdomain
4. Reserved subdomains (`www`, `api`, `auth`, `login`, etc.) → bat 404

**Site build:**
```sh
cd packages/site
npm run sync-vendor          # copies player.html, fuckslides.js, logo.png from core
node ../core/bin/cli.js build _site
# Never skip sync-vendor — _site will serve stale player/runtime otherwise
```

## CLI commands (`packages/core/bin/`)

Config file: `fslides.config.js` (preferred) or `fuckslides.config.js` (legacy fallback).

| Command | What it does |
|---|---|
| `fslides create <name> [--template charcoal\|paper\|minimal]` | Scaffold a new local deck (no GitHub required) |
| `fslides scaffold <name> [--private] [--org <org>] [--template ...]` | Full GitHub setup: creates repo via `gh` CLI, wires comments + Pages, pushes |
| `fslides serve` | Local dev server with live reload (SSE), speaker notes, narration, comment APIs |
| `fslides build [outDir]` | Static folder output (default: `dist/`). Copies slides, inlines player, rewrites asset paths |
| `fslides export [out.html]` | Single self-contained HTML file with all assets base64-inlined |
| `fslides publish` | `export` → force-push to `gh-pages` branch of `origin` |
| `fslides add-slide <name> [--template X]` | Scaffold one new slide file |
| `fslides pdf` | Export all slides to PDF via Puppeteer |
| `fslides pptx` | Export to PowerPoint via `pptxgenjs` |
| `fslides gif <slide>` | Export one slide to animated GIF |
| `fslides import <file …>` | Convert PDF/images to slides — requires `ANTHROPIC_API_KEY` |
| `fslides hub [path\|url]` | Serve all presentations from a hub manifest |

**Config shape (`fslides.config.js`):**
```js
module.exports = {
  name: 'my-deck',       // output filename base
  title: 'My Deck',      // browser tab title
  slidesDir: 'slides',
  repo: 'owner/repo',    // GitHub repo for comments (issues)
  gateway: 'https://api.fslides.dev',
  slides: ['cover.html', 'topic.html'],
  labels: ['Cover', 'Topic'],
  disabled: [],          // slides to skip
};
```

## Slide authoring rules

- Fixed **1280×720** canvas. Use absolute pixels, not viewport units.
- Each slide is a standalone HTML file. Include `<script src="/js/fuckslides.js"></script>` (keyboard relay) and the `scaleToFit` IIFE (standalone-open support). `fslides build` rewrites the runtime path automatically.
- Self-contained: inline CSS/JS per slide. Relative asset paths inside `slides/` are copied by build.
- **Never name a slide `index.html`** — the built player owns that name.
- Register every new slide in both `slides[]` and `labels[]` in the config (same index).
- Design defaults: dark background `#0d0f14`–`#22242C`, orange accent `#F05000`/`#FF6A1A`, `Inter` for text, `JetBrains Mono` for code/numbers, staggered fade-up entrance animations.

## Player (`player.html`)

- Fixed 1280×720 slide iframe (`#slide-frame`), CSS-scaled to viewport
- **Two-layer chrome in website mode:** `#site-bar` (52px, site nav) above `.preso-nav` (46px, deck controls). Plain decks have only `.preso-nav`.
- CSS custom property `--chrome-h`: 46px plain, 98px website mode, 0px presenting
- Toolbar auto-hides **only** in fullscreen presenting mode — never otherwise
- Brand: `#F05000`/`#FF6A1A` orange, `JetBrains Mono` wordmark, `Inter` UI, barbed-bat logo

## Design rules (Baha rejects violations)

- Orange `#F05000` / `#FF6A1A`, terminal identity: mono type, `##`/`>` heading prefixes, bracket [buttons], vim statusline footers
- **Mono UI text ≥ 0.88rem, body ≥ 0.92rem** — small fonts get bounced
- The barbed-bat logo appears in every top bar + favicon
- At most ONE blinking cursor per view
- Interactions must be consistent across pages: the `+ new deck` CTA with its two-row copy menu (you drive / your agent drives) is THE creation surface — never a static instruction block
- Website chrome and deck toolbar are separate layers; full-screen overlays anchor top to `--chrome-h`

## Gateway (`api.fslides.dev`)

**File:** `packages/gateway/src/index.js`

| Route | Purpose |
|---|---|
| `GET /healthz` | Health check |
| `GET /auth/login?origin=<deck-origin>` | GitHub App OAuth (issues:write) |
| `GET /auth/login?flow=oauth&origin=<deck-origin>` | Classic OAuth App (repo scope, one-click for private decks) |
| `GET /auth/install?origin=<deck-origin>` | GitHub App install + authorize |
| `GET /auth/callback?code&state` | Code exchange → token via `postMessage` |

Security: HMAC-SHA256 signed `state`, 10-minute expiry, origin allowlist.

## Environment variables and secrets

**Local dev:**

| Var | Command | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `fslides import` | PDF/image-to-slides conversion |
| `PUPPETEER_EXECUTABLE_PATH` | `fslides pdf/gif/export` | Override browser path |

**GitHub Actions secrets:**

| Secret | Workflow |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml`, `preview.yml` |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy.yml`, `preview.yml` |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude.yml` |

**Cloudflare Worker secrets (`wrangler secret put`):**

| Secret | Package | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | gateway | GitHub App client ID |
| `GITHUB_CLIENT_SECRET` | gateway | GitHub App client secret + HMAC signing key |
| `OAUTH_CLIENT_SECRET` | gateway | Classic OAuth App secret |

**Cloudflare Worker vars (`wrangler.toml`):**

| Var | Package | Value |
|---|---|---|
| `ALLOWED_ORIGIN_SUFFIXES` | gateway | `.github.io,fslides.dev,localhost,127.0.0.1` |
| `OAUTH_CLIENT_ID` | gateway | `Ov23liTBpJrvbFFyAelL` |
| `DENYLIST` | site | Comma-separated `owner` or `owner/repo` → 410 Gone |

## Dev workflow

**Local deck authoring:**
```sh
npm install -g fslides
fslides scaffold my-deck     # needs authenticated gh CLI
# or:
fslides create my-deck       # no GitHub needed
cd my-deck && npm install
fslides serve                # live reload at http://localhost:3000
```

**Working on the monorepo:**
```sh
npm install                  # from repo root, installs all workspaces

# Site:
cd packages/site
npm run sync-vendor          # always run first after touching core
node ../core/bin/cli.js build _site

# Gateway:
cd packages/gateway
npx wrangler dev             # local Cloudflare Workers dev mode
```

**Deploying:**
```sh
# Site (manual):
cd packages/site && npm run deploy   # sync-vendor + build + wrangler deploy

# Gateway (manual):
cd packages/gateway && npx wrangler@4 deploy
```

**Issue-driven loop (primary dev process):**
1. File a GitHub issue; mention `@claude` in the title or body
2. `claude.yml` runs `claude-code-action`, implements on a branch, opens a PR
3. `preview.yml` posts a staging URL as a PR comment (app-origin only)
4. Iterate by commenting `@claude …` on the issue or PR
5. Merge to `main` → `deploy.yml` ships only the changed packages (path-filtered)

**npm publish:**
```sh
cd packages/core
npm publish    # requires interactive 2FA; 7-day cooldown on new versions
               # local install of fresh version: npm install -g fslides --min-release-age=0
```

## Key conventions

- **Deck config is a JSON5 literal** on the hosted path — never `require()`'d or `eval`'d at the edge. CLI builds use `require()` (trusted local context).
- **Config name:** `fslides.config.js` preferred; `fuckslides.config.js` is always read as a fallback.
- **Comments** are GitHub Issues titled `💬 Slide: <filename>`, one issue per slide. Comment anchors stored as `<!--fslides-anchor {…}-->` in the issue body.
- **Recordings** live in `slides/recordings/` as `.webm`/`.mp4`/`.m4a`; deck repos should use `git-lfs`.
- **Monorepo decks:** A `.fslides` manifest at the repo root (`{ "decks": ["path/to/subdeck"] }`) opts into multi-deck mode. Worker uses longest-prefix URL matching; manifest cached 60s.
- **Private decks:** Viewer token is an HttpOnly cookie on the owner subdomain — deck JS can never read it. Private responses are `Cache-Control: private`, never edge-cached.
- **Abuse killswitch:** `DENYLIST` env var (site worker) → 410 Gone. One commit to main disables an abuser.
- The site gateway conflict: `packages/gateway/wrangler.toml` has an explicit zone route so `api.fslides.dev` beats the site's wildcard `*.fslides.dev/*`.

## Verification bar
- Don't claim it works — prove it. Build the site, check the pages you touched render (the preview workflow posts a staging URL on your PR).
- Every PR description: what changed, why, and what to look at on staging.
