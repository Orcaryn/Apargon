import { app, dialog } from 'electron';
import fs from 'fs';
import { PAPP_RECORDS } from '../shared/data/index.ts';
import type { Tell, TrampolineEvents } from '../shared/wire/protocol/index.ts';
import { approve } from './dialogs/approval/index.ts';
import { welcome } from './dialogs/skill/index.ts';
import { startPappProcess } from './pappProcess/index.ts';
import { TRAMPOLINE_PLATFORM } from './platform/index.ts';
import { menuState } from './records/index.ts';
import { serveRequests } from './requests/index.ts';
import { checkForUpdates } from './updates/index.ts';

let openPapps = 0;
// Each running .papp file's way to tell its process something.
const running = new Set<Tell<TrampolineEvents>>();
// Asked once: old and unsafe systems are refused.
let unsupported: Promise<string | null> | null = null;

// Every .papp file's menu shows the approvals and the update setting: a change from one is sent to all.
const refreshMenus = () => {
  const menu = menuState();

  running.forEach(tell => tell('refreshMenu', menu));
};

export async function startTrampoline(papps: string[]) {
  // The trampoline has no window of its own: it stays while a .papp file runs, and quits when the last one closes.
  app.on('window-all-closed', () => undefined);
  fs.mkdirSync(PAPP_RECORDS, { recursive: true });

  if (!papps.length) {
    await welcome(false);
    app.quit();
  } else {
    await welcome(true);
    papps.forEach(openPapp);
    checkForUpdates();
  }
}

export async function openPapp(file: string) {
  openPapps++;

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
      const started = await startPappProcess(approved);
      const serving = serveRequests(approved.papp, approved.permissions, started, openPapp, refreshMenus);
      running.add(serving.tell);
      await new Promise(resolve => started.child.on('close', resolve));
      running.delete(serving.tell);
      serving.close();
      started.close();

      // Restart: it opens again, and the popup asks again if the file changed.
      if (serving.restarting) {
        void openPapp(approved.papp);
      }
    }
  } catch (err) {
    console.error(`Apargon: ${(err as Error).message}`);
    dialog.showErrorBox('Apargon', (err as Error).message);
  }

  openPapps--;

  if (!openPapps) {
    app.quit();
  }
}
