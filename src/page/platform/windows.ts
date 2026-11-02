import { app } from 'electron';
import net from 'net';
import { tellTrampoline } from '../../shared/channel.ts';
import { pageAppId } from '../../shared/data.ts';
import type { PagePlatform } from '../platform.ts';

export const windows: PagePlatform = {
  // Both this computer and one off it: a Windows sandbox can block loopback alone and still have internet.
  isOffline: async () => (await Promise.all([connectError('127.0.0.1', 9), connectError(UNROUTED, 9)])).every(code => code === 'EACCES'),
  // Windows shows notifications through a service the sandbox may not reach, so the trampoline shows them.
  notify: text => tellTrampoline({ notify: text }),
  // The GPU process cannot run in the sandbox, and a name Chromium looks up leaves through Windows' own resolver: names go only to the proxy. So does localhost: Chromium would reach it directly, which the sandbox refuses. The taskbar groups windows by app id: each page gets its own button.
  beforeReady(page) {
    app.setAppUserModelId(pageAppId(page));
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
    app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');
  },
  appMenu: false,
  // Without this a pin would start Apargon with no page, under Apargon's name.
  pin(win, page) {
    const relaunchCommand = [process.execPath, page].map(arg => `"${arg}"`).join(' ');
    win.on('page-title-updated', (_event, title) => win.setAppDetails({ appId: pageAppId(page), relaunchCommand, relaunchDisplayName: title }));
  },
  showIcon(win, icon) {
    if (!win.isDestroyed()) {
      win.setIcon(icon);
    }
  },
  processGroups: false,
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
