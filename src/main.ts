// resworb: a browser turned inside out. A page is HTML from disk. It asks in <meta> tags
// for what it needs: folders to see or change, servers to reach, programs to run, or full
// Node. With no tags it gets its own folder and nothing else, and opens without asking.
// With tags, a popup lists them in plain words and the user approves the list once.
//
// This app is two processes. Launched normally it is the trampoline (trampoline/): it reads
// the tags, asks, and spawns itself inside an OS sandbox with no network and, on macOS,
// writes limited to the granted folders. That child (page/) opens the page, with Node only
// if it asked for full Node; otherwise the page talks to `window.resworb`. The rules both
// follow are in permissions/. See SECURITY.md.

import { app, dialog } from 'electron';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { showPage } from './page/start.ts';
import { PAGE_DATA, PAGE_FILE, type ChildConfig, type ChildMessage } from './shared.ts';
import { openPage } from './trampoline/start.ts';

// RESWORB marks the child. It is not a key: the child checks it is offline before it opens anything.
const childConfig: ChildConfig | null = process.env.RESWORB ? JSON.parse(process.env.RESWORB) : null;

if (childConfig) {
  app.setPath('userData', PAGE_DATA);

  if (childConfig.proxy) {
    app.commandLine.appendSwitch('proxy-server', childConfig.proxy);
  }
}

// Finder sends the file as an event, the command line as an argument. Resolve now:
// the child gets a different working directory.
const pages = process.argv.filter(arg => PAGE_FILE.test(arg)).map(arg => path.resolve(arg));
app.on('open-file', (event, file) => {
  event.preventDefault();

  if (childConfig) {
    // Another page gets its own approval and sandbox, from the trampoline.
    fs.writeSync(3, JSON.stringify({ open: path.resolve(file) } satisfies ChildMessage) + '\n');
  } else if (app.isReady()) {
    openPage(path.resolve(file));
  } else {
    pages.push(path.resolve(file));
  }
});

app.whenReady().then(async () => {
  if (!pages.length) {
    dialog.showErrorBox('resworb', 'Open a .lmth page.');
    app.quit();
  } else if (childConfig && (await canBindLoopback())) {
    dialog.showErrorBox('resworb', 'This process can still open sockets. Refusing to open the page.');
    app.quit();
  } else if (childConfig) {
    showPage(childConfig);
  } else if (!['darwin', 'linux'].includes(process.platform)) {
    dialog.showErrorBox('resworb', `No offline mode for ${process.platform} yet.`);
    app.quit();
  } else {
    pages.forEach(openPage);
  }
});

app.on('window-all-closed', () => app.quit());

// Inside the sandbox even a loopback bind is EPERM (a child may connect to its declared
// ports, never bind). Outside it succeeds with or without internet. So this tells
// sandbox from no sandbox, and a RESWORB typed by hand still refuses.
function canBindLoopback(): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
