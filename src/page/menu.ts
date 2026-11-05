import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import path from 'path';
import type { Line } from '../permissions/describe.ts';
import { tellTrampoline, type MenuState } from '../shared/channel.ts';
import { PAGE_PLATFORM } from './platform.ts';

export type PageMenus = ReturnType<typeof installMenu>;

// Apargon's menu, with the page's own menus between View and Window once it sets them. The trampoline sends what it shows, at start and after each change.
export function installMenu(page: string, lines: Line[], state: MenuState) {
  let pageMenus: MenuItemConstructorOptions[] = [];
  // The window whose page set the menus: only its reload or close takes them away.
  let menusFrom: BrowserWindow | null = null;
  const install = () => Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(page, lines, pageMenus, state)));

  install();

  return {
    refresh(latest: MenuState) {
      state = latest;
      install();
    },
    setPageMenus(menus: MenuItemConstructorOptions[], from: BrowserWindow) {
      pageMenus = menus;
      menusFrom = from;
      install();
    },
    clearPageMenus(from: BrowserWindow) {
      if (menusFrom === from) {
        pageMenus = [];
        menusFrom = null;
        install();
      }
    },
  };
}

function menuTemplate(page: string, lines: Line[], pageMenus: MenuItemConstructorOptions[], { approved, automaticUpdates }: MenuState): MenuItemConstructorOptions[] {
  const appMenu: MenuItemConstructorOptions[] = PAGE_PLATFORM.appMenu ? [{ role: 'appMenu' }] : [];

  return [
    ...appMenu,
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    ...pageMenus,
    { role: 'windowMenu' },
    {
      label: 'Permissions',
      submenu: [
        {
          label: "This Page's Permissions…",
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              message: `${path.basename(page)} may:`,
              detail: lines.length ? lines.map(line => `${line.short}: ${line.text}`).join('\n') : 'Nothing: no files, no network.',
            }),
        },
        {
          label: 'Approved Pages',
          submenu: approved.length ? approved.map(other => ({ label: `Revoke ${other}`, click: () => tellTrampoline('revoke', [other]) })) : [{ label: 'None', enabled: false }],
        },
        { label: 'Revoke All Approvals', enabled: approved.length > 0, click: () => tellTrampoline('revoke', approved) },
        { type: 'separator' },
        { label: 'Show Egress Log', click: () => tellTrampoline('showEgressLog') },
        { type: 'separator' },
        {
          label: 'Check for Updates Automatically',
          type: 'checkbox',
          checked: automaticUpdates,
          click: item => tellTrampoline('automaticUpdates', item.checked),
        },
      ],
    },
    {
      role: 'help',
      submenu: [{ label: 'Install the papp Skill for Agents…', click: () => tellTrampoline('installSkill') }],
    },
  ];
}
