import path from 'path';
import type { PermissionsPlatform } from '../index.ts';

export const macos: PermissionsPlatform = {
  programEnv: [],
  pageEnv: ['__CF_USER_TEXT_ENCODING'],
  refusedTags: {},
  refusedUses: {},
  useLines: { cloud: 'Read your iCloud and Dropbox files' },
  allSocketsLine: null,
  dock: 'Dock',
  programFolders: ['/opt/homebrew/bin', '/usr/local/bin'],
  programExtensions: [''],
  refusePath: () => null,
  // Where macOS keeps iCloud Drive, Dropbox, OneDrive and Google Drive.
  cloudFolders: home => ['Library/CloudStorage', 'Library/Mobile Documents'].map(name => path.join(home, name)),
  sameKey: { CommandOrControl: 'Command', Super: 'Command' },
  typingModifiers: ['Alt', 'Shift'],
  keyNames: { Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' },
  keyJoin: '',
};
