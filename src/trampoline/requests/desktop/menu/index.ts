import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { SECRETS_DATA } from '../../../../shared/data/index.ts';
import type { EventHandlers, PappEvents } from '../../../../shared/wire/protocol/index.ts';
import { offerSkill } from '../../../dialogs/skill/index.ts';
import { TRAMPOLINE_PLATFORM } from '../../../platform/index.ts';
import { menuState, records, settings } from '../../../records/index.ts';

// What the items of Apargon's menu ask for. refreshMenus: sends every running .papp file's menu what is on disk now.
export function menuEvents(papp: string, openPapp: (file: string) => void, refreshMenus: () => void): Pick<EventHandlers<PappEvents>, 'open' | 'revoke' | 'automaticUpdates' | 'installSkill'> {
  return {
    open: openPapp,
    // Only approved files, as the menu lists them. Forgetting another file takes its picks and secrets too, so the user confirms.
    revoke: papps => {
      const { approved } = menuState();
      const revoked = papps.filter(other => approved.includes(other));

      if (revoked.every(other => other === papp)) {
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
        settings.set({ automatic: true });
        refreshMenus();
      } else {
        app.focus({ steal: true });
        void dialog.showMessageBox({ type: 'warning', message: 'Turn off the update check?', detail: 'Apargon will no longer look for security fixes.', buttons: ['Turn Off', 'Cancel'], defaultId: 1, cancelId: 1 }).then(({ response }) => {
          if (response === 0) {
            settings.set({ automatic: false });
          }

          refreshMenus();
        });
      }
    },
    installSkill: () => offerSkill('The papp skill for coding agents', null),
  };
}

// Everything the user gave the .papp file goes with its yes: the picks and the secrets too.
function revoke(papps: string[]) {
  for (const papp of papps) {
    const { id } = records.get(papp);
    TRAMPOLINE_PLATFORM.startAtLogin(papp, false);

    if (id) {
      fs.rmSync(path.join(SECRETS_DATA, `${id}.json`), { force: true });
    }

    records.change(papp, { approval: undefined, x11Approval: undefined, picks: undefined, id: undefined });
  }
}
