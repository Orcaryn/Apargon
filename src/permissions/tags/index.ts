import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { isYes, readAttributes } from '../attributes/index.ts';
import { absolutePath, HOME, isInside } from '../paths/index.ts';
import { PERMISSIONS_PLATFORM } from '../platform/index.ts';
import { shortcut } from '../shortcut/index.ts';
import { WINDOW_ATTRIBUTES, windowSettings, type WindowSettings } from '../window/index.ts';
import { findProgram } from './program/index.ts';
import { site } from './site/index.ts';

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

const USES = ['notifications', 'clipboard', 'location', 'sound', 'camera', 'microphone', 'screen', 'background', 'login', 'usb', 'serial', 'hid', 'midi', 'cursor', 'broadcasts', 'share', 'cloud', 'bluetooth'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Per tag: whether it takes content, and the attributes it takes beside name. Any other attribute refuses the file.
const SHAPES: Record<string, { content: boolean; options: string[] }> = {
  id: { content: true, options: [] },
  write: { content: true, options: ['all'] },
  run: { content: true, options: ['unfenced'] },
  net: { content: true, options: [] },
  listen: { content: false, options: ['network'] },
  socket: { content: true, options: [] },
  use: { content: true, options: [] },
  window: { content: false, options: WINDOW_ATTRIBUTES },
  env: { content: true, options: [] },
  'global-shortcut': { content: true, options: [] },
  system: { content: false, options: [] },
};
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

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
    } else if (!shape) {
      throw new Error(`Unknown tag papp-${kind}. The tags are ${Object.keys(SHAPES).map(each => `papp-${each}`).join(', ')}.`);
    } else if (PERMISSIONS_PLATFORM.refusedTags[kind]) {
      throw new Error(PERMISSIONS_PLATFORM.refusedTags[kind]);
    }

    const unknown = [...attributes.keys()].find(key => key !== 'name' && (key !== 'content' || !shape.content) && !shape.options.includes(key));
    const content = attributes.get('content');

    if (unknown === 'content') {
      throw new Error(`${tag}: papp-${kind} takes no content.${kind === 'window' ? ' Its settings are attributes, as in <meta name="papp-window" on-top frame="no" size="320x80">.' : kind === 'listen' ? ' Write <meta name="papp-listen"> for this computer, or <meta name="papp-listen" network> for the network too.' : kind === 'system' ? ' Write <meta name="papp-system">.' : ''}`);
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

// One folder, as on disk. Not the home folder, not one that holds it, and not Apargon's own.
function writeFolder(value: string, dir: string, protectedFolders: string[]) {
  const absolute = absolutePath(value, dir);

  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`papp-write "${value}": ${absolute} is not a folder, or isn't there. For any folder, write <meta name="papp-write" all>.`);
  }

  const folder = fs.realpathSync.native(absolute);
  const apargonFolder = protectedFolders.find(each => isInside(folder, each) || isInside(each, folder));

  if (isInside(HOME, folder)) {
    throw new Error(`papp-write can't name ${folder}: it holds your whole home folder. Name a folder inside it, or write <meta name="papp-write" all>.`);
  } else if (apargonFolder) {
    throw new Error(`papp-write can't name ${folder}: it is or holds Apargon's own folder ${apargonFolder}.`);
  }

  return folder + path.sep;
}

function socketPath(value: string, dir: string) {
  const absolute = absolutePath(value, dir);

  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isSocket()) {
    throw new Error(`papp-socket "${value}": ${absolute} is not a socket, or isn't there. Start the program that makes it first.`);
  }

  return fs.realpathSync.native(absolute);
}
