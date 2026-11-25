import { app, BrowserWindow, dialog, screen, type Rectangle, type Session } from 'electron';
import path from 'path';
import type { Permissions } from '../../permissions/tags/index.ts';
import { windowFeatures, type WindowSettings } from '../../permissions/window/index.ts';
import { APP_ROOT } from '../../shared/data/index.ts';
import { tellTrampoline } from '../channel/index.ts';
import { navigation } from './navigation/index.ts';
import { PAPP_PLATFORM } from '../platform/index.ts';
import { chooseBluetooth } from '../session/index.ts';

// The .papp file's windows: the main one, made here and not yet loaded, and the ones its window.open makes. bounds: where the user left the main window.
export function openWindows(papp: string, permissions: Permissions, pappSession: Session, bounds: Rectangle | null) {
  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png');

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const webSecurity = !permissions.net.length;
  const preload = path.join(app.getAppPath(), 'src/papp/api/preload/preload.cjs');
  const webPreferences: Electron.WebPreferences =
    permissions.system ?
      { session: pappSession, nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity, preload }
    : { session: pappSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity, preload };
  const declared = permissions.window ?? {};
  const { onTop = false, allSpaces = false, private: privateWindow = false, dock = true } = declared;
  // How a window looks, from papp-window settings. What is not in it, the tag alone decides. Without a title bar the OS still draws the window's buttons over the content.
  // blur: what is behind the window shows through the content's transparent parts, blurred: vibrancy on macOS, acrylic on Windows 11; Linux ignores both.
  const windowOptions = ({ width = 1200, height = 800, minWidth, minHeight, resizable = true, titleBar = true, frame = true, transparent = false, blur = false }: WindowSettings): Electron.BrowserWindowConstructorOptions => ({
    width,
    height,
    minWidth,
    minHeight,
    resizable,
    frame,
    transparent,
    ...(blur && { vibrancy: 'under-window', backgroundMaterial: 'acrylic', backgroundColor: '#00000000' }),
    alwaysOnTop: onTop,
    titleBarStyle: titleBar ? 'default' : 'hidden',
    titleBarOverlay: !titleBar,
    // The taskbar's dock=no, on Windows; macOS hides the dock icon below.
    skipTaskbar: !dock,
    icon,
    webPreferences,
  });
  // Where the user left the window, while that is still on a screen. A fixed size stays as declared.
  const saved = bounds && screen.getAllDisplays().some(({ workArea: area }) => bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y) ? bounds : null;
  const mainOptions = windowOptions(declared);
  const win = new BrowserWindow({ ...mainOptions, ...(saved && (mainOptions.resizable ? saved : { x: saved.x, y: saved.y })) });
  win.on('close', () => tellTrampoline('bounds', win.getNormalBounds()));
  PAPP_PLATFORM.pin?.(win, papp);
  const all = () => BrowserWindow.getAllWindows().filter(other => other.webContents.session === pappSession);
  const background = permissions.use.includes('background');
  let quitting = false;
  app.on('before-quit', () => (quitting = true));

  const toFront = () => {
    const [front] = all();
    front?.show();
    front?.focus();
  };

  const { isPapp, stayOnPapp } = navigation(papp);
  // A renderer that crashed or ran out of memory leaves its windows blank. One question, however many windows it took down.
  let asking = false;
  app.on('render-process-gone', async (_event, contents, details) => {
    if (asking || quitting || details.reason === 'clean-exit' || contents.session !== pappSession) {
      return;
    }

    asking = true;
    const { response } = await dialog.showMessageBox({ type: 'error', message: `${path.basename(papp)} stopped working.`, buttons: ['Reload', 'Quit'] });
    asking = false;

    if (response === 1) {
      // destroy() skips beforeunload, so a window that still works can't stop this quit.
      all().forEach(other => other.destroy());
      app.quit();
    } else {
      all().filter(dead => dead.webContents.isCrashed()).forEach(dead => dead.webContents.reload());
    }
  });

  return {
    main: win,
    toFront,
    // To every window of the .papp file.
    send: (channel: string, ...args: unknown[]) => all().forEach(other => other.webContents.send(channel, ...args)),
    // Loads the .papp file. enableApi: gives a window its papp, the main one and each one it opens.
    load(enableApi: (opened: BrowserWindow, options: Electron.BrowserWindowConstructorOptions) => void) {
      // options: what the window opened with; its calls are checked against them.
      const setUpWindow = (opened: BrowserWindow, options: Electron.BrowserWindowConstructorOptions) => {
        opened.webContents.on('will-frame-navigate', stayOnPapp);
        opened.webContents.on('will-redirect', stayOnPapp);
        // window.open on the .papp file itself opens a second window, with the tag's settings and its own on top, such as 'size=320x80, frame=no'.
        opened.webContents.setWindowOpenHandler(({ url, features }) => {
          if (!isPapp(url)) {
            tellTrampoline('openLink', url);

            return { action: 'deny' };
          }

          try {
            return { action: 'allow', overrideBrowserWindowOptions: windowOptions({ ...declared, ...(features ? windowFeatures(features) : {}) }) };
          } catch (err) {
            console.error(`Apargon: window.open: ${(err as Error).message}`);

            return { action: 'deny' };
          }
        });
        opened.webContents.on('did-create-window', (child, { options }) => setUpWindow(child, options));
        opened.webContents.setAudioMuted(!permissions.use.includes('sound'));

        if (permissions.use.includes('bluetooth')) {
          chooseBluetooth(opened.webContents);
        }

        // Windows tells a window, not powerMonitor, that the session ends.
        opened.on('session-end', () => opened.webContents.send('apargon-system', 'shutdown'));

        // Not a window option Electron takes: set on each window, the .papp file's second ones too. Only when on: on macOS each call hides the window a moment.
        if (allSpaces) {
          opened.setVisibleOnAllWorkspaces(true);
          // On macOS this drops the window's level: on top again, as the tag says.
          opened.setAlwaysOnTop(onTop);
        }

        if (privateWindow) {
          opened.setContentProtection(true);
        }

        // In the background the last window hides instead of closing; the tray icon shows it again or quits.
        opened.on('close', event => {
          if (background && !quitting && all().filter(other => other.isVisible()).length === 1) {
            event.preventDefault();
            opened.hide();
          }
        });

        enableApi(opened, options);
      };

      setUpWindow(win, mainOptions);
      void win.loadFile(papp);

      if (background) {
        app.on('activate', toFront);
      }

      // dock=no needs papp-use background, so its tray icon stays.
      if (!dock) {
        app.dock?.hide();
      }
    },
  };
}
