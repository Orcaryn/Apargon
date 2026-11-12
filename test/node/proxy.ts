import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { LOG_CAP, startProxy } from '../../src/trampoline/network/proxy.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-proxy-'));
const log = path.join(dir, 'egress.log');
const target = http.createServer((_request, response) => response.end('reached')).listen(0, '127.0.0.1');
await once(target, 'listening');
const port = (target.address() as net.AddressInfo).port;
const proxy = await startProxy([`127.0.0.1:${port}`, `localhost:${port}`, 'never.invalid:443'], log);
const proxyPort = (proxy.address() as net.AddressInfo).port;
after(() => {
  proxy.close();
  target.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// A CONNECT, as a browser sends one for https.
async function connect(to: string) {
  const socket = net.connect(proxyPort, '127.0.0.1');
  socket.write(`CONNECT ${to} HTTP/1.1\r\nHost: ${to}\r\n\r\n`);
  const [reply] = await once(socket, 'data');
  socket.destroy();

  return String(reply).split('\r\n')[0];
}

test('an allowed site and port is reached', async () => assert.equal(await connect(`127.0.0.1:${port}`), 'HTTP/1.1 200 Connection Established'));
test('localhost is reached when named', async () => assert.equal(await connect(`localhost:${port}`), 'HTTP/1.1 200 Connection Established'));
test('another port of an allowed site is refused', async () => assert.equal(await connect('127.0.0.1:1'), 'HTTP/1.1 403 Forbidden'));
test('another site is refused', async () => assert.equal(await connect('example.org:443'), 'HTTP/1.1 403 Forbidden'));
test('the proxy never reaches itself', async () => assert.equal(await connect(`127.0.0.1:${proxyPort}`), 'HTTP/1.1 403 Forbidden'));

test('plain http goes through only to an allowed site', async () => {
  const get = (url: string) =>
    new Promise<number>(resolve =>
      http.get({ host: '127.0.0.1', port: proxyPort, path: url }, response => {
        response.resume();
        resolve(response.statusCode!);
      })
    );
  assert.equal(await get(`http://127.0.0.1:${port}/`), 200);
  assert.equal(await get('http://example.org/'), 403);
});

test('every try is in the egress log', () => {
  const text = fs.readFileSync(log, 'utf8');
  assert.match(text, /CONNECT example\.org:443 403/);
  assert.match(text, new RegExp(`CONNECT 127\\.0\\.0\\.1:${port} 200`));
});

test('a full egress log is renamed to .1 and a fresh one started', async () => {
  const full = path.join(dir, 'full', 'egress.log');
  fs.mkdirSync(path.dirname(full));
  fs.writeFileSync(full, Buffer.alloc(LOG_CAP, 0x2e));
  const second = await startProxy([], full);
  const second_port = (second.address() as net.AddressInfo).port;
  const socket = net.connect(second_port, '127.0.0.1');
  socket.write('CONNECT example.org:443 HTTP/1.1\r\nHost: example.org\r\n\r\n');
  await once(socket, 'data');
  socket.destroy();
  second.close();
  await once(second, 'close');
  assert.equal(fs.statSync(`${full}.1`).size, LOG_CAP);
  const text = fs.readFileSync(full, 'utf8');
  assert.match(text, /CONNECT example\.org:443 403/);
  assert.ok(text.length < 200);
});
