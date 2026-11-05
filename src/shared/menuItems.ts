import type { MenuItemConstructorOptions } from 'electron';
import type { TrayItem } from './channel.ts';

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

// Label and id only: a papp-system page writes the request itself, and could add a role that quits Apargon.
export function trayItems(items: TrayItem[], onClick: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map(item => ('separator' in item ? { type: 'separator' } : { label: item.label, click: () => onClick(item.id) }));
}
