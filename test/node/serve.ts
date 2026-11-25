import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { describe } from '../../src/permissions/describe/index.ts';
import { fileServer } from '../../src/papp/session/serve/index.ts';
import { declaredPermissions } from '../../src/permissions/tags/index.ts';

const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-serve-')));
const papp = path.join(dir, 'papp.papp');
const clip = path.join(dir, 'clip.mp4');
const approved = '<!doctype html><title>approved</title>';
fs.writeFileSync(papp, approved);
fs.writeFileSync(clip, Buffer.from(Array.from({ length: 100 }, (_, i) => i)));
test.after(() => fs.rmSync(dir, { recursive: true }));

const pappHash = createHash('sha256').update(approved).digest('hex');
const dependencies = new Set<string>();
const script = path.join(dir, 'app.js');
const style = path.join(dir, 'app.css');
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');
fs.writeFileSync(style, 'body { color: red }');
// The yes already covers the style, as the user approved it. The script loads for the first time.
const kept: Record<string, string> = {};
let reloads = 0;
const serve = fileServer(
  papp,
  { pappHash, code: { [style]: hashOf('body { color: red }') } },
  [],
  () => false,
  file => {
    dependencies.add(file);
  },
  (file, hash) => {
    kept[file] = hash;
  },
  async () => new Response('from Chromium'),
  () => {
    reloads++;
  },
  () => undefined
);
const get = (file: string, range?: string) => serve(new Request(pathToFileURL(file), { headers: range ? { range } : {} }));

test('the approved .papp file is served as HTML', async () => {
  const response = await get(papp);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), approved);
});

test('a .papp file changed since approval is refused', async () => {
  fs.writeFileSync(papp, 'swapped');
  const response = await get(papp);
  fs.writeFileSync(papp, approved);
  assert.equal(response.status, 409);
});

test('a .papp file opened without a popup reloads after an edit, until a tag asks', async () => {
  const id = '<meta name="papp-id" content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77">';
  const quiet = path.join(dir, 'quiet.papp');
  const serveQuiet = fileServer(
    quiet,
    null,
    [],
    () => false,
    () => undefined,
    () => undefined,
    async () => new Response('from Chromium'),
    () => undefined,
    () => undefined
  );

  const status = async (html: string) => {
    fs.writeFileSync(quiet, html);

    return (await serveQuiet(new Request(pathToFileURL(quiet)))).status;
  };

  assert.equal(await status(`<!doctype html>${id}<meta name="papp-window" size="900x600"><title>edited</title>`), 200);
  assert.equal(await status(`<!doctype html>${id}<meta name="papp-net" content="example.com"><title>edited</title>`), 409);
  assert.equal(await status(`<!doctype html>${id}<meta name="papp-telepathy" content="x"><title>edited</title>`), 409);
});

test('a .papp file whose changes the user trusts reloads after an edit, until its tags ask for something else', async () => {
  const withSite = (site: string, title: string) =>
    `<!doctype html><meta name="papp-id" content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77"><meta name="papp-net" content="${site}"><title>${title}</title>`;
  const trusted = path.join(dir, 'trusted.papp');
  const serveTrusted = fileServer(
    trusted,
    null,
    describe(declaredPermissions(trusted, withSite('example.com', 'opened'), [])),
    () => false,
    () => undefined,
    () => undefined,
    async () => new Response('from Chromium'),
    () => undefined,
    () => undefined
  );

  fs.writeFileSync(path.join(dir, 'trusted.js'), 'first');
  assert.equal((await serveTrusted(new Request(pathToFileURL(path.join(dir, 'trusted.js'))))).status, 200);
  fs.writeFileSync(path.join(dir, 'trusted.js'), 'edited');
  assert.equal(await (await serveTrusted(new Request(pathToFileURL(path.join(dir, 'trusted.js'))))).text(), 'edited');

  const status = async (html: string) => {
    fs.writeFileSync(trusted, html);

    return (await serveTrusted(new Request(pathToFileURL(trusted)))).status;
  };

  assert.equal(await status(withSite('example.com', 'edited')), 200);
  assert.equal(await status(withSite('example.org', 'edited')), 409);
});

// After every test that loads its .papp file: from here on that answers with the notice.
test('a script or style changed since approval is refused, and then the .papp file is too', async () => {
  fs.writeFileSync(script, 'first()');
  const first = await get(script);
  assert.equal(first.headers.get('content-type'), 'text/javascript');
  assert.equal(await first.text(), 'first()');
  assert.equal(kept[script], hashOf('first()'));
  assert.equal((await get(script)).status, 200);
  assert.equal((await get(style)).status, 200);
  assert.equal((await get(papp)).status, 200);
  assert.equal(reloads, 0);

  fs.writeFileSync(script, 'swapped()');
  assert.equal((await get(script)).status, 409);
  assert.equal(reloads, 1);
  assert.equal(kept[script], hashOf('first()'));
  assert.equal((await get(papp)).status, 409);

  fs.writeFileSync(style, 'body { color: blue }');
  assert.equal((await get(style)).status, 409);
});

test('any local file is served: every .papp file reads the local disks', async () => {
  fs.writeFileSync(path.join(dir, 'any.txt'), 'yes');
  assert.equal(await (await get(path.join(dir, 'any.txt'))).text(), 'from Chromium');
});

test('a range is streamed as 206', async () => {
  const response = await get(clip, 'bytes=10-19');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 10-19/100');
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    Array.from({ length: 10 }, (_, i) => i + 10)
  );
  assert.equal((await get(clip, 'bytes=90-')).headers.get('content-range'), 'bytes 90-99/100');
});

test('no range, or one media never asks for, goes to Chromium', async () => {
  for (const range of [undefined, 'bytes=100-', 'bytes=5-3', 'bytes=-10', 'bytes=0-1,5-6']) {
    assert.equal(await (await get(clip, range)).text(), 'from Chromium', range);
  }
});

test('a missing file is a 404, not a failed load', async () => {
  assert.equal((await get(path.join(dir, 'missing.txt'))).status, 404);
  assert.equal((await get(path.join(dir, 'missing', 'below.txt'))).status, 404);
  assert.ok(dependencies.has(path.join(dir, 'missing.txt')));
  assert.ok(dependencies.has(path.join(dir, 'missing', 'below.txt')));
});
