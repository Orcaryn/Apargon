import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { test } from 'node:test';
import type { IncomingRequest } from '../../src/shared/protocol.ts';
import { pageListeners } from '../../src/trampoline/requests/listen.ts';

test('unlisten acknowledges closure and the port can immediately be reused', { timeout: 5000 }, async t => {
  const listeners = pageListeners(
    { listen: 'localhost' },
    () => {},
    () => 'unread'
  );
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
  const listeners = pageListeners(
    { listen: 'localhost' },
    () => {},
    () => 'unread'
  );
  const rejected = assert.rejects(listeners.listen('opening', null), /closed|aborted/i);
  await listeners.closeAll();
  await rejected;
  await assert.rejects(listeners.listen('late', null), /closed/);
});

test('a duplicate id cannot overwrite a listener and leak its port', { timeout: 5000 }, async t => {
  const listeners = pageListeners(
    { listen: 'localhost' },
    () => {},
    () => 'unread'
  );
  t.after(() => listeners.closeAll());
  await listeners.listen('same', null);
  await assert.rejects(listeners.listen('same', null), /new, nonempty id/);
});

test("a request's body goes to the .papp file as a stream, and its answer comes back as one", { timeout: 5000 }, async t => {
  const bodies = new Map<string, Readable>();
  const asked: IncomingRequest[] = [];
  const listeners = pageListeners(
    { listen: 'localhost' },
    request => asked.push(request),
    source => (bodies.set('sent', source), 'sent')
  );
  t.after(() => listeners.closeAll());
  const url = await listeners.listen('echo', null);
  const answered = fetch(url, { method: 'POST', body: 'x'.repeat(100_000) });

  while (!asked.length) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  assert.equal(asked[0].body, 'sent');
  assert.equal((await buffer(bodies.get('sent')!)).length, 100_000);
  listeners.respond(asked[0].id, 201, { 'content-type': 'text/plain' }, Readable.from(Buffer.alloc(3_000_000, 'y'), { objectMode: false }));
  const answer = await answered;
  assert.equal(answer.status, 201);
  assert.equal((await answer.arrayBuffer()).byteLength, 3_000_000);
});

test('an answer to a request that is gone gives its stream up', { timeout: 5000 }, async t => {
  const listeners = pageListeners(
    { listen: 'localhost' },
    () => {},
    () => 'unread'
  );
  t.after(() => listeners.closeAll());
  const body = new PassThrough();
  listeners.respond('gone', 200, {}, body);
  assert.ok(body.destroyed);
});

test('past 32 requests waiting for an answer, the next gets 503', { timeout: 5000 }, async t => {
  const asked: IncomingRequest[] = [];
  const listeners = pageListeners(
    { listen: 'localhost' },
    request => asked.push(request),
    () => 'unread'
  );
  t.after(() => listeners.closeAll());
  const url = await listeners.listen('busy', null);
  const agent = new http.Agent({ maxSockets: 64 });
  t.after(() => agent.destroy());
  const status = () => new Promise<number>(resolve => http.get(url, { agent }, response => (response.resume(), resolve(response.statusCode!))));
  const held = Array.from({ length: 32 }, status);

  while (asked.length < 32) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  assert.equal(await status(), 503);
  asked.forEach(({ id }) => listeners.respond(id, 200, {}, Readable.from(Buffer.from('ok'), { objectMode: false })));
  assert.deepEqual(new Set(await Promise.all(held)), new Set([200]));
});
