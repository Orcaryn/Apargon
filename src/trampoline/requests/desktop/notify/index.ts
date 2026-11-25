import { nativeImage, Notification } from 'electron';
import type { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import { NOTICE_ICON_SIDE, type Notice, type Tell, type TrampolineEvents } from '../../../../shared/wire/protocol/index.ts';

// Held until answered: a notification nothing refers to is collected, and its clicks are lost.
const shown = new Set<Notification>();

// The trampoline shows every .papp file's notifications. Windows' notification service and Linux's D-Bus are out of the sandbox's reach, and macOS sends a click to the app it launched.
// Answers the button the user picked, 'click' for the notification itself, or null when they close it.
export function notifyHandler(permissions: Permissions, receive: (id: string) => Readable, tell: Tell<TrampolineEvents>) {
  return async ({ title, body, buttons, icon }: Notice) => {
    if (!permissions.use.includes('notifications')) {
      throw new Error('Apargon: this .papp file may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
    }

    // Counted, never decoded, as a tray icon's are.
    const pixels = icon === null ? null : await buffer(receive(icon));

    if (pixels && pixels.length !== NOTICE_ICON_SIDE * NOTICE_ICON_SIDE * 4) {
      throw new Error(`Apargon: a notification's icon is ${NOTICE_ICON_SIDE} × ${NOTICE_ICON_SIDE} pixels, 4 bytes each.`);
    }

    const notification = new Notification({
      title,
      body,
      actions: buttons.slice(0, 3).map(text => ({ type: 'button', text })),
      icon: pixels ? nativeImage.createFromBitmap(pixels, { width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE }) : undefined,
    });

    shown.add(notification);

    // The first answer counts: a click or a button also closes the notification.
    return new Promise<number | 'click' | null>((resolve, reject) => {
      notification
        .on('action', event => resolve(event.actionIndex))
        .on('click', () => {
          tell('show');
          resolve('click');
        })
        .on('close', () => resolve(null))
        .on('failed', (_event, error) => reject(new Error(`Apargon: the system did not show the notification: ${error}`)))
        .show();
    }).finally(() => shown.delete(notification));
  };
}
