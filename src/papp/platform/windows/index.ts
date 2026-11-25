import { app } from 'electron';
import net from 'net';
import { pappAppId } from '../../../shared/data/index.ts';
import type { PappPlatform } from '../index.ts';

export const windows: PappPlatform = {
  // Both this computer and one off it: a Windows sandbox can block loopback alone and still have internet.
  isOffline: async () => (await Promise.all([connectError('127.0.0.1', 9), connectError(UNROUTED, 9)])).every(code => code === 'EACCES'),
  // The taskbar groups windows by app id: each .papp file gets its own button.
  beforeReady(papp) {
    app.setAppUserModelId(pappAppId(papp));
  },
  appMenu: false,
  // Without this a pin would start Apargon with no .papp file, under Apargon's name.
  pin(win, papp) {
    const relaunchCommand = [process.execPath, papp].map(arg => `"${arg}"`).join(' ');
    win.on('page-title-updated', (_event, title) => win.setAppDetails({ appId: pappAppId(papp), relaunchCommand, relaunchDisplayName: title }));
  },
  showIcon(win, icon) {
    if (!win.isDestroyed()) {
      win.setIcon(icon);
    }
  },
  // taskkill finds children through WMI, which the sandbox cannot reach: a kill ends the program, not what it started.
  processGroups: false,
  // A child gets only the handles libuv hands it: its stdio.
  programsInheritFds: false,
};

// TEST-NET-1: no network routes it, so outside the sandbox the connection hangs or is unreachable, never refused by the firewall.
const UNROUTED = '192.0.2.1';

// MXC's firewall rules refuse the container every address but Apargon's proxy, with EACCES at once, loopback or not. Outside, a loopback port nobody listens on refuses with ECONNREFUSED, one in use answers, and an address off this computer answers or times out: none of these is proof.
function connectError(host: string, port: number): Promise<string | undefined> {
  return new Promise(resolve => {
    const socket = net.connect({ host, port, timeout: 3000 });

    const notRefused = () => {
      socket.destroy();
      resolve(undefined);
    };

    socket.once('connect', notRefused).once('timeout', notRefused).once('error', (err: NodeJS.ErrnoException) => resolve(err.code));
  });
}
