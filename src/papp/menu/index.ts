import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import path from 'path';
import type { Line } from '../../permissions/describe/index.ts';
import type { MenuState } from '../../shared/wire/protocol/index.ts';
import { tellTrampoline } from '../channel/index.ts';
import { PAPP_PLATFORM } from '../platform/index.ts';

export type PappMenus = ReturnType<typeof installMenu>;

// Apargon's menu, with the .papp file's own menus between View and Window once it sets them. The trampoline sends what it shows, at start and after each change.
export function installMenu(papp: string, lines: Line[], state: MenuState) {
  let pappMenus: MenuItemConstructorOptions[] = [];
  // The window that set the menus: only its reload or close takes them away.
  let menusFrom: BrowserWindow | null = null;
  const install = () => Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(papp, lines, pappMenus, state)));

  install();

  return {
    refresh(latest: MenuState) {
      state = latest;
      install();
    },
    setPappMenus(menus: MenuItemConstructorOptions[], from: BrowserWindow) {
      pappMenus = menus;
      menusFrom = from;
      install();
    },
    clearPappMenus(from: BrowserWindow) {
      if (menusFrom === from) {
        pappMenus = [];
        menusFrom = null;
        install();
      }
    },
  };
}

function menuTemplate(papp: string, lines: Line[], pappMenus: MenuItemConstructorOptions[], { approved, automaticUpdates }: MenuState): MenuItemConstructorOptions[] {
  const appMenu: MenuItemConstructorOptions[] = PAPP_PLATFORM.appMenu ? [{ role: 'appMenu' }] : [];

  return [
    ...appMenu,
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    ...pappMenus,
    { role: 'windowMenu' },
    {
      label: 'Permissions',
      submenu: [
        {
          label: "What This File Can Do…",
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              message: `${path.basename(papp)} can:`,
              // As in the popup: each heading once, its lines under it.
              detail: lines.length ? lines.flatMap((line, i) => (line.heading === null ? [line.text] : line.heading === lines[i - 1]?.heading ? [`  ${line.text}`] : [line.heading, `  ${line.text}`])).join('\n') : 'Read your files and change its own folder. No network.',
            }),
        },
        {
          label: 'Files You Said Yes To',
          submenu: approved.length ? approved.map(other => ({ label: `Revoke ${other}`, click: () => tellTrampoline('revoke', [other]) })) : [{ label: 'None', enabled: false }],
        },
        { label: 'Revoke All Approvals', enabled: approved.length > 0, click: () => tellTrampoline('revoke', approved) },
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
