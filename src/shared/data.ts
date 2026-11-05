import { app } from 'electron';
import { createHash } from 'crypto';
import path from 'path';
import { PERMISSIONS_PLATFORM } from '../permissions/platform.ts';

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const INSTALL_FOLDER = app.isPackaged ? PERMISSIONS_PLATFORM.installFolder : null;
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
// What Apargon keeps for each page: src/trampoline/storage.ts.
export const PAGE_RECORDS = path.join(DATA, 'pages-saved');
// Beside Apargon's data, not in it: every page's sandbox may read the data, and none may read a secret.
export const SECRETS_DATA = path.join(path.dirname(DATA), 'apargon-secrets');
export const NET_DATA = path.join(DATA, 'net');
// Beside Apargon's data, which every page's sandbox may read: a reply can hold a secret. Each sandbox reads only its own page's folder here.
export const REPLIES_DATA = path.join(path.dirname(DATA), 'apargon-replies');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
// Kept out of a page's reads, picks and saves.
export const APARGON_FOLDERS = [DATA, SECRETS_DATA, REPLIES_DATA, INSTALL_FOLDER ?? []].flat();

// A page's own Electron data, the only part of Apargon's data its sandbox may write. Named after the path, so storage follows a move by renaming it.
export function pageStorage(page: string) {
  return path.join(PAGE_DATA, 'Partitions', createHash('sha256').update(page).digest('hex'));
}

// Named after the path: the same app after an edit, another for a copy.
export function pageAppId(page: string) {
  return `apargon-page-${createHash('sha256').update(page).digest('hex').slice(0, 16)}`;
}
