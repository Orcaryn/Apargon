// Tags: what a page asks for, read from its <meta> tags before it runs.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { literalBase, patternSource } from './patterns.ts';

export type Permissions = {
  own: string | null; // the page's folder, unless the page has full Node or sits in a big folder
  ownSubfolders: boolean; // false for a page with no tags: the files in its folder, not those below
  read: string[];
  write: string[];
  net: string[];
  run: Record<string, string>; // name → file
  node: boolean;
};

export const HOME = fs.realpathSync(os.homedir());
export const BIG_FOLDERS = ['Desktop', 'Documents', 'Downloads'].map(name => path.join(HOME, name));
export const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function declaredPermissions(page: string) {
  const dir = path.dirname(page);
  const permissions: Permissions = { own: null, ownSubfolders: false, read: [], write: [], net: [], run: {}, node: false };

  for (const [, attrs] of fs.readFileSync(page, 'utf8').matchAll(/<meta\s+([^>]*)>/gi)) {
    const name = /\bname=["']resworb-([^"']*)["']/i.exec(attrs)?.[1].toLowerCase();
    const value = (/\bcontent=["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').trim();

    if (name === undefined) {
      continue;
    }

    permissions.ownSubfolders = true;

    if (name === 'read' || name === 'write') {
      permissions[name].push(folderPattern(value, dir));
    } else if (name === 'net') {
      permissions.net.push(hostPattern(value));
    } else if (name === 'run') {
      permissions.run[path.basename(value)] = findProgram(value);
    } else if (name === 'node' && value === 'full') {
      permissions.node = true;
    } else if (name === 'node') {
      throw new Error(`Bad resworb-node value "${value}". The only value is "full".`);
    } else {
      throw new Error(`Unknown tag resworb-${name}. The tags are resworb-read, resworb-write, resworb-net, resworb-run and resworb-node.`);
    }
  }

  if (permissions.node && (permissions.read.length || permissions.write.length || Object.keys(permissions.run).length)) {
    throw new Error('resworb-node already allows every folder and program. Keep resworb-node and resworb-net only.');
  }

  permissions.own = permissions.node || ['/', HOME, ...BIG_FOLDERS].includes(dir) ? null : dir;

  // The sandbox profile quotes the folders a page may change: a " in one would end the quote.
  const quoted = [permissions.own ?? [], permissions.write].flat().find(folder => folder.includes('"'));

  if (quoted) {
    throw new Error(`Folder ${quoted} has a " in its path, which the sandbox cannot take. Rename it.`);
  }

  return permissions;
}

// A folder value becomes an absolute pattern: the folders before the first * resolved to their real path, the rest as written.
function folderPattern(value: string, dir: string) {
  if (value === '*') {
    throw new Error('A folder of "*" is unclear. Use / for the whole disk or ~ for your home folder.');
  } else if (!value || /["\\]/.test(value)) {
    throw new Error(`Bad folder "${value}". Use a path such as ./data, ~/notes or ~/notes/*.md.`);
  }

  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, HOME + '/'));
  const base = literalBase(absolute);

  if (!fs.existsSync(base)) {
    throw new Error(`Folder ${base} does not exist (from "${value}").`);
  }

  return path.join(fs.realpathSync.native(base), path.relative(base, absolute));
}

function hostPattern(value: string) {
  const host = value === '*' ? '*:*' : value.toLowerCase();
  const port = +host.split(':')[1];

  if (!/^(\*|(\*\.)?[a-z0-9][a-z0-9.-]*):(\*|\d+)$/.test(host) || port < 1 || port > 65535) {
    throw new Error(`Bad resworb-net value "${value}". One host:port per <meta>, such as api.example.com:443 or *.example.com:443.`);
  }

  return host;
}

// Found now, so the popup shows which file runs; if a later search finds another, the page asks again.
function findProgram(value: string) {
  if (value.includes('*')) {
    throw new Error('resworb-run takes one program, no wildcards. For any program, use resworb-node.');
  } else if (path.isAbsolute(value)) {
    return value;
  } else if (!/^[\w.+-]+$/.test(value)) {
    throw new Error(`Bad resworb-run value "${value}". Name one program, such as git, or give its full path.`);
  }

  const found = [...process.env.PATH!.split(':'), '/opt/homebrew/bin', '/usr/local/bin'].map(dir => path.join(dir, value)).find(file => fs.statSync(file, { throwIfNoEntry: false })?.isFile());

  if (!found) {
    throw new Error(`Program ${value} was not found. Give its full path in resworb-run.`);
  }

  return found;
}

// What a page may change, as pattern sources for resworb's checks and for Seatbelt. A page
// with no tags opens without asking, so its own folder is the folder and the names in it,
// not its subfolders' contents: the pages and scripts there may be approved for more.
export function changeableSources({ own, ownSubfolders, write }: Permissions) {
  const ownSources = own === null ? [] : ownSubfolders ? [patternSource(own)] : [patternSource(own, false), patternSource(path.join(own, '*'), false)];

  return [...ownSources, ...write.map(pattern => patternSource(pattern))];
}
