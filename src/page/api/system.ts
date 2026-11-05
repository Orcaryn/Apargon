import { powerMonitor, type NativeImage } from 'electron';
import { linkHost, viewable } from '../../permissions/open.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { tellTrampoline, type Ask, type Notice, type PageTray } from '../../shared/channel.ts';
import { showNotice } from '../../shared/notice.ts';
import { PAGE_PLATFORM } from '../platform.ts';
import type { Scope } from './scope.ts';

export function systemApi(permissions: Permissions, { where, canSee, need }: Scope, toFront: () => void, ask: Ask, pageIcon: () => NativeImage | null) {
  return {
    // The trampoline shows the dialog and writes: this process may not write where the user picks.
    saveAs(files: Record<string, string | Uint8Array>) {
      return ask<string[]>(id => ({ saveAs: { id, files: Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data).toString('base64') })) } }));
    },
    // The path saved to, or null when the user cancels.
    save(file: string, data: string | Uint8Array) {
      return ask<string | null>(id => ({ save: { id, file: where(file), data: Buffer.from(data).toString('base64') } }));
    },
    open(target: string) {
      if (linkHost(target)) {
        tellTrampoline({ openLink: target });
      } else {
        const file = where(target);
        need(canSee(file), file, 'see');

        if (!viewable(file)) {
          throw new Error(`Apargon: open takes an http(s) link, a folder without an extension, or a file a viewer shows (images, video, audio, PDF, text), not ${file}.`);
        }

        tellTrampoline({ openFile: file });
      }
    },
    // The button the user picked, or null when they click the notification itself or close it.
    notify(title: string, body = '', { buttons = [] }: { buttons?: string[] } = {}) {
      if (!permissions.use.includes('notifications')) {
        throw new Error('Apargon: this page may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
      }

      const notice: Notice = { title: String(title), body: String(body), buttons: buttons.slice(0, 3).map(String), icon: pageIcon()?.toPNG().toString('base64') ?? null };

      return PAGE_PLATFORM.notifiesHere ? showNotice(notice, toFront) : ask<number | null>(id => ({ notify: { id, ...notice } }));
    },
    tray(title: PageTray['title'], items: PageTray['items'] = []) {
      tellTrampoline({ tray: { title: title === null ? null : String(title).slice(0, 24), items: items.map(item => ('separator' in item ? { separator: true } : { label: String(item.label), id: String(item.id) })) } });
    },
    // One argument reads; a string sets; null deletes. The trampoline keeps them where no page's process can read.
    secret(name: string, value?: string | null) {
      if (typeof name !== 'string' || !name || name.length > 256) {
        throw new Error('Apargon: secret takes a name of 1 to 256 characters.');
      } else if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new Error('Apargon: a secret is a string, or null to delete it.');
      }

      return ask<string | null>(id => ({ secret: value === undefined ? { id, name } : { id, name, value } }));
    },
    power() {
      return { idleSeconds: powerMonitor.getSystemIdleTime(), onBattery: powerMonitor.isOnBatteryPower() };
    },
  };
}
