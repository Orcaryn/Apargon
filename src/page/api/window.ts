import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageMenus } from '../menu.ts';

type PageMenuItem = { separator: true } | { label: string; id?: string; keys?: string; submenu?: PageMenuItem[] };

export function windowApi(permissions: Permissions, win: BrowserWindow, menus: PageMenus) {
  // Labels, keys and ids only: a role or a click of the page's own could do what Apargon's items do.
  const menuItems = (items: PageMenuItem[]): MenuItemConstructorOptions[] =>
    items.map(item => {
      if ('separator' in item) {
        return { type: 'separator' };
      }

      return { label: String(item.label), accelerator: item.keys === undefined ? undefined : String(item.keys), submenu: item.submenu && menuItems(item.submenu), click: () => win.webContents.send('apargon-menu', item.id) };
    });

  return {
    pdf() {
      return win.webContents.printToPDF({});
    },
    // The system's print dialog; true once the job is sent.
    print() {
      if (!permissions.use.includes('print')) {
        throw new Error('Apargon: this page may not print. Ask for it with <meta name="papp-use" content="print">, or save papp.pdf() with papp.saveAs().');
      }

      return new Promise<boolean>(resolve => win.webContents.print({}, resolve));
    },
    menu(items: PageMenuItem[]) {
      menus.setPageMenus(menuItems(items), win);
    },
    contextMenu(items: PageMenuItem[]) {
      Menu.buildFromTemplate(menuItems(items)).popup({ window: win });
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
