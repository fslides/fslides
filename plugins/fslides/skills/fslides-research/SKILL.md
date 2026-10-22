---
name: fslides-research
description: >-
  Research a topic with Exa before writing fslides slides, so every number on a slide
  has a source. Use when the user asks for a deck "about" a topic, market, company or
  trend, wants stats, "latest numbers", "back this up", "find sources", or when you are
  about to write a figure you did not get from the user. Runs `fslides research`, reads
  the brief in research/, and cites claims with data-cite ids from sources.json.
---

# Researching a deck with Exa

Exa produces **cited facts**. You still write the slides. Never put a number on a
slide that is not from the user or from `research/` with a source id.

## Run it

Needs the user's own key, locally (`export EXA_API_KEY=...`). Without one, add
`--dry-run` to show the calls and the estimated cost.

```bash
fslides research "AI agent adoption in the enterprise 2026"            # deep search, ~$0.012
fslides research "Exa AI funding" --depth fast --num 8                  # one quick search
fslides research "agentic commerce" --domains gartner.com,forrester.com --since 2025-06-01
```

- Output: `research/<slug>.md` (summary, key facts with figures, angles, sources with
  highlights) and new entries in `sources.json` (`s1`, `s2`, …, deduped by URL).
- Results are cached in `.fslides/cache/`, so re-running costs nothing.
  `--no-cache` forces a new call.

## Turn the brief into slides

1. Read `research/<slug>.md`. Pick 1 figure per slide. Prefer primary sources
   (the research firm, the filing) over articles quoting them.
2. Cite on the element that carries the claim:

   ```html
   <div class="stat" data-cite="s3">40%</div>
   <p data-cite="s3 s7">of enterprise apps will embed agents by 2026</p>
   ```

   The player adds a small superscript marker with a hover card (title, publisher,
   date, the exact passage), lists the sources in the Sources panel (key `S`), and at
   density 5 prints footnotes at the bottom of the slide. `data-cite-marker="off"`
   hides one marker (it stays in the footnotes). `<html data-footnotes="off">` hides
   a slide's footnotes.
3. Keep the figure exactly as the source states it ("40%", not "almost half"), or
   `fslides verify` will flag it as changed.
4. Run `fslides verify` (see the `fslides-sources` skill) before calling the deck done.

## Do not

- Do not ask Exa for slide copy or layout. Use it for facts, then design the slide.
- Do not cite a source for a number it does not contain.
- Do not hand-edit ids in `sources.json` that slides already reference.
