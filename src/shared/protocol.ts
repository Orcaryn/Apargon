import type { Rectangle } from 'electron';
import type { Pick } from '../trampoline/records.ts';
import type { IncomingRequest, MenuState, Notice, PageTray, PickOptions, ProgramExit, ProgramStart, SavedFile } from './channel.ts';
import type { StreamLine } from './streams.ts';

// What a .papp file asks the trampoline for, each answered once: args is what it sends, result what it gets back. Bytes never ride in a call or an event: it names a stream of them, by the id streams.ts gave.
export type Calls = {
  // The paths saved to.
  saveAll: { args: { files: SavedFile[] }; result: string[] };
  // The path saved to, or null when the user cancels. Kept as a pick to write.
  save: { args: { file: string; data: string }; result: string | null };
  // The paths the user picked, kept.
  pick: { args: PickOptions; result: string[] };
  // What the user picked so far.
  picks: { args: undefined; result: Pick[] };
  // Writes a picked file, or a file by a plain name in a picked folder: the .papp file may not write there itself.
  writePicked: { args: { file: string; data: string; append: boolean }; result: null };
  getSecret: { args: { name: string }; result: string | null };
  // A null value deletes the secret.
  setSecret: { args: { name: string; value: string | null }; result: null };
  // The listener's address.
  listen: { args: { server: string; port: number | null }; result: string };
  // Acknowledged only after the listener and its connections have closed.
  unlisten: { args: { server: string }; result: null };
  // The button the user picked, or null.
  notify: { args: Notice; result: number | null };
  trash: { args: { file: string }; result: null };
  // A program the trampoline starts: on macOS every fenced one, everywhere an unfenced one. input: the id of the stream it reads. The result names the streams of its output; its exit comes as an event.
  startProgram: { args: ProgramStart; result: { stdout: string; stderr: string } };
  // The page makes a PDF, the trampoline shows the system print panel on it: the sandbox never reaches the print server. True once the user prints it.
  print: { args: { data: string }; result: boolean };
};

// What a .papp file tells the trampoline, with no answer.
export type PageEvents = {
  open: string;
  revoke: string[];
  showEgressLog: undefined;
  automaticUpdates: boolean;
  pageIcon: string;
  // Where the window was when it closed.
  bounds: Rectangle;
  tray: PageTray;
  // The answer to a request its listener got. body: a stream's id.
  respond: { id: string; status: number; headers: Record<string, string>; body: string };
  installSkill: undefined;
  // Opens only a link to a site in papp-net.
  openLink: string;
  programKill: { id: string };
};

// What the trampoline tells a .papp file, with no answer.
export type TrampolineEvents = {
  show: undefined;
  quit: undefined;
  refreshMenu: MenuState;
  trayItem: string;
  // A click on the tray icon, of a .papp file that asked for clicks: where the icon is on the screen.
  trayClick: Rectangle;
  // A request its listener got. It answers with respond.
  request: IncomingRequest;
  picks: Pick[];
  programExit: { id: string } & ProgramExit;
};

// On the wire, one JSON line each: { event, args }, { call, id, args }, the call's answer by its id, and a stream's lines.
export type Answer = { id: string; value: unknown } | { id: string; error: string };
export type Tell<E> = <K extends keyof E>(event: K, ...args: E[K] extends undefined ? [] : [E[K]]) => void;
export type EventHandlers<E> = { [K in keyof E]: (args: E[K]) => void };
export type CallHandlers = { [K in keyof Calls]: (args: Calls[K]['args']) => Promise<Calls[K]['result']> | Calls[K]['result'] };

// The trampoline's side of one line from a page. A papp-system page can write any line, so nothing here trusts its shape: a name is looked up only among the handlers' own keys, never Object's, and every call gets exactly one answer, whatever its handler does.
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
