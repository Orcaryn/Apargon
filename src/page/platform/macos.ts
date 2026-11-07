import { app, ShareMenu, systemPreferences } from 'electron';
import net from 'net';
import { tellTrampoline } from '../../shared/channel.ts';
import type { PagePlatform } from '../platform.ts';

export const macos: PagePlatform = {
  isOffline: async () => !(await canBindLoopback()),
  notifiesHere: true,
  processGroups: true,
  programsInheritFds: true,
  freshProgramHome: true,
  appMenu: true,
  hear(name, heard) {
    const subscribed = systemPreferences.subscribeNotification(name, (_name, info, sender) => heard(info, sender));

    return () => systemPreferences.unsubscribeNotification(subscribed);
  },
  share: (win, item) => new ShareMenu(item).popup({ window: win }),
  // The trampoline sets the file's icon: this process may not write there.
  showIcon(_win, icon, madeHere) {
    app.dock?.setIcon(icon);

    if (madeHere) {
      tellTrampoline('pageIcon', icon.toPNG().toString('base64'));
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
