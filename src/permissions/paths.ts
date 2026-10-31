import fs from 'fs';
import os from 'os';
import path from 'path';
import { isInside } from './patterns.ts';
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

// Files written here can run outside the sandbox: launch agents on macOS, the Startup folder on Windows, and hidden names, such as a shell's startup file, a git hook or an autostart entry.
export const LAUNCH_FOLDER = PERMISSIONS_PLATFORM.launchFolder && path.join(HOME, PERMISSIONS_PLATFORM.launchFolder);
// macOS keeps iCloud Drive, Dropbox, OneDrive and Google Drive in ~/Library. Files there only sync.
const CLOUD_FOLDERS = ['Library/Mobile Documents', 'Library/CloudStorage'].map(name => path.join(HOME, name));

export function runsOutsideSandbox(file: string) {
  const hidden = file.split(path.sep).some(name => name.startsWith('.'));
  const launched = LAUNCH_FOLDER !== null && isInside(file, LAUNCH_FOLDER) && !CLOUD_FOLDERS.some(cloud => isInside(file, cloud));

  return hidden || launched;
}

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
