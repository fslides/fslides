# fslides — usage & deployment

Quick reference for using `fslides` (this repo, aka "fuckslides") — a no-bullshit HTML presentation CLI. Written so any Claude session (or human) can pick it up cold.

## What it is

`fslides` is a **globally-installed** CLI (`npm install -g fslides`). It is **not repo-scoped** — run it from any directory that is a "deck".

A **deck** is a folder containing:
- `fslides.config.js` — the deck manifest (legacy name `fuckslides.config.js` also read)
- `slides/` — one HTML file per slide (+ optional `slides/shared.css` for shared styles)
- optional: `notes.json` (speaker notes), `sources.json` (citations for `data-cite="s1"`),
  `tailor.json` (per-audience values for `data-fill="key"`), `research/` (Exa briefs and reports),
  `.fslides/` (local Exa cache and verify / fresh state, gitignored)

## Config shape

```js
// fslides.config.js
module.exports = {
  name: 'Deck Title',                         // also the exported filename
  slides: ['01-title.html', '02-intro.html'], // order matters
  labels: ['Title', 'Intro'],                 // optional, per-slide nav labels
  // port: 3000,                              // optional, for `serve`
  // liveReload: false,                       // optional, disable SSE reload on `serve`
  // disabled: [],                            // optional, slides to skip
};
```

Each slide in `slides/` is a standalone HTML fragment — author as normal HTML/CSS. Share look-and-feel via `slides/shared.css`. Local images/fonts referenced with relative paths get inlined on export.

## Commands (run from the deck dir)

| Command | What it does |
|---|---|
| `fslides create <name>` | Scaffold a new deck from the template |
| `fslides add-slide <name> [--template X]` | Add a slide |
| `fslides serve` | Local dev server + live reload (default `:3000`) — for authoring / presenting live |
| `fslides export [out.html]` | **Bundle the whole deck into ONE self-contained HTML file** (see below) |
| `fslides pdf` / `pptx` / `gif` | Export to those formats |
| `fslides publish` | Push a single-file export to a `gh-pages` branch |
| `fslides research "<topic>"` | Exa: cited research brief → `research/<slug>.md` + `sources.json` |
| `fslides verify` | Exa: re-check cited claims live, fact-check uncited numbers (`--ci`, `--add`) |
| `fslides deepen [slide]` | Exa: cited density 4–5 candidates → `research/deepen/` |
| `fslides tailor --company X` | Exa: audience brief + `tailor.json` |
| `fslides fresh` | Exa: newer sources since the last check (`--monitors --webhook URL`) |

The Exa commands need `EXA_API_KEY` in your environment and run locally only; `--dry-run` prints the calls and estimated cost without a key. With the key set, `fslides serve` also answers live questions (key `A`, or the presenter view). Details: [docs/agents.md](docs/agents.md#sources-citations-and-exa).

## Deployment — the important part

`fslides export` produces **one self-contained HTML file**: every slide, the player/slideshow engine (`fuckslides.js`), all local assets (base64-inlined), the citations from `sources.json` and the `tailor.json` values baked into a single file. Drop it on **any** web server, email it, or open it straight off disk via `file://`. No server, no build, nothing to run in production.

> **Source vs. artifact:** hosting the raw `slides/*.html` files does **not** give you a slideshow — those are authoring inputs, and the runtime (nav, transitions, player) is not in them. The runtime lives *inside the export output*. Deploy the exported file, not the `slides/` folder.

**Deploying = publishing one static artifact → a URL.** No container, no compute, nothing to leave abandoned. (This is the architecture behind a would-be `fslides deploy`: "publish one static artifact, get a durable URL, track ownership, auto-expire by default.")

### External refs the export does NOT inline
By design it skips absolute `http(s):` URLs. Two things stay remote:
1. The Elastic favicon (`https://www.elastic.co/favicon.svg`) — purely cosmetic (browser-tab icon).
2. **Only if a slide uses the webcam / selfie-segmentation effect** — MediaPipe is pulled from a CDN at runtime. Core decks that don't use that effect are fully standalone.

