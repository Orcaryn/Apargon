import type { BrowserWindow, NativeImage } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { Ask } from '../../shared/channel.ts';
import type { PageMenus } from '../menu.ts';
import type { pageAccess } from './access.ts';
import { connectionApi } from './connections.ts';
import { fileApi } from './files.ts';
import { listenApi } from './listen.ts';
import { programApi } from './programs.ts';
import { pageScope } from './scope.ts';
import { systemApi } from './system.ts';
import { windowApi } from './window.ts';

// What every window of the page shares: the menu bar, the trampoline's answers, and the icon as drawn.
export type PageProcess = { menus: PageMenus; toFront: () => void; ask: Ask; pageIcon: () => NativeImage | null };

// What the page's process does on its behalf, when its sandbox allows the page none of it: window.papp in the page is a mirror of this object.
export function pageApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess>, win: BrowserWindow, { menus, toFront, ask, pageIcon }: PageProcess) {
  const scope = pageScope(dir, access);
  const files = fileApi(dir, scope, win, ask);
  const programs = programApi(permissions, scope, win);
  const pageWindow = windowApi(permissions, win, menus);
  const listeners = listenApi(win, ask);
  const connections = connectionApi(win);

  return {
    ...files,
    ...programs,
    ...pageWindow,
    ...listeners,
    ...connections,
    ...systemApi(permissions, scope, toFront, ask, pageIcon),
    // On each load of the page, and when its window closes: nothing the page before it started outlives it.
    reset() {
      files.reset();
      programs.reset();
      pageWindow.reset();
      listeners.reset();
      connections.reset();
      scope.picked.length = 0;
    },
  };
}
