---
name: fslides-style
description: >-
  Choose, apply, or package an fslides design system ("style"). Use when the user wants
  a deck to look like another deck, asks for a particular look and feel, wants to reuse
  a design across decks or teams, or says "make a skill from this deck's style". A style
  is a directory with a design brief, shared CSS/JS and reference slides.
---

# fslides styles

A **style** packages a deck's look so the next deck matches it:

```
my-style/
  style.json        # name, description
  SKILL.md          # the design brief: palette, type, spacing, do and don't
  assets/           # shared CSS / JS / fonts copied into <slidesDir>/style/
  slides/           # reference slides to start from
```

## Use one

```bash
fslides style list
fslides style add <path | git-url[#subdir]>      # into ~/.fslides/styles/
fslides create my-deck --style <name>            # new deck in that look
fslides style use <name>                         # or apply to the current deck
```

Applying a style copies its assets to `<slidesDir>/style/`, writes `style: '<name>'` in
the config, and installs the brief as a project skill at
`.claude/skills/fslides-style-<name>/`. From then on, **read that brief and follow it
for every slide you write**, and start from its reference slides.

## Author one

1. Pick the deck that has the look. Copy its shared CSS/JS into `assets/`.
2. Write `SKILL.md` as a brief another agent can follow without seeing the original deck:
   - the palette with hex values and what each color means
   - the type scale (families, sizes, weights, letter-spacing)
   - layout rules (margins, grid, how a hero slide differs from a content slide)
   - motion rules (what animates, how long, what must not)
   - what to avoid
3. Add 3 to 5 neutral reference slides that use the assets, with placeholder text.
4. Add `style.json`, then test: `fslides style add ./my-style && fslides create test --style my-style`.
5. Share it as a git repo; others install with `fslides style add <git-url>`.

If the deck uses the density dial, make sure the style's CSS includes helpers for
`html[data-density="N"]` layout (see the `fslides-density` skill).
