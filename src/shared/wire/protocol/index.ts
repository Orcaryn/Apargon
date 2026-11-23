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
// A pick to write: a file, or a folder to write in by plain names.
export type Pick = { path: string; folder: boolean };
// pappHash: null for a file whose tags ask nothing, or whose changes the user trusts. programsHere: whether the papp process starts its fenced programs inside its own sandbox, or the trampoline does.
export type PappConfig = { papp: string; permissions: Permissions; pappHash: string | null; own: string; proxy: string | null; relays: Relay[]; requestFd: number; replyFd: number; muxFd: number | null; bounds: Rectangle | null; menu: MenuState; programsHere: boolean };
export type TrayItem = { separator: true } | { label: string; id: string; checked?: boolean; radio?: boolean } | { label: string; submenu: TrayItem[] };
// Raw pixels, decoded and sized in the papp process: the trampoline, which has network, decodes no image a .papp file sends.
export type TrayIcon = { width: number; height: number; pixels: string };
export type PappTray = { title: string | null; items: TrayItem[]; icon: TrayIcon | null; click: boolean };
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

export type PappEvents = {
  open: string;
  revoke: string[];
  automaticUpdates: boolean;
  pappIcon: string;
  bounds: Rectangle;
  tray: PappTray;
  respond: { id: string; status: number; headers: Record<string, string>; body: string };
  installSkill: undefined;
  openLink: string;
  programKill: { id: string };
  restart: undefined;
};

export type TrampolineEvents = {
  show: undefined;
  quit: undefined;
  forceQuit: undefined;
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

// A papp-system .papp file can write any line, so nothing here trusts its shape: a name is looked up only among the handlers' own keys, never Object's, and every call gets exactly one answer.
// False when the line is no event or call: the papp process's own output, where requests share standard output.
export function handleLine(line: Record<string, unknown>, events: EventHandlers<PappEvents>, calls: CallHandlers, answer: (answer: Answer) => void, streamLine: (line: StreamLine) => void) {
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
    (events[event as keyof PappEvents] as (args: unknown) => void)(args);
  } else {
    return false;
  }

  return true;
}
