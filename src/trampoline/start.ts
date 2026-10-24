// Trampoline: has network, no window. One sandboxed child per page.

import { app, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import type { AddressInfo } from 'net';
import readline from 'readline';
import type { Readable } from 'stream';
import type { Permissions } from '../permissions/tags.ts';
import { APP_ROOT, EGRESS_LOG, GRANTS_FILE, type ChildConfig, type ChildMessage, type Grants } from '../shared.ts';
import { approve } from './approve.ts';
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
  const proxy = permissions.net.length ? await startProxy(permissions.net) : null;
  const proxyPort = proxy && (proxy.address() as AddressInfo).port;
  const env: NodeJS.ProcessEnv = { ...process.env, RESWORB: JSON.stringify({ page, permissions, proxy: proxy && `127.0.0.1:${proxyPort}` } satisfies ChildConfig) };

  if (proxy) {
    // curl honours these. Loopback goes direct, as Chromium does with --proxy-server.
    env.http_proxy = env.https_proxy = `http://127.0.0.1:${proxyPort}`;
    env.no_proxy = 'localhost,127.0.0.1';
  }

  app.dock?.hide(); // the child's window is the app in the Dock
  const sandbox = process.platform === 'darwin' ? ['sandbox-exec', '-p', seatbeltProfile(permissions, proxyPort)] : ['bwrap', '--unshare-net', '--dev-bind', '/', '/', '--die-with-parent'];
  // Chromium's own sandbox cannot start inside sandbox-exec or bwrap.
  const [command, ...args] = [...sandbox, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page];
  // fd 3 carries the child's requests: it cannot write the approvals or open other apps itself.
  const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'inherit', 'pipe'], env });
  readline.createInterface({ input: child.stdio[3] as Readable }).on('line', line => handleChildMessage(JSON.parse(line)));
  child.on('error', err => dialog.showErrorBox('resworb', `Could not start the sandbox: ${err.message}`));
  child.on('close', () => proxy?.close());

  return child;
}

// Nothing the child sends can add an approval.
function handleChildMessage(message: ChildMessage) {
  if ('open' in message) {
    openPage(message.open);
  } else if ('revoke' in message) {
    const grants: Grants = JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8'));
    const kept = Object.entries(grants).filter(([page]) => !message.revoke.includes(page));
    fs.writeFileSync(GRANTS_FILE, JSON.stringify(Object.fromEntries(kept), null, 2) + '\n');
  } else {
    shell.openPath(EGRESS_LOG);
  }
}
