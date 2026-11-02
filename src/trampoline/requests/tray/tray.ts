import { nativeImage, Tray } from 'electron';
import path from 'path';

export function trayFor(page: string, onClick: () => void) {
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
      tray.on('click', onClick);
    }
  };
}
