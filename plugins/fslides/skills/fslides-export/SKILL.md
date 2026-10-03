---
name: fslides-export
description: >-
  Export an fslides deck to another format: editable Google Slides (real text boxes and
  shapes, not screenshots), editable PowerPoint, PDF, a single self-contained HTML file,
  GIF, or a deployable static folder. Use whenever the user wants to hand a deck to
  someone who works in Google Slides or PowerPoint, wants a PDF or one HTML file to
  share, or asks "export", "convert", or "put this in Google Slides".
---

# Exporting an fslides deck

Run these from the deck directory (where `fslides.config.js` lives).

| Goal | Command |
|---|---|
| Editable Google Slides in your Drive | `fslides gslides` |
| Editable `.pptx` only (no upload) | `fslides gslides --no-upload` or `fslides pptx --editable` |
| Screenshot-per-slide `.pptx` (legacy) | `fslides pptx` |
| PDF | `fslides pdf` (`--density N` for one level everywhere) |
| One self-contained HTML file | `fslides export [out.html]` |
| Deployable static folder | `fslides build [dir]` |

## Editable export (Google Slides and PowerPoint)

Each slide is loaded in headless Chrome at 1280×720, animations are run to their end,
and every painted element is rebuilt as a native object:

- text becomes text boxes with real fonts, weights, sizes, colors and links
- backgrounds, borders and rounded corners become shapes and lines
- `svg`, `canvas`, `img`, `video`, gradients become transparent pictures
- `notes.json` becomes speaker notes
- disabled slides are skipped; each slide uses its saved density (or `--density N`)

### Upload (Google Slides)

- One-time: `gcloud auth login --enable-gdrive-access`, or set `GOOGLE_OAUTH_TOKEN`.
- The deck lands in the user's Drive, **private until they share it**. Do not upload a
  confidential deck without asking first.
- Without credentials the command prints how to import the `.pptx` by hand.
- If bundled Chrome is unavailable, set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome.

### Make slides convert cleanly

- Put words in HTML, not inside `<svg><text>` or canvas: HTML text stays editable,
  svg text becomes part of a picture.
- Entrance animations should settle within about 3 s; for slower slides set
  `pdfOverrides: { 'slide.html': { wait: 2000 } }` in the config.
- Looping animations are captured at whatever moment the export lands on.
- Google Slides has no letter spacing: negative tracking is compensated by shrinking the
  run slightly, positive tracking is dropped. `pptx --editable` keeps it.
- Interactive demos export as their idle state.
- Always compare: open the result and look at it next to the original before sending.

## Picking the density

If the config has `density`, every slide exports at its own saved level. To export an
exec version, run with `--density 2`; for a full read, `--density 5`.
