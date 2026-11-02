import { app } from 'electron';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { localPorts } from '../../permissions/network.ts';
import { changeableSources, PAGE_SOURCE } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { REQUEST_FD } from '../../shared/channel.ts';
import { DATA, INSTALL_FOLDER, PAGE_DATA } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

export const macos: TrampolinePlatform = {
  async prepare(_page, permissions) {
    const proxy = permissions.net.length ? await startProxy(permissions.net, null) : null;
    const proxyPort = proxy && (proxy.address() as AddressInfo).port;
    const profile = seatbeltProfile(permissions, proxyPort);

    return { command: apargon => ['sandbox-exec', '-p', profile, ...apargon], stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'ignore', 'pipe'], requestFd: REQUEST_FD, repliesInFile: false, proxyPort, bridges: [], close: () => proxy?.close() };
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

    if (spawnSync('/usr/bin/xattr', ['-p', 'com.apargon.icon', page], { encoding: 'utf8' }).stdout.trim() === hash) {
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
  autoUpdates: true,
};

function seatbeltProfile(permissions: Permissions, proxyPort: number | null) {
  const ports = [proxyPort ?? [], localPorts(permissions)].flat();
  const rules = [
    fs.readFileSync(path.join(import.meta.dirname, 'profiles', 'macos.sb'), 'utf8'),
    ...ports.map(port => `(allow network-outbound (remote ip "localhost:${port}"))`),
    ...permissions.sockets.map(socket => `(allow network-outbound (${fs.statSync(socket).isDirectory() ? 'subpath' : 'literal'} "${socket}"))`),
  ];

  if (!permissions.node) {
    const { files, pages } = changeableSources(permissions);
    rules.push(
      '(deny lsopen)',
      // Sending only. The page's process must still receive Apple Events: Dock > Quit, logout, and a page opened while it runs.
      '(deny appleevent-send)',
      '(deny user-preference-write)',
      '(deny file-write*)',
      `(allow file-write* (subpath "/dev") (subpath "${fs.realpathSync(app.getPath('temp'))}"))`,
      ...files.map(source => `(allow file-write* (regex #"${source}"))`),
      `(deny file-write* (regex #"${PAGE_SOURCE}"))`,
      ...pages.map(source => `(allow file-write* (regex #"${source}"))`),
      ...permissions.hidden.map(secret => `(deny file-read* file-write* (subpath "${secret}"))`)
    );
  }

  rules.push(`(deny file-write* (subpath "${DATA}"))`, `(allow file-write* (subpath "${PAGE_DATA}"))`);

  if (INSTALL_FOLDER) {
    rules.push(`(deny file-write* (subpath "${INSTALL_FOLDER}"))`);
  }

  // No terminal, not even by name: through it a page could type commands into the shell that started Apargon. Last, as /dev is writable above.
  rules.push('(deny file-read* file-write* file-ioctl (literal "/dev/tty") (regex #"^/dev/ttys[0-9]+$"))');

  return rules.join('\n') + '\n';
}
