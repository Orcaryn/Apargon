import { Notification, type NativeImage } from 'electron';

// The side, in pixels, of the icon a .papp file's process sends the trampoline with a notification.
export const NOTICE_ICON_SIDE = 256;

// Held until answered: a notification nothing refers to is collected, and its clicks are lost.
const shown = new Set<Notification>();

// Shows the notification in whichever process may: the papp process on macOS, the trampoline elsewhere. Resolves with the button the user picked, or null when they click the notification itself or close it.
export function showNotice({ title, body, buttons }: { title: string; body: string; buttons: string[] }, icon: NativeImage | undefined, onClick: () => void) {
  return new Promise<number | null>(resolve => {
    const notification = new Notification({ title, body, actions: buttons.map(text => ({ type: 'button', text })), icon });

    const answer = (button: number | null) => {
      if (shown.delete(notification)) {
        resolve(button);
      }
    };

    shown.add(notification);
    notification
      .on('action', event => answer(event.actionIndex))
      .on('click', () => {
        onClick();
        answer(null);
      })
      .on('close', () => answer(null))
      .show();
  });
}
