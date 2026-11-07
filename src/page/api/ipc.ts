import { ipcMain, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { IncomingRequest } from '../../shared/channel.ts';
import type { pageAccess } from './access.ts';
import { pageApi, type PageProcess } from './api.ts';

// Every page gets papp, a papp-system page too: its own process reads every file, but through papp it gets what its tags name.
export function serveApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess>, shared: PageProcess) {
  const apiBySender = new Map<number, ReturnType<typeof pageApi>>();
  ipcMain.on('apargon-dir', event => (event.returnValue = dir));
  ipcMain.handle('apargon', async (event, call: string, ...args: unknown[]) => {
    const api = apiBySender.get(event.sender.id)!;

    try {
      if (!Object.hasOwn(api, call)) {
        throw new Error(`Apargon: no such call ${call}.`);
      }

      // The dynamic cast belongs only at the renderer's untyped IPC boundary.
      const handler = api[call as keyof typeof api] as (...args: unknown[]) => unknown;

      return { value: await handler(...args) };
    } catch (err) {
      return { error: (err as Error).message, code: (err as NodeJS.ErrnoException).code };
    }
  });

  return {
    enable(win: BrowserWindow, options: BrowserWindowConstructorOptions) {
      const api = pageApi(dir, permissions, access, win, shared, options);
      const id = win.webContents.id;
      apiBySender.set(id, api);
      win.on('closed', () => {
        apiBySender.delete(id);
        void api.reset().catch((err: Error) => console.error(`Apargon: ${err.message}`));
      });
    },
    // The window whose listener it is answers; the others have no such server.
    request(incoming: IncomingRequest) {
      apiBySender.forEach(api => api.request(incoming));
    },
  };
}
