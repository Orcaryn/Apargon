import { app, BrowserWindow, dialog, globalShortcut, powerMonitor, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe } from '../permissions/describe.ts';
import { HOME } from '../permissions/paths.ts';
import { onTrampolineEvent, relay, tellTrampoline, type PageConfig } from '../shared/channel.ts';
import { APP_ROOT, pageStorage } from '../shared/data.ts';
import { pageAccess } from './api/access.ts';
import { serveApi } from './api/ipc.ts';
import { followFavicon } from './icon/icon.ts';
import { installMenu } from './menu.ts';
import { PAGE_PLATFORM } from './platform.ts';
import { createPageSession } from './session.ts';

export function preparePage({ page, proxy }: PageConfig) {
  app.setPath('userData', pageStorage(page));

  if (proxy) {
    app.commandLine.appendSwitch('proxy-server', proxy);
  }

  PAGE_PLATFORM.beforeReady?.(page);
  app.on('window-all-closed', () => app.quit());
}

export async function startPage({ page, permissions, pageHash, proxy, bridges, bounds, menu }: PageConfig) {
  if (!(await PAGE_PLATFORM.isOffline())) {
    const refusal = 'This process can still open sockets, so it is not in the sandbox. Refusing to open the page. If APARGON is set in your environment, unset it.';
    console.error(`Apargon: ${refusal}`);
    dialog.showErrorBox('Apargon', refusal);
    app.quit();

    return;
  }

  await Promise.all(bridges.map(({ port, socket }) => relay({ port, host: '127.0.0.1' }, { path: socket })));

  const dir = path.dirname(page);
  const access = permissions.system ? null : pageAccess(permissions);
  const canSee = (file: string) => access === null || file === page || access.canSee(file);
  const pageSession = createPageSession(page, permissions, pageHash, canSee);
  const menus = installMenu(page, describe(permissions), menu);
  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const webSecurity = !permissions.net.length;
  const webPreferences: Electron.WebPreferences = access
    ? { session: pageSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload: path.join(import.meta.dirname, 'api', 'preload', 'preload.cjs') }
    : { session: pageSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity, preload: path.join(import.meta.dirname, 'api', 'preload', 'node-preload.cjs') };
  const { width = 1200, height = 800, minWidth, minHeight, resizable = true, titleBar = true, frame = true, transparent = false, onTop = false } = permissions.window ?? {};
  // Without a title bar the OS still draws the window's buttons over the page.
  const windowOptions: Electron.BrowserWindowConstructorOptions = { width, height, minWidth, minHeight, resizable, frame, transparent, alwaysOnTop: onTop, titleBarStyle: titleBar ? 'default' : 'hidden', titleBarOverlay: !titleBar, icon, webPreferences };
  // Where the user left the window, while that is still on a screen. A fixed size stays as declared.
  const saved = bounds && screen.getAllDisplays().some(({ workArea: area }) => bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y) ? bounds : null;
  const win = new BrowserWindow({ ...windowOptions, ...(saved && (resizable ? saved : { x: saved.x, y: saved.y })) });
  win.on('close', () => tellTrampoline('bounds', win.getNormalBounds()));
  PAGE_PLATFORM.pin?.(win, page);
  const pageIcon = followFavicon(win, canSee, pageHash === null);
  const pageWindows = () => BrowserWindow.getAllWindows().filter(other => other.webContents.session === pageSession);
  const background = permissions.use.includes('background');
  let quitting = false;
  app.on('before-quit', () => (quitting = true));

  const toFront = () => {
    const [front] = pageWindows();
    front?.show();
    front?.focus();
  };

  const api = serveApi(dir, permissions, access, { menus, toFront, pageIcon, proxy });
  const pageUrl = pathToFileURL(page);

  const isPage = (href: string) => {
    const url = new URL(href);

    return url.protocol === 'file:' && !url.host && decodeURIComponent(url.pathname) === decodeURIComponent(pageUrl.pathname);
  };

  const stayOnPage = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    if (!isPage(event.url) && (event.isMainFrame || new URL(event.url).protocol === 'file:')) {
      event.preventDefault();

      if (event.isMainFrame) {
        tellTrampoline('openLink', event.url);
      }
    }
  };

  const setUpWindow = (opened: BrowserWindow) => {
    opened.webContents.on('will-frame-navigate', stayOnPage);
    opened.webContents.on('will-redirect', stayOnPage);
    opened.webContents.setWindowOpenHandler(({ url }) => {
      if (isPage(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: windowOptions };
      }

      tellTrampoline('openLink', url);

      return { action: 'deny' };
    });
    opened.webContents.on('did-create-window', setUpWindow);
    opened.webContents.setAudioMuted(!permissions.use.includes('sound'));
    // In the background the last window hides instead of closing; the tray icon shows it again or quits.
    opened.on('close', event => {
      if (background && !quitting && pageWindows().filter(other => other.isVisible()).length === 1) {
        event.preventDefault();
        opened.hide();
      }
    });

    api.enable(opened);
  };

  setUpWindow(win);
  win.loadFile(page);

  if (background) {
    app.on('activate', toFront);
  }

  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery']) {
    (powerMonitor as NodeJS.EventEmitter).on(event, () => pageWindows().forEach(other => other.webContents.send('apargon-system', event)));
  }

  for (const keys of permissions.shortcuts) {
    globalShortcut.register(keys, () => {
      toFront();
      pageWindows().forEach(other => other.webContents.send('apargon-shortcut', keys));
    });
  }

  onTrampolineEvent({
    show: toFront,
    quit: () => app.quit(),
    refreshMenu: state => menus.refresh(state),
    trayItem: id => pageWindows().forEach(other => other.webContents.send('apargon-tray', id)),
    restart: () => {
      pageWindows().forEach(other => other.webContents.once('will-prevent-unload', event => event.preventDefault()));
      app.quit();
    },
    request: incoming => api.request(incoming),
  });

  let pendingReload: NodeJS.Timeout | undefined = undefined;
  const edits = fs.watch(dir, { recursive: dir !== HOME && dir !== path.parse(dir).root }, (_event, name) => {
    if (!name || !/\.(papp|css|js)$/.test(name) || /(^|[\\/])(\.[^\\/]*|node_modules)([\\/]|$)/.test(name)) {
      return;
    }

    clearTimeout(pendingReload);
    pendingReload = setTimeout(() => pageWindows().forEach(other => other.webContents.reloadIgnoringCache()), 100);
  });
  // On Linux a recursive watch can run out of inotify watches in a large folder; the page then no longer reloads on an edit.
  edits.on('error', err => {
    console.error(`Apargon: live reload stopped (${err.message}). Reopen the page after an edit.`);
    edits.close();
  });
}
