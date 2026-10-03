---
name: fslides-live-demo
description: >-
  Build an interactive "live demo" slide inside an fslides deck: a slide that calls a real
  API or service while presenting, with an idle state, a progress state, a result, and a
  clearly labelled fallback if the network or service fails. Use when the user wants to
  demo a product, an agent, a search, or any live call from a slide, or asks how to
  handle a slow demo on stage.
---

# Live demo slides

A slide is static HTML, so a live demo is a slide whose script talks to something. The
rules below keep it safe and presentable.

## Structure

1. **Idle state.** The slide must read well before anything is clicked: the question or
   input, an empty result area shaped like the final result, one clear button. Never
   auto-run on load.
2. **Running state.** Show progress in the place where the result will land: a bar with
   an honest label, skeleton rows shaped like the final table, and, if the service
   exposes it, a live activity feed (what it is searching, reading, calling).
3. **Done state.** The result, plus a one-line footer: how many items, how long, whether
   it was live or a sample, and the cost if known.
4. **Fallback state.** If the call fails or the helper is not running, show a **real
   earlier result labelled "Sample"**. Never fake a live result, never show a blank slide.
   A small badge near the title says `Live` or `Sample answers`.

## Keys and servers (do not leak secrets)

- Never put an API key in a slide, the config, notes or an export. Slides are HTML that
  gets published.
- Run a tiny **local helper** (a Node script on `127.0.0.1`, started with an npm script)
  that holds the key from an environment variable or an untracked `.env`, accepts only
  local origins, validates inputs (length, allowed characters), and exposes narrow
  routes (`/health`, `/search`, ...). The slide calls the helper, never the vendor.
- Add `.env` to `.gitignore`. Never print or read the key in logs or in the conversation.
- `fslides export` / `build` / `publish` ship slide files only; the helper is not part of
  a published deck, so a published demo slide **always shows its fallback**. Say so in the
  speaker notes.

## Slow calls (a minute is fine if you plan for it)

- If the call takes 20 to 60 s, the progress view is the show. If the API gives no
  percentage, **estimate from elapsed time and never pass about 95% until it finishes**,
  and say so in the notes.
- Tell the audience how long it takes before you press the button.
- Put a short script in the speaker notes for the wait (what it is doing, why it is slow,
  what the result will mean).
- Pre-run once before the meeting with the same inputs, so a good sample exists.

## Motion

The demo is allowed to move: messages arriving, a spinner, rows appearing are the
function. Keep the rest of the deck still (see `fslides-clean-deck`). If the deck freezes
animations globally, mark the demo slide so it is exempt.

## Testing

Use headless Chrome: click the button, wait for the result, screenshot idle, running and
done; then stop the helper and confirm the fallback appears and is labelled. The
`fslides-verify` skill covers the screenshots.
