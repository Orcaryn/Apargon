import { app, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { EGRESS_LOG, SECRETS_DATA } from '../../../../shared/data/index.ts';
import type { EventHandlers, PageEvents } from '../../../../shared/wire/protocol/index.ts';
import { offerSkill } from '../../../dialogs/skill/index.ts';
import { TRAMPOLINE_PLATFORM } from '../../../platform/index.ts';
import { menuState, records, updates } from '../../../records/index.ts';

// What the items of Apargon's menu ask for. refreshMenus: sends every running .papp file's menu what is on disk now.
export function menuEvents(page: string, openPage: (file: string) => void, refreshMenus: () => void): Pick<EventHandlers<PageEvents>, 'open' | 'revoke' | 'automaticUpdates' | 'showEgressLog' | 'installSkill'> {
  return {
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
    showEgressLog: () => {
      if (fs.existsSync(EGRESS_LOG)) {
        void shell.openPath(EGRESS_LOG);
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'info', message: 'Nothing sent yet.', detail: EGRESS_LOG });
      }
    },
    installSkill: () => offerSkill('The papp skill for coding agents', null),
  };
}

// Everything the user gave the .papp file goes with its yes: the picks and the secrets too.
function revoke(pages: string[]) {
  for (const page of pages) {
    const { id } = records.get(page);
    TRAMPOLINE_PLATFORM.startAtLogin(page, false);

    if (id) {
      fs.rmSync(path.join(SECRETS_DATA, `${id}.json`), { force: true });
    }

    records.change(page, { approved: undefined, unsafeDesktop: undefined, picks: undefined, id: undefined });
  }
}
