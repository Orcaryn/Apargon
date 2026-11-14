import { PERMISSIONS_PLATFORM } from '../platform/index.ts';

// No Electron here: the Node tests load it.

const MODIFIERS: Partial<Record<string, string>> = { commandorcontrol: 'CommandOrControl', cmdorctrl: 'CommandOrControl', command: 'Command', cmd: 'Command', control: 'Control', ctrl: 'Control', alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Super' };
const KEYS = [...Array.from({ length: 24 }, (_, i) => `F${i + 1}`), 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc'];
// Taken alone: no app types with them.
const MEDIA_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];

// Also for papp.shortcuts, on the keys a .papp file picks while it runs.
export function shortcut(value: string) {
  const parts = value.split('+');
  const last = parts[parts.length - 1];
  const named = parts.slice(0, -1).map(part => MODIFIERS[part.toLowerCase()]);
  const modifiers = named.filter(each => each !== undefined);
  const keysHeld = new Set(modifiers.map(each => PERMISSIONS_PLATFORM.sameKey[each] ?? each));
  const key = [...KEYS, ...MEDIA_KEYS].find(known => known.toLowerCase() === last.toLowerCase()) ?? (/^[a-z0-9]$/i.test(last) ? last.toUpperCase() : undefined);

  if (modifiers.length < named.length || key === undefined) {
    throw new Error(`Bad papp-global-shortcut "${value}". Write modifiers and one key, such as CommandOrControl+Shift+N or Alt+F9.`);
  } else if (!MEDIA_KEYS.includes(key) && (/^F\d+$/.test(key) ? keysHeld.size === 0 : keysHeld.size < 2 || [...keysHeld].every(each => PERMISSIONS_PLATFORM.typingModifiers.includes(each)))) {
    throw new Error(`papp-global-shortcut ${value} would catch keys meant for the app in front. Use two different modifiers, not only ${PERMISSIONS_PLATFORM.typingModifiers.join(' and ')}, or one with a function key.`);
  }

  return [...new Set(modifiers), key].join('+');
}
