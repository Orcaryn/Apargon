import { app, nativeImage, powerMonitor, screen, type BrowserWindow, type NativeImage } from 'electron';
import { Readable } from 'stream';
import type { Permissions } from '../../permissions/tags.ts';
import { callTrampoline, tellTrampoline, trampolineBytes, type PageTray, type TrayIcon } from '../../shared/channel.ts';
import { cleanTrayItems } from '../../shared/menuItems.ts';
import { NOTICE_ICON_SIDE, showNotice } from '../../shared/notice.ts';
import { PAGE_PLATFORM } from '../platform.ts';
import type { Scope } from './scope.ts';

export function systemApi(permissions: Permissions, { where }: Scope, toFront: () => void, pageIcon: () => NativeImage | null, win: BrowserWindow) {
  // What this window hears, by the id its page gave, each with what stops it: a reload stops them all.
  const hearing = new Map<string, () => void>();

  const needUse = (name: Permissions['use'][number], what: string) => {
    if (!permissions.use.includes(name)) {
      throw new Error(`Apargon: this .papp file may not ${what}. Ask for it with <meta name="papp-use" content="${name}">.`);
    }
  };

  return {
    // The trampoline shows the dialog and writes: the sandbox may not write where the user picks.
    // body: every file's bytes, one after another. Each file takes its size of them as the trampoline writes it, and it writes them in this order.
    saveAll(body: Readable, files: { name: string; size: number }[]) {
      const chunks = (body as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
      let chunk: Buffer = Buffer.alloc(0);
      const parts = files.map(({ size }) =>
        Readable.from(
          (async function* () {
            for (let left = size; left > 0; ) {
              if (!chunk.length) {
                chunk = (await chunks.next()).value as Buffer;
              }

              const piece = chunk.subarray(0, left);
              chunk = chunk.subarray(piece.length);
              left -= piece.length;
              yield piece;
            }
          })(),
          { objectMode: false }
        )
      );

      return callTrampoline('saveAll', { files: files.map(({ name }, index) => ({ name, data: trampolineBytes.send(parts[index]) })) }).finally(() => parts.forEach(part => part.destroy()));
    },
    // A suggestion is only a name. The file the user picks is kept as a pick to write.
    save(body: Readable, file: string) {
      return callTrampoline('save', { file, data: trampolineBytes.send(body) });
    },
    // A link opens in the user's browser only to a site in papp-net. The trampoline checks.
    open(link: string) {
      if (!/^https?:\/\//i.test(link)) {
        throw new Error('Apargon: open takes an http(s) link to a site in papp-net.');
      }

      tellTrampoline('openLink', link);
    },
    // The button the user picked, or null when they click the notification itself or close it.
    notify(title: string, body = '', { buttons = [] }: { buttons?: string[] } = {}) {
      needUse('notifications', 'show notifications');

      const notice = { title, body, buttons: buttons.slice(0, 3) };
      const icon = pageIcon();

      if (PAGE_PLATFORM.notifiesHere) {
        return showNotice(notice, icon ?? undefined, toFront);
      } else if (!icon) {
        return callTrampoline('notify', { ...notice, icon: null });
      }

      // Sized here, in the sandbox, and sent as pixels: the trampoline, which has network, decodes no image a .papp file sends.
      const pixels = Readable.from(icon.resize({ width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE, quality: 'best' }).toBitmap(), { objectMode: false });

      return callTrampoline('notify', { ...notice, icon: trampolineBytes.send(pixels) }).finally(() => pixels.destroy());
    },
    // icon: PNG or JPEG bytes, or a data: URL of one; null is Apargon's. click: a click on the icon goes to papp.onTrayClick, and a right-click opens the menu.
    tray(title: PageTray['title'], items: unknown = [], { icon = null, click = false }: { icon?: string | Uint8Array | null; click?: boolean } = {}) {
      tellTrampoline('tray', { title: title === null ? null : title.slice(0, 24), items: cleanTrayItems(items), icon: icon === null ? null : trayIcon(icon), click });
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

      const filePaths = files.map(file => where(file));

      PAGE_PLATFORM.share(win, { texts: text === undefined ? [] : [text], urls: url === undefined ? [] : [url], filePaths });
    },
    // A name another app announces, such as com.spotify.client.PlaybackStateChanged: each one heard goes to the page with what came along.
    hear(id: string, name: string) {
      needUse('broadcasts', 'hear other apps');

      if (!PAGE_PLATFORM.hear) {
        throw new Error('Apargon: hearing other apps is on macOS only.');
      } else if (!name) {
        // macOS takes an empty name as every name.
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
  if (!name || name.length > 256) {
    throw new Error('Apargon: a secret takes a name of 1 to 256 characters.');
  }
}
