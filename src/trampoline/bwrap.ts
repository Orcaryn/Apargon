import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { patternFolder } from '../permissions/patterns.ts';
import { PRIVATE, type Permissions } from '../permissions/tags.ts';
import { DATA, NET_DATA, PAGE_DATA } from '../shared.ts';

const RUNTIME = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;

export function bwrapArgs(page: string, permissions: Permissions, socketFolder: string | null) {
  const temp = fs.realpathSync(app.getPath('temp'));
  const writable = [...(PRIVATE.includes(temp) ? [] : [temp]), ...permissions.write.map(patternFolder)];
  const disk = permissions.node ? '--dev-bind' : '--ro-bind';
  const sound = permissions.use.includes('sound') || permissions.use.includes('microphone');
  // PipeWire's socket and the PulseAudio one it also answers, for playing and for recording. Only when asked: the sound server can stream to another computer.
  const soundSockets = sound ? ['pipewire-0', 'pulse'].map(name => path.join(RUNTIME, name)).filter(file => fs.existsSync(file)) : [];
  const named = [path.dirname(page), ...permissions.read.map(patternFolder), ...permissions.sockets, ...displaySockets(), ...soundSockets];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true }));
  const covered = permissions.hidden.filter(file => fs.existsSync(file)).flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  // Later mounts cover earlier ones: papp's own data must stay last.
  return [
    ...['--unshare-net', '--unshare-pid', '--unshare-user', '--disable-userns', '--new-session', '--die-with-parent', disk, '/', '/', '--dev', '/dev', '--proc', '/proc'],
    ...(fs.existsSync('/dev/dri') ? ['--dev-bind', '/dev/dri', '/dev/dri'] : []),
    ...(sound && fs.existsSync('/dev/snd') ? ['--dev-bind', '/dev/snd', '/dev/snd'] : []),
    ...(permissions.use.includes('camera') ? fs.readdirSync('/dev').filter(name => /^video\d+$/.test(name)).flatMap(name => ['--dev-bind', `/dev/${name}`, `/dev/${name}`]) : []),
    ...PRIVATE.flatMap(folder => ['--tmpfs', folder]),
    ...named.flatMap(file => [disk, file, file]),
    ...(permissions.node ? [] : writable.flatMap(folder => ['--bind', folder, folder])),
    ...covered,
    ...['--ro-bind', DATA, DATA, '--tmpfs', NET_DATA, ...(socketFolder ? ['--ro-bind', socketFolder, socketFolder] : []), '--bind', PAGE_DATA, PAGE_DATA],
  ];
}

function displaySockets() {
  const wayland = process.env.WAYLAND_DISPLAY ? [path.resolve(RUNTIME, process.env.WAYLAND_DISPLAY)] : [];
  const x11 = /^:(\d+)/.exec(process.env.DISPLAY ?? '');

  return [...wayland, ...(x11 ? [`/tmp/.X11-unix/X${x11[1]}`] : []), ...(process.env.XAUTHORITY ? [process.env.XAUTHORITY] : [])].filter(file => fs.existsSync(file));
}
