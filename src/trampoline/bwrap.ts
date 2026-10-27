import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { patternFolder } from '../permissions/patterns.ts';
import { PRIVATE, type Permissions } from '../permissions/tags.ts';
import { DATA, NET_DATA, PAGE_DATA } from '../shared.ts';

export function bwrapArgs(page: string, permissions: Permissions, socketFolder: string | null) {
  const temp = fs.realpathSync(app.getPath('temp'));
  const writable = [...(PRIVATE.includes(temp) ? [] : [temp]), ...permissions.write.map(patternFolder)];
  const disk = permissions.node ? '--dev-bind' : '--ro-bind';
  const named = [path.dirname(page), ...permissions.read.map(patternFolder), ...permissions.sockets, ...displaySockets()];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true }));
  const covered = permissions.hidden.filter(file => fs.existsSync(file)).flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  // Later mounts cover earlier ones: papp's own data must stay last.
  return [
    ...['--unshare-net', '--unshare-pid', '--unshare-user', '--disable-userns', '--new-session', '--die-with-parent', disk, '/', '/', '--dev', '/dev', '--proc', '/proc'],
    ...(fs.existsSync('/dev/dri') ? ['--dev-bind', '/dev/dri', '/dev/dri'] : []),
    ...PRIVATE.flatMap(folder => ['--tmpfs', folder]),
    ...named.flatMap(file => [disk, file, file]),
    ...(permissions.node ? [] : writable.flatMap(folder => ['--bind', folder, folder])),
    ...covered,
    ...['--ro-bind', DATA, DATA, '--tmpfs', NET_DATA, ...(socketFolder ? ['--ro-bind', socketFolder, socketFolder] : []), '--bind', PAGE_DATA, PAGE_DATA],
  ];
}

function displaySockets() {
  const runtime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;
  const wayland = process.env.WAYLAND_DISPLAY ? [path.resolve(runtime, process.env.WAYLAND_DISPLAY)] : [];
  const x11 = /^:(\d+)/.exec(process.env.DISPLAY ?? '');

  return [...wayland, ...(x11 ? [`/tmp/.X11-unix/X${x11[1]}`] : []), ...(process.env.XAUTHORITY ? [process.env.XAUTHORITY] : [])].filter(file => fs.existsSync(file));
}
