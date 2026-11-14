import fs from 'fs';
import path from 'path';
import { absolutePath } from '../../paths/index.ts';
import { PERMISSIONS_PLATFORM } from '../../platform/index.ts';

// No Electron here: the Node tests load it.

// A name on PATH, a full path, or a path from the .papp file's folder (./bin/tool) for a program it ships.
export function findProgram(value: string, dir: string) {
  const { programExtensions, programFolders } = PERMISSIONS_PLATFORM;

  const runnable = (file: string) => {
    if (!programExtensions.some(extension => file.toLowerCase().endsWith(extension)) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      return false;
    }

    try {
      // X_OK checks execute permission on POSIX. Windows relies on the extensions above.
      fs.accessSync(file, fs.constants.X_OK);

      return true;
    } catch {
      return false;
    }
  };

  if (path.isAbsolute(value) || /^\.[\\/]/.test(value)) {
    const file = absolutePath(value, dir);

    if (!runnable(file)) {
      throw new Error(`Program ${file} was not found, or is a folder or a file that can't run.`);
    }

    return file;
  } else if (!/^[\w.+-]+$/.test(value)) {
    throw new Error(`Bad papp-run "${value}". Name one program, such as git, or give its full path.`);
  }

  // An empty PATH entry, as a trailing ; leaves, is no folder.
  const folders = [...(process.env.PATH ?? '').split(path.delimiter), ...programFolders].filter(Boolean);
  const names = programExtensions.map(extension => (value.toLowerCase().endsWith(extension) ? value : value + extension));
  const found = folders.flatMap(folder => names.map(each => path.join(folder, each))).find(runnable);

  if (!found) {
    throw new Error(`Program ${value} was not found. Give its full path in papp-run.`);
  }

  return found;
}
