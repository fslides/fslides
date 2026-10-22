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

One deck, five levels of detail. The player shows a density dial (keys `-` / `+`) in
every deck. Set the starting level in `fslides.config.js`, or turn it off with `density: false`:

```js
density: { default: 3 },
```

Run `fslides serve` and turning
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

## Filling levels 4 and 5 with sourced detail

Levels 4 and 5 are where viewers who want more go. Fill them with real, cited detail,
not padding:

```bash
fslides deepen 04-context-bill          # one slide (≈ $0.012 with the user's EXA_API_KEY)
fslides deepen 04-context-bill 09-impact
fslides deepen --all --dry-run           # every slide: show calls and cost first
```

Each run writes `research/deepen/<slide>.json` with `level4` (supporting context, one
sentence each) and `level5` (methodology, caveats, definitions) candidates. Each candidate
has a `cite` id that is already in `sources.json`. Pick one to three per level that add
something the slide does not say, and add them with their citation:

```html
<p class="sub" data-d="4" data-cite="s12">Context windows grew 4× between 2023 and 2025.</p>
<p class="fine" data-d="5" data-cite="s13">Survey of 1,100 IT leaders, Q2 2025.</p>
```

Level 5 also prints the slide's footnotes automatically, for every `data-cite` on the
slide. Leave room at the bottom (about 40px), or hide them with `<html data-footnotes="off">`.
Then run `fslides verify` and check the slide at 4 and 5 with the `fslides-verify` strip.

## Checking

Force a level to look at it: `?density=N` on the slide URL, or `fslides pdf --density N`.
The `fslides-verify` skill ships a script that screenshots a slide at all five levels in
one strip so overlaps and empty states are obvious.
