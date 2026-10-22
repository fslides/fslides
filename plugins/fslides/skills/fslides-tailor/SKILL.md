---
name: fslides-tailor
description: >-
  Tailor one fslides deck to a specific audience (a prospect, a customer, an
  investor) with Exa: a researched audience brief plus per-company values for marked
  text. Use when the user says "tailor this for <company>", "personalize the deck",
  "make a version for <prospect>", "what should I know about <company> before the
  meeting", or wants their logo, industry or use case on the slides.
---

# Tailoring a deck to an audience

The deck stays the same. Only marked text changes per audience, and the values live in
`tailor.json` next to the deck.

## 1. Mark what changes

```html
<h1>Search built for <span data-fill="company">your agents</span></h1>
<p>Start with <span data-fill="useCase">agentic search</span></p>
```

The element's own text is the fallback when no value is set. Describe non-obvious keys
in `fslides.config.js` so Exa knows what to look up:

```js
tailor: {
  useCase: 'the Exa use case most relevant to their product',
  stack:   'their likely search or retrieval stack today',
},
```

`company` and `domain` are filled from the command line. Up to 10 other keys per call.

## 2. Run it

```bash
fslides tailor --company "monday.com" --domain monday.com
fslides tailor --company "Acme" --dry-run       # calls and cost, no key needed
```

- `research/audience.md`: who they are, news from the last 90 days (as source ids
  in `sources.json`, citable with `data-cite`), the values filled.
- `tailor.json`: `{ "company": "monday.com", "useCase": "…", "_audience": {…} }`.
  Edit it by hand freely. Re-running overwrites only the keys it fills.

`fslides serve` shows the filled deck right away. `fslides export`, `build` and `pdf`
bake the values in, so a tailored export works offline. Hosted decks read the
committed `tailor.json`.

## 3. Check it

- Read every filled value at slide size. Shorten anything that wraps badly.
- Open on the most recent news item from `research/audience.md`, and cite it.
- One audience at a time: commit `tailor.json` per branch, or keep it out of git for
  private prospects.
- Run `fslides verify` if you added cited claims about the audience.
