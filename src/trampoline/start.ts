import { app, dialog } from 'electron';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import readline from 'readline';
import { PAGE_ENV } from '../permissions/env.ts';
import type { PageConfig, PageTray } from '../shared/channel.ts';
import { APP_ROOT, EGRESS_LOG, OWN_FOLDERS, PAGE_RECORDS, pageStorage } from '../shared/data.ts';
import { startMux } from '../shared/mux.ts';
import { handleLine, type Tell, type TrampolineEvents } from '../shared/protocol.ts';
import { byteStreams } from '../shared/streams.ts';
import { approve, type Approved } from './dialogs/approve.ts';
import { welcome } from './dialogs/skill.ts';
import { startProxy } from './network/proxy.ts';
import { checkForUpdates } from './network/update.ts';
import { TRAMPOLINE_PLATFORM } from './platform.ts';
import { pageListeners } from './requests/listen.ts';
import { programStarter } from './requests/programs.ts';
import { pageHandlers } from './requests/requests.ts';
import { trayFor } from './requests/tray/tray.ts';
import { menuState, records } from './store.ts';

let openPages = 0;
const running: { page: string; tell: Tell<TrampolineEvents> }[] = [];
// Asked once: old and unsafe systems are refused.
let unsupported: Promise<string | null> | null = null;

// Every .papp file's menu shows the approvals and the update setting: a change from one is sent to all.
const refreshMenus = () => {
  const menu = menuState();

  running.forEach(({ tell }) => tell('refreshMenu', menu));
};

export async function startTrampoline(pages: string[]) {
  // The trampoline has no window of its own: it stays while a .papp file runs, and quits when the last one closes.
  app.on('window-all-closed', () => undefined);
  fs.mkdirSync(PAGE_RECORDS, { recursive: true });

  if (!pages.length) {
    await welcome(false);
    app.quit();
  } else {
    await welcome(true);
    pages.forEach(openPage);
    checkForUpdates();
  }
}

export async function openPage(file: string) {
  openPages++;

  // One that opened at login, then was deleted, stops opening.
  if (!fs.existsSync(file)) {
    TRAMPOLINE_PLATFORM.startAtLogin(file, false);
  }

  const child = await (unsupported ??= TRAMPOLINE_PLATFORM.unsupported())
    .then(refusal => {
      if (refusal) {
        throw new Error(refusal);
      }

      return approve(file);
    })
    .then(approved => approved && startPageProcess(approved))
    .catch((err: Error) => {
      console.error(`Apargon: ${err.message}`);
      dialog.showErrorBox('Apargon', err.message);
    });

  if (child) {
    await new Promise(resolve => child.on('close', resolve));
  }

  openPages--;

  if (!openPages) {
    app.quit();
  }
}

async function startPageProcess({ page, permissions, pageHash }: Approved) {
  // Its own folder, by its id: an update, under any name or path, finds its data. The id is kept with the file's record, so a revoke can find its secrets.
  const own = path.join(OWN_FOLDERS, permissions.id);
  const storage = pageStorage(own);
  fs.mkdirSync(storage, { recursive: true });
  records.change(page, { id: permissions.id });
  // All of its network goes through the proxy. papp-system has no limits, so no proxy either.
  const proxy = permissions.net.length && !permissions.system ? await startProxy(permissions.net, EGRESS_LOG) : null;
  const proxyPort = proxy && (proxy.address() as AddressInfo).port;
  const prepared = await TRAMPOLINE_PLATFORM.prepare({ page, permissions, own, storage, proxyPort }).catch((err: Error) => {
    proxy?.close();

    throw err;
  });
  TRAMPOLINE_PLATFORM.startAtLogin(page, permissions.use.includes('login'));
  // By name, as Windows finds Path for PATH. papp-system gets all of it. Its papp-env names too, where it starts its own programs.
  const passed = permissions.system ? Object.keys(process.env) : [...PAGE_ENV, ...permissions.env];
  const inherited = passed.filter(name => name in process.env).map(name => [name, process.env[name]]);
  const config: PageConfig = {
    page,
    permissions,
    pageHash,
    own,
    proxy: prepared.proxy,
    relays: prepared.relays,
    requestFd: prepared.requestFd,
    replyFd: prepared.replyFd,
    muxFd: prepared.muxFd,
    bounds: records.get(page).window ?? null,
    menu: menuState(),
    picks: records.get(page).picks ?? [],
    programsHere: prepared.programsHere,
  };
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), APARGON: JSON.stringify(config) };

  app.dock?.hide();
  const child = await prepared.start([process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page], env).catch((err: Error) => {
    prepared.close();
    proxy?.close();

    throw new Error(`Could not start the sandbox: ${err.message}`);
  });

  // Only the relays this .papp file was given: a name it asks for is no yes. papp-net alone must not reach the sound server.
  if (child.mux) {
    startMux(child.mux, target => (prepared.relays.some(relay => relay.target === target) ? prepared.relayTargets[target]() : null));
  }

  // A reply answered after the .papp file quit has no one to read it: the pipe refuses the write, and that is all.
  child.replies.on('error', () => undefined);
  const sendToPage = (message: object) => child.replies.write(JSON.stringify(message) + '\n');
  const tell: Tell<TrampolineEvents> = (event, ...args) => sendToPage({ event, args: args[0] });
  const bytes = byteStreams(sendToPage);
  const showTray = trayFor(
    page,
    () => tell('show'),
    () => tell('quit'),
    id => tell('trayItem', id),
    bounds => tell('trayClick', bounds)
  );
  // In the background, or with tray items of its own, it keeps an icon: it is how the user finds it again.
  const background = permissions.use.includes('background');
  const setTray = ({ title, items, icon, click }: PageTray) => showTray(title ?? (background || items.length ? '' : null), items, icon, click);
  setTray({ title: null, items: [], icon: null, click: false });
  const listeners = pageListeners(permissions, request => tell('request', request), bytes.send);
  const programs = programStarter(page, permissions, prepared, tell, bytes);
  const { events, calls } = pageHandlers({ page, permissions, own, listeners, programs, tell, receive: bytes.receive, setTray, openPage, refreshMenus });

  // Its requests, and its output as plain text: given the terminal itself, it could type commands into the shell that started Apargon.
  new Set([child.requests, child.output, child.errors]).forEach(stream => {
    readline.createInterface({ input: stream }).on('line', line => {
      let handled = false;

      if (stream === child.requests && line.startsWith('{')) {
        try {
          handled = handleLine(parseLine(line), events, calls, sendToPage, bytes.handle);
        } catch (err) {
          handled = true;
          console.error(`Apargon: ${path.basename(page)} sent a bad request: ${(err as Error).message}`);
        }
      }

      if (!handled && line.trim()) {
        (stream === child.errors ? console.error : console.log)(line.replace(/[\p{Cc}\p{Cf}]/gu, ''));
      }
    });
  });
  const entry = { page, tell };
  running.push(entry);
  child.on('close', () => {
    running.splice(running.indexOf(entry), 1);
    // Programs stop when the .papp file closes.
    programs.stopAll();
    bytes.closeAll();
    showTray(null, [], null, false);
    void listeners.closeAll();
    proxy?.close();
    prepared.close();
  });

  return child;
}

// A line starting with { parses to an object, or to none: output, as a line with no event or call is.
function parseLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line);
  } catch {
    return {};
  }
}
