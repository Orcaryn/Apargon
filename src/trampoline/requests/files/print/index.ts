import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { TEST_ALLOW } from '../../../../shared/data/index.ts';

// The page makes a PDF; the trampoline, which is outside the sandbox, shows the system print panel on it. The sandbox itself never reaches the print server. The panel is the user's yes, as a save dialog is: so printing needs no tag.
export async function printPdf(data: Readable): Promise<boolean> {
  if (TEST_ALLOW) {
    return true;
  }

  const folder = fs.mkdtempSync(path.join(app.getPath('temp'), 'apargon-print-'));
  const file = path.join(folder, 'print.pdf');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });

  try {
    await pipeline(data, fs.createWriteStream(file));
    await win.loadFile(file);

    return await new Promise<boolean>(resolve => win.webContents.print({}, success => resolve(success)));
  } finally {
    win.destroy();
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
