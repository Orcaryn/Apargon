import { app, BrowserWindow, dialog, globalShortcut, powerMonitor, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe } from '../permissions/describe.ts';
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
  const pageSession = createPageSession(page, permissions, pageHash, canSee, liveReload(page, access, () => pageWindows().forEach(other => other.webContents.reloadIgnoringCache())));
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
  const pagePath = decodeURIComponent(pathToFileURL(page).pathname);

  const isPage = (href: string) => {
    const url = new URL(href);

    try {
      return url.protocol === 'file:' && !url.host && decodeURIComponent(url.pathname) === pagePath;
    } catch {
      // A bad escape such as %zz names no file. Throwing instead would skip stayOnPage's preventDefault.
      return false;
    }
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
  void win.loadFile(page);

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
}

// Live reload: an edit to a .papp, .css or .js file the page loaded reloads its windows; a file the page may change itself does not, or every save would reload it.
// Folders are watched, not files: an editor that saves by replacing a file would end a watch on it.
function liveReload(page: string, access: ReturnType<typeof pageAccess> | null, reload: () => void) {
  const loaded = new Set<string>();
  const watched = new Set<string>();
  let pendingReload: NodeJS.Timeout | undefined = undefined;

  // A folder whose watch fails leaves the set, so the next load from it tries again; the load itself goes on.
  const stopWatching = (folder: string, err: Error) => {
    watched.delete(folder);
    console.error(`Apargon: live reload stopped for ${folder} (${err.message}). Reload the page to try again.`);
  };

  return (file: string) => {
    if (!/\.(papp|css|js)$/.test(file) || (file !== page && access?.canChange(file))) {
      return;
    }

    loaded.add(file);
    const folder = path.dirname(file);

    if (watched.has(folder)) {
      return;
    }

    watched.add(folder);

    try {
      fs.watch(folder, (_event, name) => {
        if (name && loaded.has(path.join(folder, name))) {
          clearTimeout(pendingReload);
          pendingReload = setTimeout(reload, 100);
        }
      }).on('error', err => stopWatching(folder, err));
    } catch (err) {
      stopWatching(folder, err as Error);
    }
  };
}
