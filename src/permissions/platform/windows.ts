import type { PermissionsPlatform } from '../platform.ts';

export const windows: PermissionsPlatform = {
  // Not tested yet on Windows, so refused: the release rules.
  programEnv: 'SYSTEMROOT WINDIR SYSTEMDRIVE USERPROFILE HOMEDRIVE HOMEPATH USERNAME APPDATA LOCALAPPDATA TEMP TMP PROGRAMDATA PROGRAMFILES PATHEXT COMSPEC PROCESSOR_ARCHITECTURE NUMBER_OF_PROCESSORS'.split(' '),
  pageEnv: [],
  refusedTags: { socket: 'On Windows, Apargon can\'t give a .papp file papp-socket yet. Remove the tag to open it there.' },
  refusedUses: { bluetooth: 'On Windows, Apargon can\'t give a .papp file Bluetooth yet.' },
  useLines: { cloud: 'Read your OneDrive files' },
  allSocketsLine: null,
  dock: 'taskbar',
  programFolders: [],
  // In Windows' own order. Node runs a batch file only through cmd.exe, which would read its arguments as commands.
  programExtensions: ['.com', '.exe'],
  // Windows looks up the server of a network path itself, outside the sandbox. A colon after the drive names a stream of a file, and Windows drops a name's trailing dots and spaces: either reaches a file under a name the checks do not see.
  refusePath: file => (/^[\\/]{2}/.test(file) || file.includes(':', 2) || /[. ]([\\/]|$)/.test(file) ? `Apargon: Windows reads ${file} as a network path or as another file's name, so Apargon never opens it.` : null),
  sameKey: { CommandOrControl: 'Control' },
  typingModifiers: ['AltGr', 'Shift'],
  keyNames: { Control: 'Ctrl', Super: 'Win' },
  keyJoin: '+',
};
