import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { PROGRAM_ENV } from './env.ts';
import { LOCAL_HOSTS, privateNetwork } from './network.ts';
import { absolutePath, BIG_FOLDERS, HOME, realPath, SECRETS } from './paths.ts';
import { changeableSources, isInside, literalBase, patternFolder } from './patterns.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';

export type Permissions = {
  own: string | null;
  read: string[];
  write: string[];
  net: string[];
  open: string[];
  run: Record<string, string>;
  env: string[];
  sockets: string[];
  hidden: string[];
  system: boolean;
  use: Use[];
  shortcuts: string[];
  window: WindowSettings | null;
  listen: Listen | null;
  tags: string[];
};
export type Use = (typeof USES)[number];
// Who may send the page requests: programs on this computer, or devices on the network too.
export type Listen = 'localhost' | 'network';
// Only the keys the tag sets.
export type WindowSettings = { width?: number; height?: number; minWidth?: number; minHeight?: number; resizable?: boolean; titleBar?: boolean; frame?: boolean; transparent?: boolean; onTop?: boolean };

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const USES = ['notifications', 'clipboard', 'location', 'sound', 'camera', 'microphone', 'screen', 'background', 'login', 'usb', 'serial', 'hid', 'midi', 'print'] as const;
const SIZES = { width: 'width', height: 'height', 'min-width': 'minWidth', 'min-height': 'minHeight' } as const;
const SWITCHES = { resizable: 'resizable', 'title-bar': 'titleBar', frame: 'frame', transparent: 'transparent', 'on-top': 'onTop' } as const;
const MODIFIERS: Partial<Record<string, string>> = { commandorcontrol: 'CommandOrControl', cmdorctrl: 'CommandOrControl', command: 'Command', cmd: 'Command', control: 'Control', ctrl: 'Control', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Super' };
const KEYS = [...Array.from({ length: 24 }, (_, i) => `F${i + 1}`), 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc'];
// Taken alone: no app types with them.
const MEDIA_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];

export function declaredPermissions(page: string, html = fs.readFileSync(page, 'utf8')) {
  const dir = path.dirname(page);
  const permissions: Permissions = { own: null, read: [], write: [], net: [], open: [], run: {}, env: [], sockets: [], hidden: [], system: false, use: [], shortcuts: [], window: null, listen: null, tags: [] };
  const head = html.replace(/<!--[\s\S]*?-->/g, '').split(/<script\b|<body\b|<\/head\b/i)[0];

  for (const [, attrs] of head.matchAll(/<meta\s+([^>]*)>/gi)) {
    const attributes = readAttributes(attrs);
    const name = attributes.get('name');
    const content = attributes.get('content');

    if (!name?.value.toLowerCase().startsWith('papp-')) {
      continue;
    }

    const tag = `<meta ${attrs.replace(/\s+/g, ' ').trim()}>`;

    if (!name.quoted || !content?.quoted) {
      throw new Error(`${tag} needs a quoted name and content, as in <meta name="papp-read" content="./data">.`);
    }

    const value = content.value.trim();
    const invisible = [tag, value].find(text => INVISIBLE.test(text));

    if (invisible) {
      throw new Error(`${JSON.stringify(invisible)} has a line break or another invisible character, which the popup cannot show. Write the value on one line.`);
    }

    permissions.tags.push(tag);
    const kind = name.value.slice('papp-'.length).toLowerCase();

    if (Object.hasOwn(PERMISSIONS_PLATFORM.refusedTags, kind)) {
      throw new Error(PERMISSIONS_PLATFORM.refusedTags[kind]);
    } else if (kind === 'read' || kind === 'write') {
      permissions[kind].push(folderPattern(value, dir));
    } else if (kind === 'net') {
      permissions.net.push(hostPattern(value));
    } else if (kind === 'open') {
      permissions.open.push(openHost(value));
    } else if (kind === 'run' && Object.hasOwn(permissions.run, path.basename(value))) {
      throw new Error(`Two papp-run tags name a program ${path.basename(value)}. The page runs programs by name, so keep one.`);
    } else if (kind === 'run') {
      permissions.run[path.basename(value)] = findProgram(value, dir);
    } else if (kind === 'env') {
      permissions.env.push(envName(value));
    } else if (kind === 'socket') {
      permissions.sockets.push(socketPath(value, dir));
    } else if (kind === 'system' && value === 'full') {
      permissions.system = true;
    } else if (kind === 'system') {
      throw new Error(`Bad papp-system value "${value}". The only value is "full".`);
    } else if (kind === 'use') {
      permissions.use.push(...value.split(',').map(name => useName(name.trim())));
    } else if (kind === 'global-shortcut') {
      permissions.shortcuts.push(shortcut(value));
    } else if (kind === 'window' && permissions.window) {
      throw new Error('Two papp-window tags. Put every setting in one, as in content="size=900x600, title-bar=no".');
    } else if (kind === 'window') {
      permissions.window = windowSettings(value);
    } else if (kind === 'listen' && permissions.listen) {
      throw new Error('Two papp-listen tags. Keep one: network includes this computer.');
    } else if (kind === 'listen') {
      permissions.listen = listenScope(value);
    } else {
      throw new Error(`Unknown tag papp-${kind}. The tags are papp-read, papp-write, papp-net, papp-open, papp-run, papp-env, papp-socket, papp-listen, papp-use, papp-global-shortcut, papp-window and papp-system.`);
    }
  }

  if (permissions.system && (Object.keys(permissions.run).length || permissions.env.length)) {
    throw new Error('papp-system already allows every program and variable. Remove papp-run and papp-env.');
  } else if (permissions.env.length && !Object.keys(permissions.run).length) {
    throw new Error('papp-env passes a variable to the programs a page runs, and this page runs none. Add papp-run, or remove papp-env.');
  }

  checkPermissions(permissions, page);
  const { read, write, sockets } = permissions;
  const named = [...[...read, ...write].map(literalBase), ...sockets];
  permissions.own = [path.parse(dir).root, HOME, ...BIG_FOLDERS].includes(dir) ? null : dir;
  permissions.hidden = SECRETS.map(secret => secret.path).filter(secret => !named.some(base => isInside(base, secret)));

  return permissions;
}

// What the sandbox is built from must pass these, whether a tag or a pick named it: run on the tags here, and again with the picks before the sandbox is built.
export function checkPermissions(permissions: Permissions, page: string) {
  const { read, write, run, sockets } = permissions;
  const dir = path.dirname(page);
  const quoted = [...write, ...sockets].find(folder => folder.includes('"'));
  const refusal = PERMISSIONS_PLATFORM.refuse(permissions, dir);
  const invisible = [page, ...read, ...write, ...Object.values(run), ...sockets].find(text => INVISIBLE.test(text));
  // A program the page can change is any program: "Run tool" would say nothing. As on disk, like the patterns, so a link cannot hide it. Where the sandbox grants whole folders, a program in one counts too.
  const changeable = changeableSources(permissions).files.map(source => new RegExp(source));
  const writableFolders = write.map(patternFolder);
  const rewritable = Object.values(run).find(program => changeable.some(pattern => pattern.test(realPath(program))) || (PERMISSIONS_PLATFORM.writesWholeFolders && writableFolders.some(folder => isInside(realPath(program), folder))));

  if (quoted) {
    throw new Error(`${quoted} has a " in its path, which the sandbox cannot take. Rename it.`);
  } else if (refusal) {
    throw new Error(refusal);
  } else if (invisible) {
    throw new Error(`${JSON.stringify(invisible)} has a line break or another invisible character, which the popup cannot show. Rename the file.`);
  } else if (rewritable) {
    throw new Error(`The page could change ${rewritable}, which it runs: a papp-write tag or a pick covers it. Keep a program where the page cannot write.`);
  }
}

// As the browser reads them: the first of each name wins, in any case. Quoted means name="value", no spaces around the =.
function readAttributes(attrs: string) {
  const attributes = new Map<string, { value: string; quoted: boolean }>();

  for (const [, key, equals, double, single, bare] of attrs.matchAll(/([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (!attributes.has(key.toLowerCase())) {
      attributes.set(key.toLowerCase(), { value: double ?? single ?? bare ?? '', quoted: (double ?? single) !== undefined && equals === '=' });
    }
  }

  return attributes;
}

function folderPattern(value: string, dir: string) {
  if (value === '*') {
    throw new Error('A folder of "*" is unclear. Use / for the whole disk or ~ for your home folder.');
  } else if (!value || /["\\]/.test(value)) {
    throw new Error(`Bad folder "${value}". Use a path such as ./data, ~/notes or ~/notes/*.md.`);
  }

  const absolute = absolutePath(value, dir);
  const base = absolute.includes('*') || fs.existsSync(absolute) ? literalBase(absolute) : path.dirname(absolute);

  if (!fs.existsSync(base)) {
    throw new Error(`Folder ${base} does not exist (from "${value}").`);
  }

  return path.join(fs.realpathSync.native(base), path.relative(base, absolute));
}

function hostPattern(value: string) {
  // A trailing dot names the same host: without it, localhost. would not count as this computer.
  const pattern = (value.includes(':') ? value : `${value}:443`).toLowerCase().replace('.:', ':');
  const [host, port] = pattern.split(':');

  if (!/^(\*|(\*\.)?[a-z0-9][a-z0-9.-]*):(\*|[1-9]\d*)$/.test(pattern) || +port < 1 || +port > 65535) {
    throw new Error(`Bad papp-net value "${value}". One host per <meta>, with a port after a colon if not 443, such as api.example.com, *.example.com or example.com:8080.`);
  } else if (value === '*') {
    throw new Error('Write papp-net "*:443" for any server on port 443, or "*:*" for any port.');
  } else if (!net.isIPv4(host) && host.split('.').every(label => /^(\d+|0x[0-9a-f]*)$/.test(label))) {
    // To the resolver 16843009, 1.1 and 0x7f.1 are addresses; the popup would show them as names.
    throw new Error(`Bad papp-net value "${value}". A host of numbers must be a full address, such as 1.1.1.1:${port === '*' ? '443' : port}.`);
  } else if (host !== '127.0.0.1' && /^(0|127|169\.254)\./.test(host)) {
    throw new Error(`Apargon never reaches ${host}, which is this computer or a link-local address, where cloud machines keep their keys. For a program on this computer, declare localhost:<port>.`);
  } else if (net.isIPv4(host) && Object.values(os.networkInterfaces()).flat().some(own => own?.address === host && !own.internal)) {
    throw new Error(`Apargon never reaches ${host}: it is one of this computer's own addresses. For a program on this computer, declare localhost:<port>.`);
  } else if (host.endsWith('.local')) {
    throw new Error(`Apargon reaches a device on your local network only by its address in numbers, such as 192.168.1.5:${port === '*' ? '80' : port}, not by a name such as ${host}.`);
  } else if ((LOCAL_HOSTS.includes(host) || privateNetwork().check(host)) && (port === '*' || !value.includes(':'))) {
    // On this computer, any port would include other pages' proxies, and with them their hosts. 443 is a web server's port, not a guess at a local one.
    throw new Error(`Apargon reaches ${host} on one port only, which you name. Write ${host}:<port>.`);
  }

  return pattern;
}

function openHost(value: string) {
  const host = value.toLowerCase().replace(/\.$/, '');

  if (host !== '*' && !/^(\*\.)?[a-z0-9][a-z0-9.-]*$/.test(host)) {
    throw new Error(`Bad papp-open value "${value}". One host per <meta>, no scheme or port, such as x.com or *.example.com.`);
  }

  return host;
}

// A name on PATH, a full path, or a path from the page's folder (./bin/tool) for a program the page ships.
function findProgram(value: string, dir: string) {
  const { programExtensions, programFolders } = PERMISSIONS_PLATFORM;
  const runnable = (file: string) => programExtensions.some(extension => file.toLowerCase().endsWith(extension)) && fs.statSync(file, { throwIfNoEntry: false })?.isFile();
  // Before the file is looked for: Windows would ask the server of a network path, before the popup.
  const refusal = PERMISSIONS_PLATFORM.refusePath(value);
  const bundled = /^\.[\\/]/.test(value);

  if (value.includes('*')) {
    throw new Error('papp-run takes one program, no wildcards. For any program, use papp-system.');
  } else if (path.isAbsolute(value) && path.normalize(value) !== value) {
    throw new Error(`Bad papp-run value "${value}". Write the path without .., . or //, as in ${path.normalize(value)}.`);
  } else if (bundled && value.slice(2).split(/[\\/]/).some(name => ['', '.', '..'].includes(name))) {
    throw new Error(`Bad papp-run value "${value}". Write the path from the page's folder without .., . or //, as in ./bin/${path.basename(value)}.`);
  } else if (refusal) {
    throw new Error(refusal);
  } else if (path.isAbsolute(value) || bundled) {
    const file = bundled ? absolutePath(value, dir) : value;

    if (!runnable(file)) {
      throw new Error(`Program ${file} was not found, or is a folder or another file that cannot run.`);
    }

    return file;
  } else if (!/^[\w.+-]+$/.test(value)) {
    throw new Error(`Bad papp-run value "${value}". Name one program, such as git, or give its full path.`);
  }

  // An empty PATH entry, as a trailing ; leaves, is no folder.
  const folders = [...process.env.PATH!.split(path.delimiter), ...programFolders].filter(Boolean);
  const names = programExtensions.map(extension => (value.toLowerCase().endsWith(extension) ? value : value + extension));
  const found = folders.flatMap(dir => names.map(name => path.join(dir, name))).find(runnable);

  if (!found) {
    throw new Error(`Program ${value} was not found. Give its full path in papp-run.`);
  }

  return found;
}

function listenScope(value: string): Listen {
  const scope = value.toLowerCase();

  if (scope !== 'localhost' && scope !== 'network') {
    throw new Error(`Bad papp-listen value "${value}". Write localhost, for programs on this computer, or network, for devices on your network too.`);
  }

  return scope;
}

function envName(value: string) {
  if (!/^[A-Za-z_]\w*$/.test(value)) {
    throw new Error(`Bad papp-env value "${value}". Name one environment variable, such as AWS_PROFILE.`);
  } else if (PROGRAM_ENV.includes(value)) {
    throw new Error(`Programs get ${value} already. Remove its papp-env.`);
  }

  return value;
}

function socketPath(value: string, dir: string) {
  if (value.includes('*')) {
    throw new Error('papp-socket takes one socket file or folder, no wildcards.');
  } else if (!value || /["\\]/.test(value)) {
    throw new Error(`Bad papp-socket value "${value}". Use a path such as /var/run/docker.sock or ~/.gnupg.`);
  }

  const absolute = absolutePath(value, dir);
  const stats = fs.statSync(absolute, { throwIfNoEntry: false });

  if (!stats) {
    throw new Error(`Socket ${absolute} does not exist (from "${value}"). Start the program that makes it first.`);
  } else if (!stats.isSocket() && !stats.isDirectory()) {
    throw new Error(`${absolute} is not a socket or a folder (from "${value}").`);
  }

  return fs.realpathSync.native(absolute);
}

// As the viewport tag: key=value pairs, separated by commas.
function windowSettings(value: string) {
  const settings: WindowSettings = {};
  const seen = new Set<string>();
  const keys = ['size', ...Object.keys(SIZES), ...Object.keys(SWITCHES)].join(', ');
  const sized = value.replace(/(^|,)\s*size\s*=\s*(\d+)x(\d+)/gi, '$1width=$2, height=$3');

  if ((value.match(/\bsize\s*=/gi) ?? []).length > 1) {
    throw new Error('papp-window sets size twice. Keep one.');
  }

  for (const setting of sized.split(',')) {
    const [key, given] = setting.split('=').map(part => part.trim().toLowerCase());

    if (seen.has(key)) {
      throw new Error(`papp-window sets ${key} twice. Keep one.`);
    } else if (Object.hasOwn(SIZES, key) && /^[1-9]\d{1,3}$/.test(given)) {
      settings[SIZES[key as keyof typeof SIZES]] = +given;
    } else if (Object.hasOwn(SWITCHES, key) && (given === 'yes' || given === 'no')) {
      settings[SWITCHES[key as keyof typeof SWITCHES]] = given === 'yes';
    } else {
      throw new Error(`Bad papp-window setting "${setting.trim()}". Write key=value pairs, such as size=900x600, title-bar=no. The keys are ${keys}: size as 900x600, the other sizes in pixels, the rest yes or no.`);
    }

    seen.add(key);
  }

  return settings;
}

function useName(value: string) {
  const name = value.toLowerCase() as Use;

  if (!USES.includes(name)) {
    throw new Error(`Bad papp-use value "${value}". The values are ${USES.join(', ')}, one or more separated by commas.`);
  }

  return name;
}

function shortcut(value: string) {
  const parts = value.split('+');
  const last = parts[parts.length - 1];
  const named = parts.slice(0, -1).map(part => MODIFIERS[part.toLowerCase()]);
  const modifiers = named.filter(name => name !== undefined);
  const keysHeld = new Set(modifiers.map(name => PERMISSIONS_PLATFORM.sameKey[name] ?? name));
  const key = [...KEYS, ...MEDIA_KEYS].find(known => known.toLowerCase() === last.toLowerCase()) ?? (/^[a-z0-9]$/i.test(last) ? last.toUpperCase() : undefined);

  if (modifiers.length < named.length || key === undefined) {
    throw new Error(`Bad papp-global-shortcut value "${value}". Write modifiers and one key, such as CommandOrControl+Shift+N or Alt+F9.`);
  } else if (!MEDIA_KEYS.includes(key) && (/^F\d+$/.test(key) ? keysHeld.size === 0 : keysHeld.size < 2 || [...keysHeld].every(name => PERMISSIONS_PLATFORM.typingModifiers.includes(name)))) {
    throw new Error(`papp-global-shortcut ${value} would catch keys meant for the app in front. Use two different modifiers, not only ${PERMISSIONS_PLATFORM.typingModifiers.join(' and ')}, or one with a function key.`);
  }

  return [...new Set(modifiers), key].join('+');
}
