import type { BrowserWindow } from 'electron';
import { once } from 'events';
import http from 'http';
import type net from 'net';
import tls from 'tls';
import { PAGE_CONFIG } from '../../shared/channel.ts';

// A TCP connection through Apargon's proxy, which lets through only a declared host:port and logs it, as for fetch.
export function connectionApi(win: BrowserWindow) {
  const connections = new Map<string, net.Socket>();
  let resets = 0;

  return {
    async connect(id: string, host: string, port: number, { tls: secure = false }: { tls?: boolean } = {}) {
      const target = `${host}:${port}`;
      const refusal = new Error(`Apargon: this page may not connect to ${target}. Ask for it with <meta name="papp-net" content="${target}">.`);
      const { proxy } = PAGE_CONFIG!;

      if (!proxy) {
        throw refusal;
      }

      const resetsBefore = resets;
      const [proxyHost, proxyPort] = proxy.split(':');
      const request = http.request({ host: proxyHost, port: proxyPort, method: 'CONNECT', path: target }).end();
      const [response, tunnel, head] = (await once(request, 'connect')) as [http.IncomingMessage, net.Socket, Buffer];

      if (response.statusCode !== 200) {
        tunnel.destroy();

        throw response.statusCode === 403 ? refusal : new Error(`Apargon: could not reach ${target}.`);
      }

      // What the server sent along with the proxy's answer.
      tunnel.unshift(head);
      let socket = tunnel;

      if (secure) {
        socket = tls.connect({ socket: tunnel, servername: host });
        await once(socket, 'secureConnect');
      }

      // A reload or a closed window while it opened: the page that asked is gone, so nothing may outlive it.
      if (resets !== resetsBefore) {
        socket.destroy();

        throw new Error('Apargon: the page reloaded while it connected.');
      }

      connections.set(id, socket);
      let error: string | null = null;
      socket.on('error', err => (error = err.message));
      socket.on('data', (bytes: Buffer) => win.webContents.send('apargon-data', id, bytes));
      socket.on('close', () => {
        if (connections.delete(id)) {
          win.webContents.send('apargon-closed', id, error);
        }
      });
    },
    writeConnection(id: string, data: string | Uint8Array) {
      connections.get(id)?.write(data);
    },
    // Sends what is left and ends the page's side; a server that does not end its own is cut off after 5 seconds.
    closeConnection(id: string) {
      const socket = connections.get(id);

      if (socket) {
        socket.end();
        setTimeout(() => socket.destroy(), 5000);
      }
    },
    reset() {
      connections.forEach(socket => socket.destroy());
      connections.clear();
      resets++;
    },
  };
}
