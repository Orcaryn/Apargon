import { app } from 'electron';
import { randomUUID } from 'crypto';
import { once } from 'events';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import type { Rectangle } from 'electron';
import type { Permissions } from '../permissions/tags.ts';
import type { Answer, Calls, EventHandlers, PageEvents, Tell, TrampolineEvents } from './protocol.ts';

export type Bridge = { port: number; socket: string };
// What Apargon's menu shows: the approved pages, and whether it checks for updates.
export type MenuState = { approved: string[]; automaticUpdates: boolean };
// requestFd and replyFd: the page's pipes to and from the trampoline, REQUEST_FD and REPLY_FD where the sandbox passes them, standard output and input on Windows. bounds: where the user left the window, if anywhere.
export type PageConfig = { page: string; permissions: Permissions; pageHash: string | null; proxy: string | null; bridges: Bridge[]; requestFd: number; replyFd: number; bounds: Rectangle | null; menu: MenuState };
// A page's own tray items go above Apargon's Show and Quit; a click hands back the item's id.
export type TrayItem = { label: string; id: string } | { separator: true };
export type PageTray = { title: string | null; items: TrayItem[] };
export type SavedFile = { name: string; data: string };
export type PickOptions = { folder: boolean; multiple: boolean; write: boolean };
// Headers by lowercase name, repeats joined with a comma as a browser joins them; a body as base64.
export type IncomingRequest = { server: string; id: string; method: string; url: string; headers: Record<string, string>; body: string };
// icon: the page's icon as base64 PNG, once it has one.
export type Notice = { title: string; body: string; buttons: string[]; icon: string | null };

export const REQUEST_FD = 3;
export const TRAMPOLINE_NETWORK_FD = 4;
export const REPLY_FD = 5;
export const PAGE_CONFIG: PageConfig | null = process.env.APARGON ? JSON.parse(process.env.APARGON) : null;

// The trampoline can die under the page: a crash, or a kill. Its proxy and dialogs go with it, so the page quits, as bwrap's --die-with-parent already makes it on Linux.
function sendToTrampoline(message: object) {
  const line = Buffer.from(JSON.stringify(message) + '\n');

  try {
    for (let written = 0; written < line.length; ) {
      written += fs.writeSync(PAGE_CONFIG!.requestFd, line, written);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
      throw err;
    }

    app.exit();
  }
}

export const tellTrampoline: Tell<PageEvents> = (event, ...args) => sendToTrampoline({ event, args: args[0] });

// Each call waits for the one answer with its id.
const waiting = new Map<string, PromiseWithResolvers<unknown>>();

export function callTrampoline<K extends keyof Calls>(call: K, ...args: Calls[K]['args'] extends undefined ? [] : [Calls[K]['args']]) {
  const id = randomUUID();
  const answer = Promise.withResolvers<unknown>();
  waiting.set(id, answer);
  sendToTrampoline({ call, id, args: args[0] });

  return answer.promise as Promise<Calls[K]['result']>;
}

// The pipe ends with the trampoline, and the page with it. A socket, not process.stdin: in Electron's main process on Windows, that one ends at once.
export function onTrampolineEvent(events: EventHandlers<TrampolineEvents>) {
  const read = (line: string) => {
    const message: { event: keyof TrampolineEvents; args: unknown } | Answer = JSON.parse(line);

    if ('event' in message) {
      (events[message.event] as (args: unknown) => void)(message.args);
    } else {
      const { resolve, reject } = waiting.get(message.id)!;
      waiting.delete(message.id);

      if ('error' in message) {
        reject(new Error(message.error));
      } else {
        resolve(message.value);
      }
    }
  };

  readline
    .createInterface({ input: new net.Socket({ fd: PAGE_CONFIG!.replyFd, readable: true, writable: false }) })
    .on('line', read)
    .on('close', () => app.exit());
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
