import { Menu, type BrowserWindow } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageMenus } from '../menu.ts';
import { pageMenuItems, type PageMenuItem } from '../../shared/menuItems.ts';

export function windowApi(permissions: Permissions, win: BrowserWindow, menus: PageMenus) {
  return {
    pdf() {
      return win.webContents.printToPDF({});
    },
    // The system's print dialog; true once the job is sent.
    print() {
      if (!permissions.use.includes('print')) {
        throw new Error('Apargon: this page may not print. Ask for it with <meta name="papp-use" content="print">, or save papp.pdf() with papp.save().');
      }

      return new Promise<boolean>(resolve => win.webContents.print({}, resolve));
    },
    menu(items: PageMenuItem[]) {
      menus.setPageMenus(pageMenuItems(items, id => win.webContents.send('apargon-menu', id)), win);
    },
    contextMenu(items: PageMenuItem[]) {
      Menu.buildFromTemplate(pageMenuItems(items, id => win.webContents.send('apargon-menu', id))).popup({ window: win });
    },
    closeWindow() {
      win.close();
    },
    // A bar on the window's dock or taskbar icon, from 0 to 1; null removes it.
    progress(value: number | null) {
      if (value !== null && !(typeof value === 'number' && value >= 0 && value <= 1)) {
        throw new Error('Apargon: progress takes a number from 0 to 1, or null to remove the bar.');
      }

      win.setProgressBar(value ?? -1);
    },
    reset() {
      menus.clearPageMenus(win);

      if (!win.isDestroyed()) {
        win.setProgressBar(-1);
      }
    },
  };
}
