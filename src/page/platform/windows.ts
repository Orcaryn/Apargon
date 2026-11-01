import { app } from 'electron';
import net from 'net';
import { tellTrampoline } from '../../shared/channel.ts';
import type { PagePlatform } from '../platform.ts';

export const windows: PagePlatform = {
  isOffline: async () => (await loopbackConnectError()) === 'EACCES',
  // Windows shows notifications through a service the sandbox may not reach, so the trampoline shows them.
  notify: text => tellTrampoline({ notify: text }),
  // The GPU process cannot run in the sandbox, and a name Chromium looks up leaves through Windows' own resolver: names go only to the proxy.
  beforeReady() {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  },
  appMenu: false,
  showIcon(win, icon) {
    if (!win.isDestroyed()) {
      win.setIcon(icon);
    }
  },
  processGroups: false,
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
