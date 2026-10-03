---
name: fslides-verify
description: >-
  Verify fslides slides by looking at them: screenshot a slide at all five density
  levels in one contact strip, count visible words per slide, and check for overlaps and
  empty states. Use after writing or editing any slide, before exporting, or whenever
  the user says a slide "looks weird", "is empty", "overlaps", or "is too heavy".
  Do not claim a slide works without having looked at it.
---

# Verifying slides

Two helper scripts live next to this file. They use the deck's own `puppeteer`
(a dependency of fslides), so run them **from the deck directory** with
`fslides serve` running.

```bash
S=<this skill dir>/scripts
node $S/strip.js intro.html pricing.html         # screenshots at density 1..5, one strip per slide
node $S/words.js                                 # visible words per slide at density 3
node $S/words.js --density 5 --over 100          # list slides above a budget
```

`strip.js` writes `/tmp/fslides-verify/<slide>-strip.png` (override with `--out DIR`).
Read the PNG to look at it. It uses the port from `fslides.config.js`, or `--url http://localhost:3000`.
If Chrome is not found, set `PUPPETEER_EXECUTABLE_PATH`.

## What to look for

- **Overlap and clipping:** text over text, text running off the 1280×720 canvas, a label
  hidden behind the player controls (bottom right).
- **Empty states:** a level that looks half-built. Density 1 and 2 need re-layout, not
  just hidden text.
- **Orphans:** one word alone on a title line. Balance the title (`text-wrap: balance`)
  or widen its box.
- **Floating labels:** labels left behind when a visual was removed.
- **Words:** about 60 to 90 at level 3. Over 100 usually means detail that belongs at 4 or 5.
- **Console errors:** the script prints page errors for every slide.

## For interactive slides

Operate them: click the control, wait for the result, screenshot the idle, running and
finished states. Test the failure path too (turn the helper off) and confirm the fallback
is clearly labelled.

## Report

State what you looked at and what you found, not "should work". Include words before and
after if you changed a slide.
