import { randomUUID } from 'crypto';
import { once } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import { pipeline, Readable } from 'stream';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import type { IncomingRequest } from '../../../../shared/wire/protocol/index.ts';

const BODY_LIMIT = 16 * 1024 * 1024;
// Each request waits here whole, up to the limit, until the .papp file answers: so many at once, and the next gets 503.
const REQUESTS_AT_ONCE = 32;
type Listener = { server: http.Server; abortStart: AbortController; closing: Promise<null> | null };

// The trampoline owns the listeners; the .papp file receives requests and returns answers as data. sendBytes: gives a request's body to the .papp file as a stream, and names it.
export function pappListeners({ listen: listenScope }: Pick<Permissions, 'listen'>, toPapp: (request: IncomingRequest) => void, sendBytes: (source: Readable) => string) {
  const listenersById = new Map<string, Listener>();
  const responsesById = new Map<string, http.ServerResponse>();
  let waitingForAnswer = 0;
  let pappClosed = false;

  return {
    async listen(serverId: string, port: number | null) {
      if (!listenScope) {
        throw new Error('Apargon: this .papp file may not listen. Ask for it with <meta name="papp-listen">, or <meta name="papp-listen" network> for the network too.');
      } else if (pappClosed) {
        throw new Error('Apargon: this .papp file has closed.');
      } else if (typeof serverId !== 'string' || !serverId || listenersById.has(serverId)) {
        throw new Error('Apargon: a listener needs a new, nonempty id.');
      } else if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 65535)) {
        throw new Error('Apargon: listen takes a port from 1 to 65535, or none for a free one.');
      }

      const server = http.createServer((request, response) => {
        if (waitingForAnswer === REQUESTS_AT_ONCE) {
          response.writeHead(503).end();
          request.resume();

          return;
        }

        waitingForAnswer++;
        response.on('close', () => waitingForAnswer--);
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
          const body = Readable.from(Buffer.concat(chunks), { objectMode: false });
          responsesById.set(requestId, response);
          response.on('close', () => {
            responsesById.delete(requestId);
            body.destroy();
          });
          toPapp({ server: serverId, id: requestId, method: request.method!, url: `http://${request.headers.host ?? '127.0.0.1'}${request.url}`, headers, body: sendBytes(body) });
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
    // body: the answer's bytes, sent on as whoever asked takes them. With no one left to answer, it is given up, which stops the .papp file sending.
    respond(requestId: string, status: number, headers: Record<string, string>, body: Readable) {
      const response = responsesById.get(requestId);

      if (!response) {
        body.destroy();

        return;
      }

      responsesById.delete(requestId);

      try {
        if (!Number.isInteger(status) || status < 200 || status > 599) {
          throw new Error('Apargon: a final HTTP answer needs a status from 200 to 599.');
        }

        response.writeHead(status, headers);
      } catch (err) {
        body.destroy();
        response.writeHead(500).end();

        throw err;
      }

      // Either end may leave first: the other is closed with it, and there is no one to tell.
      pipeline(body, response, () => undefined);
    },
    unlisten: closeListener,
    closeAll() {
      pappClosed = true;

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
