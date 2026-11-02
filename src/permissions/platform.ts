import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';
import type { Permissions } from './tags.ts';

export type PermissionsPlatform = {
  // Hidden from a page unless named, beside the shared list: a path in the home folder, to what it holds.
  secrets: Record<string, string>;
  // Passed to the page's programs, beside PROGRAM_ENV, and so to the page process too.
  programEnv: string[];
  pageEnv: string[];
  refusedTags: Record<string, string>;
  refuse(permissions: Permissions, dir: string): string | null;
  // A path the OS reads as a server or as another file's name, past the checks: the reason, or null.
  refusePath(file: string): string | null;
  // Where written files run outside the sandbox, in the home folder; null where hidden names cover it.
  launchFolder: string | null;
  writesWholeFolders: boolean;
  soundServerRecords: boolean;
  programFolders: string[];
  // The endings of a file the OS runs as a program, tried in turn after a name; '' where any file can be one.
  programExtensions: string[];
  installFolder: string;
  // Modifiers that are one key here, and the ones held for typing.
  sameKey: Partial<Record<string, string>>;
  typingModifiers: string[];
};

// Another system opens no page, as it has no sandbox; Linux's rules are the closest.
export const PERMISSIONS_PLATFORM: PermissionsPlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
