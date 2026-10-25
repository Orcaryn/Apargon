// Trampoline: has network, no window. One sandboxed child per page.

import { app, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import readline from 'readline';
import type { Readable } from 'stream';
import { localPorts, type Permissions } from '../permissions/tags.ts';
import { APP_ROOT, DATA, EGRESS_LOG, GRANTS_FILE, relay, UPDATE_FILE, type Bridge, type ChildConfig, type ChildMessage, type Grants, type UpdateState } from '../shared.ts';
import { approve } from './approve.ts';
import { bwrapArgs } from './bwrap.ts';
import { startProxy } from './proxy.ts';
import { seatbeltProfile } from './seatbelt.ts';

// Pages from their popup until their child closes. The trampoline quits when none is left,
// not when the last child exits: another page's popup may still be open.
let openPages = 0;

export async function openPage(file: string) {
  openPages++;
  const child = await approve(file)
    .then(approved => approved && startChild(approved.page, approved.permissions))
    .catch((err: Error) => dialog.showErrorBox('resworb', err.message));

  if (child) {
    child.on('close', closePage); // after exit, or after error for a sandbox that never started
  } else {
    closePage();
  }
}

function closePage() {
  openPages--;

  if (!openPages) {
    app.quit();
  }
}

async function startChild(page: string, permissions: Permissions) {
  const linux = process.platform === 'linux';
  // Linux: the sandbox has a loopback of its own. The proxy and each declared port on this
  // computer wait on socket files in resworb's data, which the page can see but not change,
  // and the child relays the same ports on its own loopback to them.
  const sockets = linux && permissions.net.length ? fs.mkdtempSync(path.join(DATA, 'net-')) : null;
  const proxySocket = sockets && path.join(sockets, 'proxy.sock');
  const proxy = permissions.net.length ? await startProxy(permissions.net, proxySocket) : null;
  const localBridges = sockets ? localPorts(permissions).map(port => ({ port, socket: path.join(sockets, `${port}.sock`) })) : [];
  const localRelays = await Promise.all(localBridges.map(({ port, socket }) => relay({ path: socket }, { host: '127.0.0.1', port })));
  const proxyPort = !proxy ? null : proxySocket ? unusedPort(localBridges) : (proxy.address() as AddressInfo).port;
  const bridges = proxySocket && proxyPort ? [{ port: proxyPort, socket: proxySocket }, ...localBridges] : [];
  const env: NodeJS.ProcessEnv = { ...process.env, RESWORB: JSON.stringify({ page, permissions, proxy: proxy && `127.0.0.1:${proxyPort}`, bridges } satisfies ChildConfig) };

  if (proxy) {
    // curl honours these. Loopback goes direct, as Chromium does with --proxy-server.
    env.http_proxy = env.https_proxy = `http://127.0.0.1:${proxyPort}`;
    env.no_proxy = 'localhost,127.0.0.1';
  }

  app.dock?.hide(); // the child's window is the app in the Dock
  const sandbox = linux ? ['bwrap', ...bwrapArgs(permissions)] : ['sandbox-exec', '-p', seatbeltProfile(permissions, proxyPort)];
  // Chromium's own sandbox cannot start inside sandbox-exec or bwrap.
  const [command, ...args] = [...sandbox, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page];
  // fd 3 carries the child's requests: it cannot write the approvals or open other apps itself.
  // fd 4, on Linux, is the trampoline's network, which the child checks it is not in.
  const network = linux ? [fs.openSync('/proc/self/ns/net', 'r')] : [];
  const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'inherit', 'pipe', ...network], env });
  network.forEach(fd => fs.closeSync(fd));
  readline.createInterface({ input: child.stdio[3] as Readable }).on('line', line => handleChildMessage(JSON.parse(line)));
  child.on('error', err => dialog.showErrorBox('resworb', `Could not start the sandbox: ${err.message}`));
  child.on('close', () => {
    proxy?.close();
    localRelays.forEach(server => server.close());

    if (sockets) {
      fs.rmSync(sockets, { recursive: true });
    }
  });

  return child;
}

// Inside the Linux sandbox every port is free but the declared ones. 3128 is the usual proxy port.
function unusedPort(declared: Bridge[]) {
  let port = 3128;

  while (declared.some(bridge => bridge.port === port)) {
    port++;
  }

  return port;
}

// Nothing the child sends can add an approval.
function handleChildMessage(message: ChildMessage) {
  if ('open' in message) {
    openPage(message.open);
  } else if ('revoke' in message) {
    const grants: Grants = JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8'));
    const kept = Object.entries(grants).filter(([page]) => !message.revoke.includes(page));
    fs.writeFileSync(GRANTS_FILE, JSON.stringify(Object.fromEntries(kept), null, 2) + '\n');
  } else if ('automaticUpdates' in message) {
    const state: UpdateState = fs.existsSync(UPDATE_FILE) ? JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')) : {};
    fs.writeFileSync(UPDATE_FILE, JSON.stringify({ ...state, automatic: message.automaticUpdates }, null, 2) + '\n');
  } else {
    shell.openPath(EGRESS_LOG);
  }
}
