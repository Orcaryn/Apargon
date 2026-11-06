import type { BrowserWindow, NativeImage } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageMenus } from '../menu.ts';
import type { pageAccess } from './access.ts';
import { connectionApi } from './connections.ts';
import { fileApi } from './files.ts';
import { listenApi } from './listen.ts';
import { programApi } from './programs.ts';
import { pageScope } from './scope.ts';
import { systemApi } from './system.ts';
import { windowApi } from './window.ts';

// What every window of the page shares: the menu bar, the icon as drawn, the proxy, if the page has network, and the shortcuts it picked.
export type PageProcess = { menus: PageMenus; toFront: () => void; pageIcon: () => NativeImage | null; proxy: string | null; pickShortcuts: (keys: string[]) => void };

// What the page's process does on its behalf, when its sandbox allows the page none of it: window.papp in the page is a mirror of this object.
export function pageApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess>, win: BrowserWindow, { menus, toFront, pageIcon, proxy, pickShortcuts }: PageProcess) {
  const scope = pageScope(dir, access);
  const files = fileApi(dir, scope, win);
  const programs = programApi(permissions, scope, win);
  const pageWindow = windowApi(permissions, scope, win, menus);
  const listeners = listenApi(scope, win);
  const connections = connectionApi(scope, win, proxy);
  const system = systemApi(permissions, scope, toFront, pageIcon, win);

  return {
    ...files,
    ...programs,
    ...pageWindow,
    ...listeners,
    ...connections,
    ...system,
    shortcuts: pickShortcuts,
    // On each load of the page, and when its window closes: nothing the page before it started outlives it.
    reset() {
      files.reset();
      programs.reset();
      pageWindow.reset();
      listeners.reset();
      connections.reset();
      system.reset();
      scope.reset();
    },
  };
}
