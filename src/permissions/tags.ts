// Tags: what a page asks for, read from its <meta> tags before it runs.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { literalBase, PAGE_SOURCE, patternSource } from './patterns.ts';

export type Permissions = {
  own: string | null; // the page's folder and its subfolders, to see; none for full Node or a big folder
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
  const permissions: Permissions = { own: null, read: [], write: [], net: [], run: {}, node: false };

  for (const [, attrs] of fs.readFileSync(page, 'utf8').matchAll(/<meta\s+([^>]*)>/gi)) {
    const name = /\bname=["']resworb-([^"']*)["']/i.exec(attrs)?.[1].toLowerCase();
    const value = (/\bcontent=["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').trim();

    if (name === undefined) {
      continue;
    } else if (name === 'read' || name === 'write') {
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
  const quoted = permissions.write.find(folder => folder.includes('"'));

  if (quoted) {
    throw new Error(`Folder ${quoted} has a " in its path, which the sandbox cannot take. Rename it.`);
  }

  // The popup shows each path on a line of its own. A line break in one, typed in the tag or
  // in a real folder name, would show as another permission; bidi and zero-width marks hide text.
  const invisible = [page, ...permissions.read, ...permissions.write, ...Object.values(permissions.run)].find(text => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text));

  if (invisible) {
    throw new Error(`${JSON.stringify(invisible)} has a line break or another invisible character, which the popup cannot show. Write the value on one line, or rename the file.`);
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
  // A value without * may name a file yet to be made: then its folder must exist.
  const base = absolute.includes('*') || fs.existsSync(absolute) ? literalBase(absolute) : path.dirname(absolute);

  if (!fs.existsSync(base)) {
    throw new Error(`Folder ${base} does not exist (from "${value}").`);
  }

  return path.join(fs.realpathSync.native(base), path.relative(base, absolute));
}

function hostPattern(value: string) {
  const pattern = value === '*' ? '*:*' : value.toLowerCase();
  const [host, port] = pattern.split(':');

  if (!/^(\*|(\*\.)?[a-z0-9][a-z0-9.-]*):(\*|\d+)$/.test(pattern) || +port < 1 || +port > 65535) {
    throw new Error(`Bad resworb-net value "${value}". One host:port per <meta>, such as api.example.com:443 or *.example.com:443.`);
  } else if (process.platform === 'linux' && LOCAL_HOSTS.includes(host) && port === '*') {
    throw new Error('On Linux, a port on this computer must be a number, such as localhost:11434: resworb carries each declared port into the sandbox.');
  }

  return pattern;
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

// The declared ports on this computer, which the page reaches without the proxy.
export function localPorts({ net }: Permissions) {
  return net
    .map(pattern => pattern.split(':'))
    .filter(([host]) => LOCAL_HOSTS.includes(host))
    .map(([, port]) => port);
}

// What a page may change, as pattern sources for resworb's checks and for Seatbelt: its
// resworb-write patterns, never its own folder. Only those in pages reach a page.
export function changeableSources({ write }: Permissions) {
  return {
    files: write.map(pattern => patternSource(pattern)),
    pages: write.filter(pattern => new RegExp(PAGE_SOURCE).test(pattern)).map(pattern => patternSource(pattern)),
  };
}
