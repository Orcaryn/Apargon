import { ipcMain, protocol, type BrowserWindow, type BrowserWindowConstructorOptions, type NativeImage } from 'electron';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { Permissions } from '../../permissions/tags/index.ts';
import type { IncomingRequest, Pick } from '../../shared/wire/protocol/index.ts';
import type { PappMenus } from '../menu/index.ts';
import { notifyApi } from './desktop/notify/index.ts';
import * as secrets from './desktop/secrets/index.ts';
import { systemApi } from './desktop/system/index.ts';
import { tray } from './desktop/tray/index.ts';
import { windowApi } from './desktop/window/index.ts';
import { fileApi } from './files/index.ts';
import { connectionApi } from './network/connections/index.ts';
import { listenApi } from './network/listen/index.ts';
import { programApi, programExit } from './programs/index.ts';
import { pappScope, type Scope } from './scope/index.ts';

// Bytes between a window and this process go as requests to this scheme, not as messages: Chromium streams a request's body and its answer, and makes the faster side wait. Registered before the app is ready.
export const BYTES_SCHEME = 'papp-bytes';

// What every window of the .papp file shares: the menu bar, the icon as drawn, the proxy, if the .papp file has network, the shortcuts it picked, and the user's picks to write.
type PappWide = { menus: PappMenus; pappIcon: () => NativeImage | null; proxy: string | null; pickShortcuts: (keys: string[]) => void; picks: () => Pick[]; programsHere: boolean };

// Every .papp file gets papp, a papp-system one too.
export function serveApi(dir: string, own: string, permissions: Permissions, canChange: (file: string) => boolean, pappWide: PappWide) {
  const scope = pappScope(dir, canChange);
  // token: what the window's preload shows to use the scheme. A frame in the window has no preload, so no token, and no papp.
  const pappBySender = new Map<number, { papp: ReturnType<typeof windowPapp>; token: string }>();

  const handlerOf = (papp: ReturnType<typeof windowPapp> | undefined, call: string) => {
    if (!papp || !Object.hasOwn(papp, call)) {
      throw new Error(`Apargon: no such call ${call}.`);
    }

    return papp[call as keyof typeof papp] as (...args: unknown[]) => unknown;
  };

  ipcMain.on('apargon-dir', event => (event.returnValue = { dir, folder: own, token: pappBySender.get(event.sender.id)!.token, notifications: permissions.use.includes('notifications') }));
  // papp-bytes://<token>/<call>?args=<JSON list>. A request with a body hands it to the call as a stream, before the arguments. A call that gives a stream answers with its bytes, any other with its value.
  protocol.handle(BYTES_SCHEME, async request => {
    const url = new URL(request.url);
    const call = url.pathname.slice(1);
    const papp = [...pappBySender.values()].find(({ token }) => token === url.host)?.papp;
    const body = request.body && Readable.fromWeb(request.body);

    try {
      const handler = handlerOf(papp, call);
      const args = JSON.parse(url.searchParams.get('args')!) as unknown[];
      const value = await (body ? handler(body, ...args) : handler(...args));

      return value instanceof Readable ? new Response(Readable.toWeb(value)) : Response.json({ value });
    } catch (err) {
      return Response.json({ error: (err as Error).message, code: (err as NodeJS.ErrnoException).code }, { status: 500 });
    } finally {
      // A call that failed before it read the body: the window stops sending.
      body?.destroy();
    }
  });
  ipcMain.handle('apargon', async (event, call: string, ...args: unknown[]) => {
    try {
      return { value: await handlerOf(pappBySender.get(event.sender.id)!.papp, call)(...args) };
    } catch (err) {
      return { error: (err as Error).message, code: (err as NodeJS.ErrnoException).code };
    }
  });

  return {
    enable(win: BrowserWindow, options: BrowserWindowConstructorOptions) {
      const papp = windowPapp(dir, permissions, scope, win, pappWide, options);
      const id = win.webContents.id;
      pappBySender.set(id, { papp, token: randomUUID() });
      win.on('closed', () => {
        pappBySender.delete(id);
        void papp.reset().catch((err: Error) => console.error(`Apargon: ${err.message}`));
      });
    },
    // The window whose listener it is answers; the others have no such server.
    request(incoming: IncomingRequest) {
      pappBySender.forEach(({ papp }) => papp.request(incoming));
    },
    programExit,
  };
}

// window.papp in the window is a mirror of this object.
function windowPapp(dir: string, permissions: Permissions, scope: Scope, win: BrowserWindow, { menus, pappIcon, proxy, pickShortcuts, picks, programsHere }: PappWide, options: BrowserWindowConstructorOptions) {
  const files = fileApi(dir, scope, win, picks);
  const programs = programApi(permissions, programsHere, proxy, scope, win);
  const pappWindow = windowApi(permissions, scope, win, menus, options);
  const listeners = listenApi(win.webContents);
  const connections = connectionApi(win.webContents, proxy);
  const system = systemApi(permissions, scope, win);

  return {
    ...files,
    ...programs,
    ...pappWindow,
    ...listeners,
    ...connections,
    ...system,
    ...secrets,
    notify: notifyApi(permissions, pappIcon),
    tray,
    shortcuts: pickShortcuts,
    // The trampoline started this process with the papp-env names.
    env(name: string) {
      if (!permissions.env.includes(name)) {
        throw new Error(`Apargon: this .papp file may not read ${name}. Ask for it with <meta name="papp-env" content="${name}">.`);
      }

      return process.env[name] ?? null;
    },
    // On each load of the .papp file, and when its window closes: nothing the load before it started outlives it.
    async reset() {
      files.reset();
      programs.reset();
      pappWindow.reset();
      const listenersClosed = listeners.reset();
      connections.reset();
      system.reset();
      await listenersClosed;
    },
  };
}
