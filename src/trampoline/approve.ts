// Asking the user: the download warning, then the popup, remembered in grants.json.

import { app, dialog } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe } from '../permissions/describe.ts';
import { declaredPermissions } from '../permissions/tags.ts';
import { GRANTS_FILE, type Grants } from '../shared.ts';

// The page and what it may do, or null if the user said no. Throws for a page that cannot open.
export async function approve(file: string) {
  const page = fs.realpathSync.native(file);

  if (!(await confirmDownloaded(page))) {
    return null;
  }

  const permissions = declaredPermissions(page);
  const lines = describe(permissions);
  const ids = lines.map(line => line.id).sort();
  const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  const previous = grants[page];

  if (permissions.net.length && process.platform !== 'darwin') {
    throw new Error('resworb-net works on macOS only for now: no other platform can open a port yet.');
  } else if (lines.every(line => line.id.startsWith('own:')) || previous?.join('\n') === ids.join('\n')) {
    return { page, permissions };
  } else if (!app.isPackaged && process.env.RESWORB_TEST_ALLOW === '1') {
    console.log(`resworb: ${path.basename(page)} allowed for the test:\n${lines.map(line => `  ${line.level}: ${line.text}`).join('\n')}`);

    return { page, permissions };
  }

  const marks = { red: '🔴 ', yellow: '🟡 ', plain: '•  ' };
  const red = lines.some(line => line.level === 'red');
  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const notes = [
    permissions.net.length && seesFiles ? 'It can send what it sees to the servers listed.' : '',
    seesFiles ? 'Hidden files (names starting with a dot) are left out unless named.' : '',
  ];
  const detail = [
    lines.map(line => marks[line.level] + (previous && !previous.includes(line.id) ? 'New: ' : '') + line.text).join('\n'),
    notes.filter(Boolean).join('\n'),
    page,
  ];

  app.focus({ steal: true }); // launched from a terminal or another app, the popup would open behind it

  for (;;) {
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: red ? 'warning' : 'question',
      message: `${path.basename(page)} asks for ${lines.length === 1 ? 'one permission' : `${lines.length} permissions`}:`,
      detail: detail.filter(Boolean).join('\n\n'),
      buttons: ["Don't open", 'Allow and open'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      ...(red ? { checkboxLabel: 'I understand what the 🔴 lines allow.' } : {}),
    });

    if (response === 0) {
      return null;
    } else if (!red || checkboxChecked) {
      break;
    }
  }

  grants[page] = ids;
  fs.writeFileSync(GRANTS_FILE, JSON.stringify(grants, null, 2) + '\n');

  return { page, permissions };
}

// macOS marks downloads with a quarantine attribute. Warn once, then clear it, as Finder does.
async function confirmDownloaded(page: string) {
  const quarantined = process.platform === 'darwin' && spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', page]).status === 0;

  if (!quarantined) {
    return true;
  }

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `${path.basename(page)} was downloaded.`,
    detail: `It will run as code on your computer.\n\n${page}`,
    buttons: ['Cancel', 'Open anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  if (response === 0) {
    return false;
  }

  spawnSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', page]);

  return true;
}
