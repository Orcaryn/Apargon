import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { realPath, runsOutsideSandbox } from '../../permissions/paths.ts';
import { isInside, PAGE_FILE } from '../../permissions/patterns.ts';
import { PERMISSIONS_PLATFORM } from '../../permissions/platform.ts';
import type { SavedFile } from '../../shared/channel.ts';
import { DATA, INSTALL_FOLDER } from '../../shared/data.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';

// The page names the files and the user picks the folder, in this process's dialog: a page that breaks out of its sandbox can write nowhere else.
export async function saveFiles(files: SavedFile[]) {
  if (!files.length) {
    throw new Error('Apargon: saveAs takes one or more files.');
  }

  const badName = findBadName(files.map(({ name }) => name));

  if (badName !== undefined) {
    throw new Error(`Apargon: saveAs takes plain file names, without a folder, a leading dot or .papp: ${JSON.stringify(badName)}.`);
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

  const folder = filePaths[0];
  checkFolder(folder);

  // Like a browser's downloads, a taken name gets a number: 'wx' never replaces a file or follows a link.
  return files.map(({ name, data }) => {
    const { name: stem, ext } = path.parse(name);

    for (let n = 1; ; n++) {
      const file = path.join(folder, n === 1 ? name : `${stem} (${n})${ext}`);

      try {
        fs.writeFileSync(file, Buffer.from(data, 'base64'), { flag: 'wx' });
        TRAMPOLINE_PLATFORM.markDownloaded?.(file);

        return file;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }
    }
  });
}

// The page suggests a file, the user picks the name and folder, and the dialog asks before it replaces one.
export async function saveFile(suggested: string, data: string) {
  app.focus({ steal: true });
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: suggested, properties: ['createDirectory', 'showOverwriteConfirmation'] });

  if (canceled) {
    return null;
  } else if (findBadName([path.basename(filePath)]) !== undefined) {
    throw new Error(`Apargon: a page may not save as ${path.basename(filePath)}: a hidden name, a .papp, or one with characters that do not show.`);
  }

  checkFolder(path.dirname(filePath));
  const file = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | TRAMPOLINE_PLATFORM.noFollow);

  try {
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  } finally {
    fs.closeSync(file);
  }

  TRAMPOLINE_PLATFORM.markDownloaded?.(filePath);

  return filePath;
}

// The first name that is not a plain file name, if any. Windows reads x.papp. as x.papp, and x:y as a stream of x.
function findBadName(names: string[]) {
  return names.find(name => !name || path.basename(name) !== name || name.startsWith('.') || PAGE_FILE.test(name) || /[\p{Cc}\p{Cf}]/u.test(name) || PERMISSIONS_PLATFORM.refusePath(name) !== null);
}

// A link the page planted could lead the user into a folder they did not mean.
function checkFolder(folder: string) {
  if (realPath(folder) !== folder) {
    throw new Error(`Apargon: a page may not save to ${folder}. Pick a folder itself, not a link to it.`);
  } else if (PAGE_FILE.test(folder) || runsOutsideSandbox(folder) || [DATA, INSTALL_FOLDER ?? []].flat().some(protectedFolder => isInside(folder, protectedFolder))) {
    throw new Error(`Apargon: a page may not save to ${folder}: it holds Apargon's data, or files that run on their own.`);
  }
}
