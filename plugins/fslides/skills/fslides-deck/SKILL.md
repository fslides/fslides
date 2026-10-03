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
- If `fslides.config.js` has `style: '<name>'`, follow
  `.claude/skills/fslides-style-<name>/SKILL.md` and its reference slides.
  To start a deck in a known look: `fslides style list`, then
  `fslides create <deck> --style <name>`.
- If the config has `density`, author all five levels (`data-d`, `data-dmax`,
  `html[data-density]` layout): 1 = one visual or quote, 2 = title + minimum,
  3 = default, 4–5 = more context. Each slide's chosen level lives in its
  `<html data-density="N">`; keep it when editing. See the density section of the spec.
- Unless the user has a design system, default to: dark background (#0d0f14),
  one accent color, Inter + JetBrains Mono, staggered fade-up reveals.
- Don't rebuild what the player provides (navigation, overview, notes,
  narration playback, comments) — slides contain only their own content.
- Recordings in `slides/recordings/` are user-created narration: never delete
  or overwrite them without explicit confirmation.

## Related skills (same plugin)

Reach for the focused skill when the task matches:

| Task | Skill |
|---|---|
| Choose how much each slide shows (levels 1 to 5) | `fslides-density` |
| Google Slides, PowerPoint, PDF, one HTML file | `fslides-export` |
| Apply, reuse or package a design system | `fslides-style` |
| Crisper titles, fewer words, no decorative motion | `fslides-clean-deck` |
| Look at slides at all five densities, count words | `fslides-verify` |
| A slide that calls a real API on stage | `fslides-live-demo` |
