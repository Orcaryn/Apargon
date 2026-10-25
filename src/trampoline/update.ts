// Updates: the one network call the app makes for itself. The trampoline asks GitHub for the
// latest version once a day at most, when a page opens, in the packaged app only, and not if
// the user turned it off in the Permissions menu. The sandboxed child never does this.
// macOS: Squirrel, built into Electron, downloads the .zip and installs it on the next start.
// It takes only a build signed like the running one. Linux: a notice with a link to the release.

import { app, autoUpdater, dialog, net, shell } from 'electron';
import fs from 'fs';
import { UPDATE_FILE, type UpdateState } from '../shared.ts';

const REPO = 'Orcaryn/resworb';
// release.sh uploads one feed per build with each release: Squirrel's JSON format, which Linux reads too.
const FEED = `https://github.com/${REPO}/releases/latest/download/update-${process.platform}-${process.arch}.json`;
const DAY = 24 * 60 * 60 * 1000;

export function checkForUpdates() {
  const state: UpdateState = fs.existsSync(UPDATE_FILE) ? JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')) : {};
  const checkedToday = state.checked !== undefined && Date.now() - Date.parse(state.checked) < DAY;

  if (!app.isPackaged || state.automatic === false || checkedToday) {
    return;
  }

  fs.writeFileSync(UPDATE_FILE, JSON.stringify({ ...state, checked: new Date().toISOString() }, null, 2) + '\n');

  if (process.platform === 'darwin') {
    // Squirrel checks, downloads, verifies and installs on its own. A failure (an unsigned build, an app
    // folder it cannot write) is logged, not shown; without a listener it would throw.
    autoUpdater.on('error', err => console.error(`resworb: update failed: ${err.message}`));
    autoUpdater.setFeedURL({ url: FEED, serverType: 'json' });
    autoUpdater.checkForUpdates();
  } else {
    noticeNewVersion().catch((err: Error) => console.error(`resworb: update check failed: ${err.message}`));
  }
}

// Linux has no installer in Electron. Say once, per version, that there is a newer one.
async function noticeNewVersion() {
  const feed = (await net.fetch(FEED).then(response => response.json())) as { currentRelease: string };
  const latest = feed.currentRelease;
  const state: UpdateState = JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8'));

  if (latest === app.getVersion() || latest === state.noticed) {
    return;
  }

  fs.writeFileSync(UPDATE_FILE, JSON.stringify({ ...state, noticed: latest }, null, 2) + '\n');
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `resworb ${latest} is out.`,
    detail: `You have ${app.getVersion()}. The release notes say what changed, security fixes first.`,
    buttons: ['Open the Release', 'Later'],
  });

  if (response === 0) {
    shell.openExternal(`https://github.com/${REPO}/releases/tag/v${latest}`);
  }
}
