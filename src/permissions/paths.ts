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
// Each as on disk, as every pattern is: a symlinked key folder is named by where it points.
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
  '.claude': 'Claude Code logins and sessions',
  '.claude.json': 'Claude Code logins',
  '.codex': 'Codex logins',
  '.config/op': '1Password CLI logins',
  '.cargo/credentials.toml': 'crates.io tokens',
  '.cargo/credentials': 'crates.io tokens',
  '.gem/credentials': 'RubyGems tokens',
  '.terraform.d': 'Terraform logins',
  '.vault-token': 'Vault token',
  '.huggingface': 'Hugging Face tokens',
  '.cache/huggingface/token': 'Hugging Face tokens',
  ...Object.fromEntries(BROWSERS.map(name => [name, 'browser logins and cookies'])),
  ...PERMISSIONS_PLATFORM.secrets,
}).map(([name, holds]) => ({ path: realSecret(path.join(HOME, name)), holds }));

export const LAUNCH_FOLDER = PERMISSIONS_PLATFORM.launchFolder && path.join(HOME, PERMISSIONS_PLATFORM.launchFolder);
// macOS keeps iCloud Drive, Dropbox, OneDrive and Google Drive in ~/Library. Files there only sync.
const CLOUD_FOLDERS = ['Library/Mobile Documents', 'Library/CloudStorage'].map(name => path.join(HOME, name));

// As on disk where it can be looked up. One that is not there stays as named, and so does one the page's own sandbox already hides from it: that process only shows the name. Not there includes under a file (ENOTDIR) and a link that loops (ELOOP).
function realSecret(secret: string) {
  try {
    return fs.realpathSync.native(secret);
  } catch (err) {
    if (!['ENOENT', 'ENOTDIR', 'ELOOP', 'EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code!)) {
      throw err;
    }

    return secret;
  }
}

export function runsOutsideSandbox(file: string) {
  const hidden = file.split(path.sep).some(name => name.startsWith('.'));
  const launched = LAUNCH_FOLDER !== null && isInside(file, LAUNCH_FOLDER) && !CLOUD_FOLDERS.some(cloud => isInside(file, cloud));

  return hidden || launched;
}

export function absolutePath(value: string, dir: string) {
  // As a function: a $ in the home folder's name would otherwise be read as a replacement pattern.
  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, () => HOME + '/'));
  const refusal = PERMISSIONS_PLATFORM.refusePath(absolute);

  if (refusal) {
    throw new Error(refusal);
  }

  return absolute;
}

export function realPath(file: string): string {
  const refusal = PERMISSIONS_PLATFORM.refusePath(file);

  if (refusal) {
    throw new Error(refusal);
  } else if (fs.lstatSync(file, { throwIfNoEntry: false })) {
    return fs.realpathSync.native(file);
  }

  return path.dirname(file) === file ? file : path.join(realPath(path.dirname(file)), path.basename(file));
}
