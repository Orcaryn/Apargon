import { app, dialog } from 'electron';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { showPage } from './page/start.ts';
import { PAGE_FILE } from './permissions/patterns.ts';
import { MESSAGE_FD, PAGE_DATA, TRAMPOLINE_NETWORK_FD, type ChildConfig, type ChildMessage } from './shared.ts';
import { openPage } from './trampoline/start.ts';
import { checkForUpdates } from './trampoline/update.ts';

const childConfig: ChildConfig | null = process.env.PAPP ? JSON.parse(process.env.PAPP) : null;

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
    fs.writeSync(MESSAGE_FD, JSON.stringify({ open: page } satisfies ChildMessage) + '\n');
  } else if (app.isReady()) {
    openPage(page);
  } else {
    pages.push(page);
  }
});

app.whenReady().then(async () => {
  if (!pages.length) {
    dialog.showErrorBox('papp', 'Open a .papp page.');
    app.quit();
  } else if (childConfig && (process.platform === 'linux' ? !inEmptyNetwork() : await canBindLoopback())) {
    const refusal = 'This process can still open sockets, so it is not in the sandbox. Refusing to open the page. If PAPP is set in your environment, unset it.';
    console.error(`papp: ${refusal}`);
    dialog.showErrorBox('papp', refusal);
    app.quit();
  } else if (childConfig) {
    await showPage(childConfig);
  } else if (!['darwin', 'linux'].includes(process.platform)) {
    dialog.showErrorBox('papp', `No offline mode for ${process.platform} yet. papp opens pages on macOS and Linux.`);
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

function inEmptyNetwork() {
  const loopbackAndTunnelStubs = ['lo', 'sit0', 'tunl0', 'gre0', 'gretap0', 'erspan0', 'ip_vti0', 'ip6_vti0', 'ip6tnl0', 'ip6gre0'];
  const interfaces = fs.readFileSync('/proc/self/net/dev', 'utf8').split('\n').slice(2).filter(Boolean).map(line => line.split(':')[0].trim());
  const trampolineNetwork = `/proc/self/fd/${TRAMPOLINE_NETWORK_FD}`;

  return interfaces.every(name => loopbackAndTunnelStubs.includes(name)) && fs.existsSync(trampolineNetwork) && fs.statSync(trampolineNetwork).ino !== fs.statSync('/proc/self/ns/net').ino;
}

// Only EPERM is the sandbox's answer. Any other failure must count as "can".
function canBindLoopback(): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code !== 'EPERM'));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
