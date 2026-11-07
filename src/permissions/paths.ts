import fs from 'fs';
import os from 'os';
import path from 'path';
import { isInside } from './patterns.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';

// The real path as on disk, as every pattern is: on Windows, in the folder's own case.
export const HOME = fs.realpathSync.native(os.homedir());
export const BIG_FOLDERS = ['Desktop', 'Documents', 'Downloads'].map(name => path.join(HOME, name));
// The folders the OS keeps a .papp file's process out of, but for what its tags name: every user's home, and the disks the user plugs in. The system's own files stay readable: they are the same on every computer, and the window needs them. The user's own home too, as it may lie outside the usual folders.
export const HOME_FOLDERS = [HOME, ...PERMISSIONS_PLATFORM.homeFolders];
// What every .papp file reads in the home folder, as the system does: fonts and the desktop's settings.
export const HOME_READS = PERMISSIONS_PLATFORM.homeReads.map(name => path.join(HOME, name));
// Named on every OS: a home folder can hold another OS's folders.
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

// As on disk where it can be looked up. One that is not there stays as named: that includes under a file (ENOTDIR) and a link that loops (ELOOP). So does one this process may not look at (EPERM): a .papp file's process on macOS, which Seatbelt keeps out of the home folder. On Linux the emptied home has none of them (ENOENT).
function realSecret(secret: string) {
  try {
    return fs.realpathSync.native(secret);
  } catch (err) {
    if (!['ENOENT', 'ENOTDIR', 'ELOOP', 'EPERM'].includes((err as NodeJS.ErrnoException).code!)) {
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

// Resolve the parent, but keep a final symlink as the directory entry it is.
// Only spelling-equivalent names need metadata: an unrelated, unreadable sibling must not break this operation.
export function realEntry(file: string): string {
  const refusal = PERMISSIONS_PLATFORM.refusePath(file);

  if (refusal) {
    throw new Error(refusal);
  }

  const folder = realPath(path.dirname(file));
  const requested = path.basename(file);
  const named = path.join(folder, requested);
  const link = fs.lstatSync(named, { bigint: true, throwIfNoEntry: false });

  if (!link?.isSymbolicLink()) {
    return realPath(named);
  }

  const names = fs.readdirSync(folder);

  if (names.includes(requested)) {
    return named;
  }

  // The filesystem already accepted the spelling. Check only its case/Unicode variants,
  // and verify their identity, rather than mistaking another hard link for this name.
  const spelling = requested.normalize('NFD').toLowerCase();
  const realName = names.find(name => {
    if (name.normalize('NFD').toLowerCase() !== spelling) {
      return false;
    }

    const entry = fs.lstatSync(path.join(folder, name), { bigint: true, throwIfNoEntry: false });

    return entry?.ino === link.ino && entry.dev === link.dev;
  });

  if (!realName) {
    throw new Error('Apargon: could not resolve that directory entry.');
  }

  return path.join(folder, realName);
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
