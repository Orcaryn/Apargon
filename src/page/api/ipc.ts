import { ipcMain, type BrowserWindow } from 'electron';
import remote from '@electron/remote/main/index.js';
import type { Permissions } from '../../permissions/tags.ts';
import type { IncomingRequest } from '../../shared/channel.ts';
import type { pageAccess } from './access.ts';
import { pageApi, type PageProcess } from './api.ts';

export function serveApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess> | null, shared: PageProcess) {
  const apiBySender = new Map<number, Record<string, (...args: unknown[]) => unknown>>();

  if (access) {
    ipcMain.on('apargon-dir', event => (event.returnValue = dir));
    ipcMain.handle('apargon', async (event, call: string, ...args: unknown[]) => {
      const api = apiBySender.get(event.sender.id)!;

      try {
        if (!Object.hasOwn(api, call)) {
          throw new Error(`Apargon: no such call ${call}.`);
        }

        return { value: await api[call](...args) };
      } catch (err) {
        return { error: (err as Error).message, code: (err as NodeJS.ErrnoException).code };
      }
    });
  } else {
    remote.initialize();
  }

  return {
    enable(win: BrowserWindow) {
      if (access) {
        const api = pageApi(dir, permissions, access, win, shared);
        const id = win.webContents.id;
        apiBySender.set(id, api as Record<string, (...args: unknown[]) => unknown>);
        win.on('closed', () => {
          api.reset();
          apiBySender.delete(id);
        });
      } else {
        remote.enable(win.webContents);
      }
    },
    // The window whose listener it is answers; the others have no such server.
    request(incoming: IncomingRequest) {
      apiBySender.forEach(api => api.request(incoming));
    },
  };
}
