// Sandboxed child: no network. Opens the page and answers its window.papp calls.

import { app, BrowserWindow, ipcMain, net as electronNet, protocol, session } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe } from '../permissions/describe.ts';
import { HOME } from '../permissions/tags.ts';
import { APP_ROOT, GRANTS_FILE, PAGE_FILE, relay, type ChildConfig, type Grants } from '../shared.ts';
import { pageAccess, realPath } from './access.ts';
import { pageApi } from './api.ts';
import { followFavicon } from './icon.ts';
import { installMenu } from './menu.ts';

export async function showPage({ page, permissions, pageHash, bridges }: ChildConfig) {
  // Linux: the proxy and the declared ports on this computer, at their own numbers on this sandbox's loopback.
  await Promise.all(bridges.map(({ port, socket }) => relay({ port, host: '127.0.0.1' }, { path: socket })));

  const dir = path.dirname(page);
  const access = permissions.node ? null : pageAccess(permissions);
  const canSee = (file: string) => access === null || file === page || access.canSee(file);

  // Every file: request, the page's own scripts and images included, comes through here.
  protocol.handle('file', request => {
    const file = realPath(decodeURIComponent(new URL(request.url).pathname));

    if (!canSee(file)) {
      return new Response(`papp: this page may not see ${file}\n`, { status: 403 });
    } else if (PAGE_FILE.test(file)) {
      const html = fs.readFileSync(file);

      // A downloaded page runs only as allowed, reloads included.
      if (file === page && pageHash && createHash('sha256').update(html).digest('hex') !== pageHash) {
        return new Response('papp: this page changed since you allowed it. Reopen it to be asked again.\n', { status: 409 });
      }

      // Chromium does not know .papp and would offer it as a download. Serve it as HTML.
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  // Electron grants every request it is not told about: camera, microphone, screen,
  // clipboard reading, notifications. A page gets three that show it nothing.
  const harmless = ['clipboard-sanitized-write', 'fullscreen', 'pointerLock'];
  session.defaultSession.setPermissionRequestHandler((_contents, permission, answer) => answer(harmless.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => harmless.includes(permission));

  const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  installMenu(page, describe(permissions), Object.keys(grants));

  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png'); // else Electron's logo shows

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
      ? { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload: path.join(import.meta.dirname, 'preload.cjs') }
      : { nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity },
  });

  if (access) {
    // A watch can fire after the window closed, before the app quits.
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

  followFavicon(win, canSee);
  win.loadFile(page);

  // The window stays on the page: another file, in it or in a frame, would run with this page's
  // permissions. A frame may still show a declared host, which cannot reach the page.
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

  // Reload on save, once per burst: editors write a temp file and rename, builds touch many
  // files. Subfolders count, except hidden ones and node_modules; a page sitting in the home
  // or root folder gets its own folder only. Tags are not re-read; new ones need the page reopened.
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
