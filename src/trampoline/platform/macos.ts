import { app } from 'electron';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { localPorts } from '../../permissions/network.ts';
import { changeableSources, literalBase, PAGE_SOURCE } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { REQUEST_FD } from '../../shared/channel.ts';
import { APP_ROOT, DATA, INSTALL_FOLDER, pageAppId, pageStorage, SECRETS_DATA } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

export const macos: TrampolinePlatform = {
  async prepare(page, permissions) {
    const proxy = permissions.net.length ? await startProxy(permissions.net, null) : null;
    const proxyPort = proxy && (proxy.address() as AddressInfo).port;
    const profile = seatbeltProfile(page, permissions, proxyPort);

    return { command: apargon => ['sandbox-exec', '-p', profile, ...apargon], stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'ignore', 'pipe'], requestFd: REQUEST_FD, replies: null, proxyPort, bridges: [], close: () => proxy?.close() };
  },
  installHint: '',
  // The quarantine mark says the file was downloaded; Spotlight keeps where from, the page last.
  downloadAddress(page) {
    if (spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', page]).status !== 0) {
      return null;
    }

    const whereFroms = spawnSync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemWhereFroms', page], { encoding: 'utf8' }).stdout;

    return [...whereFroms.matchAll(/"([^"]+)"/g)].at(-1)?.[1] ?? '';
  },
  pageIcon(page, png) {
    const hash = createHash('sha256').update(png).digest('hex');

    // A page that may write itself could have become a link: the icon would land on what it leads to.
    if (fs.lstatSync(page).isSymbolicLink() || spawnSync('/usr/bin/xattr', ['-p', 'com.apargon.icon', page], { encoding: 'utf8' }).stdout.trim() === hash) {
      return;
    }

    const script = `function run([page, png]) {
      ObjC.import('AppKit');
      const image = $.NSImage.alloc.initWithData($.NSData.alloc.initWithBase64EncodedStringOptions(png, 0));
      $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, page, 0);
    }`;
    spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, page, png]);
    spawnSync('/usr/bin/xattr', ['-w', 'com.apargon.icon', hash, page]);
  },
  markDownloaded(file) {
    spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};Apargon;${randomUUID().toUpperCase()}`, file]);
  },
  // A launch agent: login items take no arguments, so they could not name the page. Written only when it changes, as macOS tells the user each time.
  startAtLogin(page, on) {
    const label = `com.${pageAppId(page)}`;
    const agent = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const args = [process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), page].map(arg => `<string>${arg.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</string>`);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.join('')}</array><key>RunAtLoad</key><true/></dict></plist>
`;

    if (!on) {
      fs.rmSync(agent, { force: true });
    } else if (!fs.existsSync(agent) || fs.readFileSync(agent, 'utf8') !== plist) {
      fs.mkdirSync(path.dirname(agent), { recursive: true });
      fs.writeFileSync(agent, plist);
    }
  },
  noFollow: fs.constants.O_NOFOLLOW,
  autoUpdates: true,
};

function seatbeltProfile(page: string, permissions: Permissions, proxyPort: number | null) {
  const ports = [proxyPort ?? [], localPorts(permissions)].flat();
  const { files, pages } = changeableSources(permissions);
  const rules = [
    fs.readFileSync(path.join(import.meta.dirname, 'profiles', 'macos.sb'), 'utf8'),
    ...ports.map(port => `(allow network-outbound (remote ip "localhost:${port}"))`),
    ...permissions.sockets.map(socket => `(allow network-outbound (${socket.endsWith(path.sep) ? 'subpath' : 'literal'} "${literalBase(socket)}"))`),
    // The print server, which sends jobs on to the printers it knows.
    ...(permissions.use.includes('print') ? ['(allow network-outbound (literal "/private/var/run/cupsd"))'] : []),
    // Another app, or an Apple Event to one, would run outside the sandbox.
    '(deny lsopen)',
    // Sending only. The page's process must still receive Apple Events: Dock > Quit, logout, and a page opened while it runs.
    '(deny appleevent-send)',
    '(deny user-preference-write)',
    '(deny file-write*)',
    `(allow file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (subpath "/dev/fd") (subpath "${fs.realpathSync(app.getPath('temp'))}"))`,
    // Web Serial opens the port from this process. Any other device, like BPF, would reach past the network deny.
    ...(permissions.use.includes('serial') ? ['(allow file-write* (regex #"^/dev/(cu|tty)\\."))'] : []),
    ...files.map(source => `(allow file-write* (regex #"${source}"))`),
    `(deny file-write* (regex #"${PAGE_SOURCE}"))`,
    ...pages.map(source => `(allow file-write* (regex #"${source}"))`),
    `(deny file-read* file-write* (subpath "${SECRETS_DATA}"))`,
    `(deny file-write* (subpath "${DATA}"))`,
    `(allow file-write* (subpath "${pageStorage(page)}"))`,
  ];

  if (INSTALL_FOLDER) {
    rules.push(`(deny file-write* (subpath "${INSTALL_FOLDER}"))`);
  }

  // No terminal, not even by name: through it a page could type commands into the shell that started Apargon. Last, as /dev is writable above.
  rules.push('(deny file-read* file-write* file-ioctl (literal "/dev/tty") (regex #"^/dev/ttys[0-9]+$"))');

  return rules.join('\n') + '\n';
}
