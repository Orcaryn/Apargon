import { app, ShareMenu, systemPreferences } from 'electron';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import net from 'net';
import { tellTrampoline } from '../../channel/index.ts';
import type { PappPlatform } from '../index.ts';

export const macos: PappPlatform = {
  isOffline: async () => !(await canBindLoopback()),
  notifiesHere: true,
  processGroups: true,
  programsInheritFds: true,
  appMenu: true,
  hear(name, heard) {
    const subscribed = systemPreferences.subscribeNotification(name, (_name, info, sender) => heard(info, sender));

    return () => systemPreferences.unsubscribeNotification(subscribed);
  },
  share: (win, item) => new ShareMenu(item).popup({ window: win }),
  // As a browser marks a download. The sandbox lets it set this only where it may write.
  markWritten(file) {
    spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};Apargon;${randomUUID().toUpperCase()}`, file]);
  },
  // The trampoline sets the file's icon: this process may not write there.
  showIcon(_win, icon, madeHere) {
    // The Dock holds its icon at 32 bytes a pixel: 32 MB at 1024 pixels a side, 2 MB at 256.
    app.dock?.setIcon(icon.resize({ width: 256, height: 256 }));

    if (madeHere) {
      tellTrampoline('pappIcon', icon.toPNG().toString('base64'));
    }
  },
};

// Seatbelt refuses the bind with EPERM. Any other failure is not proof, so it counts as a bind.
function canBindLoopback(): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code !== 'EPERM'));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
