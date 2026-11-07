import path from 'path';
import { isInside, literalBase } from '../patterns.ts';
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
    const socketFolders = sockets.filter(socket => socket.endsWith(path.sep)).map(literalBase);
    // In one, or holding one: a socket file bound into the emptied folder would reach its program as well.
    const reopened = [dir, ...[...read, ...write].map(literalBase), ...socketFolders].find(file => PRIVATE.some(emptied => isInside(file, emptied) || isInside(emptied, file)));

    if (reopened) {
      return `On Linux Apargon cannot open ${reopened}: it would bring back sockets to programs outside the sandbox. Use a folder of its own, such as /tmp/apargon.`;
    } else if (use.includes('location')) {
      return 'On Linux Apargon cannot give a page its location: Chromium finds it through a web service, and the page has no network.';
    }

    return null;
  },
  refusePath: () => null,
  launchFolder: null,
  // bwrap binds each folder whole.
  writesWholeFolders: true,
  programsSendOut: false,
  // /run/media, where desktops mount drives, is emptied with /run.
  homeFolders: ['/home', '/root', '/media', '/mnt'],
  // The X11 cookie, where XAUTHORITY does not name it, fonts and their cache, and the desktop's look: GTK's settings, the icons and the cursor.
  homeReads: ['.Xauthority', '.fonts', '.local/share/fonts', '.config/fontconfig', '.cache/fontconfig', '.config/gtk-3.0', '.config/gtk-4.0', '.icons', '.local/share/icons'],
  systemReadsAll: true,
  soundServerRecords: true,
  programFolders: ['/usr/local/bin'],
  programExtensions: [''],
  installFolder: path.dirname(process.execPath),
  sameKey: { CommandOrControl: 'Control' },
  typingModifiers: ['AltGr', 'Shift'],
};
