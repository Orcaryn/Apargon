import { app } from 'electron';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
// A run from the source, under pnpm test: every popup says yes. The installed app never does.
export const TEST_ALLOW = !app.isPackaged && process.env.APARGON_TEST_ALLOW === '1';
// Apargon's own data: the approvals, the picks, the window places and the secrets. No .papp file may write here.
export const DATA = app.getPath('userData');
export const PAPP_RECORDS = path.join(DATA, 'papps');
export const SECRETS_DATA = path.join(DATA, 'secrets');
// Each .papp file's own folder is in here, the one place it writes without a tag.
export const OWN_FOLDERS = path.join(os.homedir(), '.apargon');

// Named after the path: the same app after an edit, another for a copy.
export function pappAppId(papp: string) {
  return `apargon-papp-${createHash('sha256').update(papp).digest('hex').slice(0, 16)}`;
}
