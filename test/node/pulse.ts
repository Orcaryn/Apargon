import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { test } from 'node:test';
import type { Use } from '../../src/permissions/tags/index.ts';
import { filterSound } from '../../src/trampoline/platform/linux/pulse/index.ts';

const u32 = (value: number) => {
  const bytes = Buffer.alloc(5);
  bytes.write('L');
  bytes.writeUInt32BE(value, 1);

  return bytes;
};

const text = (value: string) => Buffer.concat([Buffer.from('t'), Buffer.from(value), Buffer.alloc(1)]);
const properties = (list: Record<string, string>) =>
  Buffer.concat([
    Buffer.from('P'),
    ...Object.entries(list).flatMap(([key, value]) => [
      text(key),
      u32(value.length + 1),
      Buffer.from('x'),
      Buffer.from([0, 0, 0, value.length + 1]),
      Buffer.from(value),
      Buffer.alloc(1),
    ]),
    Buffer.from('N'),
  ]);
const sampleSpec = Buffer.from([0x61, 3, 2, 0, 0, 0xbb, 0x80]);
const channelMap = Buffer.from([0x6d, 2, 1, 2]);

function frame(channel: number, payload: Buffer) {
  const header = Buffer.alloc(20);
  header.writeUInt32BE(payload.length, 0);
  header.writeUInt32BE(channel, 4);

  return Buffer.concat([header, payload]);
}

const command = (number: number, ...fields: Buffer[]) => frame(0xffffffff, Buffer.concat([u32(number), u32(1), ...fields]));
const createStream = (number: number, device: string | null, list: Record<string, string> = {}) =>
  command(number, sampleSpec, channelMap, u32(0xffffffff), device === null ? Buffer.from('N') : text(device), u32(0), properties(list));

// What reaches the server, and whether the filter closed the connection.
async function send(use: Use[], chunks: Buffer[]) {
  const received: Buffer[] = [];
  const server = net.createServer(socket => socket.on('data', bytes => received.push(bytes)));
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const papp = filterSound(net.connect((server.address() as net.AddressInfo).port, '127.0.0.1'), use);
  const closed = new Promise(resolve => papp.on('close', resolve));
  // Read, as the mux does: the stream closes once both sides end.
  papp.resume();

  for (const chunk of chunks) {
    papp.write(chunk);
  }

  papp.end();
  await closed;
  server.close();

  return { received: Buffer.concat(received), refused: papp.errored !== null };
}

test('connecting and reading pass, split across writes', async () => {
  const auth = command(8, u32(35), Buffer.from('x'), Buffer.from([0, 0, 0, 2]), Buffer.from([1, 2]));
  const info = command(20);
  const both = Buffer.concat([auth, info]);
  const { received, refused } = await send([], [both.subarray(0, 7), both.subarray(7, 30), both.subarray(30)]);
  assert.equal(refused, false);
  assert.deepEqual(received, both);
});

test('loading a module closes the connection, under any tag', async () => {
  const { received, refused } = await send(['sound', 'microphone'], [command(51, text('module-tunnel-sink'), text('server=tcp:203.0.113.1'))]);
  assert.equal(refused, true);
  assert.equal(received.length, 0);
});

test('sound plays to the default device, and only with papp-use sound', async () => {
  assert.equal((await send(['sound'], [createStream(3, null, { 'application.name': 'Chromium', 'media.name': 'Playback' })])).refused, false);
  assert.equal((await send(['microphone'], [createStream(3, null)])).refused, true);
});

test('the microphone records from the default device, and only with papp-use microphone', async () => {
  assert.equal((await send(['microphone'], [createStream(5, null)])).refused, false);
  assert.equal((await send(['sound'], [createStream(5, null)])).refused, true);
});

test('a stream that names its device, or a target in its properties, closes', async () => {
  assert.equal((await send(['sound'], [createStream(3, 'raop_sink.speakers')])).refused, true);
  assert.equal((await send(['sound'], [createStream(3, null, { 'target.object': 'raop_sink.speakers' })])).refused, true);
  assert.equal((await send(['sound'], [command(81, u32(0), u32(0), properties({ 'node.target': '42' }))])).refused, true);
});

test('moving a stream or setting the default device closes', async () => {
  assert.equal((await send(['sound'], [command(67, u32(0), u32(0xffffffff), text('raop_sink.speakers'))])).refused, true);
  assert.equal((await send(['sound'], [command(44, text('raop_sink.speakers'))])).refused, true);
});

test('sound on a stream passes, and a command cut short closes', async () => {
  const audio = frame(0, Buffer.alloc(4096, 1));
  assert.deepEqual((await send(['sound'], [audio])).received, audio);
  assert.equal((await send(['sound'], [frame(0xffffffff, Buffer.from([0x74, 0x61]))])).refused, true);
  assert.equal((await send(['sound'], [command(9, Buffer.from('x'), Buffer.from([0, 0, 1, 0]))])).refused, true);
});
