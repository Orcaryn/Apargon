import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, net as electronNet, session } from 'electron';
import remote from '@electron/remote/main/index.js';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import readline from 'readline';
import { describe } from '../permissions/describe.ts';
import { HOME, type Use } from '../permissions/tags.ts';
import { PAGE_FILE } from '../permissions/patterns.ts';
import { APP_ROOT, GRANTS_FILE, PARENT_FD, readJson, realPath, relay, tellTrampoline, type ChildConfig, type Grants, type ParentMessage } from '../shared.ts';
import { pageAccess } from './access.ts';
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
      return new Response(`Apargon: this page may not see ${file}\n`, { status: 403 });
    } else if (PAGE_FILE.test(file)) {
      const html = fs.readFileSync(file);

      if (file === page && pageHash && createHash('sha256').update(html).digest('hex') !== pageHash) {
        return new Response('Apargon: this page changed since you allowed it. Reopen it to be asked again.\n', { status: 409 });
      }

      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  const webPermissions: Partial<Record<Use, string>> = { clipboard: 'clipboard-read', location: 'geolocation', camera: 'media:video', microphone: 'media:audio', screen: 'display-capture' };
  const allowed = ['clipboard-sanitized-write', 'fullscreen', 'pointerLock', ...permissions.use.flatMap(name => webPermissions[name] ?? [])];
  pageSession.setPermissionRequestHandler((_contents, permission, answer, details) => {
    const asked = permission === 'media' && 'mediaTypes' in details ? (details.mediaTypes ?? []).map(type => `media:${type}`) : [permission];
    answer(asked.length > 0 && asked.every(name => allowed.includes(name)));
  });
  pageSession.setPermissionCheckHandler((_contents, permission, _origin, details) => allowed.includes(permission === 'media' ? `media:${details.mediaType}` : permission));

  if (permissions.use.includes('screen')) {
    pageSession.setDisplayMediaRequestHandler(async (_request, answer) => {
      const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
      answer({ video: screen });
    });
  }

  installMenu(page, describe(permissions), Object.keys(readJson<Grants>(GRANTS_FILE)));

  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const webSecurity = !permissions.net.length;
  const webPreferences: Electron.WebPreferences = access
    ? { session: pageSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload: path.join(import.meta.dirname, 'preload.cjs') }
    : { session: pageSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity, preload: path.join(import.meta.dirname, 'node-preload.cjs') };
  const win = new BrowserWindow({ width: 1200, height: 800, icon, webPreferences });
  const pageWindows = () => BrowserWindow.getAllWindows().filter(other => other.webContents.session === pageSession);

  const toFront = () => {
    const [front] = pageWindows();
    front?.show();
    front?.focus();
  };

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

  const isPage = (href: string) => {
    const url = new URL(href);

    return url.protocol === 'file:' && decodeURIComponent(url.pathname) === page;
  };

  const stayOnPage = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    if (!isPage(event.url) && (event.isMainFrame || new URL(event.url).protocol === 'file:')) {
      event.preventDefault();
    }
  };

  const setUpWindow = (opened: BrowserWindow) => {
    opened.webContents.on('will-frame-navigate', stayOnPage);
    opened.webContents.on('will-redirect', stayOnPage);
    opened.webContents.setWindowOpenHandler(({ url }) => (isPage(url) ? { action: 'allow', overrideBrowserWindowOptions: { icon, webPreferences } } : { action: 'deny' }));
    opened.webContents.on('did-create-window', setUpWindow);
    opened.webContents.setAudioMuted(!permissions.use.includes('sound'));

    if (permissions.net.length) {
      opened.on('page-title-updated', (event, title) => {
        event.preventDefault();
        opened.setTitle(`${title} · ${permissions.net.join(' ')}`);
      });
    }

    if (access) {
      const api = pageApi(dir, permissions, access, opened, toFront, saveAs);
      const id = opened.webContents.id;
      apiBySender.set(id, api as Record<string, (...args: unknown[]) => unknown>);
      opened.on('closed', () => {
        api.reset();
        apiBySender.delete(id);
      });
    } else {
      remote.enable(opened.webContents);
    }
  };

  setUpWindow(win);
  followFavicon(win, canSee, pageHash === null);
  win.loadFile(page);

  for (const keys of permissions.shortcuts) {
    globalShortcut.register(keys, () => {
      toFront();
      pageWindows().forEach(other => other.webContents.send('apargon-shortcut', keys));
    });
  }

  readline.createInterface({ input: new net.Socket({ fd: PARENT_FD, writable: false }) }).on('line', line => {
    const message = JSON.parse(line) as ParentMessage;

    if ('trayClick' in message) {
      toFront();
    } else {
      const { resolve, reject } = savesWaiting.get(message.saved)!;
      savesWaiting.delete(message.saved);

      if ('paths' in message) {
        resolve(message.paths);
      } else {
        reject(new Error(message.error));
      }
    }
  });

  let pendingReload: NodeJS.Timeout | undefined = undefined;
  fs.watch(dir, { recursive: dir !== HOME && dir !== '/' }, (_event, name) => {
    if (!name || !/\.(papp|css|js)$/.test(name) || /(^|\/)(\.[^/]*|node_modules)(\/|$)/.test(name)) {
      return;
    }

    clearTimeout(pendingReload);
    pendingReload = setTimeout(() => pageWindows().forEach(other => other.webContents.reloadIgnoringCache()), 100);
  });
}
