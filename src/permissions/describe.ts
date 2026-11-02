import net from 'net';
import path from 'path';
import { LOCAL_HOSTS, privateNetwork } from './network.ts';
import { BIG_FOLDERS, HOME, LAUNCH_FOLDER, runsOutsideSandbox, SECRETS } from './paths.ts';
import { isInside, literalBase, PAGE_FILE, patternFolder } from './patterns.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';
import type { Permissions, Use } from './tags.ts';

// The popup shows short, with text as its tip. Red is a way to send data somewhere the tags do not name.
export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string; short: string };

const USE_LINES: Record<Use, Omit<Line, 'id'>> = {
  notifications: { level: 'plain', text: 'Show notifications', short: 'Notifications' },
  clipboard: { level: 'yellow', text: 'Read what you copy', short: 'Clipboard' },
  location: { level: 'yellow', text: 'Know where this computer is', short: 'Location' },
  sound: PERMISSIONS_PLATFORM.soundServerRecords ? { level: 'yellow', text: 'Play sound through the sound server, where its programs can also record', short: 'Sound' } : { level: 'plain', text: 'Play sound', short: 'Sound' },
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
  const writeNote = PERMISSIONS_PLATFORM.writesWholeFolders && writable.length ? `, which can change any file in ${writable.join(', ')}` : '';

  for (const [program, file] of Object.entries(permissions.run)) {
    // Red where it can write hidden files, which run outside the sandbox.
    lines.push({ id: `run:${file}`, level: writeNote ? 'red' : 'yellow', text: `Run ${file}${writeNote}`, short: program });
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
    return 'It can do anything you can, and send your files anywhere.';
  } else if (Object.keys(run).length) {
    return `It can run ${Object.keys(run).join(', ')}.`;
  } else if (sockets.length) {
    return `It can talk to ${sockets.map(socket => path.basename(socket)).join(', ')}.`;
  } else if (hosts.length && sends.length) {
    return `It can send ${sends.join(' and ')} to ${hosts.includes('*') ? 'any server' : hosts.join(', ')}.`;
  }

  return null;
}

function socketLine(socket: string): Line {
  const secret = SECRETS.find(secret => isInside(socket, secret.path));

  return { id: `socket:${socket}`, level: 'red', text: secret ? `Talk to the program that holds your ${secret.holds}` : 'Talk to the program behind it', short: socket };
}

function envLine(name: string): Line {
  const level = /key|secret|token|pass|auth|cred|session|cookie/i.test(name) ? 'yellow' : 'plain';

  return { id: `env:${name}`, level, text: 'Give this variable to its programs', short: name };
}

function folderLine(kind: 'read' | 'write', pattern: string): Line {
  const text = kind === 'read' ? 'See files' : 'See, change and delete files';
  const base = literalBase(pattern);
  // A folder that holds the launch folder reaches it too.
  const runsOutside = runsOutsideSandbox(pattern) || (LAUNCH_FOLDER !== null && isInside(LAUNCH_FOLDER, base));
  const red = kind === 'write' && (runsOutside || PAGE_FILE.test(pattern));
  const yellow =
    runsOutside ||
    pattern.includes('*') ||
    SECRETS.some(secret => isInside(base, secret.path)) ||
    path.dirname(pattern) === path.parse(pattern).root ||
    BIG_FOLDERS.includes(pattern);
  const level = red ? 'red' : yellow ? 'yellow' : 'plain';
  const short = pattern === path.parse(pattern).root ? 'All your files' : pattern === HOME ? 'Your home folder' : pattern;

  return { id: `${kind}:${pattern}`, level, text, short };
}

function hostLine(pattern: string): Line {
  const [host, port] = pattern.split(':');
  const id = `net:${pattern}`;
  const anyPort = port === '*' ? ' on any port' : '';

  if (LOCAL_HOSTS.includes(host)) {
    return { id, level: 'red', text: 'Connect to a program on this computer', short: pattern };
  } else if (host === '*') {
    return { id, level: 'red', text: `Send and receive data${anyPort}`, short: port === '*' ? 'Any server' : `Any server:${port}` };
  }

  const red = port === '*' || privateNetwork().check(host) || net.isIPv4(host) || (host.startsWith('*.') && !host.slice(2).includes('.'));
  const level = red ? 'red' : host.startsWith('*.') ? 'yellow' : 'plain';

  return { id, level, text: `Send and receive data${anyPort}`, short: port === '443' ? host : pattern };
}

function openLine(host: string): Line {
  const red = host === '*' || (host.startsWith('*.') && !host.slice(2).includes('.')) || host === 'localhost' || net.isIPv4(host);
  const level = red ? 'red' : host.startsWith('*.') ? 'yellow' : 'plain';

  return { id: `open:${host}`, level, text: host === '*' ? 'Open any link in your browser' : 'Open in your browser', short: host === '*' ? 'Any site' : host };
}
