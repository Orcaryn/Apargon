// What both processes use: the config the trampoline hands the child, the messages the
// child sends back, and where resworb keeps its files.

import { app } from 'electron';
import path from 'path';
import type { Permissions } from './permissions/tags.ts';

export type ChildConfig = { page: string; permissions: Permissions; proxy: string | null };
export type ChildMessage = { open: string } | { revoke: string[] } | { showEgressLog: true };
export type Grants = Record<string, string[]>; // page → the ids of the lines the user allowed

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const PAGE_FILE = /\.lmth$/;
// Approvals live in DATA, which no page may write. The child's own Electron data goes to PAGE_DATA.
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
export const GRANTS_FILE = path.join(DATA, 'grants.json');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
export const APP_BUNDLE = app.isPackaged && process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : null;
