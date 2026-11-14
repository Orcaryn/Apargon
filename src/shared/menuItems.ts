import type { MenuItemConstructorOptions } from 'electron';
import type { TrayItem } from './protocol.ts';

export type PageMenuItem = { separator: true } | { label: string; id?: string; keys?: string; submenu?: PageMenuItem[] };

// Labels, keys and ids only: a role or a click of the page's own could do what Apargon's items do.
export function pageMenuItems(items: PageMenuItem[], onClick: (id: string | undefined) => void): MenuItemConstructorOptions[] {
  return items.map(item => {
    if ('separator' in item) {
      return { type: 'separator' };
    }

    return { label: String(item.label), accelerator: item.keys === undefined ? undefined : String(item.keys), submenu: item.submenu && pageMenuItems(item.submenu, onClick), click: () => onClick(item.id) };
  });
}

const TRAY_ITEMS = 50;
const TRAY_DEPTH = 3;
// In all the lists together: 50 in each, 3 deep, would be 125,000 for the trampoline to build.
const TRAY_TOTAL = 200;

// Label, id, checked and submenu only, and so many: a papp-system page writes the request itself, and could add a role that quits Apargon, or nest items until the trampoline, which every page shares, runs out of stack or time.
export function cleanTrayItems(items: unknown, depth = 1, total = { items: 0 }): TrayItem[] {
  if (!Array.isArray(items) || items.length > TRAY_ITEMS || depth > TRAY_DEPTH || (total.items += items.length) > TRAY_TOTAL || !items.every(item => typeof item === 'object' && item !== null)) {
    throw new Error(
      `Apargon: tray takes a title and a list of up to ${TRAY_ITEMS} items, each { label, id }, { label, id, checked }, { label, submenu } or { separator: true }, nested up to ${TRAY_DEPTH} deep, ${TRAY_TOTAL} in all.`
    );
  }

  return (items as Record<string, unknown>[]).map(item => {
    if ('separator' in item) {
      return { separator: true };
    } else if ('submenu' in item) {
      return { label: String(item.label), submenu: cleanTrayItems(item.submenu, depth + 1, total) };
    }

    const checkable = item.checked !== undefined || item.radio === true;

    return { label: String(item.label), id: String(item.id), ...(checkable && { checked: item.checked === true, radio: item.radio === true }) };
  });
}

export function trayItems(items: TrayItem[], onClick: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map(item => {
    if ('separator' in item) {
      return { type: 'separator' };
    } else if ('submenu' in item) {
      return { label: item.label, submenu: trayItems(item.submenu, onClick) };
    }

    return { label: item.label, ...(item.checked !== undefined && { type: item.radio ? 'radio' : 'checkbox', checked: item.checked }), click: () => onClick(item.id) };
  });
}
