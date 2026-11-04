import { randomUUID } from 'crypto';
import { once } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageReply } from '../../shared/channel.ts';

// A request is a line to the page, and the page's answer a line back.
const BODY_LIMIT = 16 * 1024 * 1024;

// This process listens, as the page's may not: each request goes to the page as data, and its answer comes back the same way. Nothing in between reads either.
export function pageListeners({ listen }: Permissions, reply: (reply: PageReply) => void) {
  const servers = new Map<string, http.Server>();
  const pending = new Map<string, http.ServerResponse>();

  return {
    async listen(server: string, port: number | null) {
      if (!listen) {
        throw new Error('Apargon: this page may not listen. Ask for it with <meta name="papp-listen" content="localhost">, or "network" for devices on your network too.');
      }

      const listener = http.createServer((request, response) => {
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
          const id = randomUUID();
          // As a browser shows them: by lowercase name, repeats joined.
          const headers = Object.fromEntries(Object.entries(request.headers as Record<string, string | string[]>).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]));
          pending.set(id, response);
          response.on('close', () => pending.delete(id));
          reply({ request: { server, id, method: request.method!, url: `http://${request.headers.host ?? '127.0.0.1'}${request.url}`, headers, body: Buffer.concat(chunks).toString('base64') } });
        });
      });
      listener.listen({ port: port ?? 0, host: listen === 'network' ? '0.0.0.0' : '127.0.0.1' });
      await once(listener, 'listening');
      servers.set(server, listener);
      // The address a device on the network reaches this computer at: its first, as a page cannot know which network the user means; loopback when it is on none.
      const external = listen === 'network' && Object.values(os.networkInterfaces()).flat().find(each => each?.family === 'IPv4' && !each.internal);

      return `http://${external ? external.address : '127.0.0.1'}:${(listener.address() as AddressInfo).port}`;
    },
    respond(id: string, status: number, headers: Record<string, string>, body: string) {
      const response = pending.get(id);

      // Closed since: the one who asked is gone.
      if (!response) {
        return;
      }

      pending.delete(id);

      try {
        response.writeHead(status, headers);
      } catch (err) {
        // The page's answer, not the request, was bad: the one who asked gets an error, and the page's output the reason.
        response.writeHead(500).end();

        throw err;
      }

      response.end(Buffer.from(body, 'base64'));
    },
    // Closing the connections answers each pending request with nothing, and takes it off the list.
    unlisten(server: string) {
      servers.get(server)?.closeAllConnections();
      servers.get(server)?.close();
      servers.delete(server);
    },
    closeAll() {
      [...servers.keys()].forEach(server => this.unlisten(server));
    },
  };
}
