import net from 'net';
import path from 'path';
import { LOCAL_HOSTS, privateNetwork } from './network.ts';
import { BIG_FOLDERS, HOME, LAUNCH_FOLDER, runsOutsideSandbox, SECRETS } from './paths.ts';
import { isInside, literalBase, PAGE_FILE, patternFolder, patternSource } from './patterns.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';
import type { Permissions, Use, WindowSettings } from './tags.ts';

// The popup shows short under a heading for its kind, and what the page sees as one line. Red is a way to send data somewhere the tags do not name.
export type Line = { id: string; level: 'red' | 'yellow' | 'plain'; text: string; short: string };

const USE_LINES: Record<Use, Omit<Line, 'id'>> = {
  notifications: { level: 'plain', text: 'Show notifications', short: 'Notifications' },
  clipboard: { level: 'yellow', text: 'Read what you copy', short: 'Clipboard' },
  location: { level: 'yellow', text: 'Know where this computer is', short: 'Location' },
  sound: PERMISSIONS_PLATFORM.soundServerRecords ? { level: 'yellow', text: 'Play sound through the sound server, where its programs can also record', short: 'Sound' } : { level: 'plain', text: 'Play sound', short: 'Sound' },
  camera: { level: 'yellow', text: 'Use the camera', short: 'Camera' },
  microphone: { level: 'yellow', text: 'Use the microphone', short: 'Microphone' },
  screen: { level: 'yellow', text: 'Record or share a screen or window you pick', short: 'Screen' },
  background: { level: 'plain', text: 'Keep running after you close its window, with an icon you can quit it from', short: 'Background' },
  login: { level: 'yellow', text: 'Open when you log in', short: 'At login' },
  usb: { level: 'yellow', text: 'Use a USB device you pick', short: 'USB' },
  serial: { level: 'yellow', text: 'Use a serial port you pick', short: 'Serial ports' },
  hid: { level: 'yellow', text: 'Use an input device you pick, which can be a keyboard', short: 'Input devices' },
  midi: { level: 'plain', text: 'Use MIDI instruments, and change their settings', short: 'MIDI' },
  print: { level: 'yellow', text: 'Print what it shows, on any printer this computer can reach', short: 'Printing' },
};
const USE_SEES: Use[] = ['clipboard', 'location', 'camera', 'microphone', 'screen'];

export function describe(permissions: Permissions) {
  const lines: Line[] = [];
  const writable = [...new Set(permissions.write.map(patternFolder))];
  const programsCan = [
    PERMISSIONS_PLATFORM.programsSendOut && 'send any file it sees anywhere',
    PERMISSIONS_PLATFORM.writesWholeFolders && writable.length > 0 && `change any file in ${writable.join(', ')}`,
  ].filter(can => typeof can === 'string');

  if (permissions.system) {
    lines.push({ id: 'system', level: 'red', text: programsCan.length ? `Run any program, which can ${programsCan.join(' and ')}` : 'Run any program', short: 'Any program' });
  }

  for (const [program, file] of Object.entries(permissions.run)) {
    // Red where it can send data out, or write hidden files, which run outside the sandbox.
    const text = programsCan.length ? `Run ${file}, which can ${programsCan.join(' and ')}` : `Run ${file}`;
    lines.push({ id: `run:${file}`, level: programsCan.length ? 'red' : 'yellow', text, short: program });
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

  if (permissions.window) {
    lines.push(windowLine(permissions.window));
  }

  const order = { red: 0, yellow: 1, plain: 2 };

  return lines.sort((a, b) => order[a.level] - order[b.level]);
}

// A red line, a program, or what it sees together with a host the tags name.
export function needsTrust({ run, net, open, own, read, write, use }: Permissions, lines: Line[]) {
  const sees = own !== null || read.length > 0 || write.length > 0 || use.some(name => USE_SEES.includes(name));

  return lines.some(line => line.level === 'red') || Object.keys(run).length > 0 || (sees && (net.length > 0 || open.length > 0));
}

// What the page sees, each path once: one inside another listed path is left out. A papp-system page sees all but keys and logins, so only those add to it.
export function seenFiles({ own, read, write, system }: Permissions) {
  const named = [...new Set([own ?? [], read, write].flat())];
  const all = system && PERMISSIONS_PLATFORM.systemSeesAll;
  const listed = named.filter(pattern =>
    all ? SECRETS.some(secret => isInside(literalBase(pattern), secret.path)) : !named.some(other => other !== pattern && new RegExp(patternSource(other)).test(literalBase(pattern)))
  );

  return { all, lines: listed.map(pattern => folderLine('read', pattern)) };
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

// Each setting the tag makes, so none goes unseen. Yellow where the window could pass for another app's: without a frame, see-through, or over every other window.
function windowLine({ width, height, minWidth, minHeight, resizable, titleBar, frame, transparent, onTop }: WindowSettings): Line {
  const settings = [
    (width || height) && `${width ?? 'usual'} × ${height ?? 'usual'}`,
    (minWidth || minHeight) && `at least ${minWidth ?? 0} × ${minHeight ?? 0}`,
    resizable !== undefined && (resizable ? 'resizable' : 'fixed size'),
    titleBar !== undefined && (titleBar ? 'title bar' : 'no title bar'),
    frame !== undefined && (frame ? 'frame' : 'no frame'),
    transparent !== undefined && (transparent ? 'see-through' : 'not see-through'),
    onTop !== undefined && (onTop ? 'stays on top of other apps' : 'not on top'),
  ].filter(text => typeof text === 'string');
  const looksLikeAnotherApp = frame === false || transparent === true || onTop === true;

  return { id: `window:${settings.join(', ')}`, level: looksLikeAnotherApp ? 'yellow' : 'plain', text: `Window: ${settings.join(', ')}`, short: 'Window' };
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
