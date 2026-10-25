// The popup: what the user reads. Red marks broad requests, yellow other wildcards; the
// rules are about how a value is written.

import fs from 'fs';
import path from 'path';
import { literalBase, patternSource } from './patterns.ts';
import { BIG_FOLDERS, HOME, LOCAL_HOSTS, type Permissions } from './tags.ts';

export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string };

export function describe(permissions: Permissions) {
  const lines: Line[] = [];

  if (permissions.node) {
    lines.push({ id: 'node', level: 'red', text: 'Full access: see, change and delete any of your files, and run any program.' });
  }

  // bwrap opens whole folders, not patterns: on Linux a program reaches more than the page does.
  const folders = [permissions.own ?? [], permissions.write.map(literalBase)].flat();
  const linuxWrites = process.platform === 'linux' && folders.length ? ` It can also change any file in ${folders.join(', ')}, hidden ones included.` : '';

  for (const [program, file] of Object.entries(permissions.run)) {
    lines.push({ id: `run:${file}`, level: 'red', text: `Run ${program} (${file}), which can see all your files.${linuxWrites}` });
  }

  lines.push(...permissions.write.map(pattern => folderLine('write', pattern)), ...permissions.read.map(pattern => folderLine('read', pattern)), ...permissions.net.map(hostLine));

  if (permissions.own) {
    const where = permissions.ownSubfolders ? 'in its own folder' : 'directly in its own folder, not its subfolders';
    lines.push({ id: `own:${permissions.own}`, level: 'plain', text: `See, change and delete files ${where}, ${permissions.own}.` });
  }

  const order = { red: 0, yellow: 1, plain: 2 };

  return lines.sort((a, b) => order[a.level] - order[b.level]);
}

function folderLine(kind: 'read' | 'write', pattern: string): Line {
  const id = `${kind}:${pattern}`;
  const verb = kind === 'read' ? 'See' : 'See, change and delete';
  const base = literalBase(pattern);
  const library = path.join(HOME, 'Library');

  if (pattern === '/') {
    return { id, level: 'red', text: `${verb} all your files.` };
  } else if (pattern === HOME) {
    return { id, level: 'red', text: `${verb} all files in your home folder.` };
  } else if (pattern.split('/').some(name => name.startsWith('.'))) {
    return { id, level: 'red', text: `${verb} hidden files in ${pattern}: settings, keys or code that runs later.` };
  } else if (pattern === library || pattern.startsWith(library + '/')) {
    return { id, level: 'red', text: `${verb} files in ${pattern}: app data and programs that start on their own.` };
  } else if (pattern.includes('*') && (base === '/' || base === HOME)) {
    const where = base === '/' ? 'the top of your disk' : 'your home folder';

    return { id, level: 'red', text: `${verb} anything matching ${pattern}, straight under ${where} (${countMatches(pattern)} now, and any added later).` };
  } else if (path.dirname(pattern) === '/' || BIG_FOLDERS.includes(pattern)) {
    return { id, level: 'red', text: `${verb} all files in ${pattern}.` };
  } else if (pattern.includes('*')) {
    return { id, level: 'yellow', text: `${verb} files matching ${pattern} (${countMatches(pattern)} now, and any added later).` };
  }

  return { id, level: 'plain', text: `${verb} files in ${pattern}.` };
}

function hostLine(pattern: string): Line {
  const [host, port] = pattern.split(':');
  const id = `net:${pattern}`;
  const where = port === '*' ? 'on any port' : `on port ${port}`;

  if (LOCAL_HOSTS.includes(host) && port === '*') {
    return { id, level: 'red', text: 'Connect to any program on this computer that accepts connections.' };
  } else if (LOCAL_HOSTS.includes(host)) {
    return { id, level: 'plain', text: `Connect to a program on this computer, on port ${port}.` };
  } else if (host === '*') {
    return { id, level: 'red', text: `Send and receive data with any server on the internet, ${where}.` };
  } else if (host.startsWith('*.') && !host.slice(2).includes('.')) {
    return { id, level: 'red', text: `Send and receive data with any server under .${host.slice(2)}, ${where}.` };
  } else if (host.startsWith('*.')) {
    return { id, level: port === '*' ? 'red' : 'yellow', text: `Send and receive data with any subdomain of ${host.slice(2)}, ${where}.` };
  }

  return { id, level: port === '*' ? 'red' : 'plain', text: `Send and receive data with ${host}, ${where}.` };
}

// Files and folders a wildcard matches now, found one level at a time from the folders before the first *.
function countMatches(pattern: string) {
  const names = pattern.split('/').filter(Boolean);
  const paths = names.map((_, level) => '/' + names.slice(0, level + 1).join('/'));
  const wildPaths = paths.slice(names.findIndex(name => name.includes('*')));

  return wildPaths.reduce(
    (found, wildPath) => {
      const reached = new RegExp(patternSource(wildPath, false));

      return found
        .filter(dir => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
        .flatMap(dir => fs.readdirSync(dir).map(name => path.join(dir, name)))
        .filter(file => reached.test(file));
    },
    [literalBase(pattern)]
  ).length;
}
