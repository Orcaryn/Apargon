import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { literalBase, PAGE_FILE, patternFolder, patternSource } from './patterns.ts';

export type Permissions = {
  own: string | null;
  read: string[];
  write: string[];
  net: string[];
  run: Record<string, string>;
  env: string[];
  sockets: string[];
  hidden: string[];
  node: boolean;
  use: Use[];
  shortcuts: string[];
  tags: string[];
};
export type Use = (typeof USES)[number];

export const HOME = fs.realpathSync(os.homedir());
export const BIG_FOLDERS = ['Desktop', 'Documents', 'Downloads'].map(name => path.join(HOME, name));
export const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
export const PROGRAM_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'http_proxy', 'https_proxy', 'no_proxy'];
export const PAGE_ENV = [
  ...PROGRAM_ENV,
  ...'DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_DATA_DIRS XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME GDK_BACKEND GDK_SCALE GDK_DPI_SCALE GTK_IM_MODULE XMODIFIERS LANGUAGE ELECTRON_OZONE_PLATFORM_HINT __CF_USER_TEXT_ENCODING'.split(' '),
];
export const PRIVATE = ['/run', '/tmp', '/var/tmp'];
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
export const USES = ['notifications', 'clipboard', 'location', 'sound', 'camera', 'microphone', 'screen'] as const;
const MODIFIERS: Partial<Record<string, string>> = { commandorcontrol: 'CommandOrControl', cmdorctrl: 'CommandOrControl', command: 'Command', cmd: 'Command', control: 'Control', ctrl: 'Control', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Super' };
const SAME_KEY: Partial<Record<string, string>> = process.platform === 'darwin' ? { CommandOrControl: 'Command', Super: 'Command' } : { CommandOrControl: 'Control' };
const TYPING_MODIFIERS = process.platform === 'darwin' ? ['Alt', 'Shift'] : ['AltGr', 'Shift'];
const KEYS = [...Array.from({ length: 24 }, (_, i) => `F${i + 1}`), 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc'];
const MAC_BROWSERS = ['Google/Chrome', 'Chromium', 'BraveSoftware', 'Microsoft Edge', 'Arc', 'Firefox'].map(name => `Library/Application Support/${name}`);
const LINUX_BROWSERS = ['.config/google-chrome', '.config/chromium', '.config/BraveSoftware', '.config/microsoft-edge', '.mozilla', 'snap/firefox'];
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
  ...Object.fromEntries([...MAC_BROWSERS, ...LINUX_BROWSERS].map(name => [name, 'browser logins and cookies'])),
}).map(([name, holds]) => ({ path: path.join(HOME, name), holds }));

export function declaredPermissions(page: string, html = fs.readFileSync(page, 'utf8')) {
  const dir = path.dirname(page);
  const permissions: Permissions = { own: null, read: [], write: [], net: [], run: {}, env: [], sockets: [], hidden: [], node: false, use: [], shortcuts: [], tags: [] };
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

    if (kind === 'read' || kind === 'write') {
      permissions[kind].push(folderPattern(value, dir));
    } else if (kind === 'net') {
      permissions.net.push(hostPattern(value));
    } else if (kind === 'run' && Object.hasOwn(permissions.run, path.basename(value))) {
      throw new Error(`Two papp-run tags name a program ${path.basename(value)}. The page runs programs by name, so keep one.`);
    } else if (kind === 'run') {
      permissions.run[path.basename(value)] = findProgram(value);
    } else if (kind === 'env') {
      permissions.env.push(envName(value));
    } else if (kind === 'socket') {
      permissions.sockets.push(socketPath(value, dir));
    } else if (kind === 'node' && value === 'full') {
      permissions.node = true;
    } else if (kind === 'node') {
      throw new Error(`Bad papp-node value "${value}". The only value is "full".`);
    } else if (kind === 'use') {
      permissions.use.push(useName(value));
    } else if (kind === 'shortcut') {
      permissions.shortcuts.push(shortcut(value));
    } else {
      throw new Error(`Unknown tag papp-${kind}. The tags are papp-read, papp-write, papp-net, papp-run, papp-env, papp-socket, papp-use, papp-shortcut and papp-node.`);
    }
  }

  if (permissions.node && (permissions.read.length || permissions.write.length || Object.keys(permissions.run).length || permissions.env.length)) {
    throw new Error('papp-node already allows every folder, program and variable. Remove papp-read, papp-write, papp-run and papp-env.');
  } else if (permissions.env.length && !Object.keys(permissions.run).length) {
    throw new Error('papp-env passes a variable to the programs a page runs, and this page runs none. Add papp-run, or remove papp-env.');
  }

  const { read, write, run, sockets } = permissions;
  const quoted = [...write, ...sockets].find(folder => folder.includes('"'));
  const socketFolders = sockets.filter(socket => fs.statSync(socket).isDirectory());
  const reopened = [dir, ...[...read, ...write].map(patternFolder), ...socketFolders].find(
    folder => folder.startsWith('/run/') || PRIVATE.some(emptied => emptied === folder || emptied.startsWith(path.join(folder, '/')))
  );
  const invisible = [page, ...read, ...write, ...Object.values(run), ...sockets].find(text => INVISIBLE.test(text));

  if (quoted) {
    throw new Error(`${quoted} has a " in its path, which the sandbox cannot take. Rename it.`);
  } else if (process.platform === 'linux' && reopened) {
    throw new Error(`On Linux Apargon cannot open ${reopened}: it would bring back sockets to programs outside the sandbox. Use a folder of its own, such as /tmp/apargon.`);
  } else if (invisible) {
    throw new Error(`${JSON.stringify(invisible)} has a line break or another invisible character, which the popup cannot show. Rename the file.`);
  }

  const named = [...[...read, ...write].map(literalBase), ...sockets];
  const secrets = SECRETS.map(secret => (fs.existsSync(secret.path) ? fs.realpathSync.native(secret.path) : secret.path));
  permissions.own = permissions.node || ['/', HOME, ...BIG_FOLDERS].includes(dir) ? null : dir;
  permissions.hidden = permissions.node ? [] : secrets.filter(secret => !named.some(base => base === secret || base.startsWith(secret + '/')));

  return permissions;
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

export function absolutePath(value: string, dir: string) {
  return path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, HOME + '/'));
}

function hostPattern(value: string) {
  const pattern = value === '*' ? '*:*' : value.toLowerCase();
  const [host, port] = pattern.split(':');

  if (!/^(\*|(\*\.)?[a-z0-9][a-z0-9.-]*):(\*|[1-9]\d*)$/.test(pattern) || +port < 1 || +port > 65535) {
    throw new Error(`Bad papp-net value "${value}". One host:port per <meta>, such as api.example.com:443 or *.example.com:443.`);
  } else if (host !== '127.0.0.1' && /^(0|127|169\.254)\./.test(host)) {
    throw new Error(`Apargon never reaches ${host}, which is this computer or a link-local address, where cloud machines keep their keys. For a program on this computer, declare localhost:<port>.`);
  } else if (net.isIPv4(host) && Object.values(os.networkInterfaces()).flat().some(own => own?.address === host && !own.internal)) {
    throw new Error(`Apargon never reaches ${host}: it is one of this computer's own addresses. For a program on this computer, declare localhost:<port>.`);
  } else if (host.endsWith('.local')) {
    throw new Error(`Apargon reaches a device on your local network only by its address in numbers, such as 192.168.1.5:${port === '*' ? '80' : port}, not by a name such as ${host}.`);
  } else if (privateNetwork().check(host) && port === '*') {
    throw new Error(`Apargon reaches a device on your local network on one port only. Write ${host}:<port>.`);
  } else if (process.platform === 'linux' && LOCAL_HOSTS.includes(host) && port === '*') {
    throw new Error('On Linux, a port on this computer must be a number, such as localhost:11434: Apargon carries each declared port into the sandbox.');
  }

  return pattern;
}

function findProgram(value: string) {
  if (value.includes('*')) {
    throw new Error('papp-run takes one program, no wildcards. For any program, use papp-node.');
  } else if (path.isAbsolute(value) && path.normalize(value) !== value) {
    throw new Error(`Bad papp-run value "${value}". Write the path without .., . or //, as in ${path.normalize(value)}.`);
  } else if (path.isAbsolute(value) && !fs.statSync(value, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Program ${value} was not found, or is a folder.`);
  } else if (path.isAbsolute(value)) {
    return value;
  } else if (!/^[\w.+-]+$/.test(value)) {
    throw new Error(`Bad papp-run value "${value}". Name one program, such as git, or give its full path.`);
  }

  const found = [...process.env.PATH!.split(':'), '/opt/homebrew/bin', '/usr/local/bin'].map(dir => path.join(dir, value)).find(file => fs.statSync(file, { throwIfNoEntry: false })?.isFile());

  if (!found) {
    throw new Error(`Program ${value} was not found. Give its full path in papp-run.`);
  }

  return found;
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

function useName(value: string) {
  const name = value.toLowerCase() as Use;

  if (!USES.includes(name)) {
    throw new Error(`Bad papp-use value "${value}". The values are ${USES.join(', ')}.`);
  } else if (name === 'location' && process.platform === 'linux') {
    throw new Error('On Linux Apargon cannot give a page its location: Chromium finds it through a web service, and the page has no network.');
  }

  return name;
}

function shortcut(value: string) {
  const parts = value.split('+');
  const last = parts[parts.length - 1];
  const named = parts.slice(0, -1).map(part => MODIFIERS[part.toLowerCase()]);
  const modifiers = named.filter(name => name !== undefined);
  const keysHeld = new Set(modifiers.map(name => SAME_KEY[name] ?? name));
  const key = KEYS.find(known => known.toLowerCase() === last.toLowerCase()) ?? (/^[a-z0-9]$/i.test(last) ? last.toUpperCase() : undefined);

  if (modifiers.length < named.length || key === undefined) {
    throw new Error(`Bad papp-shortcut value "${value}". Write modifiers and one key, such as CommandOrControl+Shift+N or Alt+F9.`);
  } else if (/^F\d+$/.test(key) ? keysHeld.size === 0 : keysHeld.size < 2 || [...keysHeld].every(name => TYPING_MODIFIERS.includes(name))) {
    throw new Error(`papp-shortcut ${value} would catch keys meant for the app in front. Use two different modifiers, not only ${TYPING_MODIFIERS.join(' and ')}, or one with a function key.`);
  }

  return [...new Set(modifiers), key].join('+');
}

export function localPorts({ net }: Permissions) {
  return net
    .map(pattern => pattern.split(':'))
    .filter(([host]) => LOCAL_HOSTS.includes(host))
    .map(([, port]) => port);
}

export function privateNetwork() {
  const addresses = new net.BlockList();
  addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  addresses.addSubnet('0.0.0.0', 8, 'ipv4');
  addresses.addSubnet('10.0.0.0', 8, 'ipv4');
  addresses.addSubnet('172.16.0.0', 12, 'ipv4');
  addresses.addSubnet('192.168.0.0', 16, 'ipv4');
  addresses.addSubnet('100.64.0.0', 10, 'ipv4');
  addresses.addSubnet('169.254.0.0', 16, 'ipv4');
  addresses.addAddress('::', 'ipv6');
  addresses.addAddress('::1', 'ipv6');
  addresses.addSubnet('fc00::', 7, 'ipv6');
  addresses.addSubnet('fe80::', 10, 'ipv6');
  addresses.addSubnet('64:ff9b::', 96, 'ipv6');

  return addresses;
}

export function changeableSources({ write }: Permissions) {
  return {
    files: write.map(pattern => patternSource(pattern)),
    pages: write.filter(pattern => PAGE_FILE.test(pattern)).map(pattern => patternSource(pattern)),
  };
}
