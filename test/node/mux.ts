import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { Duplex, PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { startMux } from '../../src/shared/wire/mux/index.ts';

// Two ends of one pipe, as the sandbox's fd 6 and the trampoline's.
function pipePair() {
  const [aIn, bIn] = [new PassThrough(), new PassThrough()];

  return [Duplex.from({ readable: aIn, writable: bIn }), Duplex.from({ readable: bIn, writable: aIn })];
}

test('a stream opened inside reaches its target outside, both ways, and closes', async () => {
  const echo = net.createServer({ allowHalfOpen: true }, socket => socket.pipe(socket)).listen(0, '127.0.0.1');
  await once(echo, 'listening');
  const port = (echo.address() as net.AddressInfo).port;
  const [inside, outside] = pipePair();
  const asked: string[] = [];
  startMux(outside, target => (asked.push(target), target === 'echo' ? net.connect({ port, host: '127.0.0.1', allowHalfOpen: true }) : null));
  const mux = startMux(inside, null);
  const relay = net.createServer({ allowHalfOpen: true }, socket => mux.open('echo', socket)).listen(0, '127.0.0.1');
  await once(relay, 'listening');
  const client = net.connect((relay.address() as net.AddressInfo).port, '127.0.0.1');
  const big = Buffer.alloc(300_000, 7);
  client.end(Buffer.concat([Buffer.from('hello'), big]));
  const chunks: Buffer[] = [];
  client.on('data', chunk => chunks.push(chunk));
  await once(client, 'close');
  assert.deepEqual(asked, ['echo']);
  assert.equal(Buffer.concat(chunks).length, 5 + big.length);
  relay.close();
  echo.close();
});

test('an unknown target closes at once', async () => {
  const [inside, outside] = pipePair();
  startMux(outside, () => null);
  const mux = startMux(inside, null);
  const relay = net.createServer(socket => mux.open('nowhere', socket)).listen(0, '127.0.0.1');
  await once(relay, 'listening');
  const client = net.connect((relay.address() as net.AddressInfo).port, '127.0.0.1');
  client.on('error', () => undefined);
  await once(client, 'close');
  relay.close();
});

test('a target that takes nothing holds one window of bytes, and no other stream waits for it', { timeout: 10_000 }, async () => {
  const [inside, outside] = pipePair();
  // Takes its first bytes and never says so.
  const stuck = new Writable({ highWaterMark: 1, write: () => undefined });
  const targets: Record<string, () => Duplex> = { stuck: () => Duplex.from({ writable: stuck, readable: new PassThrough() }), echo: () => new PassThrough() };
  startMux(outside, target => targets[target]());
  const mux = startMux(inside, null);
  const source = new PassThrough();
  mux.open('stuck', source);

  // As a socket hands them over: in pieces.
  for (let piece = 0; piece < 128; piece++) {
    source.write(Buffer.alloc(65_536));
  }

  const [sent, back] = [new PassThrough(), new PassThrough()];
  mux.open('echo', Duplex.from({ readable: sent, writable: back }));
  const big = Buffer.alloc(3_000_000, 7);
  sent.end(big);
  let returned = 0;

  for await (const chunk of back as AsyncIterable<Buffer>) {
    if ((returned += chunk.length) === big.length) {
      break;
    }
  }

  assert.equal(returned, big.length);
  assert.ok(stuck.writableLength > 0 && stuck.writableLength <= 1024 * 1024 + 65_536, `${stuck.writableLength} bytes held`);
  source.destroy();
});
