// The macOS sandbox profile for one page: sandbox/macos.sb plus the page's own rules.

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { changeableSources, LOCAL_HOSTS, type Permissions } from '../permissions/tags.ts';
import { APP_BUNDLE, APP_ROOT, DATA, PAGE_DATA } from '../shared.ts';

export function seatbeltProfile(permissions: Permissions, proxyPort: number | null) {
  const localPorts = permissions.net
    .map(pattern => pattern.split(':'))
    .filter(([host]) => LOCAL_HOSTS.includes(host))
    .map(([, port]) => port);
  const ports = proxyPort ? [proxyPort, ...localPorts] : localPorts;
  const rules = [fs.readFileSync(path.join(APP_ROOT, 'sandbox/macos.sb'), 'utf8'), ...ports.map(port => `(allow network-outbound (remote ip "localhost:${port}"))`)];

  if (!permissions.node) {
    rules.push(
      ';; No full Node: no opening other apps, writes only where granted. cfprefsd writes',
      ';; preferences from outside the sandbox, so file-write* alone does not stop them.',
      '(deny lsopen)',
      '(deny user-preference-write)',
      '(deny file-write*)',
      `(allow file-write* (subpath "/dev") (subpath "${fs.realpathSync(app.getPath('temp'))}"))`,
      ...changeableSources(permissions).map(source => `(allow file-write* (regex #"${source}"))`)
    );
  }

  rules.push(';; Never resworb itself: its approvals or the app.', `(deny file-write* (subpath "${DATA}"))`, `(allow file-write* (subpath "${PAGE_DATA}"))`);

  if (APP_BUNDLE) {
    rules.push(`(deny file-write* (subpath "${APP_BUNDLE}"))`);
  }

  return rules.join('\n') + '\n';
}
