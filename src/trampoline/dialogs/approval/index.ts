import { app } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe } from '../../../permissions/describe/index.ts';
import { HOME } from '../../../permissions/paths/index.ts';
import { declaredPermissions, type Permissions } from '../../../permissions/tags/index.ts';
import { TEST_ALLOW } from '../../../shared/data/index.ts';
import { PROTECTED, TRAMPOLINE_PLATFORM } from '../../platform/index.ts';
import { records } from '../../records/index.ts';
import { ask } from '../ask/index.ts';

export type Approved = { papp: string; permissions: Permissions; pappHash: string | null };

// A file whose tags ask nothing opens at once: it reads, writes its own folder, and has no network. A tag that asks needs the user's yes, and the yes belongs to the file's exact bytes and to what the popup showed: a change to either asks again. A user who then trusts the file's changes is asked only when the popup would show other lines. On X11 every file asks first, the same way, once per hash.
export async function approve(file: string): Promise<Approved | null> {
  const papp = fs.realpathSync.native(file);
  const html = fs.readFileSync(papp);
  const permissions = declaredPermissions(papp, html.toString(), PROTECTED);
  const pappHash = createHash('sha256').update(html).digest('hex');
  const record = records.get(papp);

  if (TRAMPOLINE_PLATFORM.isX11 && record.x11Approval !== pappHash) {
    if (TEST_ALLOW) {
      console.log(`Apargon: opened on X11 for the test: ${path.basename(papp)}`);
    } else if (!(await ask(path.join(app.getAppPath(), 'src/trampoline/dialogs/approval/html/unsafe-desktop.html'), {}))) {
      return null;
    }

    records.change(papp, { x11Approval: pappHash });
  }

  const lines = describe(permissions);
  const sameId = record.id === permissions.id ? [] : records.all().filter(saved => saved.id === permissions.id).map(saved => saved.path);

  if (!lines.length && !sameId.length) {
    return { papp, permissions, pappHash: null };
  }

  // The same bytes lead elsewhere once a papp-write folder becomes a link, or PATH finds another program: the popup lines show where.
  const yesToBytes = createHash('sha256').update(pappHash + JSON.stringify(lines)).digest('hex');
  const yesToChanges = createHash('sha256').update(JSON.stringify(lines)).digest('hex');

  if (!sameId.length && record.approval?.hash === yesToBytes) {
    return { papp, permissions, pappHash };
  } else if (!sameId.length && record.approval?.hash === yesToChanges) {
    return { papp, permissions, pappHash: null };
  }

  const linesNow = lines.map(line => JSON.stringify(line));
  const linesBefore = record.approval ? record.approval.lines.map(line => JSON.stringify(line)) : linesNow;
  const changed =
    record.approval === undefined || !lines.length ? null
    : linesNow.some(line => !linesBefore.includes(line)) ? 'It asks for more than when you said yes. The new lines are marked.'
    : linesBefore.some(line => !linesNow.includes(line)) ? 'It asks for less than when you said yes.'
    : 'This file changed since you said yes. It asks for the same things.';
  const downloadAddress = TRAMPOLINE_PLATFORM.downloadAddress(papp);
  const site = downloadAddress === null ? null : (URL.parse(downloadAddress)?.hostname ?? '');
  const popup = {
    name: path.basename(papp),
    folder: (path.dirname(papp) + path.sep).replace(HOME + path.sep, `~${path.sep}`),
    source: site === null ? 'Made on this computer' : `Downloaded from ${site === '' ? 'another computer' : site}`,
    downloaded: site !== null,
    changed,
    sameId: sameId.map(other => ({ name: path.basename(other), detail: other.startsWith(HOME + path.sep) ? `~${other.slice(HOME.length)}` : other })),
    lines: lines.map((line, i) => ({ ...line, isNew: !linesBefore.includes(linesNow[i]) })),
    tags: permissions.tags,
  };
  const answer = TEST_ALLOW ? 'allow' : await ask(path.join(app.getAppPath(), 'src/trampoline/dialogs/approval/html/popup.html'), popup);

  if (answer === null) {
    return null;
  } else if (lines.length) {
    records.change(papp, { approval: { hash: answer === 'trust' ? yesToChanges : yesToBytes, lines } });
  }

  return { papp, permissions, pappHash: !lines.length || answer === 'trust' ? null : pappHash };
}
