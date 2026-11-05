import { app } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { GivenFile } from '../permissions/given.ts';
import { PERMISSIONS_PLATFORM } from '../permissions/platform.ts';

export type Grants = Record<string, string[]>;
// Page to what the user picked for it.
export type Given = Record<string, GivenFile[]>;
// Page to the link hosts the user ticked "Always" for.
export type Links = Record<string, string[]>;
export type UpdateState = { automatic?: boolean; checked?: string; noticed?: string };

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const INSTALL_FOLDER = app.isPackaged ? PERMISSIONS_PLATFORM.installFolder : null;
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
export const GRANTS_FILE = path.join(DATA, 'grants.json');
export const GIVEN_FILE = path.join(DATA, 'given.json');
// Beside Apargon's data, not in it: every page's sandbox may read the data, and none may read a secret.
export const SECRETS_DATA = path.join(path.dirname(DATA), 'apargon-secrets');
export const LINKS_FILE = path.join(DATA, 'links.json');
export const SEEN_FILE = path.join(DATA, 'seen.json');
export const NET_DATA = path.join(DATA, 'net');
export const UPDATE_FILE = path.join(DATA, 'update.json');
// Beside Apargon's data, which every page's sandbox may read: a reply can hold a secret. Each sandbox reads only its own page's folder here.
export const REPLIES_DATA = path.join(path.dirname(DATA), 'apargon-replies');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');

// Named after the path: the same app after an edit, another for a copy.
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
