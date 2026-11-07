import { randomUUID } from 'crypto';
import { once } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import type { Permissions } from '../../permissions/tags.ts';
import type { IncomingRequest } from '../../shared/channel.ts';

const BODY_LIMIT = 16 * 1024 * 1024;
type Listener = { server: http.Server; abortStart: AbortController; closing: Promise<null> | null };

// The trampoline owns the listeners; the .papp file receives requests and returns answers as data.
export function pageListeners({ listen: listenScope }: Pick<Permissions, 'listen'>, toPage: (request: IncomingRequest) => void) {
  const listenersById = new Map<string, Listener>();
  const responsesById = new Map<string, http.ServerResponse>();
  let pageClosed = false;

  return {
    async listen(serverId: string, port: number | null) {
      if (!listenScope) {
        throw new Error('Apargon: this page may not listen. Ask for it with <meta name="papp-listen" content="localhost">, or "network" for devices on your network too.');
      } else if (pageClosed) {
        throw new Error('Apargon: this page has closed.');
      } else if (typeof serverId !== 'string' || !serverId || listenersById.has(serverId)) {
        throw new Error('Apargon: a listener needs a new, nonempty id.');
      } else if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 65535)) {
        throw new Error('Apargon: listen takes a port from 1 to 65535, or none for a free one.');
      }

      const server = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on('data', (chunk: Buffer) => {
          size += chunk.length;

          if (size > BODY_LIMIT) {
            response.writeHead(413).end();
            request.destroy();
          } else {
            chunks.push(chunk);
          }
        });
        request.on('end', () => {
          if (response.destroyed || response.writableEnded || listener.closing) {
            return;
          }

          const requestId = randomUUID();
          // Node supplies values for present header entries; undefined belongs to lookups of absent names.
          const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]): [string, string] => [name, Array.isArray(value) ? value.join(', ') : value!]));
          responsesById.set(requestId, response);
          response.on('close', () => responsesById.delete(requestId));
          toPage({ server: serverId, id: requestId, method: request.method!, url: `http://${request.headers.host ?? '127.0.0.1'}${request.url}`, headers, body: Buffer.concat(chunks).toString('base64') });
        });
      });
      const listener: Listener = { server, abortStart: new AbortController(), closing: null };
      listenersById.set(serverId, listener);
      server.on('error', () => {});

      try {
        const ready = once(server, 'listening', { signal: listener.abortStart.signal });
        server.listen({ port: port ?? 0, host: listenScope === 'network' ? '0.0.0.0' : '127.0.0.1' });
        await ready;

        if (listener.closing) {
          throw new Error('Apargon: the listener closed while it opened.');
        }

        const external = listenScope === 'network' && Object.values(os.networkInterfaces()).flat().find(each => each?.family === 'IPv4' && !each.internal);

        return `http://${external ? external.address : '127.0.0.1'}:${(server.address() as AddressInfo).port}`;
      } catch (err) {
        await closeListener(serverId);

        throw err;
      }
    },
    respond(requestId: string, status: number, headers: Record<string, string>, body: string) {
      const response = responsesById.get(requestId);

      if (!response) {
        return;
      }

      responsesById.delete(requestId);

      try {
        if (!Number.isInteger(status) || status < 200 || status > 599 || typeof body !== 'string') {
          throw new Error('Apargon: a final HTTP answer needs a status from 200 to 599 and a body as base64.');
        }

        response.writeHead(status, headers);
        response.end(Buffer.from(body, 'base64'));
      } catch (err) {
        response.writeHead(500).end();

        throw err;
      }
    },
    unlisten: closeListener,
    closeAll() {
      pageClosed = true;

      return Promise.all([...listenersById.keys()].map(closeListener));
    },
  };

  function closeListener(serverId: string): Promise<null> {
    const listener = listenersById.get(serverId);

    if (!listener) {
      return Promise.resolve(null);
    } else if (listener.closing) {
      return listener.closing;
    }

    listener.abortStart.abort(new Error('Apargon: the listener closed while it opened.'));
    listener.closing = new Promise<null>(resolve => {
      listener.server.close(() => {
        listenersById.delete(serverId);
        resolve(null);
      });
      // Stop accepting first, then close every existing connection.
      listener.server.closeAllConnections();
    });

    return listener.closing;
  }
}
