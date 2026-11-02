import { nativeImage, Notification } from 'electron';
import type { Notice } from './channel.ts';

// Held until answered: a notification nothing refers to is collected, and its clicks are lost.
const shown = new Set<Notification>();

// Shows the notification in whichever process may: the page's on macOS, the trampoline elsewhere. Resolves with the button the user picked, or null when they click the notification itself or close it.
export function showNotice({ title, body, buttons, icon }: Notice, onClick: () => void) {
  return new Promise<number | null>(resolve => {
    const notification = new Notification({ title, body, actions: buttons.map(text => ({ type: 'button', text })), icon: icon === null ? undefined : nativeImage.createFromBuffer(Buffer.from(icon, 'base64')) });

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
