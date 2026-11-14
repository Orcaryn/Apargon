import { app, dialog } from 'electron';
import fs from 'fs';
import { PAGE_RECORDS } from '../shared/data/index.ts';
import type { Tell, TrampolineEvents } from '../shared/wire/protocol/index.ts';
import { approve } from './dialogs/approval/index.ts';
import { welcome } from './dialogs/skill/index.ts';
import { startPageProcess } from './pageProcess/index.ts';
import { TRAMPOLINE_PLATFORM } from './platform/index.ts';
import { menuState } from './records/index.ts';
import { serveRequests } from './requests/index.ts';
import { checkForUpdates } from './updates/index.ts';

let openPages = 0;
// Each running .papp file's way to tell its process something.
const running = new Set<Tell<TrampolineEvents>>();
// Asked once: old and unsafe systems are refused.
let unsupported: Promise<string | null> | null = null;

// Every .papp file's menu shows the approvals and the update setting: a change from one is sent to all.
const refreshMenus = () => {
  const menu = menuState();

  running.forEach(tell => tell('refreshMenu', menu));
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

  try {
    const refusal = await (unsupported ??= TRAMPOLINE_PLATFORM.unsupported());

    if (refusal) {
      throw new Error(refusal);
    }

    const approved = await approve(file);

    if (approved) {
      const started = await startPageProcess(approved);
      const serving = serveRequests(approved.page, approved.permissions, started, openPage, refreshMenus);
      running.add(serving.tell);
      await new Promise(resolve => started.child.on('close', resolve));
      running.delete(serving.tell);
      serving.close();
      started.close();
    }
  } catch (err) {
    console.error(`Apargon: ${(err as Error).message}`);
    dialog.showErrorBox('Apargon', (err as Error).message);
  }

  openPages--;

  if (!openPages) {
    app.quit();
  }
}
