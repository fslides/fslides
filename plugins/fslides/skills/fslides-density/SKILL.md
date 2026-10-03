---
name: fslides-density
description: >-
  Author or retrofit a content-density dial (levels 1 to 5) in an fslides deck so the
  audience, or the presenter, can choose how much each slide shows. Use when the user
  asks for "less text", "more detail on demand", an exec version and a deep-dive
  version of the same deck, a density slider, or says a slide feels too heavy or too
  empty. Covers data-d / data-dmax, per-level layout, the per-slide saved level, and
  how to keep slides airy at the default level.
---

# Content density in fslides

One deck, five levels of detail. Opt in once in `fslides.config.js`:

```js
density: { default: 3 },
```

The player then shows a density dial (keys `-` / `+`). Run `fslides serve` and turning
the dial **rewrites that slide's `<html data-density="N">`**, so the chosen level travels
with the deck into builds, single-file exports, hosted decks, PDFs and editable exports.

## What each level means

| Level | Slide shows |
|---|---|
| 1 | One visual or one quote. The title at most. |
| 2 | Title plus the minimum structure (labels, no sentences). |
| 3 | The default. The slide as presented: title, the visual, short labels. |
| 4 | More context: sub-lines, bullets, the second example. |
| 5 | Everything: the footnotes, the caveats, the full detail. |

## Authoring rules

- Tag elements with the level at which they appear:
  - `data-d="4"`: shown at density 4 and above
  - `data-dmax="1"`: shown only at density 1 and below (e.g. a quote that replaces the text)
- Lay the slide out per level with CSS, because moved elements animate between levels:
  `html[data-density="2"] .visual { top: 260px }`. Or read `var(--density)`.
- **Move detail up, do not delete it.** When trimming level 3, push the extra words to
  `data-d="4"` or `"5"`. Nothing is lost; it is one tap away.
- Level 3 is the one people see most. Aim for the title, the visual and short labels:
  roughly 60 to 90 visible words. See the `fslides-clean-deck` skill for the full routine.
- Re-balance, do not just hide. A slide that loses its text at level 2 must be re-laid
  out (move the visual, enlarge the type), otherwise it feels empty.
- Keep each slide's saved `<html data-density="N">` when editing. It is the author's
  decision, often set with the dial.
- Move elements with the `translate` / `scale` CSS properties or `top`. Entrance
  animations such as `.in1` lock `transform`, so `transform` moves fight them.
- Slide scripts can react: `addEventListener('fslides:density', e => e.detail.level)`.

## Checking

Force a level to look at it: `?density=N` on the slide URL, or `fslides pdf --density N`.
The `fslides-verify` skill ships a script that screenshots a slide at all five levels in
one strip so overlaps and empty states are obvious.
