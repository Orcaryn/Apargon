// The popup: what the user reads. Red marks broad requests, yellow other wildcards; the
// rules are about how a value is written.

import fs from 'fs';
import path from 'path';
import { literalBase, PAGE_SOURCE, patternSource, writableFolder } from './patterns.ts';
import { BIG_FOLDERS, HOME, LOCAL_HOSTS, SECRETS, type Permissions } from './tags.ts';

export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string };

export function describe(permissions: Permissions) {
  const lines: Line[] = [];

  if (permissions.node) {
    lines.push({ id: 'node', level: 'red', text: 'Full access: see, change and delete any of your files, and run any program.' });
  }

  // bwrap opens whole folders, not patterns: on Linux a program reaches more than the page does.
  const writable = [...new Set(permissions.write.map(writableFolder))];
  const linuxWrites = process.platform === 'linux' && writable.length ? ` It can also change any file in ${writable.join(', ')}, hidden ones and pages included.` : '';

  for (const [program, file] of Object.entries(permissions.run)) {
    lines.push({ id: `run:${file}`, level: 'red', text: `Run ${program} (${file}), which can see all your files, and keys and logins only if named below.${linuxWrites}` });
  }

  lines.push(...permissions.env.map(envLine), ...permissions.write.map(pattern => folderLine('write', pattern)), ...permissions.read.map(pattern => folderLine('read', pattern)), ...permissions.net.map(hostLine));

  if (permissions.own) {
    lines.push({ id: `own:${permissions.own}`, level: 'plain', text: `See files in its own folder and its subfolders, ${permissions.own}.` });
  }

  const order = { red: 0, yellow: 1, plain: 2 };

  return lines.sort((a, b) => order[a.level] - order[b.level]);
}

// What a page from another computer could do with the lines together, or null if each line says it
// all. Programs and full Node reach the internet through other apps (SECURITY.md, "Not enforced").
export function worstCase({ node, run, net, own, read, write }: Permissions) {
  const hosts = [...new Set(net.map(pattern => pattern.split(':')[0]))];

  if (node) {
    return 'It can do anything you can, including sending your files anywhere.';
  } else if (Object.keys(run).length) {
    return 'It can run programs that see all your files. Through other apps, they may send them anywhere.';
  } else if (hosts.length && (own || read.length || write.length)) {
    return `It can send the files it sees to ${hosts.includes('*') ? 'any server' : hosts.join(', ')}.`;
  }

  return null;
}

// The name is all there is to go on: one that reads like a secret is red.
function envLine(name: string): Line {
  const id = `env:${name}`;

  if (/key|secret|token|pass|auth|cred|session|cookie/i.test(name)) {
    return { id, level: 'red', text: `Give the programs it runs your ${name} environment variable, which by its name holds a secret.` };
  }

  return { id, level: 'plain', text: `Give the programs it runs your ${name} environment variable.` };
}

function folderLine(kind: 'read' | 'write', pattern: string): Line {
  const id = `${kind}:${pattern}`;
  const verb = kind === 'read' ? 'See' : 'See, change and delete';
  const base = literalBase(pattern);
  const library = path.join(HOME, 'Library');
  const secret = SECRETS.find(secret => base === secret.path || base.startsWith(secret.path + '/'));

  if (secret) {
    return { id, level: 'red', text: `${verb} files in ${pattern}, where your ${secret.holds} are kept.` };
  } else if (kind === 'write' && new RegExp(PAGE_SOURCE).test(pattern)) {
    return { id, level: 'red', text: `${verb} pages matching ${pattern}. A page you approved could be rewritten to do anything it was allowed.` };
  } else if (pattern === '/') {
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
