import { BrowserWindow, nativeImage, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { realPath } from '../../permissions/paths.ts';
import { PAGE_PLATFORM } from '../platform.ts';

const IMAGE_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Draws the page's favicon as its icon whenever it changes. Returns the icon as last drawn, which notifications show.
export function followFavicon(win: BrowserWindow, canSee: (file: string) => boolean, madeHere: boolean) {
  let favicons: string[] = [];
  let drawn: NativeImage | null = null;

  const showFavicon = async () => {
    const favicon = favicons.map(url => readFavicon(url, canSee)).find(data => data !== undefined);

    if (favicon === undefined) {
      return;
    }

    drawn = await drawIcon(favicon);
    PAGE_PLATFORM.showIcon(win, drawn, madeHere);
  };

  win.webContents.on('page-favicon-updated', (_event, urls) => {
    favicons = urls;
    showFavicon().catch(() => undefined);
  });
  win.webContents.on('did-start-loading', () => showFavicon().catch(() => undefined));

  return () => drawn;
}

function readFavicon(url: string, canSee: (file: string) => boolean) {
  if (url.startsWith('data:image/')) {
    return url;
  } else if (!url.startsWith('file:')) {
    return undefined;
  }

  const file = realPath(fileURLToPath(url));
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];

  return type !== undefined && canSee(file) ? `data:${type};base64,${fs.readFileSync(file).toString('base64')}` : undefined;
}

async function drawIcon(favicon: string) {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'html', 'icon.html')).toString('base64');
  const badge = fs.readFileSync(path.join(import.meta.dirname, 'images', 'badge.svg')).toString('base64');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });

  try {
    await win.loadURL(`data:text/html;base64,${html}`);
    const png: string = await win.webContents.executeJavaScript(`paint(${JSON.stringify(favicon)}, 'data:image/svg+xml;base64,${badge}')`);

    return nativeImage.createFromDataURL(png);
  } finally {
    win.destroy();
  }
}
