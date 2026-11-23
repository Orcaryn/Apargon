import { globalShortcut } from 'electron';
import type { Permissions } from '../../permissions/tags/index.ts';
import { shortcut } from '../../permissions/shortcut/index.ts';

// Registers the shortcuts the tags name, and gives papp.shortcuts: the keys the .papp file picks while it runs.
export function registerShortcuts(permissions: Permissions, onPressed: (keys: string) => void) {
  for (const keys of permissions.shortcuts) {
    globalShortcut.register(keys, () => onPressed(keys));
  }

  // The .papp file's, not a window's, until it picks others or quits. Each is checked as a papp-global-shortcut tag is; the tag's own stay on.
  let picked: string[] = [];

  return (keys: string[]) => {
    if (!permissions.anyShortcut) {
      throw new Error('Apargon: this .papp file may not pick shortcuts. Ask for it with <meta name="papp-global-shortcut" content="any">.');
    } else if (keys.length > 10) {
      throw new Error('Apargon: shortcuts takes a list of up to 10 keys, such as ["CommandOrControl+Shift+N"].');
    }

    const checked = new Set(keys.map(shortcut));
    picked.forEach(old => globalShortcut.unregister(old));
    picked = [...checked].filter(each => !permissions.shortcuts.includes(each));

    for (const each of picked) {
      if (!globalShortcut.register(each, () => onPressed(each))) {
        picked.forEach(old => globalShortcut.unregister(old));
        picked = [];

        throw new Error(`Apargon: another app holds ${each}. Pick other keys.`);
      }
    }
  };
}
