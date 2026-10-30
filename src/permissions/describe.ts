import net from 'net';
import path from 'path';
import { literalBase, PAGE_FILE, patternFolder } from './patterns.ts';
import { BIG_FOLDERS, HOME, LOCAL_HOSTS, privateNetwork, SECRETS, type Permissions, type Use } from './tags.ts';

// The popup shows short, with text as its tip. Red is a way to send data somewhere the tags do not name.
export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string; short: string };

const USE_LINES: Record<Use, Omit<Line, 'id'>> = {
  notifications: { level: 'plain', text: 'Show notifications', short: 'Notifications' },
  clipboard: { level: 'yellow', text: 'Read what you copy', short: 'Clipboard' },
  location: { level: 'yellow', text: 'Know where this computer is', short: 'Location' },
  sound: process.platform === 'linux' ? { level: 'yellow', text: 'Play sound through the sound server, where its programs can also record', short: 'Sound' } : { level: 'plain', text: 'Play sound', short: 'Sound' },
  camera: { level: 'yellow', text: 'Use the camera', short: 'Camera' },
  microphone: { level: 'yellow', text: 'Use the microphone', short: 'Microphone' },
  screen: { level: 'yellow', text: 'Record or share your screen', short: 'Screen' },
};
const USE_SENDS: Partial<Record<Use, string>> = { clipboard: 'what you copy', location: 'where you are', camera: 'what the camera sees', microphone: 'what the microphone hears', screen: 'what is on your screen' };

export function describe(permissions: Permissions) {
  const lines: Line[] = [];

  if (permissions.node) {
    lines.push({ id: 'node', level: 'red', text: 'Every file, any program', short: 'Full access' });
  }

  const writable = [...new Set(permissions.write.map(patternFolder))];
  const linuxWriteNote = process.platform === 'linux' && writable.length ? `, which can change any file in ${writable.join(', ')}` : '';

  for (const [program, file] of Object.entries(permissions.run)) {
    // Red on Linux: there it can write hidden files, which run outside the sandbox.
    lines.push({ id: `run:${file}`, level: linuxWriteNote ? 'red' : 'yellow', text: `Run ${file}${linuxWriteNote}`, short: program });
  }

  lines.push(
    ...permissions.sockets.map(socketLine),
    ...permissions.env.map(envLine),
    ...permissions.write.map(pattern => folderLine('write', pattern)),
    ...permissions.read.map(pattern => folderLine('read', pattern)),
    ...permissions.net.map(hostLine),
    ...permissions.open.map(openLine),
    ...permissions.use.map(name => ({ id: `use:${name}`, ...USE_LINES[name] })),
    ...permissions.shortcuts.map(keys => ({ id: `shortcut:${keys}`, level: 'yellow' as const, text: 'A shortcut that works in every app', short: keys }))
  );

  if (permissions.own) {
    lines.push({ id: `own:${permissions.own}`, level: 'plain', text: 'See files', short: permissions.own });
  }

  const order = { red: 0, yellow: 1, plain: 2 };

  return lines.sort((a, b) => order[a.level] - order[b.level]);
}

export function worstCase({ node, run, sockets, net, open, own, read, write, use }: Permissions) {
  const hosts = [...new Set([...net.map(pattern => pattern.split(':')[0]), ...open])];
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

  return { id: `socket:${socket}`, level: 'red', text: secret ? `Talk to the program that holds your ${secret.holds}` : 'Talk to the program behind it', short: socket };
}

function envLine(name: string): Line {
  const level = /key|secret|token|pass|auth|cred|session|cookie/i.test(name) ? 'yellow' : 'plain';

  return { id: `env:${name}`, level, text: 'Give this variable to its programs', short: name };
}

function folderLine(kind: 'read' | 'write', pattern: string): Line {
  const text = kind === 'read' ? 'See files' : 'See, change and delete files';
  const base = literalBase(pattern);
  const library = path.join(HOME, 'Library');
  const hidden = pattern.split('/').some(name => name.startsWith('.'));
  const reachesLibrary = base === library || library.startsWith(base + '/') || base.startsWith(library + '/');
  // Files that run outside the sandbox: a shell's startup file, a git hook, a launch agent, a page.
  const red = kind === 'write' && (hidden || reachesLibrary || PAGE_FILE.test(pattern));
  const yellow =
    hidden ||
    reachesLibrary ||
    pattern.includes('*') ||
    SECRETS.some(secret => base === secret.path || base.startsWith(secret.path + '/')) ||
    path.dirname(pattern) === '/' ||
    BIG_FOLDERS.includes(pattern);
  const level = red ? 'red' : yellow ? 'yellow' : 'plain';
  const short = pattern === '/' ? 'All your files' : pattern === HOME ? 'Your home folder' : pattern;

  return { id: `${kind}:${pattern}`, level, text, short };
}

function hostLine(pattern: string): Line {
  const [host, port] = pattern.split(':');
  const id = `net:${pattern}`;
  const anyPort = port === '*' ? ' on any port' : '';

  if (LOCAL_HOSTS.includes(host)) {
    return { id, level: 'red', text: port === '*' ? 'Connect to any program on this computer' : 'Connect to a program on this computer', short: pattern };
  } else if (host === '*') {
    return { id, level: 'red', text: `Send and receive data${anyPort}`, short: port === '*' ? 'Any server' : `Any server:${port}` };
  }

  const red = port === '*' || privateNetwork().check(host) || net.isIPv4(host) || (host.startsWith('*.') && !host.slice(2).includes('.'));
  const level = red ? 'red' : host.startsWith('*.') ? 'yellow' : 'plain';

  return { id, level, text: `Send and receive data${anyPort}`, short: port === '443' ? host : pattern };
}

function openLine(host: string): Line {
  // Red as in papp-net: a whole top-level domain, this computer, or an address in numbers, the local network's included.
  const red = host === '*' || (host.startsWith('*.') && !host.slice(2).includes('.')) || host === 'localhost' || net.isIPv4(host);
  const level = red ? 'red' : host.startsWith('*.') ? 'yellow' : 'plain';

  return { id: `open:${host}`, level, text: host === '*' ? 'Open any link in your browser' : 'Open in your browser', short: host === '*' ? 'Any site' : host };
}

