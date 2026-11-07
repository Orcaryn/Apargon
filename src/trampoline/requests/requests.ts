import { app, dialog, shell } from 'electron';
import fs from 'fs';
import { pageAccess } from '../../page/api/access.ts';
import { realEntry } from '../../permissions/paths.ts';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageTray } from '../../shared/channel.ts';
import { EGRESS_LOG } from '../../shared/data.ts';
import { showNotice } from '../../shared/notice.ts';
import type { CallHandlers, EventHandlers, PageEvents, Tell, TrampolineEvents } from '../../shared/protocol.ts';
import { revoke } from '../dialogs/approve.ts';
import { offerSkill } from '../dialogs/skill.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';
import { menuState, records, updates } from '../store.ts';
import type { pageListeners } from './listen.ts';
import { openFile, openLink } from './open.ts';
import { pickFiles } from './pick.ts';
import { saveFile, saveFiles } from './save.ts';
import { readSecret, writeSecret } from './secrets.ts';

type Page = {
  page: string;
  permissions: Permissions;
  listeners: ReturnType<typeof pageListeners>;
  tell: Tell<TrampolineEvents>;
  setTray(tray: PageTray): void;
  openPage(file: string): void;
  // Quits the page and opens it again, with its sandbox built anew.
  restart(): void;
  // Sends every running page's menu what is on disk now.
  refreshMenus(): void;
};

// What a page may send, by name. A papp-system page writes the line itself, so each handler takes the fields it uses, one by one, and checks a tag the page process already checked.
export function pageHandlers({ page, permissions, listeners, tell, setTray, openPage, restart, refreshMenus }: Page) {
  // Once: a pick that adds a write starts the page again.
  const access = pageAccess(permissions);
  const events: EventHandlers<PageEvents> = {
    open: openPage,
    // Only approved pages, as the menu lists them. Forgetting another page takes its picks and secrets too, so the user confirms. Either way every page's menu is sent again.
    revoke: pages => {
      const { approved } = menuState();
      const revoked = pages.filter(other => approved.includes(other));

      if (revoked.every(other => other === page)) {
        revoke(revoked);
        refreshMenus();
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'warning', message: 'Forget these pages?', detail: revoked.join('\n'), buttons: ['Forget', 'Cancel'], defaultId: 1, cancelId: 1 }).then(({ response }) => {
          if (response === 0) {
            revoke(revoked);
          }

          refreshMenus();
        });
      }
    },
    // Off stops the check for security fixes, so the user confirms. The menu's checkbox ticked itself before asking: every page's menu is sent again.
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
    // Field by field: the next start hands the window to Electron, which takes other options too.
    bounds: ({ x, y, width, height }) => records.change(page, { window: { x, y, width, height } }),
    pageIcon: icon => TRAMPOLINE_PLATFORM.pageIcon?.(page, icon),
    showEgressLog: () => {
      if (fs.existsSync(EGRESS_LOG)) {
        void shell.openPath(EGRESS_LOG);
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'info', message: 'No egress recorded yet.', detail: EGRESS_LOG });
      }
    },
    tray: setTray,
    openLink: url => openLink(page, permissions, url),
    openFile,
    installSkill: () => offerSkill('The papp skill for coding agents', null),
    respond: ({ id, status, headers, body }) => listeners.respond(id, status, headers, body),
  };
  const calls: CallHandlers = {
    saveAll: ({ files }) => saveFiles(files),
    save: ({ file, data }) => saveFile(file, data),
    pick: options => pickFiles(page, permissions, options, restart),
    given: () => records.get(page).given ?? [],
    getSecret: ({ name }) => readSecret(page, name),
    setSecret: ({ name, value }) => writeSecret(page, name, value).then(() => null),
    listen: ({ server, port }) => listeners.listen(server, port),
    unlisten: ({ server }) => listeners.unlisten(server),
    notify: ({ title, body, buttons, icon }) => {
      if (!permissions.use.includes('notifications')) {
        throw new Error('Apargon: this page may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
      }

      // Field by field: Electron takes other options too.
      return showNotice({ title, body, buttons, icon }, () => tell('show'));
    },
    // Checked again here, as the page's process did: a papp-system page could name a file it may not change.
    trash: async ({ file }) => {
      const target = realEntry(file);

      if (!access.canChangeAll(target)) {
        throw new Error('Apargon: this page may not change that. Ask for it with <meta name="papp-write" content="...">.');
      }

      await shell.trashItem(target);

      return null;
    },
  };

  return { events, calls };
}
