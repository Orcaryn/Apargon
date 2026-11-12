import { app } from 'electron';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
// Apargon's own data: the approvals, the picks, the window places, the secrets and the egress log. No .papp file may write here.
export const DATA = app.getPath('userData');
export const PAGE_RECORDS = path.join(DATA, 'pages');
export const SECRETS_DATA = path.join(DATA, 'secrets');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
// Each .papp file's own folder is in here, the one place it writes without a tag.
export const OWN_FOLDERS = path.join(os.homedir(), '.apargon');

// Its Electron data, in its own folder.
export function pageStorage(own: string) {
  return path.join(own, '.electron');
}

// Named after the path: the same app after an edit, another for a copy.
export function pageAppId(page: string) {
  return `apargon-page-${createHash('sha256').update(page).digest('hex').slice(0, 16)}`;
}
