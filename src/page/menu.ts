// The Permissions menu. The child cannot write approvals or open the log itself: it asks
// the trampoline on fd 3.

import { dialog, Menu, type MenuItemConstructorOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Line } from '../permissions/describe.ts';
import { EGRESS_LOG, type ChildMessage } from '../shared.ts';

export function installMenu(page: string, lines: Line[], approved: string[]) {
  const appMenu: MenuItemConstructorOptions[] = process.platform === 'darwin' ? [{ role: 'appMenu' }] : [];

  const revoke = (pages: string[]) => {
    fs.writeSync(3, JSON.stringify({ revoke: pages } satisfies ChildMessage) + '\n');
    installMenu(page, lines, approved.filter(other => !pages.includes(other)));
  };

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...appMenu,
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
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
                detail: lines.length ? lines.map(line => line.text).join('\n') : 'Nothing: no files, no network.',
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
                ? fs.writeSync(3, JSON.stringify({ showEgressLog: true } satisfies ChildMessage) + '\n')
                : dialog.showMessageBox({ type: 'info', message: 'No egress recorded yet.', detail: EGRESS_LOG }),
          },
        ],
      },
    ])
  );
}
