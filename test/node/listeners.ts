import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { test } from 'node:test';
import { pageListeners } from '../../src/trampoline/requests/listen.ts';

test('unlisten acknowledges closure and the port can immediately be reused', { timeout: 5000 }, async t => {
  const listeners = pageListeners({ listen: 'localhost' }, () => {});
  const control = http.createServer();
  t.after(async () => {
    control.close();
    await listeners.closeAll();
  });
  const url = new URL(await listeners.listen('first', null));
  await Promise.all([listeners.unlisten('first'), listeners.unlisten('first')]);
  control.listen(Number(url.port), '127.0.0.1');
  await once(control, 'listening');
  assert.ok(control.listening);
});

test('shutdown cancels an opening listener and refuses a late start', { timeout: 5000 }, async () => {
  const listeners = pageListeners({ listen: 'localhost' }, () => {});
  const rejected = assert.rejects(listeners.listen('opening', null), /closed|aborted/i);
  await listeners.closeAll();
  await rejected;
  await assert.rejects(listeners.listen('late', null), /closed/);
});

test('a duplicate id cannot overwrite a listener and leak its port', { timeout: 5000 }, async t => {
  const listeners = pageListeners({ listen: 'localhost' }, () => {});
  t.after(() => listeners.closeAll());
  await listeners.listen('same', null);
  await assert.rejects(listeners.listen('same', null), /new, nonempty id/);
});
