import { app } from 'electron';
import { createHash } from 'crypto';
import path from 'path';
import { PERMISSIONS_PLATFORM } from '../permissions/platform.ts';

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const INSTALL_FOLDER = app.isPackaged ? PERMISSIONS_PLATFORM.installFolder : null;
// What a .papp file's process reads of the app: the installed bundle, or in a dev build what Electron loads from the checkout, so the test .papp files in it are granted by their own patterns, as any .papp file's.
export const APP_FILES = INSTALL_FOLDER ? [INSTALL_FOLDER] : ['package.json', 'src', 'node_modules', 'build'].map(name => path.join(APP_ROOT, name));
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
// What Apargon keeps for each page: src/trampoline/storage.ts.
export const PAGE_RECORDS = path.join(DATA, 'pages-saved');
// Beside Apargon's data, not in it: a papp-system .papp file's sandbox may read the data, and none may read a secret.
export const SECRETS_DATA = path.join(path.dirname(DATA), 'apargon-secrets');
export const NET_DATA = path.join(DATA, 'net');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
// Kept out of a page's reads, picks and saves.
export const APARGON_FOLDERS = [DATA, SECRETS_DATA, INSTALL_FOLDER ?? []].flat();

// A page's own Electron data, the only part of Apargon's data its sandbox may write. Named after the path, so storage follows a move by renaming it.
export function pageStorage(page: string) {
  return path.join(PAGE_DATA, 'Partitions', createHash('sha256').update(page).digest('hex'));
}

// Named after the path: the same app after an edit, another for a copy.
export function pageAppId(page: string) {
  return `apargon-page-${createHash('sha256').update(page).digest('hex').slice(0, 16)}`;
}
