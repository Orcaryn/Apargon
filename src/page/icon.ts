// A page's favicon becomes its icon in the Dock, the app switcher and Finder (macOS) or its
// window icon (Linux), with papp's badge over the top right corner. papp draws the badge, not
// the page, so a page cannot pass for another app there.

import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ChildMessage } from '../shared.ts';
import { realPath } from './access.ts';

const TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Drawn again each time the page loads or its script changes the favicon. `canSee` is the
// page's read check, so its icon is a file it could load anyway.
export function followFavicon(win: BrowserWindow, canSee: (file: string) => boolean) {
  let favicons: string[] = [];

  const showFavicon = async () => {
    try {
      const favicon = favicons.map(url => readFavicon(url, canSee)).find(data => data !== undefined);

      if (favicon === undefined) {
        return;
      }

      const icon = await drawIcon(favicon);

      // Each page is its own app, so on macOS the app's icon is the page's. Finder shows it on
      // the page's file too, set by the trampoline: the sandbox lets no page change its own file.
      if (process.platform === 'darwin') {
        app.dock?.setIcon(icon);
        fs.writeSync(3, JSON.stringify({ fileIcon: icon.toPNG().toString('base64') } satisfies ChildMessage) + '\n');
      } else if (!win.isDestroyed()) {
        win.setIcon(icon);
      }
    } catch {
      // A favicon that does not load or draw leaves papp's icon.
    }
  };

  win.webContents.on('page-favicon-updated', (_event, urls) => {
    favicons = urls;
    showFavicon();
  });
  // Chromium does not report an unchanged favicon on a reload, though its file may have changed.
  win.webContents.on('did-start-loading', showFavicon);
}

// A favicon the page may see, as a data: URL, so the drawing window needs no file access.
function readFavicon(url: string, canSee: (file: string) => boolean) {
  if (url.startsWith('data:image/')) {
    return url;
  } else if (!url.startsWith('file:')) {
    return undefined;
  }

  const file = realPath(fileURLToPath(url));
  const type = TYPES[path.extname(file).toLowerCase()];

  return type !== undefined && canSee(file) ? `data:${type};base64,${fs.readFileSync(file).toString('base64')}` : undefined;
}

// Drawn on a canvas in a hidden window of its own: Electron's images cannot draw, or read SVG.
// The window gets only data: URLs, and its policy allows nothing else.
async function drawIcon(favicon: string) {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'icon.html')).toString('base64');
  const badge = fs.readFileSync(path.join(import.meta.dirname, 'badge.svg')).toString('base64');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });

  try {
    await win.loadURL(`data:text/html;base64,${html}`);
    const png: string = await win.webContents.executeJavaScript(`paint(${JSON.stringify(favicon)}, 'data:image/svg+xml;base64,${badge}')`);

    return nativeImage.createFromDataURL(png);
  } finally {
    win.destroy();
  }
}
