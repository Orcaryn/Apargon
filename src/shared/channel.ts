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
// replies: a file, where the sandbox passes no more pipes; null when they come on REPLY_FD. bounds: where the user left the window, if anywhere.
export type PageConfig = { page: string; permissions: Permissions; pageHash: string | null; proxy: string | null; bridges: Bridge[]; requestFd: number; replies: string | null; bounds: Rectangle | null; menu: MenuState };
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

// The pipe ends with the trampoline; the file tells nothing, so there only the next request finds out.
export function onTrampolineEvent(events: EventHandlers<TrampolineEvents>) {
  const { replies } = PAGE_CONFIG!;

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

  if (replies) {
    // A last line without its newline is still being written: it is read next time.
    let done = 0;
    fs.watchFile(replies, { interval: 100 }, () => {
      const text = fs.readFileSync(replies, 'utf8');
      text.slice(done).split('\n').slice(0, -1).forEach(read);
      done = text.lastIndexOf('\n') + 1;
    });
  } else {
    readline
      .createInterface({ input: new net.Socket({ fd: REPLY_FD, writable: false }) })
      .on('line', read)
      .on('close', () => app.exit());
  }
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
