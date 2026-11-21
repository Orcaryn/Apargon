import { app, BrowserWindow, nativeTheme, screen } from 'electron';

// file: one of the html/ windows, which fills itself in with render(). The user's yes: #allow, or #trust from the popup's checkbox. null for no.
export async function ask(file: string, content: object) {
  const width = 480;
  const win = new BrowserWindow({
    width,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  const fit = async () => {
    const height = await win.webContents.executeJavaScript(`document.body.offsetHeight + document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight`);
    win.setContentSize(width, Math.min(height, screen.getDisplayMatching(win.getBounds()).workArea.height - 80));
    win.center();
  };

  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(file);
  await win.webContents.executeJavaScript(`render(${JSON.stringify(content)})`);
  await fit();
  app.focus({ steal: true });
  // Above a .papp file's on-top window, which sits at the floating level and could paint other lines over these.
  win.setAlwaysOnTop(true, 'modal-panel');
  win.show();

  return new Promise<'allow' | 'trust' | null>(resolve => {
    win.webContents.on('did-navigate-in-page', (_event, url) => {
      if (url.endsWith('#allow')) {
        resolve('allow');
        win.close();
      } else if (url.endsWith('#trust')) {
        resolve('trust');
        win.close();
      } else if (url.endsWith('#deny')) {
        win.close();
      } else {
        void fit();
      }
    });
    win.on('closed', () => resolve(null));
  });
}
