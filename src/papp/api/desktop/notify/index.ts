import type { NativeImage } from 'electron';
import { Readable } from 'stream';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import { NOTICE_ICON_SIDE, showNotice } from '../../../../shared/notice/index.ts';
import { callTrampoline, trampolineBytes } from '../../../channel/index.ts';
import { PAPP_PLATFORM } from '../../../platform/index.ts';

// papp.notify: answers the button the user picked, or null when they click the notification itself or close it.
export function notifyApi(permissions: Permissions, toFront: () => void, pappIcon: () => NativeImage | null) {
  return (title: string, body = '', { buttons = [] }: { buttons?: string[] } = {}) => {
    if (!permissions.use.includes('notifications')) {
      throw new Error('Apargon: this .papp file may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
    }

    const notice = { title, body, buttons: buttons.slice(0, 3) };
    const icon = pappIcon();

    if (PAPP_PLATFORM.notifiesHere) {
      return showNotice(notice, icon ?? undefined, toFront);
    } else if (!icon) {
      return callTrampoline('notify', { ...notice, icon: null });
    }

    // Sized here, in the sandbox, and sent as pixels: the trampoline, which has network, decodes no image a .papp file sends.
    const pixels = Readable.from(icon.resize({ width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE, quality: 'best' }).toBitmap(), { objectMode: false });

    return callTrampoline('notify', { ...notice, icon: trampolineBytes.send(pixels) }).finally(() => pixels.destroy());
  };
}
