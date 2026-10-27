import { app } from 'electron';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { PAGE_SOURCE } from '../permissions/patterns.ts';
import { changeableSources, localPorts, type Permissions } from '../permissions/tags.ts';
import { APP_BUNDLE, APP_ROOT, DATA, PAGE_DATA } from '../shared.ts';
import type { Sandbox } from './platform.ts';
import { startProxy } from './proxy.ts';

export const seatbelt: Sandbox = {
  async prepare(_page, permissions) {
    const proxy = permissions.net.length ? await startProxy(permissions.net, null) : null;
    const proxyPort = proxy && (proxy.address() as AddressInfo).port;

    return { command: ['sandbox-exec', '-p', seatbeltProfile(permissions, proxyPort)], proxyPort, bridges: [], networkFd: null, close: () => proxy?.close() };
  },
  installHint: '',
};

function seatbeltProfile(permissions: Permissions, proxyPort: number | null) {
  const ports = [proxyPort ?? [], localPorts(permissions)].flat();
  const rules = [
    fs.readFileSync(path.join(APP_ROOT, 'sandbox/macos.sb'), 'utf8'),
    ...ports.map(port => `(allow network-outbound (remote ip "localhost:${port}"))`),
    ...permissions.sockets.map(socket => `(allow network-outbound (${fs.statSync(socket).isDirectory() ? 'subpath' : 'literal'} "${socket}"))`),
  ];

  if (!permissions.node) {
    const { files, pages } = changeableSources(permissions);
    rules.push(
      '(deny lsopen)',
      '(deny mach-lookup (global-name "com.apple.coreservices.appleevents"))',
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

  if (APP_BUNDLE) {
    rules.push(`(deny file-write* (subpath "${APP_BUNDLE}"))`);
  }

  return rules.join('\n') + '\n';
}
