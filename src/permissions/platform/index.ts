import { linux } from './linux/index.ts';
import { macos } from './macos/index.ts';
import { windows } from './windows/index.ts';
import type { Use } from '../tags/index.ts';

// What the tags and the popup need to know about the OS. No Electron here: the Node tests load it.
export type PermissionsPlatform = {
  // A tag this OS can't keep yet: the reason, shown when a .papp file uses it.
  refusedTags: Partial<Record<string, string>>;
  // A papp-use feature this OS can't give yet, with the reason.
  refusedUses: Partial<Record<Use, string>>;
  // Popup lines that differ here.
  useLines: Partial<Record<Use, string>>;
  // Where papp-socket can't allow one socket and opens them all: its one popup line. null where each socket gets its own.
  allSocketsLine: string | null;
  // Passed to programs beside the shared list, and to the .papp file's process too.
  programEnv: string[];
  pageEnv: string[];
  // What the Dock is called here.
  dock: string;
  // Folders searched for a program by name, after PATH.
  programFolders: string[];
  // The endings of a file the OS runs as a program, tried in turn after a name. '' where any file can be one.
  programExtensions: string[];
  // A path the OS reads as a server or as another file's name: the reason, or null.
  refusePath(file: string): string | null;
  // Modifiers that are one key here, the ones held for typing, and how the popup writes each.
  sameKey: Partial<Record<string, string>>;
  typingModifiers: string[];
  keyNames: Partial<Record<string, string>>;
  keyJoin: string;
};

// Any other OS gets Linux's facts. It opens no .papp file: the trampoline refuses it.
export const PERMISSIONS_PLATFORM: PermissionsPlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
