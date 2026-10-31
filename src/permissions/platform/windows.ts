import path from 'path';
import { localPorts } from '../network.ts';
import type { PermissionsPlatform } from '../platform.ts';

const BROWSERS = ['AppData/Local/Google/Chrome', 'AppData/Local/Chromium', 'AppData/Local/BraveSoftware', 'AppData/Local/Microsoft/Edge', 'AppData/Roaming/Mozilla'];

export const windows: PermissionsPlatform = {
  secrets: {
    'AppData/Roaming/Microsoft/Protect': 'Windows keys for saved passwords',
    'AppData/Roaming/Microsoft/Credentials': 'Windows saved passwords',
    'AppData/Local/Microsoft/Credentials': 'Windows saved passwords',
    'AppData/Local/Microsoft/Vault': 'Windows saved passwords',
    'AppData/Roaming/gcloud': 'Google Cloud logins',
    'AppData/Roaming/GitHub CLI': 'GitHub CLI logins',
    // Not secrets, but they run outside the sandbox: PowerShell's startup scripts, and what starts when you log in.
    'Documents/PowerShell': 'PowerShell startup scripts',
    'Documents/WindowsPowerShell': 'PowerShell startup scripts',
    'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup': 'programs that start when you log in',
    ...Object.fromEntries(BROWSERS.map(name => [name, 'browser logins and cookies'])),
  },
  // In capitals, as Windows ignores case in them.
  pageEnv: 'SYSTEMROOT WINDIR SYSTEMDRIVE USERPROFILE HOMEDRIVE HOMEPATH USERNAME APPDATA LOCALAPPDATA TEMP TMP PROGRAMDATA PROGRAMFILES PATHEXT COMSPEC PROCESSOR_ARCHITECTURE NUMBER_OF_PROCESSORS'.split(' '),
  envIgnoresCase: true,
  // Windows has no way to keep a page's programs offline: a program can still send data out through Windows itself.
  refusedTags: Object.fromEntries(['run', 'node', 'env', 'socket'].map(kind => [kind, `On Windows Apargon cannot give a page papp-${kind}: Windows lets programs send data out past the sandbox. Apargon opens pages there without programs.`])),
  refuse: permissions => (localPorts(permissions).length ? 'On Windows a page reaches only the servers it names, through Apargon, not programs on this computer.' : null),
  // Windows looks up the server of a network path itself, outside the sandbox, before anyone can refuse it. A colon after the drive names a stream of a file, as page.papp::$DATA is the page, and Windows drops a name's trailing dots and spaces: either reaches a file under a name the checks do not see.
  refusePath: file => (/^[\\/]{2}/.test(file) || file.includes(':', 2) || /[. ]([\\/]|$)/.test(file) ? `Apargon: Windows reads ${file} as a network path or as another file's name, so Apargon never opens it.` : null),
  // The Startup folder.
  launchFolder: 'AppData',
  // MXC grants each writable folder whole.
  writesWholeFolders: true,
  soundServerRecords: false,
  programFolders: [],
  installFolder: path.dirname(process.execPath),
  sameKey: { CommandOrControl: 'Control' },
  typingModifiers: ['AltGr', 'Shift'],
};
