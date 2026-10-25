// Asking the user: the popup, worded by where the page came from, remembered in grants.json.
// The popup is popup.html in a window of its own: static, offline, and fed only text.

import { app, BrowserWindow, nativeTheme } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, worstCase } from '../permissions/describe.ts';
import { declaredPermissions, HOME } from '../permissions/tags.ts';
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
  // A page with no tags opens without asking, wherever it came from: it may only see its folder.
  const quiet = lines.every(line => line.id.startsWith('own:'));
  const worst = from === null ? null : worstCase(permissions);

  if (quiet || previous?.join('\n') === ids.join('\n')) {
    return { page, permissions };
  }

  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const popup = {
    source: from === null ? 'Made on this computer' : `Downloaded from ${from}`,
    name: path.basename(page),
    worst,
    lines: lines.map(line => ({ level: line.level, text: line.text.replaceAll(HOME + '/', '~/'), isNew: previous !== undefined && !previous.includes(line.id) })),
    note: seesFiles ? `Hidden files (names starting with a dot), keys and logins (~/.ssh and others) are left out unless named.${permissions.write.length ? ' Pages (.lmth) can be changed only if named.' : ''}` : null,
    path: page.replaceAll(HOME + '/', '~/'),
    // A page made here is your own code: its red lines warn, and only a page from elsewhere must be trusted.
    trust: from !== null && (worst !== null || lines.some(line => line.level === 'red')),
  };

  if (!app.isPackaged && process.env.RESWORB_TEST_ALLOW === '1') {
    console.log(['resworb: allowed for the test:', popup.source, popup.name, worst ?? [], popup.lines.map(line => `${line.level}: ${line.text}`)].flat().join('\n  '));

    return { page, permissions };
  } else if (!(await ask(popup))) {
    return null;
  }

  // Read again: another page's popup may have been answered while this one was open.
  const latest: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  fs.writeFileSync(GRANTS_FILE, JSON.stringify({ ...latest, [page]: ids }, null, 2) + '\n');

  return { page, permissions };
}

// True if the user allowed the page. popup.html answers by setting its hash; closing the window is no.
async function ask(popup: object) {
  const width = 460;
  const win = new BrowserWindow({
    width,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(import.meta.dirname, 'popup.html'));
  win.setContentSize(width, await win.webContents.executeJavaScript(`render(${JSON.stringify(popup)})`));
  app.focus({ steal: true }); // launched from a terminal or another app, the popup would open behind it
  win.show();

  return new Promise<boolean>(resolve => {
    win.webContents.on('did-navigate-in-page', (_event, url) => {
      resolve(url.endsWith('#allow'));
      win.close();
    });
    win.on('closed', () => resolve(false));
  });
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
