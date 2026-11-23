import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { test } from 'node:test';
import { connectionApi } from '../../src/papp/api/network/connections/index.ts';

for (const secure of [false, true]) {
  test(`reset cancels a pending ${secure ? 'TLS handshake' : 'CONNECT request'}`, { timeout: 5000 }, async t => {
    const proxy = http.createServer();
    const sockets = new Set<Duplex>();
    const entered = Promise.withResolvers<void>();
    proxy.on('connect', (_request, socket) => {
      sockets.add(socket);
      socket.on('error', () => {});

      if (secure) {
        // Accept CONNECT but never answer the TLS ClientHello.
        socket.once('data', () => entered.resolve());
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      } else {
        // Never answer CONNECT at all.
        entered.resolve();
      }
    });
    t.after(() => {
      sockets.forEach(socket => socket.destroy());
      proxy.close();
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const port = (proxy.address() as AddressInfo).port;
    const sent: string[] = [];
    const api = connectionApi({ send: channel => sent.push(channel) }, `127.0.0.1:${port}`);
    t.after(() => api.reset());
    const rejected = assert.rejects(api.connect('pending', 'allowed.example', 443, { tls: secure }), /reloaded/);
    await entered.promise;
    // The proxy's side sees the end: Node's HTTP server keeps its half open.
    const closed = Promise.all([...sockets].map(socket => once(socket, 'end')));
    api.reset();
    await rejected;
    await closed;
    assert.deepEqual(sent, []);
  });
}
