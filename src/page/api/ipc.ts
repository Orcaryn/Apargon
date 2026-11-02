import { ipcMain, type BrowserWindow } from 'electron';
import remote from '@electron/remote/main/index.js';
import { randomUUID } from 'crypto';
import type { Permissions } from '../../permissions/tags.ts';
import { tellTrampoline, type PageReply } from '../../shared/channel.ts';
import type { pageAccess } from './access.ts';
import { pageApi } from './api.ts';

export function serveApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess> | null, toFront: () => void) {
  // The trampoline shows the dialog and writes: this process may not write where the user picks.
  const savesWaiting = new Map<string, { resolve: (paths: string[]) => void; reject: (err: Error) => void }>();
  const saveAs = (files: Record<string, string | Uint8Array>) =>
    new Promise<string[]>((resolve, reject) => {
      const id = randomUUID();
      const encoded = Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data).toString('base64') }));
      savesWaiting.set(id, { resolve, reject });
      tellTrampoline({ saveAs: { id, files: encoded } });
    });
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
        const api = pageApi(dir, permissions, access, win, toFront, saveAs);
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
    saved(reply: Extract<PageReply, { saved: string }>) {
      const { resolve, reject } = savesWaiting.get(reply.saved)!;
      savesWaiting.delete(reply.saved);

      if ('paths' in reply) {
        resolve(reply.paths);
      } else {
        reject(new Error(reply.error));
      }
    },
  };
}
