import { app, BrowserWindow, nativeTheme } from 'electron';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, worstCase } from '../permissions/describe.ts';
import { declaredPermissions, HOME } from '../permissions/tags.ts';
import { GRANTS_FILE, readJson, writeJson, type Grants } from '../shared.ts';

export async function approve(file: string) {
  const page = fs.realpathSync.native(file);
  const html = fs.readFileSync(page);
  const permissions = declaredPermissions(page, html.toString());
  const downloadedFrom = cameFrom(page);
  const lines = describe(permissions);
  const opensWithoutAsking = downloadedFrom === null && lines.every(line => line.id.startsWith('own:'));
  const pageHash = downloadedFrom === null ? null : createHash('sha256').update(html).digest('hex');
  const grant = lines.map(line => line.id).concat(pageHash ? `content:${pageHash}` : []).sort();
  const grants = readJson<Grants>(GRANTS_FILE);
  const previous = grants[page];
  const worst = worstCase(permissions);
  const approved = { page, permissions, pageHash };

  if (opensWithoutAsking || previous?.join('\n') === grant.join('\n')) {
    return approved;
  }

  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const popup = {
    source: downloadedFrom === null ? 'Made on this computer' : `Downloaded from ${downloadedFrom}`,
    downloaded: downloadedFrom !== null,
    name: path.basename(page),
    changed: previous?.some(id => id.startsWith('content:') && id !== `content:${pageHash}`) ? 'This page changed since you allowed it.' : null,
    worst,
    lines: lines.map(line => ({ level: line.level, kind: line.id.split(':')[0], text: line.text.replaceAll(HOME + '/', '~/'), isNew: previous !== undefined && !previous.includes(line.id) })),
    note: seesFiles ? `Hidden files (names starting with a dot), keys and logins (~/.ssh and others) are left out unless named.${permissions.write.length ? ' Pages (.papp) can be changed only if named.' : ''}` : null,
    folder: (path.dirname(page) + '/').replaceAll(HOME + '/', '~/'),
    tags: permissions.tags,
    trust: worst !== null || lines.some(line => line.level === 'red'),
  };

  if (!app.isPackaged && process.env.APARGON_TEST_ALLOW === '1') {
    console.log(['Apargon: allowed for the test:', popup.source, popup.name, popup.changed ?? [], worst ?? [], popup.lines.map(line => `${line.level}: ${line.text}`)].flat().join('\n  '));

    return approved;
  } else if (!(await ask(popup))) {
    return null;
  }

  const latest = readJson<Grants>(GRANTS_FILE);
  writeJson(GRANTS_FILE, { ...latest, [page]: grant });

  return approved;
}

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
  app.focus({ steal: true });
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
