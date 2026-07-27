---
name: fslides-monorepo
description: >-
  Initialise or update a `.fslides` manifest for a repo that contains multiple
  decks in subdirectories. Run this in any repo where fslides.config.js files
  live under subdirectories — it scans, shows what it found, writes the
  manifest, and explains the resulting deck URLs. Use it when a user says they
  have multiple decks in one repo, asks how to register them on fslides.dev, or
  wants their profile to show N cards instead of one.
---

# Setting up a `.fslides` monorepo manifest

fslides normally assumes one repo = one deck (config at the root).
For repos that contain **multiple decks in subdirectories** — or a single deck
buried inside a larger codebase — a `.fslides` manifest at the repo root tells
`decks.fslides.dev` where each deck lives. It surfaces N cards on the owner's
profile instead of one card for the whole repo, and gives each sub-deck its
own address.

## Workflow

### 1  Discover decks

Use `find` to locate every `fslides.config.js` in the repo (also catch the
legacy name):

```bash
find . \( -name "fslides.config.js" -o -name "fuckslides.config.js" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/vendor/*"
```

Collect the **directory** of each hit, strip the leading `./`. Separate them
into two buckets:

- **Root config** (`fslides.config.js` at `.`) — already detected automatically
  by `decks.fslides.dev`; do **not** add to the manifest.
- **Sub-deck configs** — everything else. These are the paths to register.

If no sub-directory configs are found, tell the user this skill only applies to
repos with decks in subdirectories and stop.

### 2  Show what was found

Before writing anything, print a clear summary:

```
Found 2 sub-deck(s):
  obs-preso/              (fslides.config.js present)
  talks/k8s-2024/         (fslides.config.js present)

Root config present: yes  ← keeps decks.fslides.dev/owner/repo/ unchanged
```

Ask for confirmation before proceeding if anything looks unexpected.

### 3  Check for an existing manifest

```bash
cat .fslides 2>/dev/null
```

If `.fslides` already exists:
- Show the current `decks` list.
- Identify any **new** paths (found in step 1 but absent from the manifest).
- Propose adding only the new ones (never silently remove existing entries).
- Ask the user to confirm before writing.

### 4  Write the manifest

Create or update `.fslides` at the repo root:

```json5
// .fslides — fslides monorepo manifest
// Each entry is the path (relative to repo root) of a sub-deck directory.
// decks.fslides.dev/<owner>/<repo>/<path>/ serves that deck.
// Root deck (fslides.config.js at repo root) needs no entry here.
{
  "decks": [
    "obs-preso",
    "talks/k8s-2024"
  ]
}
```

Format rules:
- Paths relative to repo root, no leading or trailing slash.
- Order sets the profile card order — put the primary deck first.
- Root deck must not appear here; it is detected automatically.
- Nested paths like `talks/k8s-2024` are fine — use the full relative path.

### 5  Verify

For each path in the manifest, confirm `<path>/fslides.config.js` (or the
legacy name) is readable. Report any path that fails the check. Do not write
the manifest if a path fails.

### 6  Commit

Ask the user whether to commit the manifest. If yes:

```bash
git add .fslides
git commit -m "chore: add .fslides monorepo manifest"
```

---

## Resulting URLs

Once `.fslides` is pushed, the worker reads it on every request (cached 60 s):

| URL | What it serves |
|---|---|
| `decks.fslides.dev/<owner>/<repo>/` | Root deck (if root config exists); otherwise redirects to the first listed sub-deck |
| `decks.fslides.dev/<owner>/<repo>/<path>/` | Sub-deck at `<path>/` |
| `fslides.dev/<owner>` | N profile cards — one per manifest entry |

Profile cards show each sub-deck's `config.title` and thumbnail. Stars, forks,
and comment counts come from the parent repo.

---

## Edge cases

| Situation | Handling |
|---|---|
| Root config + sub-decks | Root keeps `…/owner/repo/`; sub-decks get their own paths. Do not list root in the manifest. |
| Deck already registered | Detect and skip — never duplicate entries. |
| Nested paths (`talks/k8s-2024`) | Fully supported. Use the full relative path as the entry. |
| Private repo | Deck privacy follows the GitHub repo ACL; the manifest changes nothing. |
| No sub-deck configs found | Tell the user and stop — this skill is not needed for single-deck repos. |
| Manifest already exists, nothing new | Tell the user all decks are already registered. |
