import type { NativeImage } from 'electron';
import { Readable } from 'stream';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import { NOTICE_ICON_SIDE } from '../../../../shared/wire/protocol/index.ts';
import { callTrampoline, trampolineBytes } from '../../../channel/index.ts';

// papp.notify: the trampoline shows it, and answers the button the user picked, 'click' for the notification itself, or null when they close it.
export function notifyApi(permissions: Permissions, pappIcon: () => NativeImage | null) {
  return (title: string, body = '', { buttons = [] }: { buttons?: string[] } = {}) => {
    if (!permissions.use.includes('notifications')) {
      throw new Error('Apargon: this .papp file may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
    }

    const icon = pappIcon();
    // Sized here, in the sandbox, and sent as pixels: the trampoline, which has network, decodes no image a .papp file sends.
    const pixels = icon && Readable.from(icon.resize({ width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE, quality: 'best' }).toBitmap(), { objectMode: false });

    return callTrampoline('notify', { title, body, buttons: buttons.slice(0, 3), icon: pixels && trampolineBytes.send(pixels) }).finally(() => pixels?.destroy());
  };
}
