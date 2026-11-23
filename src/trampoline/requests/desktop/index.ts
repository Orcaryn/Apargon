import type { Rectangle } from 'electron';
import type { Readable } from 'stream';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { PappTray, Tell, TrampolineEvents } from '../../../shared/wire/protocol/index.ts';
import { TRAMPOLINE_PLATFORM } from '../../platform/index.ts';
import { records } from '../../records/index.ts';
import { menuEvents } from './menu/index.ts';
import { notifyHandler } from './notify/index.ts';
import { secretHandlers } from './secrets/index.ts';
import { trayFor } from './tray/index.ts';

// What a .papp file has on the user's desktop through the trampoline: Apargon's menu, its tray icon, its window's place and icon, notifications and secrets.
export function desktopRequests(papp: string, permissions: Permissions, receive: (id: string) => Readable, tell: Tell<TrampolineEvents>, openPapp: (file: string) => void, refreshMenus: () => void) {
  const showTray = trayFor(papp, tell);
  // In the background, or with tray items of its own, it keeps an icon: it is how the user finds it again.
  const background = permissions.use.includes('background');
  const setTray = ({ title, items, icon, click }: PappTray) => showTray(title ?? (background || items.length ? '' : null), items, icon, click);
  setTray({ title: null, items: [], icon: null, click: false });

  return {
    events: {
      ...menuEvents(papp, openPapp, refreshMenus),
      tray: setTray,
      // Field by field, and only numbers: the next start hands the window to Electron, which would refuse anything else, and the file would never open again.
      bounds: ({ x, y, width, height }: Rectangle) => {
        if ([x, y, width, height].every(Number.isInteger)) {
          records.change(papp, { window: { x, y, width, height } });
        }
      },
      pappIcon: (icon: string) => TRAMPOLINE_PLATFORM.pappIcon?.(papp, icon),
    },
    calls: {
      ...secretHandlers(permissions.id),
      notify: notifyHandler(permissions, receive, tell),
    },
    close: () => showTray(null, [], null, false),
  };
}
