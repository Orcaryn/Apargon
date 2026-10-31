import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe } from '../permissions/describe.ts';
import { HOME } from '../permissions/paths.ts';
import { onTrampolineReply, relay, tellTrampoline, type PageConfig } from '../shared/channel.ts';
import { APP_ROOT, GRANTS_FILE, LINKS_FILE, PAGE_DATA, readJson, type Grants, type Links } from '../shared/data.ts';
import { pageAccess } from './api/access.ts';
import { serveApi } from './api/ipc.ts';
import { followFavicon } from './icon/icon.ts';
import { installMenu } from './menu.ts';
import { PAGE_PLATFORM } from './platform.ts';
import { createPageSession } from './session.ts';

// Before the app is ready: the page process keeps its own data, reaches the network only through the proxy, and quits with its last window.
export function preparePage({ proxy }: PageConfig) {
  app.setPath('userData', PAGE_DATA);

  if (proxy) {
    app.commandLine.appendSwitch('proxy-server', proxy);
  }

  PAGE_PLATFORM.beforeReady?.();
  app.on('window-all-closed', () => app.quit());
}

export async function startPage({ page, permissions, pageHash, bridges }: PageConfig) {
  if (!(await PAGE_PLATFORM.isOffline())) {
    const refusal = 'This process can still open sockets, so it is not in the sandbox. Refusing to open the page. If APARGON is set in your environment, unset it.';
    console.error(`Apargon: ${refusal}`);
    dialog.showErrorBox('Apargon', refusal);
    app.quit();

    return;
  }

  await Promise.all(bridges.map(({ port, socket }) => relay({ port, host: '127.0.0.1' }, { path: socket })));

  const dir = path.dirname(page);
  const access = permissions.node ? null : pageAccess(permissions);
  const canSee = (file: string) => access === null || file === page || access.canSee(file);
  const pageSession = createPageSession(page, permissions, pageHash, canSee);

  installMenu(page, describe(permissions), Object.keys({ ...readJson<Links>(LINKS_FILE), ...readJson<Grants>(GRANTS_FILE) }));

  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const webSecurity = !permissions.net.length;
  const webPreferences: Electron.WebPreferences = access
    ? { session: pageSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload: path.join(import.meta.dirname, 'api', 'preload', 'preload.cjs') }
    : { session: pageSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity, preload: path.join(import.meta.dirname, 'api', 'preload', 'node-preload.cjs') };
  const win = new BrowserWindow({ width: 1200, height: 800, icon, webPreferences });
  const pageWindows = () => BrowserWindow.getAllWindows().filter(other => other.webContents.session === pageSession);

  const toFront = () => {
    const [front] = pageWindows();
    front?.show();
    front?.focus();
  };

  const api = serveApi(dir, permissions, access, toFront);
  const pageUrl = pathToFileURL(page);

  const isPage = (href: string) => {
    const url = new URL(href);

    return url.protocol === 'file:' && !url.host && decodeURIComponent(url.pathname) === decodeURIComponent(pageUrl.pathname);
  };

  const stayOnPage = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    if (!isPage(event.url) && (event.isMainFrame || new URL(event.url).protocol === 'file:')) {
      event.preventDefault();

      // The trampoline opens an http(s) link in the browser, or asks; the window stays on the page.
      if (event.isMainFrame) {
        tellTrampoline({ openLink: event.url });
      }
    }
  };

  const setUpWindow = (opened: BrowserWindow) => {
    opened.webContents.on('will-frame-navigate', stayOnPage);
    opened.webContents.on('will-redirect', stayOnPage);
    opened.webContents.setWindowOpenHandler(({ url }) => {
      if (isPage(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: { icon, webPreferences } };
      }

      tellTrampoline({ openLink: url });

      return { action: 'deny' };
    });
    opened.webContents.on('did-create-window', setUpWindow);
    opened.webContents.setAudioMuted(!permissions.use.includes('sound'));

    api.enable(opened);
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

  onTrampolineReply(reply => {
    if ('trayClick' in reply) {
      toFront();
    } else {
      api.saved(reply);
    }
  });

  let pendingReload: NodeJS.Timeout | undefined = undefined;
  fs.watch(dir, { recursive: dir !== HOME && dir !== path.parse(dir).root }, (_event, name) => {
    if (!name || !/\.(papp|css|js)$/.test(name) || /(^|[\\/])(\.[^\\/]*|node_modules)([\\/]|$)/.test(name)) {
      return;
    }

    clearTimeout(pendingReload);
    pendingReload = setTimeout(() => pageWindows().forEach(other => other.webContents.reloadIgnoringCache()), 100);
  });
}
