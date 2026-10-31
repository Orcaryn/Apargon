import { app, dialog } from 'electron';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { Readable, Writable } from 'stream';
import { PAGE_ENV } from '../permissions/env.ts';
import { PERMISSIONS_PLATFORM } from '../permissions/platform.ts';
import { REPLY_FD, type PageConfig, type PageReply } from '../shared/channel.ts';
import { APP_ROOT, PAGE_DATA, REPLIES_DATA, SEEN_FILE } from '../shared/data.ts';
import { approve } from './dialogs/approve.ts';
import { welcome } from './dialogs/skill.ts';
import { checkForUpdates } from './network/update.ts';
import { TRAMPOLINE_PLATFORM } from './platform.ts';
import { handleRequest } from './requests/requests.ts';
import { trayFor } from './requests/tray/tray.ts';
import { followMove, noteContent } from './storage.ts';

let openPages = 0;
// The path of each page with a window, once per window.
const running: string[] = [];

export async function startTrampoline(pages: string[]) {
  // The trampoline has no window of its own: it stays while a page process runs, and quits when the last one closes.
  app.on('window-all-closed', () => undefined);

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

async function startPageProcess({ page, permissions, pageHash }: Pick<PageConfig, 'page' | 'permissions' | 'pageHash'>) {
  followMove(page, PAGE_DATA, SEEN_FILE, running);
  noteContent(page, SEEN_FILE);
  const sandbox = await TRAMPOLINE_PLATFORM.prepare(page, permissions);
  const proxy = sandbox.proxyPort === null ? null : `127.0.0.1:${sandbox.proxyPort}`;
  const inherited = Object.entries(process.env).filter(([name]) => permissions.node || PAGE_ENV.includes(PERMISSIONS_PLATFORM.envIgnoresCase ? name.toUpperCase() : name) || permissions.env.includes(name));
  const replies = sandbox.repliesInFile ? path.join(REPLIES_DATA, `${randomUUID()}.jsonl`) : null;

  if (replies) {
    fs.mkdirSync(REPLIES_DATA, { recursive: true });
    fs.writeFileSync(replies, '');
  }

  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), APARGON: JSON.stringify({ page, permissions, pageHash, proxy, bridges: sandbox.bridges, requestFd: sandbox.requestFd, replies } satisfies PageConfig) };

  if (proxy) {
    env.http_proxy = env.https_proxy = `http://${proxy}`;
    env.no_proxy = 'localhost,127.0.0.1';
  }

  app.dock?.hide();
  const [command, ...args] = sandbox.command([process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page], env);
  const child = spawn(command, args, { stdio: sandbox.stdio, env });

  const reply = (answer: PageReply) => {
    const line = JSON.stringify(answer) + '\n';

    if (replies) {
      fs.appendFileSync(replies, line);
    } else {
      (child.stdio.at(REPLY_FD) as Writable).write(line);
    }
  };

  const setTray = trayFor(page, () => reply({ trayClick: true }));

  readline.createInterface({ input: child.stdio[sandbox.requestFd] as Readable }).on('line', line => {
    if (line.startsWith('{')) {
      handleRequest(JSON.parse(line), { page, permissions, reply, setTray, openPage });
    } else if (line.trim()) {
      console.log(line);
    }
  });
  child.on('error', err => dialog.showErrorBox('Apargon', `Could not start the sandbox: ${err.message}${TRAMPOLINE_PLATFORM.installHint}`));
  running.push(page);
  child.on('close', () => {
    running.splice(running.indexOf(page), 1);
    noteContent(page, SEEN_FILE);
    setTray(null);
    sandbox.close();

    if (replies) {
      fs.rmSync(replies);
    }
  });

  return child;
}
