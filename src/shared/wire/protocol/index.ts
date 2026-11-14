import type { Rectangle } from 'electron';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { StreamLine } from '../streams/index.ts';

export const REQUEST_FD = 3;
export const TRAMPOLINE_NETWORK_FD = 4;
export const REPLY_FD = 5;
export const MUX_FD = 6;
export const WAYLAND_FD = 7;

export type Relay = { port: number; target: string };
export type MenuState = { approved: string[]; automaticUpdates: boolean };
export type Pick = { path: string; write: boolean; folder: boolean };
// pageHash: null for a file with no tags. programsHere: whether the page's process starts its fenced programs inside its own sandbox, or the trampoline does.
export type PageConfig = { page: string; permissions: Permissions; pageHash: string | null; own: string; proxy: string | null; relays: Relay[]; requestFd: number; replyFd: number; muxFd: number | null; bounds: Rectangle | null; menu: MenuState; picks: Pick[]; programsHere: boolean };
export type TrayItem = { separator: true } | { label: string; id: string; checked?: boolean; radio?: boolean } | { label: string; submenu: TrayItem[] };
// Raw pixels, decoded and sized in the page's process: the trampoline, which has network, decodes no image a page sends.
export type TrayIcon = { width: number; height: number; pixels: string };
export type PageTray = { title: string | null; items: TrayItem[]; icon: TrayIcon | null; click: boolean };
// data: a stream's id.
export type SavedFile = { name: string; data: string };
export type PickOptions = { folder: boolean; multiple: boolean; write: boolean };
export type ProgramStart = { id: string; name: string; args: string[]; cwd: string; input: string };
export type ProgramExit = { status: number | null; signal: string | null; error: string | null };
// Headers by lowercase name, repeats joined with a comma as a browser joins them. body: a stream's id.
export type IncomingRequest = { server: string; id: string; method: string; url: string; headers: Record<string, string>; body: string };
// icon: the id of a stream of raw pixels, NOTICE_ICON_SIDE each way.
export type Notice = { title: string; body: string; buttons: string[]; icon: string | null };

// Bytes never ride in a call or an event: each names a stream of them, by the id its stream was given.
export type Calls = {
  saveAll: { args: { files: SavedFile[] }; result: string[] };
  save: { args: { file: string; data: string }; result: string | null };
  pick: { args: PickOptions; result: string[] };
  writePicked: { args: { file: string; data: string; append: boolean }; result: null };
  getSecret: { args: { name: string }; result: string | null };
  // A null value deletes the secret.
  setSecret: { args: { name: string; value: string | null }; result: null };
  listen: { args: { server: string; port: number | null }; result: string };
  // Answered only after the listener and its connections have closed.
  unlisten: { args: { server: string }; result: null };
  notify: { args: Notice; result: number | null };
  trash: { args: { file: string }; result: null };
  startProgram: { args: ProgramStart; result: { stdout: string; stderr: string } };
  print: { args: { data: string }; result: boolean };
};

export type PageEvents = {
  open: string;
  revoke: string[];
  showEgressLog: undefined;
  automaticUpdates: boolean;
  pageIcon: string;
  bounds: Rectangle;
  tray: PageTray;
  respond: { id: string; status: number; headers: Record<string, string>; body: string };
  installSkill: undefined;
  openLink: string;
  programKill: { id: string };
};

export type TrampolineEvents = {
  show: undefined;
  quit: undefined;
  refreshMenu: MenuState;
  trayItem: string;
  trayClick: Rectangle;
  request: IncomingRequest;
  picks: Pick[];
  programExit: { id: string } & ProgramExit;
};

export type Answer = { id: string; value: unknown } | { id: string; error: string };
export type Tell<E> = <K extends keyof E>(event: K, ...args: E[K] extends undefined ? [] : [E[K]]) => void;
export type EventHandlers<E> = { [K in keyof E]: (args: E[K]) => void };
export type CallHandlers = { [K in keyof Calls]: (args: Calls[K]['args']) => Promise<Calls[K]['result']> | Calls[K]['result'] };

// A papp-system page can write any line, so nothing here trusts its shape: a name is looked up only among the handlers' own keys, never Object's, and every call gets exactly one answer.
// False when the line is no event or call: the page's own output, where requests share standard output.
export function handleLine(line: Record<string, unknown>, events: EventHandlers<PageEvents>, calls: CallHandlers, answer: (answer: Answer) => void, streamLine: (line: StreamLine) => void) {
  const { event, call, id, args } = line;

  if (typeof line.stream === 'string') {
    streamLine(line as StreamLine);
  } else if (typeof call === 'string' && typeof id === 'string' && !Object.hasOwn(calls, call)) {
    answer({ id, error: `Apargon: no such call ${call}.` });
  } else if (typeof call === 'string' && typeof id === 'string') {
    // Inside async, so a handler that throws before its promise starts is an error answer too.
    const handler = calls[call as keyof Calls] as (args: unknown) => unknown;
    (async () => handler(args))().then(
      value => answer({ id, value }),
      (err: Error) => answer({ id, error: err.message })
    );
  } else if (typeof event === 'string' && !Object.hasOwn(events, event)) {
    throw new Error(`no such event ${event}`);
  } else if (typeof event === 'string') {
    (events[event as keyof PageEvents] as (args: unknown) => void)(args);
  } else {
    return false;
  }

  return true;
}
