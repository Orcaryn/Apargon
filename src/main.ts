import { app, dialog } from 'electron';
import path from 'path';
import { PAGE_PLATFORM } from './page/platform.ts';
import { showPage } from './page/start.ts';
import { PAGE_FILE } from './permissions/patterns.ts';
import { PAGE_DATA, tellTrampoline, type ChildConfig } from './shared.ts';
import { SANDBOX } from './trampoline/platform.ts';
import { openPage } from './trampoline/start.ts';
import { checkForUpdates } from './trampoline/update.ts';

const childConfig: ChildConfig | null = process.env.APARGON ? JSON.parse(process.env.APARGON) : null;

if (childConfig) {
  app.setPath('userData', PAGE_DATA);

  if (childConfig.proxy) {
    app.commandLine.appendSwitch('proxy-server', childConfig.proxy);
  }
}

const pages = process.argv.filter(arg => PAGE_FILE.test(arg)).map(arg => path.resolve(arg));
app.on('open-file', (event, file) => {
  const page = path.resolve(file);
  event.preventDefault();

  if (childConfig) {
    tellTrampoline({ open: page });
  } else if (app.isReady()) {
    openPage(page);
  } else {
    pages.push(page);
  }
});

app.whenReady().then(async () => {
  if (!pages.length) {
    dialog.showErrorBox('Apargon', 'Open a .papp page.');
    app.quit();
  } else if (childConfig && !(PAGE_PLATFORM && (await PAGE_PLATFORM.isOffline()))) {
    const refusal = 'This process can still open sockets, so it is not in the sandbox. Refusing to open the page. If APARGON is set in your environment, unset it.';
    console.error(`Apargon: ${refusal}`);
    dialog.showErrorBox('Apargon', refusal);
    app.quit();
  } else if (childConfig) {
    await showPage(childConfig);
  } else if (!SANDBOX) {
    dialog.showErrorBox('Apargon', `No offline mode for ${process.platform} yet. Apargon opens pages on macOS and Linux.`);
    app.quit();
  } else {
    pages.forEach(openPage);
    checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  if (childConfig) {
    app.quit();
  }
});
