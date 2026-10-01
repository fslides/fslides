'use strict';

// Post-save hooks for `fslides serve`.
//
// Config (fslides.config.js):
//   onSave:        async ({ deck, deckDir, slidesDir, changes }) => {}   in-process
//   onSaveCommand: 'python tools/on_save.py'                             shell command
//   onSaveDebounceMs: 500                                                quiet period before firing
//
// Saves are coalesced: a burst of saves (the editor autosaves) fires the hook
// once with every slide that changed. Hooks never block or fail the save; errors
// are logged. Runs are serialised, so a slow hook never overlaps itself.
//
// `changes` is [{ file, path, before, after }]. `before` is the content from
// before the FIRST save in the burst, `after` the content after the LAST.
// Slides whose content ends up identical are dropped.
//
// For onSaveCommand the payload is JSON on stdin and also in the environment:
//   FSLIDES_DECK, FSLIDES_DECK_DIR, FSLIDES_SLIDES_DIR,
//   FSLIDES_CHANGED_FILES (newline-separated slide names),
//   FSLIDES_BEFORE_DIR    (temp dir holding each changed slide's pre-save copy).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const NOOP = { enabled: false, record() {}, flush: async () => {} };

module.exports = function createSaveHooks(config, { cwd, slidesDir, disabled = false, log = console }) {
  const fn  = typeof config.onSave === 'function' ? config.onSave : null;
  const cmd = typeof config.onSaveCommand === 'string' && config.onSaveCommand.trim() ? config.onSaveCommand : null;
  if (disabled || (!fn && !cmd)) return NOOP;

  const debounceMs = config.onSaveDebounceMs != null ? +config.onSaveDebounceMs : 500;
  const pending = new Map();   // file -> { before, after }
  let timer = null;
  let running = Promise.resolve();

  function record(file, before, after) {
    const prev = pending.get(file);
    pending.set(file, { before: prev ? prev.before : before, after });
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const changes = [];
    for (const [file, { before, after }] of pending) {
      if (before !== after) changes.push({ file, path: path.join(slidesDir, file), before, after });
    }
    pending.clear();
    if (!changes.length) return running;
    const payload = { deck: config.name || 'presentation', deckDir: cwd, slidesDir, changes };
    running = running.then(() => run(payload)).catch(e => log.error('onSave hook failed:', e.message));
    return running;
  }

  async function run(payload) {
    if (fn) await fn(payload);
    if (cmd) await runCommand(payload);
  }

  function runCommand(payload) {
    return new Promise((resolve, reject) => {
      const beforeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fslides-before-'));
      for (const c of payload.changes) fs.writeFileSync(path.join(beforeDir, c.file), c.before, 'utf8');
      const done = err => { fs.rmSync(beforeDir, { recursive: true, force: true }); err ? reject(err) : resolve(); };
      const child = spawn(cmd, {
        cwd,
        shell: true,
        stdio: ['pipe', 'inherit', 'inherit'],
        env: {
          ...process.env,
          FSLIDES_DECK: payload.deck,
          FSLIDES_DECK_DIR: cwd,
          FSLIDES_SLIDES_DIR: slidesDir,
          FSLIDES_CHANGED_FILES: payload.changes.map(c => c.file).join('\n'),
          FSLIDES_BEFORE_DIR: beforeDir,
        },
      });
      child.on('error', done);
      child.on('close', code => done(code === 0 ? null : new Error(`onSaveCommand exited ${code}`)));
      child.stdin.on('error', () => {});   // hook may not read stdin
      child.stdin.end(JSON.stringify(payload));
    });
  }

  return { enabled: true, record, flush };
};
