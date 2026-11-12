import { app, dialog, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import { isInside, realPath } from '../../permissions/paths.ts';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageTray } from '../../shared/channel.ts';
import { EGRESS_LOG } from '../../shared/data.ts';
import { NOTICE_ICON_SIDE, showNotice } from '../../shared/notice.ts';
import type { CallHandlers, EventHandlers, PageEvents, Tell, TrampolineEvents } from '../../shared/protocol.ts';
import { PROTECTED, revoke } from '../dialogs/approve.ts';
import { offerSkill } from '../dialogs/skill.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';
import { menuState, records, updates } from '../store.ts';
import { openLink } from './links.ts';
import type { pageListeners } from './listen.ts';
import { pickHandlers } from './picks.ts';
import { printPdf } from './print.ts';
import type { programStarter } from './programs.ts';
import { readSecret, writeSecret } from './secrets.ts';

type Page = {
  page: string;
  permissions: Permissions;
  own: string;
  listeners: ReturnType<typeof pageListeners>;
  programs: ReturnType<typeof programStarter>;
  tell: Tell<TrampolineEvents>;
  // The bytes of a stream the .papp file named.
  receive(id: string): Readable;
  setTray(tray: PageTray): void;
  openPage(file: string): void;
  // Sends every running .papp file's menu what is on disk now.
  refreshMenus(): void;
};

// What a .papp file may send, by name. Its process could be hostile, so each handler checks again what the process already checked: the tags, and where it may write.
export function pageHandlers({ page, permissions, own, listeners, programs, tell, receive, setTray, openPage, refreshMenus }: Page) {
  const picks = pickHandlers(page, receive, latest => tell('picks', latest));
  const events: EventHandlers<PageEvents> = {
    open: openPage,
    // Only approved files, as the menu lists them. Forgetting another file takes its picks and secrets too, so the user confirms.
    revoke: pages => {
      const { approved } = menuState();
      const revoked = pages.filter(other => approved.includes(other));

      if (revoked.every(other => other === page)) {
        revoke(revoked);
        refreshMenus();
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'warning', message: 'Forget these files?', detail: revoked.join('\n'), buttons: ['Forget', 'Cancel'], defaultId: 1, cancelId: 1 }).then(({ response }) => {
          if (response === 0) {
            revoke(revoked);
          }

          refreshMenus();
        });
      }
    },
    // Off stops the check for security fixes, so the user confirms.
    automaticUpdates: automatic => {
      if (automatic) {
        updates.set({ automatic: true });
        refreshMenus();
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'warning', message: 'Turn off the update check?', detail: 'Apargon will no longer look for security fixes.', buttons: ['Turn Off', 'Cancel'], defaultId: 1, cancelId: 1 }).then(({ response }) => {
          if (response === 0) {
            updates.set({ automatic: false });
          }

          refreshMenus();
        });
      }
    },
    // Field by field, and only numbers: the next start hands the window to Electron, which would refuse anything else, and the file would never open again.
    bounds: ({ x, y, width, height }) => {
      if ([x, y, width, height].every(Number.isInteger)) {
        records.change(page, { window: { x, y, width, height } });
      }
    },
    pageIcon: icon => TRAMPOLINE_PLATFORM.pageIcon?.(page, icon),
    showEgressLog: () => {
      if (fs.existsSync(EGRESS_LOG)) {
        void shell.openPath(EGRESS_LOG);
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'info', message: 'Nothing sent yet.', detail: EGRESS_LOG });
      }
    },
    tray: setTray,
    openLink: url => openLink(permissions, url),
    installSkill: () => offerSkill('The papp skill for coding agents', null),
    respond: ({ id, status, headers, body }) => listeners.respond(id, status, headers, receive(body)),
    programKill: programs.kill,
  };
  const calls: CallHandlers = {
    saveAll: ({ files }) => picks.saveAll(files),
    save: ({ file, data }) => picks.save(file, data),
    pick: picks.pick,
    picks: () => records.get(page).picks ?? [],
    writePicked: picks.writePicked,
    getSecret: ({ name }) => readSecret(permissions.id, name),
    setSecret: ({ name, value }) => writeSecret(permissions.id, name, value).then(() => null),
    listen: ({ server, port }) => listeners.listen(server, port),
    unlisten: ({ server }) => listeners.unlisten(server),
    notify: async ({ title, body, buttons, icon }) => {
      if (!permissions.use.includes('notifications')) {
        throw new Error('Apargon: this .papp file may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
      }

      // Counted, never decoded, as a tray icon's are.
      const pixels = icon === null ? null : await buffer(receive(icon));

      if (pixels && pixels.length !== NOTICE_ICON_SIDE * NOTICE_ICON_SIDE * 4) {
        throw new Error(`Apargon: a notification's icon is ${NOTICE_ICON_SIDE} × ${NOTICE_ICON_SIDE} pixels, 4 bytes each.`);
      }

      return showNotice({ title, body, buttons: buttons.slice(0, 3) }, pixels ? nativeImage.createFromBitmap(pixels, { width: NOTICE_ICON_SIDE, height: NOTICE_ICON_SIDE }) : undefined, () => tell('show'));
    },
    // Checked again here: only where the .papp file may write. Its own folder, then Apargon's own folders, then its tags.
    trash: async ({ file }) => {
      const target = path.join(realPath(path.dirname(file)), path.basename(file));
      const inOwn = isInside(target, own);
      const inProtected = PROTECTED.some(folder => isInside(target, folder));
      const inWrite = permissions.writeAll || permissions.write.some(folder => isInside(target, folder));

      if (!permissions.system && !inOwn && (inProtected || !inWrite)) {
        throw new Error('Apargon: this .papp file may not change that. Ask for it with <meta name="papp-write" content="...">.');
      }

      await shell.trashItem(target);

      return null;
    },
    startProgram: programs.start,
    print: ({ data }) => printPdf(receive(data)),
  };

  return { events, calls };
}
