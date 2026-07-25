---
name: fslides-deck
description: >-
  Create and edit fslides presentations — decks that live in git repos where
  every slide is a plain HTML file on a fixed 1280×720 canvas. Use whenever the
  user wants a slide deck or presentation: starting from NOTHING (fslides
  scaffold creates the GitHub repo, CI, and live GitHub Pages URL in one
  command), from source material, or by improving an existing deck (a directory
  containing fslides.config.js). Covers slides, speaker notes, narration,
  element-anchored review comments, and publishing. Full spec at
  https://fslides.dev/agents.md.
---

# Authoring fslides decks

An fslides deck is a directory with `fslides.config.js` (the manifest),
`slides/*.html` (one self-contained HTML file per slide, fixed 1280×720), and
`notes.json` (speaker notes). The full authoring spec — slide skeleton, config
schema, hard rules — is one page: read it before your first slide.

- Local copy (if this repo is fslides itself): `docs/agents.md`
- Canonical: https://fslides.dev/agents.md — fetch it when working in a deck repo

## Starting from nothing

```bash
npm install -g fslides           # once
fslides scaffold <deck-name>     # GitHub repo + CI + Pages + comments, one command
# (requires gh CLI authenticated; use `fslides create <name>` for local-only)
cd <deck-name> && npm install && fslides serve
```

## The loop

1. Write/edit `slides/<name>.html` following the skeleton in the spec —
   self-contained HTML, fixed 1280×720 body, `/js/fuckslides.js` script tag,
   `scaleToFit` block, entrance animations via staggered CSS keyframes.
2. Register every slide in `fslides.config.js` (`slides` + `labels`, same
   index). Never name a slide `index.html`.
3. Write the talk track in `notes.json` — it powers the teleprompter and
   Notes panel.
4. `fslides serve` live-reloads on save. Verify rendering there or with a
   headless-browser screenshot; don't guess.
5. Ship: commit and push — the scaffolded CI publishes to GitHub Pages via
   `fslides build`.

## Judgment calls

- Map content to the medium: big numbers get big type, comparisons get
  side-by-side layouts, processes get animated sequences — not walls of bullets.
- Unless the user has a design system, default to: dark background (#0d0f14),
  one accent color, Inter + JetBrains Mono, staggered fade-up reveals.
- Don't rebuild what the player provides (navigation, overview, notes,
  narration playback, comments) — slides contain only their own content.
- Recordings in `slides/recordings/` are user-created narration: never delete
  or overwrite them without explicit confirmation.
