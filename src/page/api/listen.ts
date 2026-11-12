import type { WebContents } from 'electron';
import type { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import { callTrampoline, tellTrampoline, trampolineBytes, type IncomingRequest } from '../../shared/channel.ts';

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

          throw new Error('Apargon: the .papp file reloaded or the listener closed while it opened.');
        }

        return url;
      } catch (err) {
        if (listeners.get(server) === started) {
          listeners.delete(server);
        }

        throw err;
      }
    },
    // body: the answer's bytes, sent as whoever asked takes them. Done once they are all sent, or whoever asked has gone.
    async respond(body: Readable, id: string, status: number, headers: Record<string, string>) {
      if (!Number.isInteger(status) || status < 200 || status > 599) {
        throw new Error('Apargon: a final answer\'s status is a number from 200 to 599.');
      } else if (typeof headers !== 'object' || headers === null || Array.isArray(headers) || !Object.values(headers).every(value => typeof value === 'string')) {
        throw new Error('Apargon: an answer\'s headers are an object of strings, such as { "content-type": "text/plain" }.');
      }

      tellTrampoline('respond', { id, status, headers, body: trampolineBytes.send(body) });
      await new Promise(resolve => body.on('close', resolve));
    },
    unlisten(server: string) {
      listeners.delete(server);

      return callTrampoline('unlisten', { server });
    },
    request({ server, ...request }: IncomingRequest) {
      if (listeners.has(server)) {
        // Whoever asked may leave while the body comes: then there is no request to hand over.
        buffer(trampolineBytes.receive(request.body)).then(
          body => contents.send('apargon-request', server, { ...request, body }),
          () => undefined
        );
      }
    },
    reset() {
      const servers = [...listeners.keys()];
      listeners.clear();

      return Promise.all(servers.map(server => callTrampoline('unlisten', { server })));
    },
  };
}
