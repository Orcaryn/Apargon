import { Menu, nativeImage, Tray } from 'electron';
import path from 'path';

// A menu, not only a click: Linux sends no clicks, and a page in the background is quit from here.
export function trayFor(page: string, onShow: () => void, onQuit: () => void) {
  let tray: Tray | null = null;

  return (title: string | null) => {
    if (title === null) {
      tray?.destroy();
      tray = null;
    } else if (tray) {
      tray.setTitle(title);
    } else {
      const icon = nativeImage.createFromPath(path.join(import.meta.dirname, 'images', 'tray.png'));
      icon.setTemplateImage(true);
      tray = new Tray(icon);
      tray.setToolTip(path.basename(page));
      tray.setTitle(title);
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: `Show ${path.basename(page)}`, click: onShow },
          { label: `Quit ${path.basename(page)}`, click: onQuit },
        ])
      );
    }
  };
}
