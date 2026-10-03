---
name: fslides-clean-deck
description: >-
  Review and tighten an fslides deck so it reads as written by a person, not generated:
  crisp one-sentence titles, fewer words per slide, no decorative motion, a visual that
  carries information. Use when the user says a deck feels like "AI slop", too wordy,
  too busy, too animated, too many boxes and lines, "make the titles crisper", "simplify
  this", or before sending a deck to leadership or an interview panel.
---

# Cleaning up a deck

The goal: attention goes to the message. A reader should get each slide from its title
alone, and nothing on the slide should compete with the point.

## 1. Titles first (where attention is highest)

A good title is **one plain sentence, ideally 8 words or fewer, with a specific claim in
the author's own voice**. Rewrite titles that show these patterns:

- **"Label. Tagline."** Two sentences where the first only names the slide
  ("The field organization. Specialized where it creates leverage.") → one claim.
- **"X, not Y"** contrasts and matched pairs ("forecastable, not surprising",
  "different tools for different jobs") → say the point directly.
- **Abstract nouns** ("growth system", "intervention system", "operating process") →
  the concrete thing and what it does.
- **Filler openers** ("Why X matters", "The importance of X").

Keep the author's own best lines even when they are blunt. Ask before rewriting a title
whose claim you are changing, not just shortening. Do not invent claims or numbers.

## 2. Words per slide

- Measure visible words at the default density (`fslides-verify` has `words.js`).
  Target about 60 to 90 at level 3; the title plus the visual plus short labels.
- Bullets of about 7 words or fewer. One short sub-line at most.
- Cut filler, hedges, repetition and buzzwords ("unlock", "leverage", "seamless",
  "robust"). No em-dash pileups.
- **Move detail up, do not delete it.** Push it to `data-d="4"` / `"5"` (see
  `fslides-density`), so the full version is one tap away.
- A word-count drop alone is not the goal. Re-balance the layout so level 3 looks
  airy, not emptied.

## 3. Motion

Ask of each animation: does the movement itself explain something?

- If **yes** (a flow into a store, a curve drawing, a build that reveals an order): keep
  it, one per slide at most.
- If it is **decoration** (looping particles, pulsing dots, counters counting up,
  staggered reveals, typing effects, orbiting labels): remove it and show the final state.
- A frozen animation is worse than none. Either it moves for a reason, or the slide is
  designed as a still: a table, a flow of boxes, a small chart, big numbers.
- Interactive demos keep their motion: it is the function.

## 4. Visuals that carry information

Replace decoration with structure: a table, a stepped flow of 3 to 5 boxes, a timeline,
a thin-line chart, a row of big numbers. Thin 1px lines, two or three colors. If a slide
has many boxes, lines and chips competing, remove the borders and colored bars first:
type size and one rule carry hierarchy better than boxes.

## 5. Order and pruning

- Group slides into a few parts that follow how the audience thinks (for example the
  team's lifecycle, then the customer's lifecycle, then proof). Renumber the eyebrows
  and footers after moving slides.
- Disable (do not delete) slides the author does not need: add them to `disabled` in the
  config so they remain as backups.
- Put the strongest concrete example early, not at the end.
- Every claim with a number should be checked against the source the user gave you.

## 6. Verify

After each pass, run the `fslides-verify` skill: screenshots at all five densities, word
counts, no overlaps. Report words before and after for each slide, and list every line
you rewrote so the author can confirm it sounds like them.
