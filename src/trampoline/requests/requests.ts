import { shell } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';
import type { PageReply, PageRequest } from '../../shared/channel.ts';
import { EGRESS_LOG, readJson, UPDATE_FILE, writeJson, type UpdateState } from '../../shared/data.ts';
import { showNotice } from '../../shared/notice.ts';
import { revoke } from '../dialogs/approve.ts';
import { offerSkill } from '../dialogs/skill.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';
import { openFile, openLink } from './open.ts';
import { saveFile, saveFiles } from './save.ts';

export function handleRequest(request: PageRequest, { page, permissions, reply, setTray, openPage }: { page: string; permissions: Permissions; reply(reply: PageReply): void; setTray(title: string | null): void; openPage(file: string): void }) {
  if ('open' in request) {
    openPage(request.open);
  } else if ('revoke' in request) {
    revoke(request.revoke);
  } else if ('automaticUpdates' in request) {
    writeJson(UPDATE_FILE, { ...readJson<UpdateState>(UPDATE_FILE), automatic: request.automaticUpdates });
  } else if ('pageIcon' in request) {
    TRAMPOLINE_PLATFORM.pageIcon?.(page, request.pageIcon);
  } else if ('showEgressLog' in request) {
    shell.openPath(EGRESS_LOG);
  } else if ('notify' in request) {
    // Field by field: a papp-system page writes the line itself, and could add Electron's other options.
    const { id, title, body, buttons, icon } = request.notify;
    showNotice({ title, body, buttons, icon }, () => reply({ show: true })).then(button => reply({ answered: id, value: button }));
  } else if ('tray' in request) {
    setTray(request.tray);
  } else if ('openLink' in request) {
    openLink(page, permissions, request.openLink);
  } else if ('openFile' in request) {
    openFile(request.openFile, permissions);
  } else if ('installSkill' in request) {
    offerSkill('The papp skill for coding agents', null);
  } else if ('saveAs' in request) {
    const { id, files } = request.saveAs;
    saveFiles(files, permissions.hidden).then(
      paths => reply({ answered: id, value: paths }),
      (err: Error) => reply({ answered: id, error: err.message })
    );
  } else if ('save' in request) {
    const { id, file, data } = request.save;
    saveFile(file, data, permissions.hidden).then(
      saved => reply({ answered: id, value: saved }),
      (err: Error) => reply({ answered: id, error: err.message })
    );
  }
}
