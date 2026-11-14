import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { test } from 'node:test';
import { byteStreams, type StreamLine } from '../../src/shared/wire/streams/index.ts';

// Two sides, each handed the other's lines a turn later, as a pipe does. sent: every line, by its sender.
function pair() {
  const sent: { from: 'a' | 'b'; line: StreamLine }[] = [];
  const a: ReturnType<typeof byteStreams> = byteStreams(line => (sent.push({ from: 'a', line }), setImmediate(() => b.handle(JSON.parse(JSON.stringify(line))))));
  const b: ReturnType<typeof byteStreams> = byteStreams(line => (sent.push({ from: 'b', line }), setImmediate(() => a.handle(JSON.parse(JSON.stringify(line))))));

  return { a, b, sent };
}

const turns = async (count: number) => {
  for (let turn = 0; turn < count; turn++) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sentBytes = (sent: { line: StreamLine }[]) => sent.reduce((sum, { line }) => sum + ('data' in line ? Buffer.from(line.data, 'base64').length : 0), 0);

test('bytes arrive whole, and no line is large', async () => {
  const { a, b, sent } = pair();
  const bytes = randomBytes(5_000_000);
  const got = await buffer(b.receive(a.send(Readable.from(bytes, { objectMode: false }))));
  assert.equal(hash(got), hash(bytes));
  assert.ok(sent.every(({ line }) => JSON.stringify(line).length < 70_000));
});

test('nothing is sent before the receiver asks, not even the end of an empty stream', async () => {
  const { a, b, sent } = pair();
  const id = a.send(Readable.from(Buffer.alloc(0), { objectMode: false }));
  await turns(5);
  assert.deepEqual(sent, []);
  assert.equal((await buffer(b.receive(id))).length, 0);
});

test('a receiver that does not read stops the sender at one window', async () => {
  const { a, b, sent } = pair();
  const sink = b.receive(a.send(Readable.from(Buffer.alloc(8_000_000), { objectMode: false })));
  sink.read(0);
  await turns(200);
  assert.equal(sentBytes(sent), 1024 * 1024);
  assert.equal((await buffer(sink)).length, 8_000_000);
});

test('one slow stream does not hold another', async () => {
  const { a, b } = pair();
  const slow = b.receive(a.send(Readable.from(Buffer.alloc(4_000_000), { objectMode: false })));
  slow.read(0);
  assert.equal((await buffer(b.receive(a.send(Readable.from(Buffer.alloc(4_000_000, 1), { objectMode: false }))))).length, 4_000_000);
  slow.destroy();
});

test('a source that fails fails the receiver', async () => {
  const { a, b } = pair();
  const source = new PassThrough();
  const sink = b.receive(a.send(source));
  source.write('partial');
  setImmediate(() => source.destroy(new Error('disk gone')));
  await assert.rejects(buffer(sink), { message: 'disk gone' });
});

test('a receiver that gives up stops the source', async () => {
  const { a, b } = pair();
  const source = new PassThrough();
  const sink = b.receive(a.send(source));
  sink.destroy();
  await once(source, 'close');
  assert.ok(source.destroyed);
});

test('asking for a stream already given up fails, and does not wait', async () => {
  const { a, b } = pair();
  const source = new PassThrough();
  const id = a.send(source);
  source.destroy();
  await turns(3);
  await assert.rejects(buffer(b.receive(id)), { message: 'closed' });
});

test('with the other side gone, every stream closes and no line is sent', async () => {
  const { a, sent } = pair();
  const source = new PassThrough();
  a.send(source);
  const sink = a.receive('theirs');
  sink.on('error', () => undefined);
  await turns(3);
  const before = sent.length;
  a.closeAll();
  await turns(3);
  assert.ok(source.destroyed && sink.destroyed);
  assert.equal(sent.length, before);
});
