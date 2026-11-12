import { app, Menu, powerSaveBlocker, screen, type BrowserWindow, type BrowserWindowConstructorOptions, type Rectangle } from 'electron';
import { Readable } from 'stream';
import type { Permissions } from '../../permissions/tags.ts';
import { callTrampoline, trampolineBytes } from '../../shared/channel.ts';
import type { PageMenus } from '../menu.ts';
import { pageMenuItems, type PageMenuItem } from '../../shared/menuItems.ts';
import type { Scope } from './scope.ts';

type Size = { width: number; height: number };
// minSize and maxSize: 0 on a side is no limit. aspectRatio: width over height, 0 for none. file: the file the window shows, named in its title bar (macOS); edited: the dot for unsaved changes.
// shape: the rectangles of the window, in its own pixels, that are drawn and take clicks; [] is the whole window (Windows and Linux).
type WindowChange = { onTop?: boolean; allSpaces?: boolean; clickThrough?: boolean; private?: boolean; opacity?: number; bounds?: Partial<Rectangle>; visible?: boolean; state?: 'normal' | 'minimized' | 'maximized'; resizable?: boolean; minSize?: Size; maxSize?: Size; aspectRatio?: number; file?: string | null; edited?: boolean; shape?: Rectangle[] };
// Below this a window on top would be a pane no one sees, catching the clicks meant for the app under it.
const LEAST_OPACITY = 0.3;

export function windowApi(permissions: Permissions, { where }: Scope, win: BrowserWindow, menus: PageMenus, { resizable = true, frame = true }: BrowserWindowConstructorOptions) {
  // What may be turned on is the tag's; resizable and frame are this window's own, as Electron has no getter for frame.
  const { onTop = false, allSpaces = false, clickThrough: mayClickThrough = false, private: privateWindow = false } = permissions.window ?? {};
  // As the window opened, from the tag or window.open's features: what a reload goes back to.
  const [minWidth, minHeight] = win.getMinimumSize();
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
      if (change.onTop && !onTop) {
        throw new Error('Apargon: this window may not stay on top. Ask for it with <meta name="papp-window" on-top>.');
      } else if (change.allSpaces && !allSpaces) {
        throw new Error('Apargon: this window may not show on every desktop. Ask for it with <meta name="papp-window" all-spaces>.');
      } else if (change.clickThrough && !mayClickThrough) {
        throw new Error('Apargon: this window may not let clicks pass through. Ask for it with <meta name="papp-window" click-through>.');
      } else if (change.private && !privateWindow) {
        throw new Error('Apargon: this window may not hide from screen sharing. Ask for it with <meta name="papp-window" private>.');
      } else if (change.visible === false && !permissions.use.includes('background')) {
        throw new Error('Apargon: this .papp file may not hide its window: it would run with nothing to show it. Ask for it with <meta name="papp-use" content="background">, which gives it a tray icon.');
      } else if (change.opacity !== undefined && !(change.opacity >= LEAST_OPACITY && change.opacity <= 1)) {
        throw new Error(`Apargon: opacity takes a number from ${LEAST_OPACITY} to 1.`);
      } else if (!resizable && (change.resizable || change.bounds?.width !== undefined || change.bounds?.height !== undefined || change.state === 'maximized')) {
        throw new Error('Apargon: this window has a fixed size: papp-window says resizable="no".');
      } else if (change.state !== undefined && !['normal', 'minimized', 'maximized'].includes(change.state)) {
        throw new Error("Apargon: state takes normal, minimized or maximized. For fullscreen, use the .papp file's own requestFullscreen().");
      } else if ([change.minSize, change.maxSize].some(size => size && ![size.width, size.height].every(side => Number.isInteger(side) && side >= 0))) {
        throw new Error('Apargon: minSize and maxSize take { width, height } in whole pixels; 0 on a side is no limit.');
      } else if (change.aspectRatio !== undefined && !(change.aspectRatio >= 0)) {
        throw new Error('Apargon: aspectRatio takes width over height, such as 16 / 9, or 0 for none.');
      } else if (change.shape?.length && frame) {
        throw new Error('Apargon: a window with a frame keeps its shape. Ask for it with <meta name="papp-window" frame="no">.');
      } else if (change.shape?.some(rect => ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger))) {
        throw new Error('Apargon: shape takes a list of { x, y, width, height } in whole pixels, or [] for the whole window.');
      }

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
        win.setMinimumSize(minWidth, minHeight);
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
