# fslides — agent authoring guide

You are reading the canonical guide for AI agents that author **fslides** decks.
fslides is a presentation framework where every slide is a plain HTML file in a
git repo. There is no proprietary format: if you can write HTML, you can author
a deck. This page is self-contained — no other context is required.

Live copy: https://fslides.dev/agents.md · Source: https://github.com/fslides/fslides

## Deck anatomy

```
my-deck/
├── fslides.config.js     # the manifest (legacy name fuckslides.config.js also read)
├── notes.json               # per-slide speaker notes: { "<slide>.html": "…" }
├── package.json             # devDependency: fslides; scripts: serve/build/pdf
├── slides/
│   ├── cover.html           # one file per slide — self-contained HTML
│   ├── topic.html
│   └── recordings/          # per-slide narration (webm/mp4), managed by the player
└── .github/workflows/pages.yml   # CI: fslides build _site → GitHub Pages
```

## The manifest (`fslides.config.js`)

```js
module.exports = {
  name: 'my-deck',                       // output filename for builds/exports
  title: 'My Deck — Subtitle',           // browser tab + player title
  slidesDir: 'slides',
  repo: 'owner/repo',                    // where slide comments live (GitHub issues)
  gateway: 'https://api.fslides.dev',    // sign-in broker for comments on published decks

  slides: [ 'cover.html', 'topic.html' ],  // order = presentation order
  labels: [ 'Cover', 'The Topic' ],        // shown in the player's nav/overview
  // disabled: ['draft.html'],             // listed but skipped
};
```

When you add a slide file, **always register it in `slides` and `labels`**
(same index). Never name a slide `index.html` — the built player owns that name.

## Slide authoring rules

Each slide is a standalone HTML document on a **fixed 1280×720 canvas**. Use
this skeleton — the pattern matters more than the styling:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deck — Slide name</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { width: 100%; height: 100%; overflow: hidden; background: #0d0f14; }
    body {
      width: 1280px; height: 720px; overflow: hidden; position: absolute;
      font-family: -apple-system, system-ui, sans-serif;
      background: #0d0f14; color: #fff;
    }
    /* your slide styles */
  </style>
</head>
<body>
  <!-- your slide content -->
<script src="/js/fuckslides.js"></script>
<script>
(function scaleToFit() {
  if (window !== window.top) return;            // player scales it instead
  const W = 1280, H = 720;
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    document.body.style.transform = 'scale(' + s + ')';
    document.body.style.transformOrigin = '0 0';
    document.body.style.left = ((window.innerWidth - W * s) / 2) + 'px';
    document.body.style.top = ((window.innerHeight - H * s) / 2) + 'px';
  }
  fit(); window.addEventListener('resize', fit);
})();
</script>
</body>
</html>
```

Hard rules:
- **Fixed 1280×720** body; design in absolute pixels, not viewport units.
- Include `<script src="/js/fuckslides.js"></script>` (keyboard relay to the player)
  and the `scaleToFit` block (standalone-open support). The build rewrites the
  runtime path for deployment automatically.
- Self-contained: inline your CSS/JS per slide. Relative asset paths (images,
  gifs) resolve from `slidesDir` and are copied by the build.
- Entrance animations: CSS keyframes with staggered `animation-delay` on load.
  Slides re-run their animations each time they're navigated to (fresh iframe).
- Anything a browser renders is legal: canvas, SVG, embedded apps, charts.

Design defaults that look right if the user gives no direction: dark background
(#0d0f14–#22242C), one accent color, `Inter` for text and `JetBrains Mono` for
numbers/code (Google Fonts), generous whitespace, 0.4–1s staggered fade-up reveals.

## Speaker notes

`notes.json` maps slide filename → talk track (markdown-ish plain text, bullets
encouraged). Write them — they power the teleprompter during narration recording
and the Notes panel while presenting.

```json
{ "cover.html": "- Welcome — one-line thesis.\n- Set up the arc of the deck." }
```

## Commands (run in the deck directory)

| Command | Purpose |
|---|---|
| `fslides serve` | Author/present locally: live reload, notes editing, narration recording, comments |
| `fslides build [dir]` | Deployable static folder (player + slides + assets) — what CI publishes |
| `fslides scaffold <name>` | New deck as a GitHub repo: files + CI + Pages + comments wired |
| `fslides export [out.html]` | Single self-contained HTML file |
| `fslides pdf` / `pptx` / `gif <slide>` | Format exports |
| `fslides add-slide <name>` | Scaffold one slide file |

Starting from nothing: `npm install -g fslides && fslides scaffold <name>`
(requires the GitHub CLI, authenticated). For a local-only deck use
`fslides create <name>` instead.

## Features you get for free (don't rebuild these)

- **Narration**: per-slide voice/camera recording with teleprompter; files in
  `slides/recordings/`, played back on the published deck. Suggest `git lfs`
  for the recordings directory.
- **Comments**: reviewers right-click any element in the player and pin a
  thread to it; threads are GitHub issues on `config.repo` titled
  `💬 Slide: <file>`. Comment bodies may carry a hidden
  `<!--fslides-anchor {…}-->` header — preserve it if you edit comments.
- **Player chrome**: toolbar, overview grid, filmstrip, PDF-ready layout — all
  from the framework. A slide should only ever contain its own content.

## Working style for agents

- Edit slide files in place; keep each slide's CSS/JS inside that file.
- After adding/removing slides, update `slides` + `labels` in the config and
  add a note in `notes.json`.
- Verify with `fslides serve` (or ask the user to) rather than guessing at
  rendering. Slides are plain HTML — a headless browser screenshot works too.
- Respect the 1280×720 fixed canvas. If content overflows, cut content or
  split the slide — never shrink type below readable presentation sizes.
