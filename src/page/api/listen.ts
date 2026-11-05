import type { BrowserWindow } from 'electron';
import { callTrampoline, tellTrampoline, type IncomingRequest } from '../../shared/channel.ts';
import type { Scope } from './scope.ts';

// The trampoline listens for the page, refusing without the tag, and passes each request here as data; the page's answer goes back the same way.
export function listenApi({ loaded }: Scope, win: BrowserWindow) {
  const servers = new Set<string>();

  return {
    async listen(server: string, port: number | null) {
      if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 65535)) {
        throw new Error('Apargon: listen takes a port from 1 to 65535, or none for a free one.');
      }

      const stillLoaded = loaded();
      const url = await callTrampoline('listen', { server, port });

      // A reload while it opened: the page that asked is gone, and so is its handler.
      if (stillLoaded()) {
        servers.add(server);
      } else {
        tellTrampoline('unlisten', server);
      }

      return url;
    },
    respond(id: string, status: number, headers: Record<string, string>, body: string | Uint8Array) {
      if (!Number.isInteger(status) || status < 100 || status > 999) {
        throw new Error('Apargon: an answer\'s status is a number from 100 to 999.');
      } else if (typeof headers !== 'object' || headers === null || Array.isArray(headers) || !Object.values(headers).every(value => typeof value === 'string')) {
        throw new Error('Apargon: an answer\'s headers are an object of strings, such as { "content-type": "text/plain" }.');
      } else if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
        throw new Error('Apargon: an answer\'s body is a string or bytes.');
      }

      tellTrampoline('respond', { id: String(id), status, headers, body: Buffer.from(body).toString('base64') });
    },
    unlisten(server: string) {
      if (servers.delete(server)) {
        tellTrampoline('unlisten', server);
      }
    },
    request({ server, ...request }: IncomingRequest) {
      if (servers.has(server)) {
        win.webContents.send('apargon-request', server, { ...request, body: Buffer.from(request.body, 'base64') });
      }
    },
    reset() {
      servers.forEach(server => tellTrampoline('unlisten', server));
      servers.clear();
    },
  };
}
