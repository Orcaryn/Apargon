import path from 'path';
import type { PermissionsPlatform } from '../platform.ts';

export const macos: PermissionsPlatform = {
  secrets: {},
  programEnv: [],
  pageEnv: ['__CF_USER_TEXT_ENCODING'],
  refusedTags: {},
  refuse: () => null,
  refusePath: () => null,
  // Launch agents.
  launchFolder: 'Library',
  writesWholeFolders: false,
  soundServerRecords: false,
  programFolders: ['/opt/homebrew/bin', '/usr/local/bin'],
  programExtensions: [''],
  programsWorstCase: 'It can run programs that see all your files. Through other apps, they may send them anywhere.',
  // The .app bundle: Apargon.app/Contents/MacOS/Apargon.
  installFolder: path.resolve(process.execPath, '../../..'),
  sameKey: { CommandOrControl: 'Command', Super: 'Command' },
  typingModifiers: ['Alt', 'Shift'],
};
