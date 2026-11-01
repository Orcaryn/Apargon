import fs from 'fs';
import path from 'path';
import { patternFolder } from '../patterns.ts';
import type { PermissionsPlatform } from '../platform.ts';

// Emptied in the sandbox: they hold sockets to programs outside it.
export const PRIVATE = ['/run', '/tmp', '/var/tmp'];

export const linux: PermissionsPlatform = {
  secrets: {},
  programEnv: [],
  pageEnv: 'DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_DATA_DIRS XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME GDK_BACKEND GDK_SCALE GDK_DPI_SCALE GTK_IM_MODULE XMODIFIERS LANGUAGE ELECTRON_OZONE_PLATFORM_HINT'.split(' '),
  refusedTags: {},
  refuse(permissions, dir) {
    const { read, write, sockets, use } = permissions;
    const socketFolders = sockets.filter(socket => fs.statSync(socket).isDirectory());
    const reopened = [dir, ...[...read, ...write].map(patternFolder), ...socketFolders].find(
      folder => folder.startsWith('/run/') || PRIVATE.some(emptied => emptied === folder || emptied.startsWith(path.join(folder, '/')))
    );

    if (reopened) {
      return `On Linux Apargon cannot open ${reopened}: it would bring back sockets to programs outside the sandbox. Use a folder of its own, such as /tmp/apargon.`;
    } else if (use.includes('location')) {
      return 'On Linux Apargon cannot give a page its location: Chromium finds it through a web service, and the page has no network.';
    }

    return null;
  },
  refusePath: () => null,
  // Startup files are hidden names, which are red already.
  launchFolder: null,
  // bwrap binds each writable folder whole, hidden files in it too, and they can run outside the sandbox.
  writesWholeFolders: true,
  soundServerRecords: true,
  programFolders: ['/usr/local/bin'],
  programExtensions: [''],
  programsWorstCase: 'It can run programs that see all your files. Through other apps, they may send them anywhere.',
  installFolder: path.dirname(process.execPath),
  sameKey: { CommandOrControl: 'Control' },
  typingModifiers: ['AltGr', 'Shift'],
};
