import fs from 'fs';
import os from 'os';
import path from 'path';
import { PERMISSIONS_PLATFORM } from '../platform/index.ts';

// No Electron here: the Node tests load it.

// As on disk: on Windows, in the folder's own case.
export const HOME = fs.realpathSync.native(os.homedir());

// From the .papp file's folder, with ~ for the home folder.
export function absolutePath(value: string, dir: string) {
  // As a function: a $ in the home folder's name would otherwise be read as a replacement pattern.
  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~[\\/]/, () => HOME + path.sep));
  const refusal = PERMISSIONS_PLATFORM.refusePath(absolute);

  if (refusal) {
    throw new Error(refusal);
  }

  return absolute;
}

// path.relative, not startsWith: a root such as / or C:\ already ends in a separator, and Windows ignores case.
export function isInside(file: string, folder: string) {
  const fromFolder = path.relative(folder, file);

  return fromFolder !== '..' && !fromFolder.startsWith('..' + path.sep) && !path.isAbsolute(fromFolder);
}

// The real path of what is there, and the rest as named.
export function realPath(file: string): string {
  const refusal = PERMISSIONS_PLATFORM.refusePath(file);

  if (refusal) {
    throw new Error(refusal);
  } else if (fs.lstatSync(file, { throwIfNoEntry: false })) {
    return fs.realpathSync.native(file);
  }

  return path.dirname(file) === file ? file : path.join(realPath(path.dirname(file)), path.basename(file));
}
