import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'path';
import { cleanTrayItems, trayItems } from '../../../../shared/menuItems/index.ts';
import type { Tell, TrampolineEvents, TrayIcon, TrayItem } from '../../../../shared/wire/protocol/index.ts';
import { TRAMPOLINE_PLATFORM } from '../../../platform/index.ts';

// As the papp process sizes it: 32 pixels high, at most 64 wide, shown at half that on a sharp screen.
const ICON_SIDE = 64;

// A menu, not only a click: Linux sends no clicks, and a .papp file in the background is quit from here. A .papp file that takes clicks gets the left one; the right one, or Control and a click, still opens the menu, with Show and Quit.
export function trayFor(papp: string, tell: Tell<TrampolineEvents>) {
  const name = path.basename(papp);
  const apargonIcon = nativeImage.createFromPath(path.join(app.getAppPath(), 'src/trampoline/requests/desktop/tray/images/tray.png'));
  apargonIcon.setTemplateImage(true);
  let tray: Tray | null = null;
  let menu = Menu.buildFromTemplate([]);
  let clicks = false;

  return (title: string | null, items: TrayItem[], icon: TrayIcon | null, click: boolean) => {
    if (title === null) {
      tray?.destroy();
      tray = null;

      return;
    }

    // The icon first: one that is refused leaves the tray as it was, its menu too.
    const image = icon === null ? apargonIcon : iconFromPixels(icon);
    menu = Menu.buildFromTemplate([...trayItems(cleanTrayItems(items), id => tell('trayItem', id)), ...(items.length ? [{ type: 'separator' } as const] : []), { label: `Show ${name}`, click: () => tell('show') }, { label: `Quit ${name}`, click: () => tell('quit') }]);

    if (!tray) {
      const made = new Tray(image);
      made.setToolTip(name);
      // Without a context menu set, Electron opens none itself: these open it where the .papp file keeps the left click.
      made.on('click', (event, bounds) => clicks && (event.ctrlKey ? made.popUpContextMenu(menu) : tell('trayClick', bounds)));
      made.on('right-click', () => clicks && made.popUpContextMenu(menu));
      tray = made;
    }

    clicks = click && TRAMPOLINE_PLATFORM.trayClicks;
    tray.setImage(image);
    tray.setTitle(title);
    tray.setContextMenu(clicks ? null : menu);
  };
}

// Counted, never decoded: the pixels must fill the size they claim, and no more.
function iconFromPixels({ width, height, pixels }: TrayIcon) {
  const bytes = Buffer.from(pixels, 'base64');

  if (![width, height].every(side => Number.isInteger(side) && side >= 1 && side <= ICON_SIDE) || bytes.length !== width * height * 4) {
    throw new Error(`a tray icon is at most ${ICON_SIDE} × ${ICON_SIDE} pixels, 4 bytes each`);
  }

  return nativeImage.createFromBitmap(bytes, { width, height, scaleFactor: 2 });
}
