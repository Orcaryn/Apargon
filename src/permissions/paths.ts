import fs from 'fs';
import os from 'os';
import path from 'path';
import { PERMISSIONS_PLATFORM } from './platform.ts';

// The real path as on disk, as every pattern is: on Windows, in the folder's own case.
export const HOME = fs.realpathSync.native(os.homedir());
export const BIG_FOLDERS = ['Desktop', 'Documents', 'Downloads'].map(name => path.join(HOME, name));
// Hidden on every OS: a home folder can hold another OS's folders, and hiding one that is not there costs nothing.
const BROWSERS = [
  ...['Google/Chrome', 'Chromium', 'BraveSoftware', 'Microsoft Edge', 'Arc', 'Firefox'].map(name => `Library/Application Support/${name}`),
  ...['.config/google-chrome', '.config/chromium', '.config/BraveSoftware', '.config/microsoft-edge', '.mozilla', 'snap/firefox'],
];
export const SECRETS = Object.entries({
  '.ssh': 'SSH keys',
  '.gnupg': 'GPG keys',
  '.aws': 'AWS keys',
  '.azure': 'Azure logins',
  '.config/gcloud': 'Google Cloud logins',
  '.kube': 'Kubernetes logins',
  '.docker': 'Docker logins',
  '.config/gh': 'GitHub CLI logins',
  '.netrc': 'saved server passwords',
  '.git-credentials': 'saved git passwords',
  '.npmrc': 'npm tokens',
  '.pypirc': 'PyPI tokens',
  '.password-store': 'pass passwords',
  '.local/share/keyrings': 'keyrings',
  ...Object.fromEntries(BROWSERS.map(name => [name, 'browser logins and cookies'])),
  ...PERMISSIONS_PLATFORM.secrets,
}).map(([name, holds]) => ({ path: path.join(HOME, name), holds }));

export function absolutePath(value: string, dir: string) {
  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, HOME + '/'));
  const refusal = PERMISSIONS_PLATFORM.refusePath(absolute);

  if (refusal) {
    throw new Error(refusal);
  }

  return absolute;
}

// The path as on disk, links followed, for a file that may not exist yet.
export function realPath(file: string): string {
  const refusal = PERMISSIONS_PLATFORM.refusePath(file);

  if (refusal) {
    throw new Error(refusal);
  } else if (fs.lstatSync(file, { throwIfNoEntry: false })) {
    return fs.realpathSync.native(file);
  }

  return path.dirname(file) === file ? file : path.join(realPath(path.dirname(file)), path.basename(file));
}
