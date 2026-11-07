import { app, nativeImage, powerMonitor, screen, type BrowserWindow, type NativeImage } from 'electron';
import { linkHost, viewable } from '../../permissions/open.ts';
import { absolutePath } from '../../permissions/paths.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { callTrampoline, tellTrampoline, type Notice, type PageTray, type TrayIcon } from '../../shared/channel.ts';
import { cleanTrayItems } from '../../shared/menuItems.ts';
import { showNotice } from '../../shared/notice.ts';
import { PAGE_PLATFORM } from '../platform.ts';
import type { Scope } from './scope.ts';

export function systemApi(dir: string, permissions: Permissions, { where, canSee, need }: Scope, toFront: () => void, pageIcon: () => NativeImage | null, win: BrowserWindow) {
  // What this window hears, by the id its page gave, each with what stops it: a reload stops them all.
  const hearing = new Map<string, () => void>();

  const needUse = (name: Permissions['use'][number], what: string) => {
    if (!permissions.use.includes(name)) {
      throw new Error(`Apargon: this page may not ${what}. Ask for it with <meta name="papp-use" content="${name}">.`);
    }
  };

  return {
    // The trampoline shows the dialog and writes: this process may not write where the user picks.
    saveAll(files: Record<string, string | Uint8Array>) {
      return callTrampoline('saveAll', { files: Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data).toString('base64') })) });
    },
    // A suggestion is only a name: no filesystem lookup before the Save dialog opens.
    save(file: string, data: string | Uint8Array) {
      return callTrampoline('save', { file: absolutePath(file, dir), data: Buffer.from(data).toString('base64') });
    },
    open(target: string) {
      if (linkHost(target)) {
        tellTrampoline('openLink', target);
      } else {
        const file = where(target);
        need(canSee(file), 'see');

        if (!viewable(file)) {
          throw new Error(`Apargon: open takes an http(s) link, a folder without an extension, or a file a viewer shows (images, video, audio, PDF, text), not ${file}.`);
        }

        tellTrampoline('openFile', file);
      }
    },
    // The button the user picked, or null when they click the notification itself or close it.
    notify(title: string, body = '', { buttons = [] }: { buttons?: string[] } = {}) {
      needUse('notifications', 'show notifications');

      const notice: Notice = { title: String(title), body: String(body), buttons: buttons.slice(0, 3).map(String), icon: pageIcon()?.toPNG().toString('base64') ?? null };

      return PAGE_PLATFORM.notifiesHere ? showNotice(notice, toFront) : callTrampoline('notify', notice);
    },
    // icon: PNG or JPEG bytes, or a data: URL of one; null is Apargon's. click: a click on the icon goes to papp.onTrayClick, and a right-click opens the menu.
    tray(title: PageTray['title'], items: unknown = [], { icon = null, click = false }: { icon?: string | Uint8Array | null; click?: boolean } = {}) {
      tellTrampoline('tray', { title: title === null ? null : String(title).slice(0, 24), items: cleanTrayItems(items), icon: icon === null ? null : trayIcon(icon), click });
    },
    // The whole page, every window: as Quit in its tray menu.
    quit() {
      app.quit();
    },
    // Where the pointer is on the screen, in the points of papp.displays.
    cursor() {
      needUse('cursor', 'see where the mouse is');

      return screen.getCursorScreenPoint();
    },
    // The user picks the app in the system's menu. Only an http(s) link: a file: one would hand over a file the page may not see.
    share({ text, url, files = [] }: { text?: string; url?: string; files?: string[] } = {}) {
      needUse('share', 'open the share menu');

      if (!PAGE_PLATFORM.share) {
        throw new Error('Apargon: the share menu is on macOS only.');
      } else if (url !== undefined && !/^https?:\/\//i.test(url)) {
        throw new Error('Apargon: share takes an http(s) link as url.');
      }

      const filePaths = files.map(file => {
        const target = where(file);
        need(canSee(target), 'see');

        return target;
      });

      PAGE_PLATFORM.share(win, { texts: text === undefined ? [] : [String(text)], urls: url === undefined ? [] : [url], filePaths });
    },
    // A name another app announces, such as com.spotify.client.PlaybackStateChanged: each one heard goes to the page with what came along.
    hear(id: string, name: string) {
      needUse('broadcasts', 'hear other apps');

      if (!PAGE_PLATFORM.hear) {
        throw new Error('Apargon: hearing other apps is on macOS only.');
      } else if (typeof name !== 'string' || !name) {
        // macOS takes null as every name.
        throw new Error('Apargon: hear takes the name of one notification, such as com.spotify.client.PlaybackStateChanged.');
      }

      // An id given twice: the first stops, or nothing could reach it.
      hearing.get(id)?.();
      hearing.set(id, PAGE_PLATFORM.hear(name, (info, sender) => win.webContents.send('apargon-broadcast', id, { name, sender, info })));
    },
    unhear(id: string) {
      hearing.get(id)?.();
      hearing.delete(id);
    },
    // The trampoline keeps them where no page's process can read. Null when there is none.
    getSecret(name: string) {
      checkSecretName(name);

      return callTrampoline('getSecret', { name });
    },
    setSecret(name: string, value: string) {
      checkSecretName(name);

      if (typeof value !== 'string') {
        throw new Error('Apargon: a secret is a string. To remove one, use deleteSecret.');
      }

      return callTrampoline('setSecret', { name, value });
    },
    deleteSecret(name: string) {
      checkSecretName(name);

      return callTrampoline('setSecret', { name, value: null });
    },
    power() {
      return { idleSeconds: powerMonitor.getSystemIdleTime(), onBattery: powerMonitor.isOnBatteryPower() };
    },
    reset() {
      hearing.forEach(stop => stop());
      hearing.clear();
    },
  };
}

// Decoded here, in the sandbox, and sent as pixels: 32 high, as a menu bar shows it on a sharp screen, at most 64 wide.
function trayIcon(icon: string | Uint8Array): TrayIcon {
  const image = typeof icon === 'string' ? nativeImage.createFromDataURL(icon) : nativeImage.createFromBuffer(Buffer.from(icon));

  if (image.isEmpty()) {
    throw new Error('Apargon: a tray icon is PNG or JPEG bytes, or a data: URL of one.');
  }

  const size = image.getSize();
  const scale = Math.min(32 / size.height, 64 / size.width);
  const [width, height] = [size.width, size.height].map(side => Math.max(1, Math.round(side * scale)));

  return { width, height, pixels: image.resize({ width, height, quality: 'best' }).toBitmap().toString('base64') };
}

function checkSecretName(name: string) {
  if (typeof name !== 'string' || !name || name.length > 256) {
    throw new Error('Apargon: a secret takes a name of 1 to 256 characters.');
  }
}
