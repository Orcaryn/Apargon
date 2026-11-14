import { app, Menu, powerSaveBlocker, screen, type BrowserWindow, type BrowserWindowConstructorOptions, type Rectangle } from 'electron';
import { Readable } from 'stream';
import { pageMenuItems, type PageMenuItem } from '../../../../shared/menuItems/index.ts';
import type { Permissions } from '../../../../permissions/tags/index.ts';
import { callTrampoline, trampolineBytes } from '../../../channel/index.ts';
import type { PageMenus } from '../../../menu/index.ts';
import type { Scope } from '../../scope/index.ts';
import { checkChange, type WindowChange } from './change/index.ts';

export function windowApi(permissions: Permissions, { where }: Scope, win: BrowserWindow, menus: PageMenus, { resizable = true, frame = true }: BrowserWindowConstructorOptions) {
  // What may be turned on is the tag's; resizable and frame are this window's own, as Electron has no getter for frame.
  const { onTop = false, allSpaces = false, private: privateWindow = false } = permissions.window ?? {};
  // As the window opened, from the tag or window.open's features: what a reload goes back to.
  const [openedMinWidth, openedMinHeight] = win.getMinimumSize();
  // This window's own: a reload lets go of only these.
  const keptAwake = new Set<number>();
  // Electron has no getter for these. A window starts clickable, with no aspect ratio, whole.
  let clickThrough = false;
  let aspectRatio = 0;
  let shape: Rectangle[] = [];
  // Windows flashes until told to stop.
  win.on('focus', () => win.flashFrame(false));

  return {
    // Changes what it is given, then answers how the window is. What the tags did not turn on stays off: the popup said so.
    window(change: WindowChange = {}) {
      checkChange(change, permissions, { resizable, frame });

      // Its name and icon go in the title bar. Null clears it.
      const file = change.file ? where(change.file) : '';
      // Whole, on one screen's work area: a window off every screen, or under the menu bar or taskbar, is one the user cannot reach.
      const bounds = { ...win.getBounds(), ...change.bounds };
      const { workArea: area } = screen.getDisplayMatching(bounds);
      const offScreen = bounds.x < area.x || bounds.y < area.y || bounds.x + bounds.width > area.x + area.width || bounds.y + bounds.height > area.y + area.height;

      if (change.bounds && offScreen) {
        throw new Error(`Apargon: the window would leave the screen: it must fit within ${area.width} × ${area.height} at ${area.x}, ${area.y}. Read papp.displays() for each screen's work area.`);
      } else if (change.bounds) {
        win.setBounds(bounds);
      }

      if (change.resizable !== undefined) {
        win.setResizable(change.resizable);
      }

      if (change.minSize) {
        win.setMinimumSize(change.minSize.width, change.minSize.height);
      }

      if (change.maxSize) {
        win.setMaximumSize(change.maxSize.width, change.maxSize.height);
      }

      if (change.aspectRatio !== undefined) {
        aspectRatio = change.aspectRatio;
        win.setAspectRatio(aspectRatio);
      }

      // Windows and Linux only: elsewhere Electron ignores it.
      if (change.shape) {
        shape = change.shape;
        win.setShape(shape);
      }

      // macOS only: elsewhere Electron ignores both.
      if (change.file !== undefined) {
        win.setRepresentedFilename(file);
      }

      if (change.edited !== undefined) {
        win.setDocumentEdited(change.edited);
      }

      if (change.onTop !== undefined) {
        win.setAlwaysOnTop(change.onTop);
      }

      // On macOS each call hides the window and the dock icon a moment: only a change makes one.
      if (change.allSpaces !== undefined && change.allSpaces !== win.isVisibleOnAllWorkspaces()) {
        const wasOnTop = win.isAlwaysOnTop();
        win.setVisibleOnAllWorkspaces(change.allSpaces);
        // On macOS this drops the window's level.
        win.setAlwaysOnTop(wasOnTop);
      }

      if (change.clickThrough !== undefined) {
        clickThrough = change.clickThrough;
        win.setIgnoreMouseEvents(clickThrough);
      }

      if (change.private !== undefined) {
        win.setContentProtection(change.private);
      }

      if (change.opacity !== undefined) {
        win.setOpacity(change.opacity);
      }

      // Shown without focus: a page that takes focus could catch keys typed for another app.
      if (change.visible === true) {
        win.showInactive();
      } else if (change.visible === false) {
        win.hide();
      }

      if (change.state === 'minimized') {
        win.minimize();
      } else if (change.state === 'maximized') {
        win.maximize();
      } else if (change.state === 'normal') {
        win.unmaximize();
        win.restore();
      }

      const [minWidth, minHeight] = win.getMinimumSize();
      const [maxWidth, maxHeight] = win.getMaximumSize();

      return {
        onTop: win.isAlwaysOnTop(),
        allSpaces: win.isVisibleOnAllWorkspaces(),
        clickThrough,
        private: win.isContentProtected(),
        opacity: win.getOpacity(),
        bounds: win.getBounds(),
        visible: win.isVisible(),
        state: win.isMinimized() ? 'minimized' : win.isMaximized() ? 'maximized' : 'normal',
        resizable: win.isResizable(),
        minSize: { width: minWidth, height: minHeight },
        maxSize: { width: maxWidth, height: maxHeight },
        aspectRatio,
        shape,
        file: win.getRepresentedFilename() === '' ? null : win.getRepresentedFilename(),
        edited: win.isDocumentEdited(),
      };
    },
    // Each screen, and where on it a window may go.
    displays() {
      const primary = screen.getPrimaryDisplay().id;

      return screen.getAllDisplays().map(({ id, bounds, workArea, scaleFactor }) => ({ bounds, workArea, scaleFactor, primary: id === primary }));
    },
    // Keeps the computer awake, and with display its screen on, until letSleep, or the window closes or reloads.
    keepAwake({ display = false }: { display?: boolean } = {}) {
      const id = powerSaveBlocker.start(display ? 'prevent-display-sleep' : 'prevent-app-suspension');
      keptAwake.add(id);

      return id;
    },
    letSleep(id: number) {
      if (keptAwake.delete(id)) {
        powerSaveBlocker.stop(id);
      }
    },
    // A count on the dock or taskbar icon; 0 or null removes it.
    badge(count: number | null) {
      app.setBadgeCount(count ?? 0);
    },
    // Bounces the dock icon or flashes the taskbar until the user comes to the window. It never takes focus itself.
    attention() {
      if (!win.isFocused()) {
        win.flashFrame(true);
      }
    },
    pdf() {
      return win.webContents.printToPDF({});
    },
    // Makes a PDF and hands it to the trampoline, which shows the system print panel: the sandbox never reaches the print server. True once the user prints it.
    async print() {
      const pdf = Readable.from(await win.webContents.printToPDF({}), { objectMode: false });

      return callTrampoline('print', { data: trampolineBytes.send(pdf) }).finally(() => pdf.destroy());
    },
    menu(items: PageMenuItem[]) {
      menus.setPageMenus(pageMenuItems(items, id => win.webContents.send('apargon-menu', id)), win);
    },
    contextMenu(items: PageMenuItem[]) {
      Menu.buildFromTemplate(pageMenuItems(items, id => win.webContents.send('apargon-menu', id))).popup({ window: win });
    },
    closeWindow() {
      win.close();
    },
    // A bar on the window's dock or taskbar icon, from 0 to 1; null removes it.
    progress(value: number | null) {
      if (value !== null && !(typeof value === 'number' && value >= 0 && value <= 1)) {
        throw new Error('Apargon: progress takes a number from 0 to 1, or null to remove the bar.');
      }

      win.setProgressBar(value ?? -1);
    },
    // Back to what the tags set: nothing this window changed outlives a reload. The badge is the page's, not a window's: it stays until the page sets another or quits.
    reset() {
      menus.clearPageMenus(win);
      keptAwake.forEach(id => powerSaveBlocker.stop(id));
      keptAwake.clear();
      clickThrough = false;
      aspectRatio = 0;
      shape = [];

      if (!win.isDestroyed()) {
        win.setProgressBar(-1);
        win.setAlwaysOnTop(onTop);
        win.setIgnoreMouseEvents(false);
        win.setContentProtection(privateWindow);
        win.setOpacity(1);
        win.flashFrame(false);
        win.setResizable(resizable);
        win.setMinimumSize(openedMinWidth, openedMinHeight);
        win.setMaximumSize(0, 0);
        win.setAspectRatio(0);
        win.setShape([]);
        win.setRepresentedFilename('');
        win.setDocumentEdited(false);

        if (win.isVisibleOnAllWorkspaces() !== allSpaces) {
          win.setVisibleOnAllWorkspaces(allSpaces);
        }
      }
    },
  };
}
