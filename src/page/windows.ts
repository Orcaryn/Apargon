import net from 'net';
import { tellTrampoline } from '../shared.ts';
import type { PagePlatform } from './platform.ts';

export const windows: PagePlatform = {
  isOffline: async () => (await loopbackConnectError()) === 'EACCES',
  // Windows shows notifications through a service the sandbox may not reach, so the trampoline shows them.
  notify: text => tellTrampoline({ notify: text }),
};

// MXC's firewall rules refuse the container any address but Apargon's proxy, with EACCES. Outside, a port nobody listens on refuses with ECONNREFUSED, and one in use answers: either is not proof.
function loopbackConnectError(): Promise<string | undefined> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 9 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(undefined);
    });
    socket.once('error', (err: NodeJS.ErrnoException) => resolve(err.code));
  });
}
