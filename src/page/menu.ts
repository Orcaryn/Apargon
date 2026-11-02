import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Line } from '../permissions/describe.ts';
import { tellTrampoline } from '../shared/channel.ts';
import { EGRESS_LOG, readJson, UPDATE_FILE, type UpdateState } from '../shared/data.ts';
import { PAGE_PLATFORM } from './platform.ts';

export type PageMenus = ReturnType<typeof installMenu>;

// Apargon's menu, with the page's own menus between View and Window once it sets them.
export function installMenu(page: string, lines: Line[], approved: string[]) {
  let pageMenus: MenuItemConstructorOptions[] = [];
  // The window whose page set the menus: only its reload or close takes them away.
  let menusFrom: BrowserWindow | null = null;
  let stillApproved = approved;

  const revoke = (pages: string[]) => {
    tellTrampoline({ revoke: pages });
    stillApproved = stillApproved.filter(other => !pages.includes(other));
    install();
  };

  const install = () => Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(page, lines, stillApproved, pageMenus, revoke)));

  install();

  return {
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

function menuTemplate(page: string, lines: Line[], approved: string[], pageMenus: MenuItemConstructorOptions[], revoke: (pages: string[]) => void): MenuItemConstructorOptions[] {
  const appMenu: MenuItemConstructorOptions[] = PAGE_PLATFORM.appMenu ? [{ role: 'appMenu' }] : [];
  const updates = readJson<UpdateState>(UPDATE_FILE);

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
          submenu: approved.length ? approved.map(other => ({ label: `Revoke ${other}`, click: () => revoke([other]) })) : [{ label: 'None', enabled: false }],
        },
        { label: 'Revoke All Approvals', enabled: approved.length > 0, click: () => revoke(approved) },
        { type: 'separator' },
        {
          label: 'Show Egress Log',
          click: () =>
            fs.existsSync(EGRESS_LOG)
              ? tellTrampoline({ showEgressLog: true })
              : dialog.showMessageBox({ type: 'info', message: 'No egress recorded yet.', detail: EGRESS_LOG }),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates Automatically',
          type: 'checkbox',
          checked: updates.automatic !== false,
          click: item => tellTrampoline({ automaticUpdates: item.checked }),
        },
      ],
    },
    {
      role: 'help',
      submenu: [{ label: 'Install the papp Skill for Agents…', click: () => tellTrampoline({ installSkill: true }) }],
    },
  ];
}
