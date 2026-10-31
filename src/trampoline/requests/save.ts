import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { realPath } from '../../permissions/paths.ts';
import { isInside, PAGE_FILE } from '../../permissions/patterns.ts';
import type { SavedFile } from '../../shared/channel.ts';
import { DATA, INSTALL_FOLDER } from '../../shared/data.ts';

// The page names the files and the user picks the folder, in this process's dialog: a page that breaks out of its sandbox can write nowhere else.
export async function saveFiles(files: SavedFile[], hidden: string[]) {
  const badName = files.find(({ name }) => !name || path.basename(name) !== name || name.startsWith('.') || PAGE_FILE.test(name) || /[\p{Cc}\p{Cf}]/u.test(name));

  if (!files.length || badName) {
    throw new Error(`Apargon: saveAs takes one or more plain file names, without a folder, a leading dot or .papp${badName ? `: ${JSON.stringify(badName.name)}` : ''}.`);
  }

  // This process has no window of its own: without this, its dialog opens behind the page.
  app.focus({ steal: true });
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: app.getPath('downloads'),
    buttonLabel: 'Save Here',
    message: files.length === 1 ? `Save ${files[0].name}` : `Save ${files.length} files`,
    properties: ['openDirectory', 'createDirectory', 'noResolveAliases'],
  });

  if (canceled) {
    return [];
  }

  // A link the page planted could lead the user into a folder they did not mean. Keys and logins are hidden names or whole folders, so with plain names the folder is what to check.
  const folder = filePaths[0];

  if (realPath(folder) !== folder || PAGE_FILE.test(folder) || [DATA, INSTALL_FOLDER ?? [], hidden].flat().some(protectedFolder => isInside(folder, protectedFolder))) {
    throw new Error(`Apargon: a page may not save to ${folder}. Pick a folder itself, not a link to it.`);
  }

  // Like a browser's downloads, a taken name gets a number: 'wx' never replaces a file or follows a link.
  return files.map(({ name, data }) => {
    const { name: stem, ext } = path.parse(name);

    for (let n = 1; ; n++) {
      const file = path.join(folder, n === 1 ? name : `${stem} (${n})${ext}`);

      try {
        fs.writeFileSync(file, Buffer.from(data, 'base64'), { flag: 'wx' });

        return file;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }
    }
  });
}
