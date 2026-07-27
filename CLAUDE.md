# fslides — project instructions

fslides (real name: **Fuckslides** — provocative on purpose, the logo is the
top of a barbed-wire baseball bat) is slides-as-code: decks are GitHub repos,
pushes are deploys, agents are first-class users.

## Source of truth
- `ROADMAP.md` is the source of truth. Update it **in the same commit** as
  any feature/architecture work.

## Architecture (read before touching)
- `packages/core` — CLI + player (player.html is one file with inline script)
- `packages/site` — fslides.dev: a worker (`src/index.js`) serving static
  assets, profile pages (`src/profile.html`), the 404 (`src/notfound.html`),
  and rendering hosted decks on the fly from GitHub at decks.fslides.dev
  (nothing is stored; `git push` publishes)
- `packages/gateway` — api.fslides.dev: GitHub OAuth for comments
- Site builds: `cd packages/site && npm run sync-vendor && node
  ../core/bin/cli.js build _site`. Never skip sync-vendor.

## Design rules (Baha rejects violations)
- Orange `#F05000` / `#FF6A1A`, terminal identity: mono type, `##`/`>`
  heading prefixes, bracket [buttons], vim statusline footers
- Mono UI text ≥ 0.88rem, body ≥ 0.92rem — small fonts get bounced
- The barbed-bat logo appears in every top bar + favicon
- At most ONE blinking cursor per view
- Interactions must be consistent across pages: the "+ new deck" CTA with
  its two-row copy menu (you drive / your agent drives) is THE creation
  surface — never a static instruction block
- Website chrome and deck toolbar are separate layers; full-screen overlays
  anchor top to `--chrome-h`

## Verification bar
- Don't claim it works — prove it. Build the site, check the pages you
  touched render (the preview workflow posts a staging URL on your PR).
- Every PR description: what changed, why, and what to look at on staging.
