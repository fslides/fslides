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
  // liveReload: false,                    // fslides serve: no SSE reload (or ?noreload=1 per tab)
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
| `fslides pdf` / `pptx` / `gif <slide>` | Format exports (`pdf --density N` for density decks) |
| `fslides gslides` | Editable deck uploaded to Google Drive as Google Slides (`--no-upload`, `--density N`) |
| `fslides pptx --editable` | Editable PowerPoint: real text boxes, shapes, pictures, notes |
| `fslides add-slide <name>` | Scaffold one slide file |
| `fslides style list \| add <path\|git-url> \| use <name>` | Reusable design systems (styles), see below |

Starting from nothing: `npm install -g fslides && fslides scaffold <name>`
(requires the GitHub CLI, authenticated). For a local-only deck use
`fslides create <name>` instead.

## Editable export: Google Slides and PowerPoint

`fslides gslides` rebuilds every slide from native objects and uploads the result to
Google Drive, which converts it into a real Google Slides deck. `fslides pptx --editable`
writes the same objects as a PowerPoint file. The classic `fslides pptx` is still one
screenshot per slide.

What becomes what:
- Text (including `::before` / `::after` content, form values, links) → text boxes with
  runs: font family and weight (`Inter SemiBold`, `IBM Plex Mono Medium`…), size, color,
  italic, underline, super/subscript, hyperlinks. Line breaks are copied from the browser,
  so nothing re-wraps.
- Background colors, borders, rounded corners, circles → shapes; single-side borders and
  rules → lines.
- `svg`, `canvas`, `img`, `video`, `iframe` and CSS gradients → transparent pictures at
  2× resolution, captured in isolation (their extent includes overflowing svg labels).
- `notes.json` → speaker notes. Disabled slides are skipped; each slide uses its saved
  density (or `--density N`).

Authoring for a clean conversion:
- Put words in HTML, not in `<svg><text>` or canvas: HTML text stays editable, svg text
  becomes part of a picture.
- Let entrance animations settle within 3 s, or set `pdfOverrides: { 'x.html': { wait: 2000 } }`.
  Looping animations are captured wherever they are at that moment.
- Google Slides has no letter spacing: negative tracking is compensated by sizing the run
  down slightly; positive tracking is dropped. PowerPoint keeps it (`pptx --editable`).
- Upload credentials: `gcloud auth login --enable-gdrive-access` once, or `GOOGLE_OAUTH_TOKEN`.
  Set `PUPPETEER_EXECUTABLE_PATH` if the bundled Chrome is unavailable.

## Content density (1–5)

Decks can let the audience choose how much text they see. Opt in with
`density: { default: 3 }` in `fslides.config.js`; the player then shows a
density dial in the toolbar (keys `-` / `+`).

**The level is set per slide and lives in the slide's HTML**: `<html data-density="3">`.
In `fslides serve` the dial writes that attribute back to the slide file (no
reload), so it's committed with the deck and carries into `build`, `export`
(single HTML file), hosted decks and `pdf`. A slide without the attribute uses
the deck default. Viewers of a shared deck can still move the dial for
themselves; that change isn't saved. `?density=N` or `fslides pdf --density N`
forces one level for every slide.

Author every slide so that level 5 contains the maximum content:

| Level | What the slide shows |
|---|---|
| 1 | One self-explanatory visual, or a single quote. Nothing else. |
| 2 | The title plus minimal content (the visual and one key element). |
| 3 | The default: the slide as designed. |
| 4 | More text or illustration: context, mechanism, examples. |
| 5 | Everything: the deeper how and why. |

Markup, handled by `/js/fuckslides.js`:

- `data-d="4"`: element shown at density ≥ 4.
- `data-dmax="1"`: element shown only at density ≤ 1 (for example, a quote that replaces the text at level 1).
- `html[data-density="2"] .x { … }`: per-level layout, or read `var(--density)`.
- Moves between levels animate automatically. Give moved elements a CSS transition for transforms and sizes.
- Slide scripts can react: `addEventListener('fslides:density', e => e.detail.level)`, or read `document.documentElement.dataset.density`.

Reorganize rather than cram: at low levels, let the visual grow into the freed
space; at high levels, shrink or reposition it to make room. Never let content
overlap at any level.

## Styles: reusable design systems

A **style** packages a deck's look (atmosphere, palette, type, layout,
components, motion rules) so new decks stay consistent. It is a directory:

```
my-style/
├── style.json   # { name, description, starter: { slides, labels } }
├── SKILL.md     # the design brief agents follow (skill frontmatter)
├── assets/      # shared CSS/JS, copied to <slidesDir>/style/
└── slides/      # starter + reference slides
```

- `fslides kit add <path | git-url[#subdir]>` installs into `~/.fslides/styles/`. A packaged style is called
  a **kit** on fslides.dev; `fslides kit` and `fslides style` are the same command.
- `fslides style list` shows installed and built-in styles.
- `fslides create <deck> --style <name>` (or `scaffold --style`) starts a deck
  from the style's starter slides.
- `fslides style use <name>` applies a style to an existing deck without
  touching its slides.

Applying a style writes `style: '<name>'` into the config and installs the
brief as a project skill at `.claude/skills/fslides-style-<name>/`, with the
reference slides next to it. **If a deck's config names a style, read that
SKILL.md before editing any slide and follow it over the defaults here.**

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
