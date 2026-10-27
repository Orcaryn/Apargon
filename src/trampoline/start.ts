import { app, dialog, nativeImage, Notification, shell, Tray } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import readline from 'readline';
import type { Readable, Writable } from 'stream';
import { localPorts, PAGE_ENV } from '../permissions/tags.ts';
import { APP_ROOT, EGRESS_LOG, GRANTS_FILE, NET_DATA, MESSAGE_FD, PARENT_FD, relay, UPDATE_FILE, writeJson, type Bridge, type ChildConfig, type ChildMessage, type Grants, type ParentMessage, type UpdateState } from '../shared.ts';
import { approve } from './approve.ts';
import { bwrapArgs } from './bwrap.ts';
import { startProxy } from './proxy.ts';
import { seatbeltProfile } from './seatbelt.ts';

let openPages = 0;
const trays = new Map<ChildProcess, Tray>();

export async function openPage(file: string) {
  openPages++;
  const child = await approve(file)
    .then(approved => approved && startChild(approved))
    .catch((err: Error) => dialog.showErrorBox('papp', err.message));

  if (child) {
    await new Promise(resolve => child.on('close', resolve));
  }

  openPages--;

  if (!openPages) {
    app.quit();
  }
}

async function startChild({ page, permissions, pageHash }: Pick<ChildConfig, 'page' | 'permissions' | 'pageHash'>) {
  const linux = process.platform === 'linux';

  if (linux) {
    fs.mkdirSync(NET_DATA, { recursive: true });
  }

  const socketFolder = linux && permissions.net.length ? fs.mkdtempSync(path.join(NET_DATA, 'page-')) : null;
  const proxySocket = socketFolder && path.join(socketFolder, 'proxy.sock');
  const proxy = permissions.net.length ? await startProxy(permissions.net, proxySocket) : null;
  const localBridges = socketFolder ? localPorts(permissions).map(port => ({ port: +port, socket: path.join(socketFolder, `${port}.sock`) })) : [];
  const localRelays = await Promise.all(localBridges.map(({ port, socket }) => relay({ path: socket }, { host: '127.0.0.1', port })));
  const proxyPort = !proxy ? null : proxySocket ? unusedPort(localBridges) : (proxy.address() as AddressInfo).port;
  const bridges = proxySocket && proxyPort ? [{ port: proxyPort, socket: proxySocket }, ...localBridges] : [];
  const inherited = Object.entries(process.env).filter(([name]) => permissions.node || PAGE_ENV.includes(name) || permissions.env.includes(name));
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), PAPP: JSON.stringify({ page, permissions, pageHash, proxy: proxy && `127.0.0.1:${proxyPort}`, bridges } satisfies ChildConfig) };

  if (proxy) {
    env.http_proxy = env.https_proxy = `http://127.0.0.1:${proxyPort}`;
    env.no_proxy = 'localhost,127.0.0.1';
  }

  app.dock?.hide();
  const sandbox = linux ? ['bwrap', ...bwrapArgs(page, permissions, socketFolder)] : ['sandbox-exec', '-p', seatbeltProfile(permissions, proxyPort)];
  const [command, ...args] = [...sandbox, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page];
  const trampolineNetwork = linux ? fs.openSync('/proc/self/ns/net', 'r') : null;
  const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'inherit', 'pipe', trampolineNetwork ?? 'ignore', 'pipe'], env });

  if (trampolineNetwork !== null) {
    fs.closeSync(trampolineNetwork);
  }

  readline.createInterface({ input: child.stdio[MESSAGE_FD] as Readable }).on('line', line => handleChildMessage(child, page, JSON.parse(line)));
  child.on('error', err => dialog.showErrorBox('papp', `Could not start the sandbox: ${err.message}${linux ? '. Install papp from the .deb: it brings bwrap and the AppArmor profile Ubuntu needs.' : ''}`));
  child.on('close', () => {
    setTray(child, page, null);
    proxy?.close();
    localRelays.forEach(server => server.close());

    if (socketFolder) {
      fs.rmSync(socketFolder, { recursive: true });
    }
  });

  return child;
}

function unusedPort(declared: Bridge[]) {
  let port = 3128;

  while (declared.some(bridge => bridge.port === port)) {
    port++;
  }

  return port;
}

// Nothing the child sends can add an approval, or set the icon of any file but its page's.
function handleChildMessage(child: ChildProcess, page: string, message: ChildMessage) {
  if ('open' in message) {
    openPage(message.open);
  } else if ('revoke' in message) {
    const grants: Grants = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
    const kept = Object.entries(grants).filter(([page]) => !message.revoke.includes(page));
    writeJson(GRANTS_FILE, Object.fromEntries(kept));
  } else if ('automaticUpdates' in message) {
    const state: UpdateState = fs.existsSync(UPDATE_FILE) ? JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')) : {};
    writeJson(UPDATE_FILE, { ...state, automatic: message.automaticUpdates });
  } else if ('fileIcon' in message) {
    setFileIcon(page, message.fileIcon);
  } else if ('showEgressLog' in message) {
    shell.openPath(EGRESS_LOG);
  } else if ('notify' in message) {
    new Notification(message.notify).show();
  } else if ('tray' in message) {
    setTray(child, page, message.tray);
  }
}

function setFileIcon(page: string, png: string) {
  const hash = createHash('sha256').update(png).digest('hex');

  if (spawnSync('/usr/bin/xattr', ['-p', 'com.papp.icon', page], { encoding: 'utf8' }).stdout.trim() === hash) {
    return;
  }

  const script = `function run([page, png]) {
    ObjC.import('AppKit');
    const image = $.NSImage.alloc.initWithData($.NSData.alloc.initWithBase64EncodedStringOptions(png, 0));
    $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, page, 0);
  }`;
  spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, page, png]);
  spawnSync('/usr/bin/xattr', ['-w', 'com.papp.icon', hash, page]);
}

// papp's own icon, never the page's: in the menu bar there is no room for the badge.
function setTray(child: ChildProcess, page: string, title: string | null) {
  const tray = trays.get(child);

  if (title === null) {
    tray?.destroy();
    trays.delete(child);
  } else if (tray) {
    tray.setTitle(title);
  } else {
    const icon = nativeImage.createFromPath(path.join(import.meta.dirname, 'tray.png'));
    icon.setTemplateImage(true);
    const created = new Tray(icon);
    created.setToolTip(path.basename(page));
    created.setTitle(title);
    created.on('click', () => (child.stdio.at(PARENT_FD) as Writable).write(JSON.stringify({ trayClick: true } satisfies ParentMessage) + '\n'));
    trays.set(child, created);
  }
}
