// The Linux sandbox for one page: bwrap's arguments, the counterpart of seatbelt.ts.

import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writableFolder } from '../permissions/patterns.ts';
import type { Permissions } from '../permissions/tags.ts';
import { DATA, PAGE_DATA } from '../shared.ts';

// A network, a process list and a session of its own: no IP, no other processes, no terminal to
// type into. Without full Node the disk is read-only but for the temp folder, /dev and the
// resworb-write folders, whole: bwrap takes folders, not patterns, so a wildcard opens the folder
// before its first * and a named file the folder it is in, hidden names and pages included.
// The session's runtime folder holds sockets to helpers with network: D-Bus, through which systemd
// runs commands and the portal opens links, and the sound server, which can stream to a server.
// An empty folder covers it, and only the Wayland socket comes back. Sessions without logind have none.
// Outside it, tmux and screen type into a shell that has network, and Docker's socket acts as root:
// empty folders and files cover those, and the keys and logins no tag names, if they exist now.
// tmux's folder is made first, as tmux makes it, so a tmux started later is covered too.
// Later mounts cover earlier ones, so resworb's own data comes last.
export function bwrapArgs(permissions: Permissions) {
  const writable = [fs.realpathSync(app.getPath('temp')), ...permissions.write.map(writableFolder)];
  const disk = permissions.node ? ['--dev-bind', '/', '/'] : ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', ...writable.flatMap(folder => ['--bind', folder, folder])];
  const runtime = `/run/user/${os.userInfo().uid}`;
  const wayland = process.env.WAYLAND_DISPLAY && path.resolve(runtime, process.env.WAYLAND_DISPLAY);
  const emptyRuntime = fs.existsSync(runtime) ? ['--tmpfs', runtime, ...(wayland ? ['--ro-bind', wayland, wayland] : [])] : [];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true })); // bwrap binds only what exists
  const tmux = path.join(process.env.TMUX_TMPDIR ?? '/tmp', `tmux-${os.userInfo().uid}`);
  fs.mkdirSync(tmux, { recursive: true, mode: 0o700 });
  const covered = [tmux, process.env.SCREENDIR ?? '/run/screen', '/run/docker.sock', ...permissions.hidden]
    .filter(file => fs.existsSync(file))
    .flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  return ['--unshare-net', '--unshare-pid', '--new-session', '--die-with-parent', ...disk, '--proc', '/proc', ...emptyRuntime, ...covered, '--ro-bind', DATA, DATA, '--bind', PAGE_DATA, PAGE_DATA];
}
