import { app, BrowserWindow, ipcMain, net as electronNet, session } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe } from '../permissions/describe.ts';
import { HOME } from '../permissions/tags.ts';
import { PAGE_FILE } from '../permissions/patterns.ts';
import { APP_ROOT, GRANTS_FILE, relay, type ChildConfig, type Grants } from '../shared.ts';
import { pageAccess, realPath } from './access.ts';
import { pageApi } from './api.ts';
import { followFavicon } from './icon.ts';
import { installMenu } from './menu.ts';

export async function showPage({ page, permissions, pageHash, bridges }: ChildConfig) {
  await Promise.all(bridges.map(({ port, socket }) => relay({ port, host: '127.0.0.1' }, { path: socket })));

  const dir = path.dirname(page);
  const access = permissions.node ? null : pageAccess(permissions);
  const canSee = (file: string) => access === null || file === page || access.canSee(file);
  const pageSession = session.fromPartition(`persist:${createHash('sha256').update(page).digest('hex')}`);

  pageSession.protocol.handle('file', request => {
    const file = realPath(decodeURIComponent(new URL(request.url).pathname));

    if (!canSee(file)) {
      return new Response(`papp: this page may not see ${file}\n`, { status: 403 });
    } else if (PAGE_FILE.test(file)) {
      const html = fs.readFileSync(file);

      if (file === page && pageHash && createHash('sha256').update(html).digest('hex') !== pageHash) {
        return new Response('papp: this page changed since you allowed it. Reopen it to be asked again.\n', { status: 409 });
      }

      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  // Electron grants any permission request it has no handler for.
  const harmless = ['clipboard-sanitized-write', 'fullscreen', 'pointerLock'];
  pageSession.setPermissionRequestHandler((_contents, permission, answer) => answer(harmless.includes(permission)));
  pageSession.setPermissionCheckHandler((_contents, permission) => harmless.includes(permission));

  const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  installMenu(page, describe(permissions), Object.keys(grants));

  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  // CORS is off when a page may reach servers: the host list is the boundary.
  const webSecurity = !permissions.net.length;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon,
    webPreferences: access
      ? { session: pageSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload: path.join(import.meta.dirname, 'preload.cjs') }
      : { session: pageSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity },
  });

  if (access) {
    const api = pageApi(dir, permissions, access, (id, file) => !win.isDestroyed() && win.webContents.send('papp-change', id, file)) as Record<string, (...args: unknown[]) => unknown>;
    ipcMain.on('papp-dir', event => (event.returnValue = dir));
    ipcMain.handle('papp', async (_event, call: string, ...args: unknown[]) => {
      try {
        if (!Object.hasOwn(api, call)) {
          throw new Error(`papp: no such call ${call}.`);
        }

        return { value: await api[call](...args) };
      } catch (err) {
        return { error: (err as Error).message, code: (err as NodeJS.ErrnoException).code };
      }
    });
  }

  followFavicon(win, canSee, pageHash === null);
  win.loadFile(page);

  const stayOnPage = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    const url = new URL(event.url);
    const isPage = url.protocol === 'file:' && decodeURIComponent(url.pathname) === page;

    if (!isPage && (event.isMainFrame || url.protocol === 'file:')) {
      event.preventDefault();
    }
  };

  win.webContents.on('will-frame-navigate', stayOnPage);
  win.webContents.on('will-redirect', stayOnPage);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (permissions.net.length) {
    win.on('page-title-updated', (event, title) => {
      event.preventDefault();
      win.setTitle(`${title} · ${permissions.net.join(' ')}`);
    });
  }

  let pendingReload: NodeJS.Timeout | undefined = undefined;
  const watcher = fs.watch(dir, { recursive: dir !== HOME && dir !== '/' }, (_event, name) => {
    if (!name || !/\.(papp|css|js)$/.test(name) || /(^|\/)(\.[^/]*|node_modules)(\/|$)/.test(name)) {
      return;
    }

    clearTimeout(pendingReload);
    pendingReload = setTimeout(() => win.webContents.reloadIgnoringCache(), 100);
  });
  win.on('closed', () => {
    clearTimeout(pendingReload);
    watcher.close();
  });
}
