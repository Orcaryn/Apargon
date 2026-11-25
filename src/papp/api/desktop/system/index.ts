import { app, powerMonitor, screen, type BrowserWindow } from 'electron';
import type { Permissions, Use } from '../../../../permissions/tags/index.ts';
import { tellTrampoline } from '../../../channel/index.ts';
import { PAPP_PLATFORM } from '../../../platform/index.ts';
import type { Scope } from '../../scope/index.ts';

export function systemApi(permissions: Permissions, { where }: Scope, win: BrowserWindow) {
  // What this window hears, by the id the .papp file gave, each with what stops it: a reload stops them all.
  const hearing = new Map<string, () => void>();

  const needUse = (name: Use, what: string) => {
    if (!permissions.use.includes(name)) {
      throw new Error(`Apargon: this .papp file may not ${what}. Ask for it with <meta name="papp-use" content="${name}">.`);
    }
  };

  return {
    // A link opens in the user's browser only to a site in papp-net. The trampoline checks.
    open(link: string) {
      if (!/^https?:\/\//i.test(link)) {
        throw new Error('Apargon: open takes an http(s) link to a site in papp-net.');
      }

      tellTrampoline('openLink', link);
    },
    // The whole .papp file, every window: as Quit in its tray menu.
    quit() {
      app.quit();
    },
    // Where the pointer is on the screen, in the points of window.getScreenDetails().
    cursor() {
      needUse('cursor', 'see where the mouse is');

      return screen.getCursorScreenPoint();
    },
    // The user picks the app in the system's menu. Only an http(s) link: a file: one would hand over a file the .papp file may not see.
    share({ text, url, files = [] }: { text?: string; url?: string; files?: string[] } = {}) {
      needUse('share', 'open the share menu');

      if (!PAPP_PLATFORM.share) {
        throw new Error('Apargon: the share menu is on macOS only.');
      } else if (url !== undefined && !/^https?:\/\//i.test(url)) {
        throw new Error('Apargon: share takes an http(s) link as url.');
      }

      const filePaths = files.map(file => where(file));

      PAPP_PLATFORM.share(win, { texts: text === undefined ? [] : [text], urls: url === undefined ? [] : [url], filePaths });
    },
    // A name another app announces, such as com.spotify.client.PlaybackStateChanged: each one heard goes to the .papp file with what came along.
    hear(id: string, name: string) {
      needUse('broadcasts', 'hear other apps');

      if (!PAPP_PLATFORM.hear) {
        throw new Error('Apargon: hearing other apps is on macOS only.');
      } else if (!name) {
        // macOS takes an empty name as every name.
        throw new Error('Apargon: hear takes the name of one notification, such as com.spotify.client.PlaybackStateChanged.');
      }

      // An id given twice: the first stops, or nothing could reach it.
      hearing.get(id)?.();
      hearing.set(id, PAPP_PLATFORM.hear(name, (info, sender) => win.webContents.send('apargon-broadcast', id, { name, sender, info })));
    },
    unhear(id: string) {
      hearing.get(id)?.();
      hearing.delete(id);
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
