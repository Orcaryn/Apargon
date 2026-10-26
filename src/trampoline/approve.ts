// Asking the user: the popup, worded by where the page came from, remembered in grants.json.
// The popup is popup.html in a window of its own: static, offline, and fed only text.

import { app, BrowserWindow, nativeTheme } from 'electron';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, worstCase } from '../permissions/describe.ts';
import { declaredPermissions, HOME } from '../permissions/tags.ts';
import { GRANTS_FILE, type Grants } from '../shared.ts';

// The page and what it may do, or null if the user said no. Throws for a page that cannot open.
export async function approve(file: string) {
  const page = fs.realpathSync.native(file);
  const html = fs.readFileSync(page);
  const permissions = declaredPermissions(page, html.toString());
  const from = cameFrom(page);
  const lines = describe(permissions);
  // A page with no tags opens without asking, wherever it came from: it may only see its folder.
  const quiet = lines.every(line => line.id.startsWith('own:'));
  // A downloaded page is allowed as it is: changed, or another download in its place, it asks again.
  // A page made here is yours to edit.
  const pageHash = from === null || quiet ? null : createHash('sha256').update(html).digest('hex');
  const ids = lines.map(line => line.id).concat(pageHash ? `content:${pageHash}` : []).sort();
  const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  const previous = grants[page];
  const worst = from === null ? null : worstCase(permissions);

  if (quiet || previous?.join('\n') === ids.join('\n')) {
    return { page, permissions, pageHash };
  }

  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const popup = {
    source: from === null ? 'Made on this computer' : `Downloaded from ${from}`,
    downloaded: from !== null,
    name: path.basename(page),
    changed: previous?.some(id => id.startsWith('content:') && id !== `content:${pageHash}`) ? 'This page changed since you allowed it.' : null,
    worst,
    lines: lines.map(line => ({ level: line.level, kind: line.id.split(':')[0], text: line.text.replaceAll(HOME + '/', '~/'), isNew: previous !== undefined && !previous.includes(line.id) })),
    note: seesFiles ? `Hidden files (names starting with a dot), keys and logins (~/.ssh and others) are left out unless named.${permissions.write.length ? ' Pages (.papp) can be changed only if named.' : ''}` : null,
    folder: (path.dirname(page) + '/').replaceAll(HOME + '/', '~/'), // the name is the title; the folder tells two pages of one name apart
    tags: permissions.tags, // as written, folded away: the lines are the popup, these are for checking them
    // A page made here is your own code: its red lines warn, and only a page from elsewhere must be trusted.
    trust: from !== null && (worst !== null || lines.some(line => line.level === 'red')),
  };

  if (!app.isPackaged && process.env.PAPP_TEST_ALLOW === '1') {
    console.log(['papp: allowed for the test:', popup.source, popup.name, popup.changed ?? [], worst ?? [], popup.lines.map(line => `${line.level}: ${line.text}`)].flat().join('\n  '));

    return { page, permissions, pageHash };
  } else if (!(await ask(popup))) {
    return null;
  }

  // Read again: another page's popup may have been answered while this one was open.
  const latest: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  fs.writeFileSync(GRANTS_FILE, JSON.stringify({ ...latest, [page]: ids }, null, 2) + '\n');

  return { page, permissions, pageHash };
}

// True if the user allowed the page. popup.html answers by setting its hash, and sets another hash
// when its tags fold or unfold, so the window can fit them; closing the window is no.
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
  const fit = async () => win.setContentSize(width, await win.webContents.executeJavaScript('document.body.offsetHeight'));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(import.meta.dirname, 'popup.html'));
  await win.webContents.executeJavaScript(`render(${JSON.stringify(popup)})`);
  await fit();
  app.focus({ steal: true }); // launched from a terminal or another app, the popup would open behind it
  win.show();

  return new Promise<boolean>(resolve => {
    win.webContents.on('did-navigate-in-page', (_event, url) => {
      if (url.endsWith('#allow') || url.endsWith('#deny')) {
        resolve(url.endsWith('#allow'));
        win.close();
      } else {
        fit();
      }
    });
    win.on('closed', () => resolve(false));
  });
}

// The site a page was downloaded from, or null if it was made here. macOS marks what browsers, Mail,
// Messages and AirDrop save, and Spotlight keeps the address and the page it was found on. On Linux,
// Chrome keeps the address, which getfattr reads. git clone, curl and USB sticks leave no mark.
// papp never clears it: a page that changes its tags later is still asked about as downloaded.
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
