import { app } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import type { Rectangle } from 'electron';
import type { Permissions } from '../permissions/tags.ts';
import type { Pick } from '../trampoline/records.ts';
import type { Answer, Calls, EventHandlers, PageEvents, Tell, TrampolineEvents } from './protocol.ts';
import { byteStreams, type StreamLine } from './streams.ts';

// Linux: a port inside the sandbox that leads, through the mux, to a target of the trampoline's: the proxy, or the sound server.
export type Relay = { port: number; target: string };
// What Apargon's menu shows: the approved pages, and whether it checks for updates.
export type MenuState = { approved: string[]; automaticUpdates: boolean };
// requestFd and replyFd: the .papp file's pipes to and from the trampoline. muxFd: Linux's pipe for the relays. own: its own folder. pageHash: the bytes the user said yes to, null for a file with no tags. bounds: where the user left the window, if anywhere. programsHere: whether this process starts its fenced programs, inside its own sandbox, or the trampoline does.
export type PageConfig = { page: string; permissions: Permissions; pageHash: string | null; own: string; proxy: string | null; relays: Relay[]; requestFd: number; replyFd: number; muxFd: number | null; bounds: Rectangle | null; menu: MenuState; picks: Pick[]; programsHere: boolean };
// A page's own tray items go above Apargon's Show and Quit; a click hands back the item's id. checked makes a checkbox, with radio a radio button.
export type TrayItem = { separator: true } | { label: string; id: string; checked?: boolean; radio?: boolean } | { label: string; submenu: TrayItem[] };
// Raw pixels, decoded and sized in the page's process: the trampoline, which has network, decodes no image a page sends.
export type TrayIcon = { width: number; height: number; pixels: string };
// click: a click on the icon goes to the page, with where the icon is, and a right-click opens the menu. Where the OS sends no clicks, the menu opens as before.
export type PageTray = { title: string | null; items: TrayItem[]; icon: TrayIcon | null; click: boolean };
// data: a stream's id.
export type SavedFile = { name: string; data: string };
export type PickOptions = { folder: boolean; multiple: boolean; write: boolean };
export type ProgramStart = { id: string; name: string; args: string[]; cwd: string; input: string };
export type ProgramExit = { status: number | null; signal: string | null; error: string | null };
// Headers by lowercase name, repeats joined with a comma as a browser joins them; body: a stream's id.
export type IncomingRequest = { server: string; id: string; method: string; url: string; headers: Record<string, string>; body: string };
// icon: the page's icon, once it has one: the id of a stream of its raw pixels, NOTICE_ICON_SIDE each way, for the reason a tray icon is pixels.
export type Notice = { title: string; body: string; buttons: string[]; icon: string | null };

export const REQUEST_FD = 3;
export const TRAMPOLINE_NETWORK_FD = 4;
export const REPLY_FD = 5;
export const MUX_FD = 6;
export const WAYLAND_FD = 7;
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

// Bytes to and from the trampoline. A stream sent is named in a call or an event by its id; whoever sent it destroys it when the call ends.
export const trampolineBytes = byteStreams(sendToTrampoline);

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
    const message: { event: keyof TrampolineEvents; args: unknown } | Answer | StreamLine = JSON.parse(line);

    if ('stream' in message) {
      trampolineBytes.handle(message);
    } else if ('event' in message) {
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
