import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PAGE_ENV } from '../permissions/env.ts';
import { withGiven } from '../permissions/given.ts';
import { literalBase } from '../permissions/patterns.ts';
import type { PageConfig, PageTray } from '../shared/channel.ts';
import { handleLine, type Tell, type TrampolineEvents } from '../shared/protocol.ts';
import { APP_ROOT, PAGE_RECORDS, pageStorage, SECRETS_DATA } from '../shared/data.ts';
import { approve } from './dialogs/approve.ts';
import { welcome } from './dialogs/skill.ts';
import { checkForUpdates } from './network/update.ts';
import { TRAMPOLINE_PLATFORM } from './platform.ts';
import { pageListeners } from './requests/listen.ts';
import { pageHandlers } from './requests/requests.ts';
import { moveSecrets } from './requests/secrets.ts';
import { trayFor } from './requests/tray/tray.ts';
import { followMove, noteContent } from './storage.ts';
import { menuState, records } from './store.ts';

let openPages = 0;
const running: { page: string; tell: Tell<TrampolineEvents> }[] = [];

// Every page's menu shows the approvals and the update setting: a change from one page is sent to all.
const refreshMenus = () => {
  const menu = menuState();

  running.forEach(({ tell }) => tell('refreshMenu', menu));
};

export async function startTrampoline(pages: string[]) {
  // The trampoline has no window of its own: it stays while a page process runs, and quits when the last one closes.
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

  // A page that opened at login, then was deleted, stops opening; approve then reports it missing.
  if (!fs.existsSync(file)) {
    TRAMPOLINE_PLATFORM.startAtLogin(file, false);
  }

  const child = await approve(file)
    .then(approved => approved && startPageProcess(approved))
    .catch((err: Error) => dialog.showErrorBox('Apargon', err.message));

  if (child) {
    await new Promise(resolve => child.on('close', resolve));
  }

  openPages--;

  if (!openPages) {
    app.quit();
  }
}

async function startPageProcess({ page, permissions: declared, pageHash }: Pick<PageConfig, 'page' | 'permissions' | 'pageHash'>) {
  const movedFrom = followMove(page, pageStorage, records, running.map(other => other.page));

  // Its data moves with it: storage, window and secrets. Its approval, links and picks stay with the old path, so it is asked again.
  if (movedFrom) {
    moveSecrets(movedFrom, page);
  }

  noteContent(page, pageStorage, records);
  // The sandboxes hide the folder, so it must be there to hide.
  fs.mkdirSync(SECRETS_DATA, { recursive: true });
  const permissions = withGiven(declared, records.get(page).given ?? [], page);

  // The sandbox grants a written path itself, so it must be there: a folder or a wildcard's folder is made as a folder, a file as an empty file. wx refuses a link the page planted, which would make its target.
  for (const pattern of permissions.write) {
    if (pattern.includes('*') || pattern.endsWith(path.sep)) {
      fs.mkdirSync(literalBase(pattern), { recursive: true });
    } else if (!fs.existsSync(pattern)) {
      fs.writeFileSync(pattern, '', { flag: 'wx' });
    }
  }

  const sandbox = await TRAMPOLINE_PLATFORM.prepare(page, permissions);
  TRAMPOLINE_PLATFORM.startAtLogin(page, permissions.use.includes('login'));
  const proxy = sandbox.proxyPort === null ? null : `127.0.0.1:${sandbox.proxyPort}`;
  // By name, as Windows finds Path for PATH.
  const passed = permissions.system ? Object.keys(process.env) : [...PAGE_ENV, ...permissions.env];
  const inherited = passed.filter(name => name in process.env).map(name => [name, process.env[name]]);
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), APARGON: JSON.stringify({ page, permissions, pageHash, proxy, bridges: sandbox.bridges, requestFd: sandbox.requestFd, replyFd: sandbox.replyFd, bounds: records.get(page).window ?? null, menu: menuState() } satisfies PageConfig) };

  // Programs reach a declared localhost port through the proxy too: no no_proxy, not even the user's.
  if (proxy) {
    env.http_proxy = env.https_proxy = `http://${proxy}`;
  }

  app.dock?.hide();
  const child = await sandbox.start([process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page], env).catch((err: Error) => {
    sandbox.close();

    throw new Error(`Could not start the sandbox: ${err.message}${TRAMPOLINE_PLATFORM.installHint}`);
  });
  // A pick or a notice answered after the page quit has no one to read it: the pipe refuses the write, and that is all.
  child.replies.on('error', () => undefined);
  const sendToPage = (message: object) => child.replies.write(JSON.stringify(message) + '\n');
  const tell: Tell<TrampolineEvents> = (event, ...args) => sendToPage({ event, args: args[0] });
  const showTray = trayFor(
    page,
    () => tell('show'),
    () => tell('quit'),
    id => tell('trayItem', id),
    bounds => tell('trayClick', bounds)
  );
  // A page in the background, or with tray items of its own, keeps an icon: it is how the user finds it again.
  const background = permissions.use.includes('background');
  const setTray = ({ title, items, icon, click }: PageTray) => showTray(title ?? (background || items.length ? '' : null), items, icon, click === true);
  setTray({ title: null, items: [], icon: null, click: false });
  const listeners = pageListeners(permissions, request => tell('request', request));
  let reopen = false;

  const restart = () => {
    reopen = true;
    tell('restart');
  };

  const { events, calls } = pageHandlers({ page, permissions, listeners, tell, setTray, openPage, restart, refreshMenus });

  // The page's requests, and its output as plain text: given the terminal itself, it could type commands into the shell that started Apargon.
  new Set([child.requests, child.output, child.errors]).forEach(stream => {
    readline.createInterface({ input: stream }).on('line', line => {
      let handled = false;

      // Where requests share standard output, a line that is no event or call is output. A papp-system page writes the line itself: one that throws is logged, not shown as an error box.
      if (stream === child.requests && line.startsWith('{')) {
        try {
          handled = handleLine(parseLine(line), events, calls, sendToPage);
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
    noteContent(page, pageStorage, records);
    showTray(null, [], null, false);
    listeners.closeAll();
    sandbox.close();

    // Before openPage counts this one closed, so the app does not quit in between.
    if (reopen) {
      void openPage(page);
    }
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
