// resworb: a browser turned inside out. A page is HTML from disk. It asks in <meta> tags
// for what it needs: folders to see or change, servers to reach, programs to run, or full
// Node. With no tags it may see its own folder and nothing else, and opens without asking.
// With tags, a popup lists them in plain words and the user approves the list once.
//
// This app is two processes. Launched normally it is the trampoline (trampoline/): it reads
// the tags, asks, and spawns itself inside an OS sandbox with no network and writes
// limited to the granted folders. That child (page/) opens the page, with Node only
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
  } else if (childConfig && (process.platform === 'linux' ? !inEmptyNetwork() : await canBindLoopback())) {
    dialog.showErrorBox('resworb', 'This process can still open sockets. Refusing to open the page.');
    app.quit();
  } else if (childConfig) {
    await showPage(childConfig);
  } else if (!['darwin', 'linux'].includes(process.platform)) {
    dialog.showErrorBox('resworb', `No offline mode for ${process.platform} yet.`);
    app.quit();
  } else {
    pages.forEach(openPage);
  }
});

// The trampoline quits when its last page closes (trampoline/start.ts), not when a popup does.
app.on('window-all-closed', () => {
  if (childConfig) {
    app.quit();
  }
});

// bwrap gives the child a network of its own, with a loopback it may bind, so on Linux the
// kernel is asked instead. The child's network must list no interface but lo (and the
// tunnel stubs the kernel adds to every network), and must not be the trampoline's, open
// on fd 4. A real machine lists its Wi-Fi or Ethernet even when it is off; one with none
// still fails the second test. Neither reads RESWORB, so one typed by hand still refuses.
function inEmptyNetwork() {
  const stubs = ['lo', 'sit0', 'tunl0', 'gre0', 'gretap0', 'erspan0', 'ip_vti0', 'ip6_vti0', 'ip6tnl0', 'ip6gre0'];
  const interfaces = fs.readFileSync('/proc/self/net/dev', 'utf8').split('\n').slice(2).filter(Boolean).map(line => line.split(':')[0].trim());
  const trampolineNetwork = '/proc/self/fd/4';

  return interfaces.every(name => stubs.includes(name)) && fs.existsSync(trampolineNetwork) && fs.statSync(trampolineNetwork).ino !== fs.statSync('/proc/self/ns/net').ino;
}

// Inside Seatbelt even a loopback bind is EPERM (a child may connect to its declared
// ports, never bind). Outside it succeeds with or without internet. So this tells
// sandbox from no sandbox, and a RESWORB typed by hand still refuses.
function canBindLoopback(): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
