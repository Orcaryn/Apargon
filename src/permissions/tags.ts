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
  tags: string[];
};

export const HOME = fs.realpathSync(os.homedir());
export const BIG_FOLDERS = ['Desktop', 'Documents', 'Downloads'].map(name => path.join(HOME, name));
export const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
export const PROGRAM_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'http_proxy', 'https_proxy', 'no_proxy'];
export const PAGE_ENV = [
  ...PROGRAM_ENV,
  ...'DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_DATA_DIRS XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME GDK_BACKEND GDK_SCALE GDK_DPI_SCALE GTK_IM_MODULE XMODIFIERS LANGUAGE ELECTRON_OZONE_PLATFORM_HINT __CF_USER_TEXT_ENCODING'.split(' '),
];
export const PRIVATE = ['/run', '/tmp', '/var/tmp'];

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
  const permissions: Permissions = { own: null, read: [], write: [], net: [], run: {}, env: [], sockets: [], hidden: [], node: false, tags: [] };
  const head = html.replace(/<!--[\s\S]*?-->/g, '').split(/<script\b|<body\b|<\/head\b/i)[0];

  for (const [, attrs] of head.matchAll(/<meta\s+([^>]*)>/gi)) {
    if (!/\bname=["']?papp-/i.test(attrs)) {
      continue;
    }

    const tag = `<meta ${attrs.replace(/\s+/g, ' ').trim()}>`;
    const name = /\bname=(["'])papp-(.*?)\1/is.exec(attrs)?.[2].toLowerCase();
    const value = /\bcontent=(["'])(.*?)\1/is.exec(attrs)?.[2].trim();

    if (name === undefined || value === undefined) {
      throw new Error(`${tag} needs a quoted name and content, as in <meta name="papp-read" content="./data">.`);
    }

    permissions.tags.push(tag);

    if (name === 'read' || name === 'write') {
      permissions[name].push(folderPattern(value, dir));
    } else if (name === 'net') {
      permissions.net.push(hostPattern(value));
    } else if (name === 'run') {
      permissions.run[path.basename(value)] = findProgram(value);
    } else if (name === 'env') {
      permissions.env.push(envName(value));
    } else if (name === 'socket') {
      permissions.sockets.push(socketPath(value, dir));
    } else if (name === 'node' && value === 'full') {
      permissions.node = true;
    } else if (name === 'node') {
      throw new Error(`Bad papp-node value "${value}". The only value is "full".`);
    } else {
      throw new Error(`Unknown tag papp-${name}. The tags are papp-read, papp-write, papp-net, papp-run, papp-env, papp-socket and papp-node.`);
    }
  }

  if (permissions.node && (permissions.read.length || permissions.write.length || Object.keys(permissions.run).length || permissions.env.length)) {
    throw new Error('papp-node already allows every folder, program and variable. Keep papp-node, papp-net and papp-socket only.');
  } else if (permissions.env.length && !Object.keys(permissions.run).length) {
    throw new Error('papp-env passes a variable to the programs a page runs, and this page runs none. Add papp-run, or remove papp-env.');
  }

  const { read, write, run, sockets, tags } = permissions;
  const quoted = [...write, ...sockets].find(folder => folder.includes('"'));
  const reopened = [dir, ...[...read, ...write].map(patternFolder)].find(
    folder => folder.startsWith('/run/') || PRIVATE.some(emptied => emptied === folder || emptied.startsWith(path.join(folder, '/')))
  );
  const invisible = [page, ...read, ...write, ...Object.values(run), ...sockets, ...tags].find(text => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text));

  if (quoted) {
    throw new Error(`${quoted} has a " in its path, which the sandbox cannot take. Rename it.`);
  } else if (process.platform === 'linux' && reopened) {
    throw new Error(`On Linux papp cannot open ${reopened}: it would bring back sockets to programs outside the sandbox. Use a folder of its own, such as /tmp/papp.`);
  } else if (invisible) {
    throw new Error(`${JSON.stringify(invisible)} has a line break or another invisible character, which the popup cannot show. Write the value on one line, or rename the file.`);
  }

  const named = [...[...read, ...write].map(literalBase), ...sockets];
  const secrets = SECRETS.map(secret => (fs.existsSync(secret.path) ? fs.realpathSync.native(secret.path) : secret.path));
  permissions.own = permissions.node || ['/', HOME, ...BIG_FOLDERS].includes(dir) ? null : dir;
  permissions.hidden = permissions.node ? [] : secrets.filter(secret => !named.some(base => base === secret || base.startsWith(secret + '/')));

  return permissions;
}

function folderPattern(value: string, dir: string) {
  if (value === '*') {
    throw new Error('A folder of "*" is unclear. Use / for the whole disk or ~ for your home folder.');
  } else if (!value || /["\\]/.test(value)) {
    throw new Error(`Bad folder "${value}". Use a path such as ./data, ~/notes or ~/notes/*.md.`);
  }

  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, HOME + '/'));
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
    throw new Error(`Bad papp-net value "${value}". One host:port per <meta>, such as api.example.com:443 or *.example.com:443.`);
  } else if (host !== '127.0.0.1' && privateNetwork().check(host)) {
    throw new Error(`papp never reaches your local network, and ${host} is an address on it. For a program on this computer, declare localhost:<port>.`);
  } else if (process.platform === 'linux' && LOCAL_HOSTS.includes(host) && port === '*') {
    throw new Error('On Linux, a port on this computer must be a number, such as localhost:11434: papp carries each declared port into the sandbox.');
  }

  return pattern;
}

function findProgram(value: string) {
  if (value.includes('*')) {
    throw new Error('papp-run takes one program, no wildcards. For any program, use papp-node.');
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

  const absolute = path.resolve(dir, value === '~' ? HOME : value.replace(/^~\//, HOME + '/'));
  const stats = fs.statSync(absolute, { throwIfNoEntry: false });

  if (!stats) {
    throw new Error(`Socket ${absolute} does not exist (from "${value}"). Start the program that makes it first.`);
  } else if (!stats.isSocket() && !stats.isDirectory()) {
    throw new Error(`${absolute} is not a socket or a folder (from "${value}").`);
  }

  return fs.realpathSync.native(absolute);
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

  return addresses;
}

export function changeableSources({ write }: Permissions) {
  return {
    files: write.map(pattern => patternSource(pattern)),
    pages: write.filter(pattern => PAGE_FILE.test(pattern)).map(pattern => patternSource(pattern)),
  };
}
