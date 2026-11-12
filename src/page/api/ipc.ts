import { ipcMain, protocol, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { Permissions } from '../../permissions/tags.ts';
import type { IncomingRequest } from '../../shared/channel.ts';
import type { pageAccess } from './access.ts';
import { pageApi, type PageProcess } from './api.ts';

// Bytes between a window and this process go as requests to this scheme, not as messages: Chromium streams a request's body and its answer, and makes the faster side wait. Registered before the app is ready.
export const BYTES_SCHEME = 'papp-bytes';

// Every .papp file gets papp, a papp-system one too.
export function serveApi(dir: string, own: string, permissions: Permissions, access: ReturnType<typeof pageAccess>, shared: PageProcess) {
  // token: what the window's preload shows to use the scheme. A frame in the window has no preload, so no token, and no papp.
  const apiBySender = new Map<number, { api: ReturnType<typeof pageApi>; token: string }>();
  ipcMain.on('apargon-dir', event => (event.returnValue = { dir, folder: own, token: apiBySender.get(event.sender.id)!.token }));
  // papp-bytes://<token>/<call>?args=<JSON list>. A request with a body hands it to the call as a stream, before the arguments. A call that gives a stream answers with its bytes, any other with its value.
  protocol.handle(BYTES_SCHEME, async request => {
    const url = new URL(request.url);
    const call = url.pathname.slice(1);
    const api = [...apiBySender.values()].find(({ token }) => token === url.host)?.api;
    const body = request.body && Readable.fromWeb(request.body);

    try {
      if (!api || !Object.hasOwn(api, call)) {
        throw new Error(`Apargon: no such call ${call}.`);
      }

      const handler = api[call as keyof typeof api] as (...args: unknown[]) => unknown;
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
    const { api } = apiBySender.get(event.sender.id)!;

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
      apiBySender.set(id, { api, token: randomUUID() });
      win.on('closed', () => {
        apiBySender.delete(id);
        void api.reset().catch((err: Error) => console.error(`Apargon: ${err.message}`));
      });
    },
    // The window whose listener it is answers; the others have no such server.
    request(incoming: IncomingRequest) {
      apiBySender.forEach(({ api }) => api.request(incoming));
    },
  };
}
