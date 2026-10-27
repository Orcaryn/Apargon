import fs from 'fs';
import net from 'net';
import path from 'path';
import { literalBase, PAGE_FILE, patternFolder, patternSource } from './patterns.ts';
import { BIG_FOLDERS, HOME, LOCAL_HOSTS, privateNetwork, SECRETS, type Permissions, type Use } from './tags.ts';

export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string };

const USE_LINES: Record<Use, Omit<Line, 'id'>> = {
  notifications: { level: 'plain', text: 'Show notifications.' },
  clipboard: { level: 'yellow', text: 'Read what you copy. The clipboard can hold a password.' },
  location: { level: 'yellow', text: 'Know where this computer is.' },
  sound: process.platform === 'linux' ? { level: 'yellow', text: 'Play sound, through the sound server, which can also stream to another computer. A program it runs, or full Node, can also record from the microphone through it.' } : { level: 'plain', text: 'Play sound.' },
  camera: { level: 'yellow', text: 'Use the camera.' },
  microphone: { level: 'yellow', text: 'Listen through the microphone.' },
  screen: { level: 'red', text: 'See your screen: every window, passwords on it included.' },
};
// What each use lets a page with papp-net send out.
const USE_SENDS: Partial<Record<Use, string>> = { clipboard: 'what you copy', location: 'where you are', camera: 'what the camera sees', microphone: 'what the microphone hears', screen: 'what is on your screen' };

export function describe(permissions: Permissions) {
  const lines: Line[] = [];

  if (permissions.node) {
    lines.push({ id: 'node', level: 'red', text: 'Full access: see, change and delete any of your files, and run any program.' });
  }

  const writable = [...new Set(permissions.write.map(patternFolder))];
  const linuxWriteNote = process.platform === 'linux' && writable.length ? ` It can also change any file in ${writable.join(', ')}, hidden ones and pages included.` : '';

  for (const [program, file] of Object.entries(permissions.run)) {
    lines.push({ id: `run:${file}`, level: 'red', text: `Run ${program} (${file}), which can see all your files, and keys and logins only if named below.${linuxWriteNote}` });
  }

  lines.push(
    ...permissions.sockets.map(socketLine),
    ...permissions.env.map(envLine),
    ...permissions.write.map(pattern => folderLine('write', pattern)),
    ...permissions.read.map(pattern => folderLine('read', pattern)),
    ...permissions.net.map(hostLine),
    ...permissions.use.map(name => ({ id: `use:${name}`, ...USE_LINES[name] })),
    ...permissions.shortcuts.map(keys => ({ id: `shortcut:${keys}`, level: 'yellow' as const, text: `Answer ${keys} in every app, and come to the front when you press it.` }))
  );

  if (permissions.own) {
    lines.push({ id: `own:${permissions.own}`, level: 'plain', text: `See files in its own folder and its subfolders, ${permissions.own}.` });
  }

  const order = { red: 0, yellow: 1, plain: 2 };

  return lines.sort((a, b) => order[a.level] - order[b.level]);
}

export function worstCase({ node, run, sockets, net, own, read, write, use }: Permissions) {
  const hosts = [...new Set(net.map(pattern => pattern.split(':')[0]))];
  const sends = [...(own || read.length || write.length ? ['the files it sees'] : []), ...use.flatMap(name => USE_SENDS[name] ?? [])];

  if (node) {
    return 'It can do anything you can, including sending your files anywhere.';
  } else if (Object.keys(run).length) {
    return 'It can run programs that see all your files. Through other apps, they may send them anywhere.';
  } else if (sockets.length) {
    return 'It can talk to other programs on this computer. Through them, it may send the files it sees anywhere.';
  } else if (hosts.length && sends.length) {
    return `It can send ${sends.join(' and ')} to ${hosts.includes('*') ? 'any server' : hosts.join(', ')}.`;
  }

  return null;
}

function socketLine(socket: string): Line {
  const secret = SECRETS.find(secret => socket === secret.path || socket.startsWith(secret.path + '/'));
  const where = secret ? `${socket}, where your ${secret.holds} are kept` : socket;

  return { id: `socket:${socket}`, level: 'red', text: `Talk to the programs behind ${where}. They can have network and act as you.` };
}

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
  } else if (kind === 'write' && PAGE_FILE.test(pattern)) {
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
  } else if (privateNetwork().check(host)) {
    return { id, level: 'red', text: `Send and receive data with the device at ${host} on your local network, on port ${port}. papp cannot tell what answers there.` };
  } else if (net.isIPv4(host)) {
    return { id, level: 'red', text: `Send and receive data with the machine at ${host}, ${where}. An address in numbers has no name to check.` };
  } else if (host.startsWith('*.') && !host.slice(2).includes('.')) {
    return { id, level: 'red', text: `Send and receive data with any server under .${host.slice(2)}, ${where}.` };
  } else if (host.startsWith('*.')) {
    return { id, level: port === '*' ? 'red' : 'yellow', text: `Send and receive data with any subdomain of ${host.slice(2)}, ${where}.` };
  }

  return { id, level: port === '*' ? 'red' : 'plain', text: `Send and receive data with ${host}, ${where}.` };
}

function countMatches(pattern: string) {
  const names = pattern.split('/').filter(Boolean);
  const paths = names.map((_, level) => '/' + names.slice(0, level + 1).join('/'));
  let found = [literalBase(pattern)];

  for (const wildPath of paths.slice(names.findIndex(name => name.includes('*')))) {
    const reached = new RegExp(patternSource(wildPath, false));
    found = found
      .filter(dir => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
      .flatMap(dir => fs.readdirSync(dir).map(name => path.join(dir, name)))
      .filter(file => reached.test(file));
  }

  return found.length;
}
