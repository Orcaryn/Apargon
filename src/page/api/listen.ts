import type { WebContents } from 'electron';
import { callTrampoline, tellTrampoline, type IncomingRequest } from '../../shared/channel.ts';

// Each start promise identifies its listener across reloads, including while the trampoline is still opening it.
export function listenApi(contents: Pick<WebContents, 'send'>) {
  const listeners = new Map<string, Promise<string>>();

  return {
    async listen(server: string, port: number | null) {
      if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 65535)) {
        throw new Error('Apargon: listen takes a port from 1 to 65535, or none for a free one.');
      }

      const started = callTrampoline('listen', { server, port });
      listeners.set(server, started);

      try {
        const url = await started;

        if (listeners.get(server) !== started) {
          await callTrampoline('unlisten', { server });

          throw new Error('Apargon: the page reloaded or the listener closed while it opened.');
        }

        return url;
      } catch (err) {
        if (listeners.get(server) === started) {
          listeners.delete(server);
        }

        throw err;
      }
    },
    respond(id: string, status: number, headers: Record<string, string>, body: string | Uint8Array) {
      if (!Number.isInteger(status) || status < 200 || status > 599) {
        throw new Error('Apargon: a final answer\'s status is a number from 200 to 599.');
      } else if (typeof headers !== 'object' || headers === null || Array.isArray(headers) || !Object.values(headers).every(value => typeof value === 'string')) {
        throw new Error('Apargon: an answer\'s headers are an object of strings, such as { "content-type": "text/plain" }.');
      } else if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
        throw new Error('Apargon: an answer\'s body is a string or bytes.');
      }

      tellTrampoline('respond', { id: String(id), status, headers, body: Buffer.from(body).toString('base64') });
    },
    unlisten(server: string) {
      listeners.delete(server);

      return callTrampoline('unlisten', { server });
    },
    request({ server, ...request }: IncomingRequest) {
      if (listeners.has(server)) {
        contents.send('apargon-request', server, { ...request, body: Buffer.from(request.body, 'base64') });
      }
    },
    reset() {
      const servers = [...listeners.keys()];
      listeners.clear();

      return Promise.all(servers.map(server => callTrampoline('unlisten', { server })));
    },
  };
}
