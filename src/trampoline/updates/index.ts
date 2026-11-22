import { app, autoUpdater, dialog, net, shell } from 'electron';
import { TRAMPOLINE_PLATFORM } from '../platform/index.ts';
import { updates } from '../records/index.ts';

const REPO = 'Orcaryn/Apargon';
const FEED = `https://github.com/${REPO}/releases/latest/download/update-${TRAMPOLINE_PLATFORM.os}-${process.arch}.json`;
const DAY = 24 * 60 * 60 * 1000;

export function checkForUpdates() {
  const state = updates.get();
  const checkedToday = state.checked !== undefined && Date.now() - Date.parse(state.checked) < DAY;

  if (!app.isPackaged || state.automatic === false || checkedToday) {
    return;
  }

  updates.set({ checked: new Date().toISOString() });

  if (TRAMPOLINE_PLATFORM.autoUpdates) {
    autoUpdater.on('error', err => console.error(`Apargon: update failed: ${err.message}`));
    autoUpdater.setFeedURL({ url: FEED, serverType: 'json' });
    autoUpdater.checkForUpdates();
  } else {
    noticeNewVersion().catch((err: Error) => console.error(`Apargon: update check failed: ${err.message}`));
  }
}

async function noticeNewVersion() {
  const { currentRelease: latest } = (await net.fetch(FEED).then(response => response.json())) as { currentRelease: string };
  const state = updates.get();

  if (latest === app.getVersion() || latest === state.noticed) {
    return;
  }

  updates.set({ noticed: latest });
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `Apargon ${latest} is out.`,
    detail: `You have ${app.getVersion()}. The release notes say what changed, security fixes first.`,
    buttons: ['Open the Release', 'Later'],
  });

  if (response === 0) {
    void shell.openExternal(`https://github.com/${REPO}/releases/tag/v${latest}`);
  }
}
