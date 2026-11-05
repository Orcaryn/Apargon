import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import path from 'path';

// Each window in html/ fills itself in with render(); true when the user picks #allow.
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
  await win.loadFile(path.join(import.meta.dirname, 'html', file));
  await win.webContents.executeJavaScript(`render(${JSON.stringify(content)})`);
  await fit();
  app.focus({ steal: true });
  win.show();

  return new Promise<boolean>(resolve => {
    win.webContents.on('did-navigate-in-page', (_event, url) => {
      if (url.endsWith('#allow') || url.endsWith('#deny')) {
        resolve(url.endsWith('#allow'));
        win.close();
      } else {
        void fit();
      }
    });
    win.on('closed', () => resolve(false));
  });
}
