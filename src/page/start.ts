import { app, BrowserWindow, dialog, globalShortcut, powerMonitor, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe } from '../permissions/describe.ts';
import { shortcut, windowSettings, type WindowSettings } from '../permissions/tags.ts';
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
  // A papp-system page's process sees every file; its papp, what the tags name, as any page's.
  const access = pageAccess(permissions);
  const canSee = (file: string) => permissions.system || file === page || access.canSee(file);
  const pageSession = createPageSession(page, permissions, pageHash, canSee, liveReload(page, access, () => pageWindows().forEach(other => other.webContents.reloadIgnoringCache())));
  const menus = installMenu(page, describe(permissions), menu);
  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const webSecurity = !permissions.net.length;
  const preload = path.join(import.meta.dirname, 'api', 'preload', 'preload.cjs');
  const webPreferences: Electron.WebPreferences =
    permissions.system ?
      { session: pageSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity, preload }
    : { session: pageSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload };
  const declared = permissions.window ?? {};
  const { onTop = false, allSpaces = false, private: privateWindow = false, dock = true, mark = true } = declared;
  // How a window looks, from papp-window settings. What is not in it, the tag alone decides. Without a title bar the OS still draws the window's buttons over the page.
  // blur: what is behind the window shows through the page's transparent parts, blurred: vibrancy on macOS, acrylic on Windows 11; Linux ignores both.
  const windowOptions = ({ width = 1200, height = 800, minWidth, minHeight, resizable = true, titleBar = true, frame = true, transparent = false, blur = false }: WindowSettings): Electron.BrowserWindowConstructorOptions => ({
    width,
    height,
    minWidth,
    minHeight,
    resizable,
    frame,
    transparent,
    ...(blur && { vibrancy: 'under-window', backgroundMaterial: 'acrylic', backgroundColor: '#00000000' }),
    alwaysOnTop: onTop,
    titleBarStyle: titleBar ? 'default' : 'hidden',
    titleBarOverlay: !titleBar,
    // The taskbar's dock=no, on Windows; macOS hides the dock icon below.
    skipTaskbar: !dock,
    icon,
    webPreferences,
  });
  // Where the user left the window, while that is still on a screen. A fixed size stays as declared.
  const saved = bounds && screen.getAllDisplays().some(({ workArea: area }) => bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y) ? bounds : null;
  const mainOptions = windowOptions(declared);
  const win = new BrowserWindow({ ...mainOptions, ...(saved && (mainOptions.resizable ? saved : { x: saved.x, y: saved.y })) });
  win.on('close', () => tellTrampoline('bounds', win.getNormalBounds()));
  PAGE_PLATFORM.pin?.(win, page);
  const pageIcon = followFavicon(win, canSee, pageHash === null, mark);
  const pageWindows = () => BrowserWindow.getAllWindows().filter(other => other.webContents.session === pageSession);
  const background = permissions.use.includes('background');
  let quitting = false;
  app.on('before-quit', () => (quitting = true));

  const toFront = () => {
    const [front] = pageWindows();
    front?.show();
    front?.focus();
  };

  // A global shortcut brings the page forward and tells each of its windows.
  const shortcutPressed = (keys: string) => () => {
    toFront();
    pageWindows().forEach(other => other.webContents.send('apargon-shortcut', keys));
  };

  for (const keys of permissions.shortcuts) {
    globalShortcut.register(keys, shortcutPressed(keys));
  }

  // papp.shortcuts: the page's, not a window's, until it picks others or quits. Each is checked as a papp-global-shortcut tag is; the tag's own stay on.
  let picked: string[] = [];

  const pickShortcuts = (keys: string[]) => {
    if (!permissions.anyShortcut) {
      throw new Error('Apargon: this page may not pick shortcuts. Ask for it with <meta name="papp-global-shortcut" content="any">.');
    } else if (!Array.isArray(keys) || keys.length > 10) {
      throw new Error('Apargon: shortcuts takes a list of up to 10 keys, such as ["CommandOrControl+Shift+N"].');
    }

    const checked = new Set(keys.map(each => shortcut(String(each))));
    picked.forEach(old => globalShortcut.unregister(old));
    picked = [...checked].filter(each => !permissions.shortcuts.includes(each));

    for (const each of picked) {
      if (!globalShortcut.register(each, shortcutPressed(each))) {
        picked.forEach(old => globalShortcut.unregister(old));
        picked = [];

        throw new Error(`Apargon: another app holds ${each}. Pick other keys.`);
      }
    }
  };

  const api = serveApi(dir, permissions, access, { menus, toFront, pageIcon, proxy, pickShortcuts });
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
    // window.open on the page itself opens a second window, with the tag's settings and its own on top, such as 'size=320x80, frame=no'.
    opened.webContents.setWindowOpenHandler(({ url, features }) => {
      if (!isPage(url)) {
        tellTrampoline('openLink', url);

        return { action: 'deny' };
      }

      try {
        return { action: 'allow', overrideBrowserWindowOptions: windowOptions({ ...declared, ...(features ? windowSettings(features) : {}) }) };
      } catch (err) {
        console.error(`Apargon: window.open: ${(err as Error).message}`);

        return { action: 'deny' };
      }
    });
    opened.webContents.on('did-create-window', setUpWindow);
    opened.webContents.setAudioMuted(!permissions.use.includes('sound'));
    // Windows tells a window, not powerMonitor, that the session ends.
    opened.on('session-end', () => opened.webContents.send('apargon-system', 'shutdown'));

    // Not a window option Electron takes: set on each window, the page's second ones too. Only when on: on macOS each call hides the window a moment.
    if (allSpaces) {
      opened.setVisibleOnAllWorkspaces(true);
    }

    if (privateWindow) {
      opened.setContentProtection(true);
    }

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

  // dock=no needs papp-use background, so its tray icon stays.
  if (!dock) {
    app.dock?.hide();
  }

  // shutdown: on macOS and Linux; the page gets the event, not time: Apargon does not hold the shutdown back.
  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery', 'shutdown']) {
    (powerMonitor as NodeJS.EventEmitter).on(event, () => pageWindows().forEach(other => other.webContents.send('apargon-system', event)));
  }

  onTrampolineEvent({
    show: toFront,
    quit: () => app.quit(),
    refreshMenu: state => menus.refresh(state),
    trayItem: id => pageWindows().forEach(other => other.webContents.send('apargon-tray', id)),
    // Where the icon is, so the page can put a window under it.
    trayClick: bounds => pageWindows().forEach(other => other.webContents.send('apargon-tray-click', bounds)),
    restart: () => {
      pageWindows().forEach(other => other.webContents.once('will-prevent-unload', event => event.preventDefault()));
      app.quit();
    },
    request: incoming => api.request(incoming),
  });
}

// Live reload: an edit to a .papp, .css or .js file the page loaded reloads its windows; a file the page may change itself does not, or every save would reload it.
// Folders are watched, not files: an editor that saves by replacing a file would end a watch on it.
function liveReload(page: string, access: ReturnType<typeof pageAccess>, reload: () => void) {
  const loaded = new Set<string>();
  const watched = new Set<string>();
  let pendingReload: NodeJS.Timeout | undefined = undefined;

  // A folder whose watch fails leaves the set, so the next load from it tries again; the load itself goes on.
  const stopWatching = (folder: string, err: Error) => {
    watched.delete(folder);
    console.error(`Apargon: live reload stopped for ${folder} (${err.message}). Reload the page to try again.`);
  };

  return (file: string) => {
    if (!/\.(papp|css|js)$/.test(file) || (file !== page && access.canChange(file))) {
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
