import { randomUUID } from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { absolutePath, HOME, isInside } from './paths.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';

// No Electron here: the Node tests load it.

// What a .papp file's tags allow. Without permission tags: read every local disk, write its own folder, no network.
export type Permissions = {
  // papp-id: a UUID that names the app, whatever the file is called or wherever it moves. Its folder and its secrets are kept by it, so an update finds them.
  id: string;
  // Folders it may change, each ending in the separator.
  write: string[];
  // papp-write all: any file but Apargon's own.
  writeAll: boolean;
  // By the name the .papp file runs it by.
  run: Record<string, { file: string; unfenced: boolean }>;
  // Each host:port it may reach, and open links to.
  net: string[];
  // Who may connect to what the .papp file serves: this computer, or the network too.
  listen: 'localhost' | 'network' | null;
  sockets: string[];
  use: Use[];
  window: WindowSettings | null;
  env: string[];
  shortcuts: string[];
  // papp-global-shortcut any: the .papp file may pick its keys while it runs, with papp.shortcuts.
  anyShortcut: boolean;
  // papp-system: no limits. The .papp file runs as a Node script.
  system: boolean;
  // Every permission tag as written, for the popup. Not papp-id: it asks for nothing.
  tags: string[];
};
export type Use = (typeof USES)[number];
// Only the settings the tag names.
export type WindowSettings = { width?: number; height?: number; minWidth?: number; minHeight?: number; resizable?: boolean; titleBar?: boolean; frame?: boolean; transparent?: boolean; onTop?: boolean; allSpaces?: boolean; clickThrough?: boolean; private?: boolean; dock?: boolean; blur?: boolean; mark?: boolean };

const USES = ['notifications', 'clipboard', 'location', 'sound', 'camera', 'microphone', 'screen', 'background', 'login', 'usb', 'serial', 'hid', 'midi', 'cursor', 'broadcasts', 'share', 'cloud', 'bluetooth'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZES = { width: 'width', height: 'height', 'min-width': 'minWidth', 'min-height': 'minHeight' } as const;
const SWITCHES = { resizable: 'resizable', 'title-bar': 'titleBar', frame: 'frame', transparent: 'transparent', 'on-top': 'onTop', 'all-spaces': 'allSpaces', 'click-through': 'clickThrough', private: 'private', dock: 'dock', blur: 'blur', mark: 'mark' } as const;
// Per tag: whether it takes content, and the attributes it takes beside name. Any other attribute refuses the file.
const SHAPES: Record<string, { content: boolean; options: string[] }> = {
  id: { content: true, options: [] },
  write: { content: true, options: ['all'] },
  run: { content: true, options: ['unfenced'] },
  net: { content: true, options: [] },
  listen: { content: false, options: ['network'] },
  socket: { content: true, options: [] },
  use: { content: true, options: [] },
  window: { content: false, options: ['size', ...Object.keys(SIZES), ...Object.keys(SWITCHES)] },
  env: { content: true, options: [] },
  'global-shortcut': { content: true, options: [] },
  system: { content: false, options: [] },
};
const OLD_TAGS: Record<string, string> = {
  read: 'papp-read is gone: every .papp file reads the local disks. Remove the tag.',
  open: 'papp-open is gone: a site in papp-net opens its links too. Write <meta name="papp-net" content="example.com">.',
};
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const MODIFIERS: Partial<Record<string, string>> = { commandorcontrol: 'CommandOrControl', cmdorctrl: 'CommandOrControl', command: 'Command', cmd: 'Command', control: 'Control', ctrl: 'Control', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Super' };
const KEYS = [...Array.from({ length: 24 }, (_, i) => `F${i + 1}`), 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc'];
// Taken alone: no app types with them.
const MEDIA_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];

export function noPermissions(id: string): Permissions {
  return { id, write: [], writeAll: false, run: {}, net: [], listen: null, sockets: [], use: [], window: null, env: [], shortcuts: [], anyShortcut: false, system: false, tags: [] };
}

// The tags in the head, as the browser reads them. A tag Apargon can't keep refuses the whole file, and so does a missing papp-id.
export function declaredPermissions(page: string, html: string, protectedFolders: string[]) {
  const dir = path.dirname(page);
  const permissions = noPermissions('');

  // The path goes, as it is, into files the OS reads line by line, as Linux's launcher entry: a line break in it would write lines of its own there.
  if (/\p{Cc}/u.test(page)) {
    throw new Error(`${JSON.stringify(path.basename(page))} has a line break or another control character in its path. Rename it.`);
  }

  const head = html.replace(/<!--[\s\S]*?-->/g, '').split(/<script\b|<body\b|<\/head\b/i)[0];

  for (const [, attrs] of head.matchAll(/<meta\s+([^>]*)>/gi)) {
    const attributes = readAttributes(attrs);
    const name = attributes.get('name');

    if (!name?.value.toLowerCase().startsWith('papp-')) {
      continue;
    }

    const tag = `<meta ${attrs.replace(/\s+/g, ' ').replace(/\s*\/$/, '').trim()}>`;
    const kind = name.value.slice('papp-'.length).toLowerCase();
    const shape = Object.hasOwn(SHAPES, kind) ? SHAPES[kind] : undefined;

    if (INVISIBLE.test(tag)) {
      throw new Error(`${JSON.stringify(tag)} has a line break or another invisible character, which the popup can't show. Write the tag on one line.`);
    } else if (Object.hasOwn(OLD_TAGS, kind)) {
      throw new Error(OLD_TAGS[kind]);
    } else if (!shape) {
      throw new Error(`Unknown tag papp-${kind}. The tags are ${Object.keys(SHAPES).map(each => `papp-${each}`).join(', ')}.`);
    } else if (PERMISSIONS_PLATFORM.refusedTags[kind]) {
      throw new Error(PERMISSIONS_PLATFORM.refusedTags[kind]);
    }

    const unknown = [...attributes.keys()].find(key => key !== 'name' && (key !== 'content' || !shape.content) && !shape.options.includes(key));
    const content = attributes.get('content');

    if (unknown === 'content') {
      throw new Error(`${tag}: papp-${kind} takes no content.${kind === 'window' ? ' Its settings are attributes now, as in <meta name="papp-window" on-top frame="no" size="320x80">.' : kind === 'listen' ? ' Write <meta name="papp-listen"> for this computer, or <meta name="papp-listen" network> for the network too.' : kind === 'system' ? ' Write <meta name="papp-system">.' : ''}`);
    } else if (unknown !== undefined) {
      throw new Error(`${tag}: papp-${kind} has no attribute "${unknown}".${shape.options.length ? ` It takes ${shape.options.join(', ')}.` : ''}`);
    } else if (!name.quoted || (content && !content.quoted)) {
      throw new Error(`${tag} needs quoted values, as in <meta name="papp-net" content="example.com">.`);
    }

    // A tag that takes content needs it, unless an option stands in for it: papp-write all.
    const value = content?.value.trim() ?? '';
    const yes = (key: string) => attributes.has(key) && isYes(attributes.get(key)!, tag);

    if (kind !== 'id') {
      permissions.tags.push(tag);
    }

    if (shape.content && !value && !(kind === 'write' && attributes.has('all'))) {
      throw new Error(`${tag} needs content: the ${{ id: 'UUID', write: 'folder', run: 'program', net: 'site', socket: 'socket', use: 'feature', env: 'variable', 'global-shortcut': 'keys' }[kind]} it allows.`);
    } else if (kind === 'id' && permissions.id) {
      throw new Error('Two papp-id tags. Keep one.');
    } else if (kind === 'id' && !UUID.test(value)) {
      throw new Error(`Bad papp-id "${value}". It is a UUID, such as ${randomUUID()}.`);
    } else if (kind === 'id') {
      permissions.id = value.toLowerCase();
    } else if (kind === 'write' && attributes.has('all')) {
      if (content) {
        throw new Error(`${tag}: papp-write all takes no folder. Keep one or the other.`);
      }

      permissions.writeAll = yes('all');
    } else if (kind === 'write') {
      permissions.write.push(writeFolder(value, dir, protectedFolders));
    } else if (kind === 'run') {
      const program = findProgram(value, dir);
      const runName = path.basename(value);

      if (Object.hasOwn(permissions.run, runName)) {
        throw new Error(`Two papp-run tags name a program ${runName}. The .papp file runs programs by name, so keep one.`);
      }

      // Unfenced: its real file, so a link can't hide that papp-write reaches it.
      const unfenced = yes('unfenced');
      permissions.run[runName] = { file: unfenced ? fs.realpathSync.native(program) : program, unfenced };
    } else if (kind === 'net') {
      permissions.net.push(site(value));
    } else if (kind === 'listen' && permissions.listen) {
      throw new Error('Two papp-listen tags. Keep one: the network includes this computer.');
    } else if (kind === 'listen') {
      permissions.listen = yes('network') ? 'network' : 'localhost';
    } else if (kind === 'socket') {
      permissions.sockets.push(socketPath(value, dir));
    } else if (kind === 'use') {
      permissions.use.push(useName(value));
    } else if (kind === 'window' && permissions.window) {
      throw new Error('Two papp-window tags. Put every setting in one, as in <meta name="papp-window" on-top frame="no">.');
    } else if (kind === 'window') {
      permissions.window = windowSettings(attributes, tag);
    } else if (kind === 'env' && !/^[A-Za-z_]\w*$/.test(value)) {
      throw new Error(`Bad papp-env "${value}". Name one environment variable, such as AWS_PROFILE.`);
    } else if (kind === 'env') {
      permissions.env.push(value);
    } else if (kind === 'global-shortcut' && value.toLowerCase() === 'any') {
      permissions.anyShortcut = true;
    } else if (kind === 'global-shortcut') {
      permissions.shortcuts.push(shortcut(value));
    } else if (kind === 'system') {
      permissions.system = true;
    }
  }

  if (!permissions.id) {
    throw new Error(`${path.basename(page)} has no papp-id. Add <meta name="papp-id" content="${randomUUID()}"> to its head: it names the app, so an update keeps its data.`);
  }

  checkTogether(permissions, protectedFolders);

  return permissions;
}

// What only the tags together decide.
function checkTogether(permissions: Permissions, protectedFolders: string[]) {
  const { system, writeAll, write, run, net, sockets, listen, env, use, window } = permissions;
  const unfencedRewritable = Object.entries(run).find(([, program]) => program.unfenced && (writeAll || [...write, ...protectedFolders].some(folder => isInside(program.file, folder))));
  const duplicate = [write, net, sockets, use, env, permissions.shortcuts].map(list => list.find((each, i) => list.indexOf(each) !== i)).find(each => each !== undefined);

  if (system && (writeAll || write.length || Object.keys(run).length || net.length || sockets.length || listen || env.length)) {
    throw new Error('papp-system already allows everything: every file, every program and the internet. Remove the other papp-write, papp-run, papp-net, papp-socket, papp-listen and papp-env tags.');
  } else if (writeAll && write.length) {
    throw new Error('papp-write all already allows every folder. Remove the other papp-write tags.');
  } else if (env.length && !Object.keys(run).length) {
    throw new Error('papp-env passes a variable to the programs a .papp file runs, and this one runs none. Add papp-run, or remove papp-env.');
  } else if (unfencedRewritable) {
    throw new Error(`The .papp file could change ${unfencedRewritable[1].file}, which papp-run unfenced runs with no limits. Keep it where the .papp file can't write.`);
  } else if (duplicate !== undefined) {
    throw new Error(`Two tags allow ${duplicate}. Keep one.`);
  } else if (window?.dock === false && !use.includes('background')) {
    throw new Error('papp-window dock="no" leaves no icon to find the .papp file by. Add <meta name="papp-use" content="background">, which keeps its tray icon.');
  }
}

// As the browser reads them: the first of each name wins, in any case. A bare attribute has the value ''. Quoted means name="value", no spaces around the =.
function readAttributes(attrs: string) {
  const attributes = new Map<string, { value: string; quoted: boolean }>();

  for (const [, key, equals, double, single, bare] of attrs.matchAll(/([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (!attributes.has(key.toLowerCase())) {
      attributes.set(key.toLowerCase(), { value: double ?? single ?? bare ?? '', quoted: equals === undefined || ((double ?? single) !== undefined && equals === '=') });
    }
  }

  return attributes;
}

// A bare attribute is yes, and so is ="yes". ="no" is no.
function isYes({ value, quoted }: { value: string; quoted: boolean }, tag: string) {
  const answer = value.trim().toLowerCase();

  if (!quoted || !['', 'yes', 'no'].includes(answer)) {
    throw new Error(`${tag}: write a setting bare for yes, as in on-top, or ="no" for no.`);
  }

  return answer !== 'no';
}

// One folder, as on disk. Not the home folder, not one that holds it, and not Apargon's own.
function writeFolder(value: string, dir: string, protectedFolders: string[]) {
  const absolute = absolutePath(value, dir);

  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`papp-write "${value}": ${absolute} is not a folder, or isn't there. For any folder, write <meta name="papp-write" all>.`);
  }

  const folder = fs.realpathSync.native(absolute);
  const own = protectedFolders.find(each => isInside(folder, each) || isInside(each, folder));

  if (isInside(HOME, folder)) {
    throw new Error(`papp-write can't name ${folder}: it holds your whole home folder. Name a folder inside it, or write <meta name="papp-write" all>.`);
  } else if (own) {
    throw new Error(`papp-write can't name ${folder}: it is or holds Apargon's own folder ${own}.`);
  }

  return folder + path.sep;
}

// A host and an optional port, 443 if none. No scheme, no *. An IP address and localhost are fine: the user says yes to them.
export function site(value: string) {
  const [name, port = '443', ...rest] = value.toLowerCase().split(':');
  // A trailing dot names the same host.
  const host = name.replace(/\.$/, '');

  if (rest.length || !/^[1-9]\d{0,4}$/.test(port) || +port > 65535 || !host.split('.').every(label => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error(`Bad papp-net "${value}". Write one site and an optional port, as in example.com or example.com:8080. No scheme, no path, no *.`);
  } else if (!net.isIPv4(host) && URL.parse(`http://${host}`)?.hostname !== host) {
    // The browser reads 0x7f.1 and 127.1 as 127.0.0.1: the popup would show a name for an address.
    throw new Error(`Bad papp-net "${value}". Write an address in full, as in 127.0.0.1.`);
  } else if (host !== 'localhost' && host.endsWith('.localhost')) {
    throw new Error(`Bad papp-net "${value}". For this computer, write localhost.`);
  }

  return `${host}:${port}`;
}

// A name on PATH, a full path, or a path from the .papp file's folder (./bin/tool) for a program it ships.
function findProgram(value: string, dir: string) {
  const { programExtensions, programFolders } = PERMISSIONS_PLATFORM;

  const runnable = (file: string) => {
    if (!programExtensions.some(extension => file.toLowerCase().endsWith(extension)) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      return false;
    }

    try {
      // X_OK checks execute permission on POSIX. Windows relies on the extensions above.
      fs.accessSync(file, fs.constants.X_OK);

      return true;
    } catch {
      return false;
    }
  };

  if (path.isAbsolute(value) || /^\.[\\/]/.test(value)) {
    const file = absolutePath(value, dir);

    if (!runnable(file)) {
      throw new Error(`Program ${file} was not found, or is a folder or a file that can't run.`);
    }

    return file;
  } else if (!/^[\w.+-]+$/.test(value)) {
    throw new Error(`Bad papp-run "${value}". Name one program, such as git, or give its full path.`);
  }

  // An empty PATH entry, as a trailing ; leaves, is no folder.
  const folders = [...(process.env.PATH ?? '').split(path.delimiter), ...programFolders].filter(Boolean);
  const names = programExtensions.map(extension => (value.toLowerCase().endsWith(extension) ? value : value + extension));
  const found = folders.flatMap(folder => names.map(each => path.join(folder, each))).find(runnable);

  if (!found) {
    throw new Error(`Program ${value} was not found. Give its full path in papp-run.`);
  }

  return found;
}

function socketPath(value: string, dir: string) {
  const absolute = absolutePath(value, dir);

  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isSocket()) {
    throw new Error(`papp-socket "${value}": ${absolute} is not a socket, or isn't there. Start the program that makes it first.`);
  }

  return fs.realpathSync.native(absolute);
}

function useName(value: string) {
  const name = value.toLowerCase() as Use;

  if (value.includes(',')) {
    throw new Error(`Bad papp-use "${value}": one feature per tag. Write a tag for each.`);
  } else if (!USES.includes(name)) {
    throw new Error(`Bad papp-use "${value}". The features are ${USES.join(', ')}.`);
  } else if (PERMISSIONS_PLATFORM.refusedUses[name]) {
    throw new Error(PERMISSIONS_PLATFORM.refusedUses[name]);
  }

  return name;
}

// Attributes, as <meta name="papp-window" on-top frame="no" size="320x80">. window.open's features take the same, as on-top, frame=no, size=320x80.
function windowSettings(attributes: Map<string, { value: string; quoted: boolean }>, tag: string) {
  const settings: WindowSettings = {};

  for (const [key, given] of attributes) {
    const value = given.value.trim().toLowerCase();

    if (key === 'name') {
      continue;
    } else if (key === 'size' && (attributes.has('width') || attributes.has('height'))) {
      throw new Error(`${tag}: size sets the width and height. Keep size, or width and height.`);
    } else if (key === 'size' && /^[1-9]\d{1,3}x[1-9]\d{1,3}$/.test(value)) {
      const [width, height] = value.split('x').map(Number);
      Object.assign(settings, { width, height });
    } else if (Object.hasOwn(SIZES, key) && /^[1-9]\d{1,3}$/.test(value)) {
      settings[SIZES[key as keyof typeof SIZES]] = +value;
    } else if (Object.hasOwn(SWITCHES, key)) {
      settings[SWITCHES[key as keyof typeof SWITCHES]] = isYes(given, tag);
    } else {
      throw new Error(`${tag}: bad window setting ${key}${given.value ? `="${given.value}"` : ''}. Sizes take pixels, as in size="900x600" or min-width="400". The rest are bare for yes, as in on-top, or ="no", as in frame="no".`);
    }
  }

  return settings;
}

// window.open's features, as on-top, frame=no, size=320x80: read as the tag's attributes.
export function windowFeatures(features: string) {
  const attributes = new Map<string, { value: string; quoted: boolean }>();

  for (const feature of features.split(',').map(each => each.trim()).filter(Boolean)) {
    const [key, value = ''] = feature.split('=').map(part => part.trim());
    attributes.set(key.toLowerCase(), { value, quoted: true });
  }

  return windowSettings(attributes, `window.open features "${features}"`);
}

// Also for papp.shortcuts, on the keys a .papp file picks while it runs.
export function shortcut(value: string) {
  const parts = value.split('+');
  const last = parts[parts.length - 1];
  const named = parts.slice(0, -1).map(part => MODIFIERS[part.toLowerCase()]);
  const modifiers = named.filter(each => each !== undefined);
  const keysHeld = new Set(modifiers.map(each => PERMISSIONS_PLATFORM.sameKey[each] ?? each));
  const key = [...KEYS, ...MEDIA_KEYS].find(known => known.toLowerCase() === last.toLowerCase()) ?? (/^[a-z0-9]$/i.test(last) ? last.toUpperCase() : undefined);

  if (modifiers.length < named.length || key === undefined) {
    throw new Error(`Bad papp-global-shortcut "${value}". Write modifiers and one key, such as CommandOrControl+Shift+N or Alt+F9.`);
  } else if (!MEDIA_KEYS.includes(key) && (/^F\d+$/.test(key) ? keysHeld.size === 0 : keysHeld.size < 2 || [...keysHeld].every(each => PERMISSIONS_PLATFORM.typingModifiers.includes(each)))) {
    throw new Error(`papp-global-shortcut ${value} would catch keys meant for the app in front. Use two different modifiers, not only ${PERMISSIONS_PLATFORM.typingModifiers.join(' and ')}, or one with a function key.`);
  }

  return [...new Set(modifiers), key].join('+');
}
