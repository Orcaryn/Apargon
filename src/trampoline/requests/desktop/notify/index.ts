import { nativeImage } from 'electron';
import type { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import { NOTICE_ICON_SIDE, showNotice } from '../../../../shared/notice/index.ts';
import type { Notice, Tell, TrampolineEvents } from '../../../../shared/wire/protocol/index.ts';

// Where the papp process can't show a notification itself, the trampoline does.
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

    return showNotice({ title, body, buttons: buttons.slice(0, 3) }, pixels ? nativeImage.createFromBitmap(pixels, { width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE }) : undefined, () => tell('show'));
  };
}
