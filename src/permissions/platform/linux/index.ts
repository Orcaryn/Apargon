import type { PermissionsPlatform } from '../index.ts';

export const linux: PermissionsPlatform = {
  programEnv: [],
  pageEnv: 'XDG_RUNTIME_DIR XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_DATA_DIRS XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME GDK_SCALE GDK_DPI_SCALE GTK_IM_MODULE XMODIFIERS XAUTHORITY LANGUAGE'.split(' '),
  refusedTags: {},
  refusedUses: {
    location: 'On Linux, Apargon can\'t give a .papp file your location: Chromium finds it through a web service.',
    bluetooth: 'On Linux, Apargon can\'t give a .papp file Bluetooth: it goes through the system bus, which the .papp file has no way to reach.',
  },
  useLines: { cloud: 'Read your cloud folders' },
  // The socket block can't allow one path, so papp-socket turns it off.
  allSocketsLine: 'any program on this computer',
  dock: 'dock',
  programFolders: ['/usr/local/bin'],
  programExtensions: [''],
  refusePath: () => null,
  sameKey: { CommandOrControl: 'Control' },
  typingModifiers: ['AltGr', 'Shift'],
  keyNames: { Control: 'Ctrl' },
  keyJoin: '+',
};
