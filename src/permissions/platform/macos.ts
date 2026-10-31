import path from 'path';
import type { PermissionsPlatform } from '../platform.ts';

export const macos: PermissionsPlatform = {
  secrets: {},
  pageEnv: ['__CF_USER_TEXT_ENCODING'],
  envIgnoresCase: false,
  refusedTags: {},
  refuse: () => null,
  refusePath: () => null,
  // Launch agents.
  launchFolder: 'Library',
  writesWholeFolders: false,
  soundServerRecords: false,
  programFolders: ['/opt/homebrew/bin', '/usr/local/bin'],
  // The .app bundle: Apargon.app/Contents/MacOS/Apargon.
  installFolder: path.resolve(process.execPath, '../../..'),
  sameKey: { CommandOrControl: 'Command', Super: 'Command' },
  typingModifiers: ['Alt', 'Shift'],
};
