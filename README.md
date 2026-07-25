<p align="center"><img src="packages/core/logo.png" width="96" /></p>

# fslides — slides are code

**[fslides.dev](https://fslides.dev)** · the site is an fslides deck — press → when you get there

A presentation framework for developers. Every slide is a **plain HTML file** in a **git repo**. fslides provides everything around your slides: a player with keyboard navigation and overview, speaker notes, **voice/camera narration**, **element-anchored review comments backed by GitHub issues**, live reload, an in-browser editor, and one-command publishing to GitHub Pages.

No build step. No proprietary format. No lock-in. A deck from this year opens in ten years.

```bash
npm install -g fslides
fslides scaffold my-deck     # GitHub repo + CI + live Pages URL + comments, one command
cd my-deck && npm install
fslides serve                # author with live reload
```

`scaffold` needs the [GitHub CLI](https://cli.github.com) authenticated. For a local-only deck: `fslides create my-deck` (add `--template charcoal|paper` for a [designed starter](https://fslides.dev/templates)).

## How it works

```
my-deck/
├── fslides.config.js        # manifest: slides, labels, title, repo, gateway
├── notes.json               # speaker notes per slide
├── slides/
│   ├── cover.html           # ← a slide is just this. any HTML/CSS/JS.
│   ├── topic.html
│   └── recordings/          # narration (git-lfs tracked in scaffolded decks)
└── .github/workflows/       # push to main → fslides build → GitHub Pages
```

Slides are self-contained HTML on a fixed 1280×720 canvas. The player scales, navigates, and presents them. Push to `main` and CI publishes the deck. That's the whole model.

*(Older decks using `fuckslides.config.js` keep working — both filenames are read.)*

## The player

`fslides serve` opens your deck locally with the full toolbar:

| | |
|---|---|
| **Navigate** | ← → · **G** overview grid · **T** filmstrip · **F** present fullscreen |
| **Notes** | **N** — per-slide speaker notes, saved to `notes.json` |
| **Narrate** | **M** — record voice or camera per slide: pop-out teleprompter, live waveform, device pickers, virtual backgrounds. Viewers press **Play** (**V**) on the published deck; camera takes render in a draggable bubble and auto-continue across slides |
| **Comment** | **K** — reviewers right-click any element and pin a thread to it (drag-select for groups). Threads are **GitHub issues** on your repo; the panel is a deck-wide inbox. Published decks get one-popup GitHub sign-in via the [fslides GitHub App](https://github.com/apps/fslides) (issues-only permission) |
| **Edit** | **E** — in-browser slide editor with live preview |

## Commands

| Command | |
|---|---|
| `fslides scaffold <name>` | New deck as a GitHub repo — files, CI, Pages, comments wired (`--template`, `--private`, `--org`) |
| `fslides create <name>` | New local-only deck (`--template charcoal\|paper`) |
| `fslides serve` | Local player: live reload, notes, narration, comments |
| `fslides build [dir]` | Deployable static folder — what CI publishes |
| `fslides export [out.html]` | Single self-contained HTML file (works from `file://`) |
| `fslides pdf` / `pptx` / `gif <slide>` | Format exports |
| `fslides add-slide <name>` | Scaffold one slide |
| `fslides publish` | Push a single-file export to a `gh-pages` branch |

## Author with AI

Slides are HTML — the native language of every coding agent. The one-page spec at **[fslides.dev/agents.md](https://fslides.dev/agents.md)** teaches any model the deck anatomy and slide rules. Claude Code users get a packaged skill:

```
/plugin marketplace add fslides/fslides
```

Then: *"make me a deck about X"* — the skill scaffolds the repo, writes the slides, fills the speaker notes, and publishes.

## Docs & links

- **Docs**: [fslides.dev/docs](https://fslides.dev/docs)
- **Templates**: [fslides.dev/templates](https://fslides.dev/templates)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **npm**: [fslides](https://www.npmjs.com/package/fslides)

## Contributing

PRs welcome — this repo runs on them (live reload, self-contained export, sandbox hardening, and the `build` command direction all came from contributors). For deck repos: install `git-lfs` before cloning decks with narration.

Monorepo layout: `packages/core` (CLI + player) · `packages/gateway` (the api.fslides.dev sign-in broker, Cloudflare Worker) · `packages/site` (fslides.dev — itself an fslides deck).
