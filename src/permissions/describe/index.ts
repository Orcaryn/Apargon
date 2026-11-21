import path from 'path';
import { HOME } from '../paths/index.ts';
import { PERMISSIONS_PLATFORM } from '../platform/index.ts';
import type { Permissions, Use } from '../tags/index.ts';

// No Electron here: the Node tests load it.

// One popup line per tag that asks or adds to what leaves, built from what it asks for, under the heading it reads on from. kind: the tag, or use:<feature>, for its icon. heading: null for papp-system, which stands alone. detail: the place it names, in full, behind a tooltip. Drafts: the user approves the wording.
export type Line = { kind: string; heading: string | null; text: string; detail: string | null };

type Quiet = 'notifications' | 'sound';

const USE_LINES: Record<Exclude<Use, Quiet>, string> = {
  clipboard: 'Read what you copy',
  location: 'Know where you are',
  camera: 'Use your camera',
  microphone: 'Use your microphone',
  screen: 'Record your screen',
  background: 'Keep running after you close its window',
  login: 'Open when you log in',
  usb: 'Use USB devices',
  serial: 'Use serial devices',
  hid: 'Use keyboards, game controllers and other input devices',
  midi: 'Use MIDI instruments',
  cursor: 'See where your mouse is',
  broadcasts: 'Hear what other apps announce, like the song playing',
  share: 'Share with other apps',
  cloud: 'Read your cloud files',
  bluetooth: 'Use Bluetooth devices',
  ...PERMISSIONS_PLATFORM.useLines,
};

// A tag asks when data can leave, when files outside the .papp file's own folder can change, when it watches the user, or when it works with its window closed. With none of those there is no popup and no line: window settings, notifications, sound, fenced programs and settings shared with them add nothing a file without tags can't already do.
export function describe(permissions: Permissions): Line[] {
  const { system, writeAll, write, run, net, sockets, listen, shortcuts, anyShortcut } = permissions;
  const askingUses = permissions.use.filter((name): name is Exclude<Use, Quiet> => name !== 'notifications' && name !== 'sound');
  const asks = system || writeAll || write.length > 0 || net.length > 0 || sockets.length > 0 || listen !== null || shortcuts.length > 0 || anyShortcut || askingUses.length > 0 || Object.values(run).some(program => program.unfenced);

  if (!asks) {
    return [];
  }

  const place = (file: string) => (file.startsWith(HOME + path.sep) ? `~${file.slice(HOME.length)}` : file);
  const line = (kind: string, heading: string | null, text: string, detail: string | null = null) => ({ kind, heading, text, detail });
  // A folder or socket shows by its name, its place behind the tooltip. Two with one name show their places in full, or the lines would read the same.
  const named = (files: string[]) =>
    files.map(file => {
      const name = path.basename(file);

      return files.filter(other => path.basename(other) === name).length > 1 ? { name: place(file), detail: null } : { name, detail: place(file) };
    });

  return [
    ...(system ? [line('system', null, 'Do anything on your computer, with the internet')] : []),
    ...(writeAll ? [line('write', 'Change files in', 'every folder on your computer')] : []),
    ...named(write).map(({ name, detail }) => line('write', 'Change files in', name, detail)),
    ...Object.entries(run).map(([name, { file, unfenced }]) => line('run', 'Use', unfenced ? `${name}, with full access and the internet` : name, place(file))),
    ...permissions.env.map(name => line('env', 'Read', `your ${name} setting`)),
    ...net.map(site => line('net', 'Send your files to', site.replace(/:443$/, ''))),
    ...(PERMISSIONS_PLATFORM.allSocketsLine ? [] : named(sockets).map(({ name, detail }) => line('socket', 'Control', `the program at ${name}`, detail))),
    ...(PERMISSIONS_PLATFORM.allSocketsLine && sockets.length ? [line('socket', 'Control', PERMISSIONS_PLATFORM.allSocketsLine)] : []),
    ...(listen === 'localhost' ? [line('listen', 'Also', 'Let websites and apps on this computer connect')] : []),
    ...(listen === 'network' ? [line('listen', 'Also', 'Let phones and computers on your network connect')] : []),
    ...askingUses.map(name => line(`use:${name}`, 'Also', USE_LINES[name])),
    ...shortcuts.map(keys => line('shortcut', 'Also', `Use ${keyNames(keys)} in every app`)),
    ...(anyShortcut ? [line('shortcut', 'Also', 'Pick keys that work in every app')] : []),
  ];
}

// As the OS writes them: ⌘⇧N on macOS, Ctrl+Shift+N elsewhere.
export function keyNames(keys: string) {
  return keys
    .split('+')
    .map(key => PERMISSIONS_PLATFORM.sameKey[key] ?? key)
    .map(key => PERMISSIONS_PLATFORM.keyNames[key] ?? key)
    .join(PERMISSIONS_PLATFORM.keyJoin);
}
