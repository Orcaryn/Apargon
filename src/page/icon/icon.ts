import { BrowserWindow, nativeImage, session, type NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { realPath } from '../../permissions/paths.ts';
import { PAGE_PLATFORM } from '../platform.ts';

const MAX_FAVICON_BYTES = 1024 * 1024;
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
  let faviconUrls: string[] = [];
  let drawn: NativeImage | null = null;

  const drawFavicons = async () => {
    const urls = faviconUrls;
    const read = await Promise.all(urls.map(url => readFavicon(win, url, canSee).catch(() => undefined)));
    const favicons = read.filter(favicon => favicon !== undefined);

    // The page changed its favicon while a web one downloaded: the newer call draws.
    if (favicons.length === 0 || urls !== faviconUrls) {
      return;
    }

    const icon = await drawIcon(favicons);

    // None decoded: the icon as last drawn stays.
    if (icon === null) {
      return;
    }

    drawn = icon;
    PAGE_PLATFORM.showIcon(win, drawn, madeHere);
  };

  win.webContents.on('page-favicon-updated', (_event, urls) => {
    faviconUrls = urls;
    drawFavicons().catch(() => undefined);
  });
  win.webContents.on('did-start-loading', () => drawFavicons().catch(() => undefined));

  return () => drawn;
}

// As a data: URL, which the sandboxed icon window can load.
async function readFavicon(win: BrowserWindow, url: string, canSee: (file: string) => boolean) {
  if (url.startsWith('data:image/')) {
    return url.length <= MAX_FAVICON_BYTES ? url : undefined;
  } else if (/^https?:/.test(url)) {
    // Through the page's session, so its proxy: only a host in papp-net answers. An image of a favicon's size, or nothing.
    const response = await win.webContents.session.fetch(url);
    const type = response.headers.get('content-type') ?? '';

    if (!response.ok || !type.startsWith('image/')) {
      return undefined;
    }

    // Counted as it arrives: a server can send more than it says. Leaving the loop cancels the download.
    const chunks: Uint8Array[] = [];
    let size = 0;

    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength;

      if (size > MAX_FAVICON_BYTES) {
        return undefined;
      }

      chunks.push(chunk);
    }

    return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
  } else if (!url.startsWith('file:')) {
    return undefined;
  }

  const file = realPath(fileURLToPath(url));
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];

  return type !== undefined && canSee(file) && fs.statSync(file).size <= MAX_FAVICON_BYTES ? `data:${type};base64,${fs.readFileSync(file).toString('base64')}` : undefined;
}

async function drawIcon(favicons: string[]) {
  const html = fs.readFileSync(path.join(import.meta.dirname, 'html', 'icon.html')).toString('base64');
  const badge = fs.readFileSync(path.join(import.meta.dirname, 'images', 'badge.svg')).toString('base64');
  // Not the page's session, so not one of its windows.
  const win = new BrowserWindow({ show: false, webPreferences: { session: session.fromPartition('icon'), sandbox: true, contextIsolation: true } });

  try {
    await win.loadURL(`data:text/html;base64,${html}`);
    const png: string | null = await win.webContents.executeJavaScript(`paint(${JSON.stringify(favicons)}, 'data:image/svg+xml;base64,${badge}')`);

    return png === null ? null : nativeImage.createFromDataURL(png);
  } finally {
    win.destroy();
  }
}
