import { nativeImage } from 'electron';
import { cleanTrayItems } from '../../../../shared/menuItems/index.ts';
import type { PappTray, TrayIcon } from '../../../../shared/wire/protocol/index.ts';
import { tellTrampoline } from '../../../channel/index.ts';

// icon: PNG or JPEG bytes, or a data: URL of one; null is Apargon's. click: a click on the icon goes to papp.onTrayClick, and a right-click opens the menu.
export function tray(title: PappTray['title'], items: unknown = [], { icon = null, click = false }: { icon?: string | Uint8Array | null; click?: boolean } = {}) {
  tellTrampoline('tray', { title: title === null ? null : title.slice(0, 24), items: cleanTrayItems(items), icon: icon === null ? null : trayIcon(icon), click });
}

// Decoded here, in the sandbox, and sent as pixels: 32 high, as a menu bar shows it on a sharp screen, at most 64 wide.
function trayIcon(icon: string | Uint8Array): TrayIcon {
  const image = typeof icon === 'string' ? nativeImage.createFromDataURL(icon) : nativeImage.createFromBuffer(Buffer.from(icon));

  if (image.isEmpty()) {
    throw new Error('Apargon: a tray icon is PNG or JPEG bytes, or a data: URL of one.');
  }

  const size = image.getSize();
  const scale = Math.min(32 / size.height, 64 / size.width);
  const [width, height] = [size.width, size.height].map(side => Math.max(1, Math.round(side * scale)));

  return { width, height, pixels: image.resize({ width, height, quality: 'best' }).toBitmap().toString('base64') };
}
