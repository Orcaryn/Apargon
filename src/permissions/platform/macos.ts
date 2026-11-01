import path from 'path';
import type { PermissionsPlatform } from '../platform.ts';

export const macos: PermissionsPlatform = {
  // Encrypted with the login password, but a copy can be cracked at leisure.
  secrets: { 'Library/Keychains': 'keychains' },
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
  // The .app bundle: Apargon.app/Contents/MacOS/Apargon.
  installFolder: path.resolve(process.execPath, '../../..'),
  sameKey: { CommandOrControl: 'Command', Super: 'Command' },
  typingModifiers: ['Alt', 'Shift'],
};
