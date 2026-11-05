import { Menu, nativeImage, Tray } from 'electron';
import path from 'path';
import type { TrayItem } from '../../../shared/channel.ts';
import { trayItems } from '../../../shared/menuItems.ts';

// A menu, not only a click: Linux sends no clicks, and a page in the background is quit from here.
export function trayFor(page: string, onShow: () => void, onQuit: () => void, onItem: (id: string) => void) {
  const name = path.basename(page);
  let tray: Tray | null = null;

  return (title: string | null, items: TrayItem[]) => {
    if (title === null) {
      tray?.destroy();
      tray = null;
    } else {
      if (!tray) {
        const icon = nativeImage.createFromPath(path.join(import.meta.dirname, 'images', 'tray.png'));
        icon.setTemplateImage(true);
        tray = new Tray(icon);
        tray.setToolTip(name);
      }

      tray.setTitle(title);
      tray.setContextMenu(Menu.buildFromTemplate([...trayItems(items, onItem), ...(items.length ? [{ type: 'separator' } as const] : []), { label: `Show ${name}`, click: onShow }, { label: `Quit ${name}`, click: onQuit }]));
    }
  };
}
