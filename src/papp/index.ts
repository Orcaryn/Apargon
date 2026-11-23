import { app, BrowserWindow, dialog, powerMonitor, protocol } from 'electron';
import path from 'path';
import { Worker } from 'worker_threads';
import { pappAccess } from '../permissions/access/index.ts';
import { describe } from '../permissions/describe/index.ts';
import { APP_ROOT, OWN_FOLDERS } from '../shared/data/index.ts';
import type { PappConfig, Pick } from '../shared/wire/protocol/index.ts';
import { BYTES_SCHEME, serveApi } from './api/index.ts';
import { onTrampolineEvent } from './channel/index.ts';
import { followFavicon } from './icon/index.ts';
import { installMenu } from './menu/index.ts';
import { PAPP_PLATFORM } from './platform/index.ts';
import { createPappSession } from './session/index.ts';
import { registerShortcuts } from './shortcuts/index.ts';
import { openWindows } from './windows/index.ts';

export function preparePapp({ papp, own, proxy, permissions, relays, muxFd }: PappConfig) {
  app.setPath('userData', path.join(own, '.electron'));

  // Linux: the relays listen before Chromium starts, as on X11 it connects to the screen through one. 10 seconds at most. Before ready there is no dialog: the trampoline shows what the process wrote.
  if (muxFd !== null) {
    const ready = new Int32Array(new SharedArrayBuffer(4));
    new Worker(new URL('./relays/index.ts', import.meta.url), { workerData: { muxFd, relays, ready } });
    Atomics.wait(ready, 0, 0, 10_000);

    if (!Atomics.load(ready, 0)) {
      console.error('Apargon: the relays to the trampoline did not start.');
      process.exit(1);
    }
  }

  // Chromium looks up no name itself: a lookup leaves through the system's resolver, outside the sandbox. Names go only to the proxy.
  if (!permissions.system) {
    app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  }

  // All network goes through the proxy, this computer's too.
  if (proxy) {
    app.commandLine.appendSwitch('proxy-server', proxy);
    app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');
  }

  // Bluetooth is off in Chromium unless asked for.
  if (permissions.use.includes('bluetooth')) {
    app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  }

  protocol.registerSchemesAsPrivileged([{ scheme: BYTES_SCHEME, privileges: { supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } }]);
  PAPP_PLATFORM.beforeReady?.(papp);
  app.on('window-all-closed', () => app.quit());
}

export async function startPapp({ papp, permissions, pappHash, own, proxy, bounds, menu, programsHere }: PappConfig) {
  // The offline check: a .papp file never opens with network it wasn't given. papp-system has the internet.
  if (!permissions.system && !(await PAPP_PLATFORM.isOffline())) {
    const refusal = 'This process can still reach the network, so it is not in the sandbox. Refusing to open the .papp file. If APARGON is set in your environment, unset it.';
    console.error(`Apargon: ${refusal}`);
    dialog.showErrorBox('Apargon', refusal);
    app.quit();

    return;
  }

  const dir = path.dirname(papp);
  const canChange = pappAccess(permissions, own, [OWN_FOLDERS, ...(app.isPackaged ? [APP_ROOT] : [])]);
  // The user's picks to write, as the trampoline sends them after each pick.
  let picks: Pick[] = [];
  const pappSession = createPappSession(papp, permissions, pappHash, canChange);
  const menus = installMenu(papp, describe(permissions), menu);
  const windows = openWindows(papp, permissions, pappSession, bounds);
  const pappIcon = followFavicon(windows.main, true, permissions.window?.mark ?? true);
  // A global shortcut brings the .papp file forward and tells each of its windows.
  const pickShortcuts = registerShortcuts(permissions, keys => {
    windows.toFront();
    windows.send('apargon-shortcut', keys);
  });
  const api = serveApi(dir, own, permissions, canChange, { menus, toFront: windows.toFront, pappIcon, proxy, pickShortcuts, picks: () => picks, programsHere });
  windows.load((opened, options) => api.enable(opened, options));

  // shutdown: on macOS and Linux; the .papp file gets the event, not time: Apargon does not hold the shutdown back.
  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery', 'shutdown']) {
    (powerMonitor as NodeJS.EventEmitter).on(event, () => windows.send('apargon-system', event));
  }

  onTrampolineEvent({
    show: windows.toFront,
    quit: () => app.quit(),
    // destroy() skips beforeunload, so no window can stop this quit.
    forceQuit: () => {
      BrowserWindow.getAllWindows().forEach(win => win.destroy());
      app.quit();
    },
    refreshMenu: state => menus.refresh(state),
    trayItem: id => windows.send('apargon-tray', id),
    // Where the icon is, so the .papp file can put a window under it.
    trayClick: trayBounds => windows.send('apargon-tray-click', trayBounds),
    request: incoming => api.request(incoming),
    picks: latest => (picks = latest),
    programExit: exit => api.programExit(exit),
  });
}
