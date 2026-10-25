// Asking the user: the popup, worded by where the page came from, remembered in grants.json.

import { app, dialog } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, worstCase } from '../permissions/describe.ts';
import { declaredPermissions } from '../permissions/tags.ts';
import { GRANTS_FILE, type Grants } from '../shared.ts';

// The page and what it may do, or null if the user said no. Throws for a page that cannot open.
export async function approve(file: string) {
  const page = fs.realpathSync.native(file);
  const permissions = declaredPermissions(page);
  const from = cameFrom(page);
  const lines = describe(permissions);
  const ids = lines.map(line => line.id).sort();
  const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  const previous = grants[page];
  // A page made here with no tags opens without asking. One from elsewhere asks about its folder too:
  // saved beside your files, it could delete them.
  const quiet = from === null ? lines.every(line => line.id.startsWith('own:')) : !lines.length;
  const worst = from === null ? null : worstCase(permissions);

  if (quiet || previous?.join('\n') === ids.join('\n')) {
    return { page, permissions };
  }

  const marks = { red: '🔴 ', yellow: '🟡 ', plain: '•  ' };
  const red = lines.some(line => line.level === 'red');
  // A page made here is your own code: its red lines warn, and only a page from elsewhere must be trusted.
  const mustTrust = from !== null && (red || worst !== null);
  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const message = from === null ? `${path.basename(page)} will:` : `${path.basename(page)} came from ${from}.`;
  const detail = [
    worst ?? [],
    lines.map(line => marks[line.level] + (previous && !previous.includes(line.id) ? 'New: ' : '') + line.text).join('\n'),
    seesFiles ? 'Hidden files (names starting with a dot) are left out unless named.' : [],
    page,
  ]
    .flat()
    .join('\n\n');

  if (!app.isPackaged && process.env.RESWORB_TEST_ALLOW === '1') {
    console.log(`resworb: allowed for the test:\n${message}\n\n${detail}\n`);

    return { page, permissions };
  }

  app.focus({ steal: true }); // launched from a terminal or another app, the popup would open behind it

  for (;;) {
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: red || worst !== null ? 'warning' : 'question',
      message,
      detail,
      buttons: ["Don't open", 'Allow and open'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      ...(mustTrust ? { checkboxLabel: 'I trust where this page came from.' } : {}),
    });

    if (response === 0) {
      return null;
    } else if (!mustTrust || checkboxChecked) {
      break;
    }
  }

  // Read again: another page's popup may have been answered while this one was open.
  const latest: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  fs.writeFileSync(GRANTS_FILE, JSON.stringify({ ...latest, [page]: ids }, null, 2) + '\n');

  return { page, permissions };
}

// The site a page was downloaded from, or null if it was made here. macOS marks what browsers, Mail,
// Messages and AirDrop save, and Spotlight keeps the address and the page it was found on. On Linux,
// Chrome keeps the address, which getfattr reads. git clone, curl and USB sticks leave no mark.
// resworb never clears it: a page that changes its tags later is still asked about as downloaded.
function cameFrom(page: string) {
  const mac = process.platform === 'darwin';
  const mark = mac
    ? spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', page], { encoding: 'utf8' })
    : spawnSync('getfattr', ['--only-values', '-n', 'user.xdg.origin.url', page], { encoding: 'utf8' });

  if (mark.status !== 0) {
    return null;
  }

  const address = mac ? [...spawnSync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemWhereFroms', page], { encoding: 'utf8' }).stdout.matchAll(/"([^"]+)"/g)].at(-1)?.[1] : mark.stdout;
  const site = URL.parse(address ?? '')?.hostname ?? '';

  return site === '' ? 'another computer' : site;
}
