import type { WebContents } from 'electron';
import { once } from 'events';
import http from 'http';
import type net from 'net';
import tls from 'tls';
import { WINDOW } from '../../../../shared/wire/streams/index.ts';

// Every opening connection owns its cancellation; only registered sockets may send events to the .papp file.
export function connectionApi(contents: Pick<WebContents, 'send'>, proxy: string | null) {
  const connections = new Map<string, net.Socket>();
  const pendingConnections = new Map<string, AbortController>();
  // What the window says it took of each connection's bytes.
  const onRead = new Map<string, (count: number) => void>();

  return {
    async connect(id: string, host: string, port: number, { tls: secure = false }: { tls?: boolean } = {}) {
      const target = `${host}:${port}`;
      const refusal = new Error(`Apargon: this .papp file may not connect to ${target}. Ask for it with <meta name="papp-net" content="${target}">.`);

      if (!proxy) {
        throw refusal;
      } else if (connections.has(id) || pendingConnections.has(id)) {
        throw new Error('Apargon: that connection is already opening or open.');
      }

      const [proxyHost, proxyPort] = proxy.split(':');
      const controller = new AbortController();
      // No agent: a kept-alive socket would outlive the cancel.
      const request = http.request({ host: proxyHost, port: proxyPort, method: 'CONNECT', path: target, signal: controller.signal, agent: false });
      let socket: net.Socket | null = null;
      let connectionError: string | null = null;
      controller.signal.addEventListener(
        'abort',
        () => {
          socket?.destroy();
          request.socket?.destroy();
        },
        { once: true }
      );
      pendingConnections.set(id, controller);
      const timeout = setTimeout(() => controller.abort(new Error(`Apargon: connecting to ${target} timed out.`)), 30_000);

      try {
        const connected = new Promise<{ response: http.IncomingMessage; tunnel: net.Socket; head: Buffer }>((resolve, reject) => {
          request.once('connect', (response: http.IncomingMessage, tunnel: net.Socket, head: Buffer) => resolve({ response, tunnel, head }));
          request.once('error', reject);
        });
        request.end();
        const { response, tunnel, head } = await connected;
        socket = tunnel;
        tunnel.on('error', err => (connectionError = err.message));

        if (response.statusCode !== 200) {
          throw response.statusCode === 403 ? refusal : new Error(`Apargon: could not reach ${target}.`);
        }

        tunnel.unshift(head);

        if (secure) {
          socket = tls.connect({ socket: tunnel, servername: host });
          socket.on('error', err => (connectionError = err.message));
          await once(socket, 'secureConnect', { signal: controller.signal });
        }

        controller.signal.throwIfAborted();

        if (socket.destroyed) {
          throw new Error('Apargon: the .papp file reloaded or the connection closed while it connected.');
        }

        const connectedSocket = socket;
        connections.set(id, connectedSocket);
        let unread = 0;
        connectedSocket.on('data', (bytes: Buffer) => {
          if (connections.get(id) === connectedSocket) {
            contents.send('apargon-data', id, bytes);

            // With a window's worth untaken, the other end waits.
            if ((unread += bytes.length) > WINDOW) {
              connectedSocket.pause();
            }
          }
        });
        onRead.set(id, count => {
          if ((unread -= count) <= WINDOW) {
            connectedSocket.resume();
          }
        });
        connectedSocket.on('close', () => {
          if (connections.get(id) === connectedSocket) {
            connections.delete(id);
            onRead.delete(id);
            contents.send('apargon-closed', id, connectionError);
          }
        });
      } catch (err) {
        controller.abort(err);
        // The CONNECT reply may hand us its socket after cancellation has already fired.
        socket?.destroy();

        throw controller.signal.reason;
      } finally {
        clearTimeout(timeout);

        if (pendingConnections.get(id) === controller) {
          pendingConnections.delete(id);
        }
      }
    },
    // Answered once the bytes are on their way, or the connection has closed: a page that waits for the answer never runs ahead of a slow one.
    async writeConnection(id: string, data: string | Uint8Array) {
      const socket = connections.get(id);

      if (socket) {
        await new Promise<void>(sent => socket.write(data, () => sent()));
      }
    },
    dataRead(id: string, count: number) {
      onRead.get(id)?.(count);
    },
    // Flush the input; cut off a peer that does not end its side within five seconds.
    closeConnection(id: string) {
      const socket = connections.get(id);

      if (socket) {
        const timeout = setTimeout(() => socket.destroy(), 5000);
        socket.once('close', () => clearTimeout(timeout));
        socket.end();
      }
    },
    reset() {
      pendingConnections.forEach(controller => controller.abort(new Error('Apargon: the .papp file reloaded while it connected.')));
      pendingConnections.clear();
      connections.forEach(socket => socket.destroy());
      connections.clear();
      onRead.clear();
    },
  };
}
