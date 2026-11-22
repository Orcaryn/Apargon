import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { after, test } from 'node:test';
import { startProxy } from '../../src/trampoline/pageProcess/proxy/index.ts';

const target = http.createServer((_request, response) => response.end('reached')).listen(0, '127.0.0.1');
await once(target, 'listening');
const port = (target.address() as net.AddressInfo).port;
const sites = [`127.0.0.1:${port}`, `localhost:${port}`, 'never.invalid:443'];
const proxy = await startProxy(sites);
const proxyPort = (proxy.address() as net.AddressInfo).port;
sites.push(`localhost:${proxyPort}`, `127.0.0.1:${proxyPort}`);
after(() => {
  proxy.close();
  target.close();
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
test('the proxy never reaches itself', async () => {
  assert.equal(await connect(`127.0.0.1:${proxyPort}`), 'HTTP/1.1 403 Forbidden');
  assert.equal(await connect(`LOCALHOST:${proxyPort}`), 'HTTP/1.1 403 Forbidden');
  assert.equal(await connect(`localhost.:${proxyPort}`), 'HTTP/1.1 403 Forbidden');
});

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
