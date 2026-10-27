import { Notification } from 'electron';
import net from 'net';
import type { PagePlatform } from './platform.ts';

export const macos: PagePlatform = {
  isOffline: async () => !(await canBindLoopback()),
  notify(text, toFront) {
    new Notification(text).on('click', toFront).show();
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
