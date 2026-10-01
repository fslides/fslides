'use strict';
// End-to-end: runs the real `fslides serve` in a temp deck and POSTs real saves.
// Run: node --test packages/core/test

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
let nextPort = 4300 + Math.floor(Math.random() * 500);

function makeDeck(configExtra, extraArgs = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fslides-hook-'));
  fs.mkdirSync(path.join(dir, 'slides'));
  for (const n of ['a', 'b']) fs.writeFileSync(path.join(dir, 'slides', `${n}.html`), `<html><body>${n} v0</body></html>`);
  // stub `open` so the server doesn't launch a browser
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'open'), '#!/bin/sh\n', { mode: 0o755 });
  const port = nextPort++;
  fs.writeFileSync(path.join(dir, 'fslides.config.js'),
    `module.exports = { name: 'hooktest', port: ${port}, slides: ['a.html','b.html'], ${configExtra} };`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'serve', ...extraArgs], {
      cwd: dir, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    });
    let out = '';
    child.stdout.on('data', d => { out += d; if (out.includes('localhost')) resolve({ dir, port, child }); });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
}

function save(port, file, content) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ file, content });
    const req = http.request({ port, path: '/api/save', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(body);
  });
}

async function waitFor(file, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fs.existsSync(file)) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('timed out waiting for ' + file);
}

const stop = d => { d.child.removeAllListeners('exit'); d.child.kill(); fs.rmSync(d.dir, { recursive: true, force: true }); };

test('onSaveCommand fires once for a burst, with before/after and env', async () => {
  const d = await makeDeck(`onSaveDebounceMs: 150, onSaveCommand: 'cat > payload.json; echo "$FSLIDES_CHANGED_FILES" > files.txt; cp "$FSLIDES_BEFORE_DIR/a.html" before-a.html; echo x >> runs.txt'`);
  try {
    assert.equal(await save(d.port, 'a.html', '<html><body>a v1</body></html>'), 200);
    assert.equal(await save(d.port, 'a.html', '<html><body>a v2</body></html>'), 200);
    assert.equal(await save(d.port, 'b.html', '<html><body>b v1</body></html>'), 200);
    await waitFor(path.join(d.dir, 'runs.txt'));
    await new Promise(r => setTimeout(r, 400));   // would catch a second run
    assert.equal(fs.readFileSync(path.join(d.dir, 'runs.txt'), 'utf8'), 'x\n');
    const p = JSON.parse(fs.readFileSync(path.join(d.dir, 'payload.json'), 'utf8'));
    assert.equal(p.deck, 'hooktest');
    assert.deepEqual(p.changes.map(c => c.file).sort(), ['a.html', 'b.html']);
    const a = p.changes.find(c => c.file === 'a.html');
    assert.equal(a.before, '<html><body>a v0</body></html>');   // first save's "before"
    assert.equal(a.after, '<html><body>a v2</body></html>');    // last save's "after"
    assert.equal(fs.readFileSync(path.join(d.dir, 'files.txt'), 'utf8').trim().split('\n').sort().join(), 'a.html,b.html');
    assert.equal(fs.readFileSync(path.join(d.dir, 'before-a.html'), 'utf8'), a.before);
    assert.equal(fs.readFileSync(path.join(d.dir, 'slides', 'a.html'), 'utf8'), a.after);
  } finally { stop(d); }
});

test('no-op saves (content unchanged) do not fire the hook', async () => {
  const d = await makeDeck(`onSaveDebounceMs: 100, onSaveCommand: 'echo x >> runs.txt'`);
  try {
    await save(d.port, 'a.html', '<html><body>a v0</body></html>');
    await new Promise(r => setTimeout(r, 500));
    assert.ok(!fs.existsSync(path.join(d.dir, 'runs.txt')));
  } finally { stop(d); }
});

test('onSave function hook runs in-process; failing hook does not break saves', async () => {
  const d = await makeDeck(`onSaveDebounceMs: 100, onSave: async ({ changes }) => { require('fs').writeFileSync('fn.json', JSON.stringify(changes.map(c => c.file))); throw new Error('boom'); }`);
  try {
    assert.equal(await save(d.port, 'a.html', '<html>new</html>'), 200);
    await waitFor(path.join(d.dir, 'fn.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d.dir, 'fn.json'), 'utf8')), ['a.html']);
    assert.equal(await save(d.port, 'b.html', '<html>new</html>'), 200);   // server still healthy
  } finally { stop(d); }
});

test('--no-hooks disables the hook', async () => {
  const d = await makeDeck(`onSaveDebounceMs: 100, onSaveCommand: 'echo x >> runs.txt'`, ['--no-hooks']);
  try {
    await save(d.port, 'a.html', '<html>new</html>');
    await new Promise(r => setTimeout(r, 500));
    assert.ok(!fs.existsSync(path.join(d.dir, 'runs.txt')));
  } finally { stop(d); }
});

test('no hook configured: saves work as before', async () => {
  const d = await makeDeck('');
  try {
    assert.equal(await save(d.port, 'a.html', '<html>plain</html>'), 200);
    assert.equal(fs.readFileSync(path.join(d.dir, 'slides', 'a.html'), 'utf8'), '<html>plain</html>');
  } finally { stop(d); }
});
