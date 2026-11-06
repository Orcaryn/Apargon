import type { Rectangle } from 'electron';
import type { GivenFile } from '../permissions/given.ts';
import type { IncomingRequest, MenuState, Notice, PageTray, PickOptions, SavedFile } from './channel.ts';

// What a page asks the trampoline for, each answered once: args is what the page sends, result what it gets back.
export type Calls = {
  // The paths saved to.
  saveAll: { args: { files: SavedFile[] }; result: string[] };
  // The path saved to, or null when the user cancels.
  save: { args: { file: string; data: string }; result: string | null };
  pick: { args: PickOptions; result: string[] };
  // What the user picked for the page so far.
  given: { args: undefined; result: GivenFile[] };
  getSecret: { args: { name: string }; result: string | null };
  // A null value deletes the secret.
  setSecret: { args: { name: string; value: string | null }; result: null };
  // The listener's address.
  listen: { args: { server: string; port: number | null }; result: string };
  // The button the user picked, or null.
  notify: { args: Notice; result: number | null };
  trash: { args: { file: string }; result: null };
};

// What a page tells the trampoline, with no answer.
export type PageEvents = {
  open: string;
  revoke: string[];
  showEgressLog: undefined;
  automaticUpdates: boolean;
  pageIcon: string;
  // Where the window was when it closed.
  bounds: Rectangle;
  tray: PageTray;
  // The page's answer to a request its listener got.
  respond: { id: string; status: number; headers: Record<string, string>; body: string };
  unlisten: string;
  installSkill: undefined;
  openLink: string;
  openFile: string;
};

// What the trampoline tells a page, with no answer. restart quits past the page's beforeunload: the page asked for it with a write pick, and the trampoline opens it again.
export type TrampolineEvents = {
  show: undefined;
  quit: undefined;
  restart: undefined;
  refreshMenu: MenuState;
  trayItem: string;
  // A click on the tray icon, of a page that asked for clicks: where the icon is on the screen.
  trayClick: Rectangle;
  // A request the page's listener got; the page answers with respond.
  request: IncomingRequest;
};

// On the wire, one JSON line each: { event, args }, { call, id, args }, and the call's answer by its id.
export type Answer = { id: string; value: unknown } | { id: string; error: string };
export type Tell<E> = <K extends keyof E>(event: K, ...args: E[K] extends undefined ? [] : [E[K]]) => void;
export type EventHandlers<E> = { [K in keyof E]: (args: E[K]) => void };
export type CallHandlers = { [K in keyof Calls]: (args: Calls[K]['args']) => Promise<Calls[K]['result']> | Calls[K]['result'] };

// The trampoline's side of one line from a page. A papp-system page can write any line, so nothing here trusts its shape: a name is looked up only among the handlers' own keys, never Object's, and every call gets exactly one answer, whatever its handler does.
// False when the line is no event or call: the page's own output, where requests share standard output.
export function handleLine({ event, call, id, args }: Record<string, unknown>, events: EventHandlers<PageEvents>, calls: CallHandlers, answer: (answer: Answer) => void) {
  if (typeof call === 'string' && typeof id === 'string' && !Object.hasOwn(calls, call)) {
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
