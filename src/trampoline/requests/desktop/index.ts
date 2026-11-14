import type { Rectangle } from 'electron';
import type { Readable } from 'stream';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { PageTray, Tell, TrampolineEvents } from '../../../shared/wire/protocol/index.ts';
import { TRAMPOLINE_PLATFORM } from '../../platform/index.ts';
import { records } from '../../records/index.ts';
import { menuEvents } from './menu/index.ts';
import { notifyHandler } from './notify/index.ts';
import { secretHandlers } from './secrets/index.ts';
import { trayFor } from './tray/index.ts';

// What a .papp file has on the user's desktop through the trampoline: Apargon's menu, its tray icon, its window's place and icon, notifications and secrets.
export function desktopRequests(page: string, permissions: Permissions, receive: (id: string) => Readable, tell: Tell<TrampolineEvents>, openPage: (file: string) => void, refreshMenus: () => void) {
  const showTray = trayFor(page, tell);
  // In the background, or with tray items of its own, it keeps an icon: it is how the user finds it again.
  const background = permissions.use.includes('background');
  const setTray = ({ title, items, icon, click }: PageTray) => showTray(title ?? (background || items.length ? '' : null), items, icon, click);
  setTray({ title: null, items: [], icon: null, click: false });

  return {
    events: {
      ...menuEvents(page, openPage, refreshMenus),
      tray: setTray,
      // Field by field, and only numbers: the next start hands the window to Electron, which would refuse anything else, and the file would never open again.
      bounds: ({ x, y, width, height }: Rectangle) => {
        if ([x, y, width, height].every(Number.isInteger)) {
          records.change(page, { window: { x, y, width, height } });
        }
      },
      pageIcon: (icon: string) => TRAMPOLINE_PLATFORM.pageIcon?.(page, icon),
    },
    calls: {
      ...secretHandlers(permissions.id),
      notify: notifyHandler(permissions, receive, tell),
    },
    close: () => showTray(null, [], null, false),
  };
}
