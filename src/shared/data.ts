import { app } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { PERMISSIONS_PLATFORM } from '../permissions/platform.ts';

export type Grants = Record<string, string[]>;
// Page to the link hosts the user ticked "Always" for.
export type Links = Record<string, string[]>;
export type UpdateState = { automatic?: boolean; checked?: string; noticed?: string };

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const INSTALL_FOLDER = app.isPackaged ? PERMISSIONS_PLATFORM.installFolder : null;
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
export const GRANTS_FILE = path.join(DATA, 'grants.json');
export const LINKS_FILE = path.join(DATA, 'links.json');
export const SEEN_FILE = path.join(DATA, 'seen.json');
export const NET_DATA = path.join(DATA, 'net');
export const UPDATE_FILE = path.join(DATA, 'update.json');
// Pages may read Apargon's data, not write it, so no page can forge another's replies.
export const REPLIES_DATA = path.join(DATA, 'replies');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');

// A page as an app of its own on the taskbar or dock, named after its path: the same after an edit, another for a copy.
export function pageAppId(page: string) {
  return `apargon-page-${createHash('sha256').update(page).digest('hex').slice(0, 16)}`;
}

export function readJson<T extends object>(file: string): T {
  return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}');
}

export function writeJson(file: string, value: object) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
}
