// What both processes use: the config the trampoline hands the child, the messages the
// child sends back, where papp keeps its files, the update setting, and the relay that
// carries the network into the Linux sandbox.

import { app } from 'electron';
import { once } from 'events';
import net from 'net';
import path from 'path';
import { PAGE_SOURCE } from './permissions/patterns.ts';
import type { Permissions } from './permissions/tags.ts';

// A bridge is a port inside the Linux sandbox's own network, relayed through a socket file to the trampoline.
export type Bridge = { port: number; socket: string };
// pageHash: for a downloaded page, the content the user allowed; the child serves no other.
export type ChildConfig = { page: string; permissions: Permissions; pageHash: string | null; proxy: string | null; bridges: Bridge[] };
export type ChildMessage = { open: string } | { revoke: string[] } | { showEgressLog: true } | { automaticUpdates: boolean } | { fileIcon: string };
export type Grants = Record<string, string[]>; // page → the ids of the lines the user allowed, and content:<hash> for a downloaded page
// The update check (trampoline/update.ts): off if the user turned it off, when the trampoline last asked
// GitHub, and the version Linux users were last told about. The child reads it for its menu.
export type UpdateState = { automatic?: boolean; checked?: string; noticed?: string };

export const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
export const PAGE_FILE = new RegExp(PAGE_SOURCE);
// Approvals live in DATA, which no page may write. The child's own Electron data goes to PAGE_DATA.
export const DATA = app.getPath('userData');
export const PAGE_DATA = path.join(DATA, 'pages');
export const GRANTS_FILE = path.join(DATA, 'grants.json');
// Linux: each page with servers gets a folder of socket files here. The sandbox shows a page its own and no other's.
export const NET_DATA = path.join(DATA, 'net');
export const UPDATE_FILE = path.join(DATA, 'update.json');
export const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
export const APP_BUNDLE = app.isPackaged && process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : null;

// Pipes every connection made to one address on to another. The Linux sandbox has a network
// of its own: the trampoline listens on a socket file, which the sandbox can see, and the
// child relays its own loopback ports to it.
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
