// The Linux sandbox for one page: bwrap's arguments, the counterpart of seatbelt.ts.

import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { patternFolder } from '../permissions/patterns.ts';
import type { Permissions } from '../permissions/tags.ts';
import { DATA, NET_DATA, PAGE_DATA } from '../shared.ts';

// Where socket files live (/var/run is a link to /run). --unshare-net stops IP, not socket files, and
// each leads to a program outside the fence: D-Bus, through which systemd runs commands and the portal
// opens links; the name lookup service, which carries data out in a lookup; the sound server; tmux and
// screen, which type into a shell; Docker, which acts as root. Each folder starts empty.
const PRIVATE = ['/run', '/tmp', '/var/tmp'];

// A network, a process list and a session of its own: no IP, no other processes, no terminal to
// type into. Without full Node the disk is read-only but for /dev, the temp folder and the
// papp-write folders, whole: bwrap takes folders, not patterns, so a wildcard opens the folder
// before its first * and a named file the folder it is in, hidden names and pages included.
// Into the emptied folders come back only what the tags name and the display's socket, as the disk
// is bound: read-only, or with full Node as it is. Keys and logins no tag names are covered, if they
// exist now. Later mounts cover earlier ones, so papp's own data comes last, and of the socket
// folders that carry the network to pages with servers, only this page's.
export function bwrapArgs(page: string, permissions: Permissions, sockets: string | null) {
  const temp = fs.realpathSync(app.getPath('temp'));
  const writable = [...(PRIVATE.includes(temp) ? [] : [temp]), ...permissions.write.map(patternFolder)];
  const disk = permissions.node ? '--dev-bind' : '--ro-bind';
  const named = [path.dirname(page), ...permissions.read.map(patternFolder), ...permissions.sockets, ...displaySockets()];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true })); // bwrap binds only what exists
  const covered = permissions.hidden.filter(file => fs.existsSync(file)).flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  return [
    ...['--unshare-net', '--unshare-pid', '--new-session', '--die-with-parent', disk, '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc'],
    ...PRIVATE.flatMap(folder => ['--tmpfs', folder]),
    ...named.flatMap(file => [disk, file, file]),
    ...(permissions.node ? [] : writable.flatMap(folder => ['--bind', folder, folder])),
    ...covered,
    ...['--ro-bind', DATA, DATA, '--tmpfs', NET_DATA, ...(sockets ? ['--ro-bind', sockets, sockets] : []), '--bind', PAGE_DATA, PAGE_DATA],
  ];
}

// The window talks to the display through a socket: Wayland's in the runtime folder, X11's in /tmp,
// and the X11 cookie wherever XAUTHORITY says. Both displays, if both are set: Electron picks.
function displaySockets() {
  const runtime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;
  const wayland = process.env.WAYLAND_DISPLAY ? [path.resolve(runtime, process.env.WAYLAND_DISPLAY)] : [];
  const x11 = /^:(\d+)/.exec(process.env.DISPLAY ?? '');

  return [...wayland, ...(x11 ? [`/tmp/.X11-unix/X${x11[1]}`] : []), ...(process.env.XAUTHORITY ? [process.env.XAUTHORITY] : [])].filter(file => fs.existsSync(file));
}
