import { app, autoUpdater, dialog, net, shell } from 'electron';
import fs from 'fs';
import { UPDATE_FILE, writeJson, type UpdateState } from '../shared.ts';

const REPO = 'Orcaryn/papp';
const FEED = `https://github.com/${REPO}/releases/latest/download/update-${process.platform}-${process.arch}.json`;
const DAY = 24 * 60 * 60 * 1000;

export function checkForUpdates() {
  const state: UpdateState = fs.existsSync(UPDATE_FILE) ? JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')) : {};
  const checkedToday = state.checked !== undefined && Date.now() - Date.parse(state.checked) < DAY;

  if (!app.isPackaged || state.automatic === false || checkedToday) {
    return;
  }

  writeJson(UPDATE_FILE, { ...state, checked: new Date().toISOString() });

  if (process.platform === 'darwin') {
    autoUpdater.on('error', err => console.error(`papp: update failed: ${err.message}`));
    autoUpdater.setFeedURL({ url: FEED, serverType: 'json' });
    autoUpdater.checkForUpdates();
  } else {
    noticeNewVersion().catch((err: Error) => console.error(`papp: update check failed: ${err.message}`));
  }
}

async function noticeNewVersion() {
  const feed = (await net.fetch(FEED).then(response => response.json())) as { currentRelease: string };
  const latest = feed.currentRelease;
  const state: UpdateState = fs.existsSync(UPDATE_FILE) ? JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')) : {};

  if (latest === app.getVersion() || latest === state.noticed) {
    return;
  }

  writeJson(UPDATE_FILE, { ...state, noticed: latest });
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `papp ${latest} is out.`,
    detail: `You have ${app.getVersion()}. The release notes say what changed, security fixes first.`,
    buttons: ['Open the Release', 'Later'],
  });

  if (response === 0) {
    shell.openExternal(`https://github.com/${REPO}/releases/tag/v${latest}`);
  }
}
