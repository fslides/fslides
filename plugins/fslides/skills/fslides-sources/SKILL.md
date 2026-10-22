---
name: fslides-sources
description: >-
  Cite, check and maintain the sources behind an fslides deck: data-cite markup,
  sources.json, and the Exa-backed `fslides verify` and `fslides fresh` commands. Use
  when the user asks to "add sources", "cite this", "fact-check the deck", "are these
  numbers still right", "update the stats", before presenting or publishing a deck with
  figures, or in CI. Also covers live Q&A answers and backup slides during a talk.
---

# Sources and citations in fslides

## The model

- `sources.json` at the deck root: `{ "s1": { url, title, publisher, published, quote } }`.
  Ids are stable once a slide references them. `fslides research` and `verify --add`
  append entries (deduped by URL). You may add entries by hand. Never invent a URL or a
  quote: use pages you or Exa actually read.
- `data-cite="s1"` (several: `"s1 s4"`) on the element that carries the claim. Put it on
  the element that contains the number, so verify checks that number.
- The runtime renders the marker, the hover card, the Sources panel (key `S`) and
  footnotes at density 5. Do not hand-write footnotes.
  - `data-cite-marker="off"` hides one marker, e.g. the second bar of a chart citing
    the same source.
  - `<html data-footnotes="off">` hides a slide's footnotes.

## Verify before presenting

Uses the user's `EXA_API_KEY`, locally. `--dry-run` shows the calls and cost.

```bash
fslides verify                        # whole deck
fslides verify --slide 03-agents-arrived
fslides verify --add                  # put pages that support uncited numbers in sources.json
fslides verify --ci                   # exit 1 on broken / changed / unconfirmed (add --strict for stale)
```

| Status | Meaning | Fix |
|---|---|---|
| ok | the page still states the number | nothing |
| changed | a number in the claim is no longer on the cited page | update the slide to the page's figure, or cite the right page |
| broken | the page cannot be fetched | find the new URL (`fslides research`), update `sources.json` |
| stale | the source is older than 18 months (`--stale-days`) | look for a newer figure: `fslides fresh` |
| uncited, supported | Exa found a page that states it | `--add`, then add `data-cite` with the new id |
| uncited, not confirmed | Exa could not confirm it | ask the user where it comes from, or cut it |

Read `research/verify.md`. Fix the slides, then run verify again until it is clean.
Numbers that are the user's own (their pricing, their metrics) cannot be confirmed by
the web: say so instead of deleting them.

Fact-checking (`fslides verify`) is not rendering checks (the `fslides-verify` skill).
Do both before you call a deck done.

## Keep it fresh

```bash
fslides fresh                                   # pages published since the last check
fslides fresh --since 2026-06-01
fslides fresh --monitors --webhook https://…    # daily Exa Monitors (public HTTPS webhook required)
fslides fresh --monitors                        # later: pull what the monitors found
```

`research/fresh.md` lists new pages per claim. `fslides serve` shows a banner and
"new" badges on the affected thumbnails. Update the figure only when the new source is
better (primary, more recent), then run `fslides verify`.

## During a talk

With the key set where `fslides serve` runs:
- Press `A` in the player, or use the presenter view's Ask box, to answer a question
  from the room with citations. The browser never sees the key.
- "+ Backup slide" adds `slides/qa-N.html` after the current slide, skipped, with
  its sources in `sources.json`. Enable it in the overview to show it.
- Questions are logged to `research/qa.md`. Use them for the follow-up email.
