import { app } from 'electron';
import { once } from 'events';
import fs from 'fs';
import net from 'net';
import path from 'path';
import type { Permissions } from './permissions/tags.ts';

export type Bridge = { port: number; socket: string };
export type ChildConfig = { page: string; permissions: Permissions; pageHash: string | null; proxy: string | null; bridges: Bridge[] };
export type ChildMessage = { open: string } | { revoke: string[] } | { showEgressLog: true } | { automaticUpdates: boolean } | { fileIcon: string };
export type Grants = Record<string, string[]>;
export type UpdateState = { automatic?: boolean; checked?: string; noticed?: string };

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
export const GRANTS_FILE = path.join(DATA, 'grants.json');
export const NET_DATA = path.join(DATA, 'net');
export const UPDATE_FILE = path.join(DATA, 'update.json');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
export const MESSAGE_FD = 3;
export const TRAMPOLINE_NETWORK_FD = 4;
export const APP_BUNDLE = app.isPackaged && process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : null;

export function writeJson(file: string, value: object) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
}

export async function relay(from: net.ListenOptions, to: net.NetConnectOpts) {
  const server = net.createServer(socket => {
    const upstream = net.connect(to);
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });
  server.listen(from);
  await once(server, 'listening');

  return server;
}
