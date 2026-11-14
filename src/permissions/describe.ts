import path from 'path';
import { HOME } from './paths.ts';
import { PERMISSIONS_PLATFORM } from './platform.ts';
import type { Permissions, Use, WindowSettings } from './tags.ts';

// No Electron here: the Node tests load it.

// One popup line per tag, built from what it asks for, under the heading it reads on from. kind: the tag, or use:<feature>, for its icon. heading: null for papp-system, which stands alone. detail: the place it names, in full, behind a tooltip. Drafts: the user approves the wording.
export type Line = { kind: string; heading: string | null; text: string; detail: string | null };

const USE_LINES: Record<Use, string> = {
  notifications: 'Show notifications',
  clipboard: 'Read what you copy',
  location: 'Know where you are',
  sound: 'Play sound',
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
// Known sockets, by file name, to the program behind them.
const SOCKETS: Partial<Record<string, string>> = { 'docker.sock': 'Docker', 'podman.sock': 'Podman', 'S.gpg-agent': 'GPG', 'S.gpg-agent.ssh': 'your SSH keys', 'agent.sock': 'your SSH keys', 'ssh-agent.sock': 'your SSH keys', 'mysql.sock': 'MySQL', 'mysqld.sock': 'MySQL' };

export function describe(permissions: Permissions): Line[] {
  const place = (file: string) => (file.startsWith(HOME + path.sep) ? `~${file.slice(HOME.length)}` : file);
  const line = (kind: string, heading: string | null, text: string, detail: string | null = null) => ({ kind, heading, text, detail });

  return [
    ...(permissions.system ? [line('system', null, 'Do anything on your computer, with the internet')] : []),
    ...(permissions.writeAll ? [line('write', 'Change files in', 'every folder on your computer')] : []),
    ...permissions.write.map(folder => {
      const name = path.basename(folder);
      // Two folders with one name: each shows its place in full, or the lines would read the same.
      const nameIsShared = permissions.write.filter(other => path.basename(other) === name).length > 1;

      return nameIsShared ? line('write', 'Change files in', place(folder)) : line('write', 'Change files in', name, place(folder));
    }),
    ...Object.entries(permissions.run).map(([name, { file, unfenced }]) => line('run', 'Use', unfenced ? `${name}, with full access and the internet` : name, place(file))),
    ...permissions.env.map(name => line('env', 'Share with its programs', `your ${name} setting`)),
    ...permissions.net.map(site => line('net', 'Send your files to', site.replace(/:443$/, ''))),
    ...(PERMISSIONS_PLATFORM.allSocketsLine ? [] : permissions.sockets.map(socket => line('socket', 'Control', SOCKETS[path.basename(socket)] ?? `the program at ${place(socket)}`, place(socket)))),
    ...(PERMISSIONS_PLATFORM.allSocketsLine && permissions.sockets.length ? [line('socket', 'Control', PERMISSIONS_PLATFORM.allSocketsLine)] : []),
    ...(permissions.listen === 'localhost' ? [line('listen', 'Also', 'Let websites and apps on this computer connect')] : []),
    ...(permissions.listen === 'network' ? [line('listen', 'Also', 'Let phones and computers on your network connect')] : []),
    ...permissions.use.map(name => line(`use:${name}`, 'Also', USE_LINES[name])),
    ...permissions.shortcuts.map(keys => line('shortcut', 'Also', `Use ${keyNames(keys)} in every app`)),
    ...(permissions.anyShortcut ? [line('shortcut', 'Also', 'Pick keys that work in every app')] : []),
    ...windowLines(permissions.window ?? {}).map(text => line('window', 'Also', text)),
  ];
}

// One line per setting that changes the usual window.
function windowLines({ width, height, minWidth, minHeight, resizable, titleBar, frame, transparent, onTop, allSpaces, clickThrough, private: privateWindow, dock, blur, mark }: WindowSettings) {
  return [
    (width || height) && `Open at ${width ?? 'the usual width'} × ${height ?? 'the usual height'}`,
    (minWidth || minHeight) && `Stay at least ${minWidth ?? 0} × ${minHeight ?? 0}`,
    resizable === false && 'Keep one size',
    titleBar === false && 'Hide its title bar',
    frame === false && 'Hide its window frame',
    transparent && 'Have a see-through window',
    onTop && 'Stay on top of other windows',
    allSpaces && 'Show on every desktop',
    clickThrough && 'Let clicks pass through it',
    privateWindow && 'Hide from screenshots and screen sharing',
    dock === false && `Hide from the ${PERMISSIONS_PLATFORM.dock}`,
    blur && 'Blur what is behind it',
    mark === false && "Use its own icon, without Apargon's mark",
  ].filter(text => typeof text === 'string');
}

// As the OS writes them: ⌘⇧N on macOS, Ctrl+Shift+N elsewhere.
export function keyNames(keys: string) {
  return keys
    .split('+')
    .map(key => PERMISSIONS_PLATFORM.sameKey[key] ?? key)
    .map(key => PERMISSIONS_PLATFORM.keyNames[key] ?? key)
    .join(PERMISSIONS_PLATFORM.keyJoin);
}
