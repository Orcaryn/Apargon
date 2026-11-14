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

export type Approved = { page: string; permissions: Permissions; pageHash: string | null };

// A file with no permission tags opens at once: it reads, writes its own folder, and has no network. A tag is the user's yes, and the yes belongs to the file's exact bytes and to what the popup showed: a change to either asks again. On X11 every file asks first, the same way, once per hash.
export async function approve(file: string): Promise<Approved | null> {
  const page = fs.realpathSync.native(file);
  const html = fs.readFileSync(page);
  const permissions = declaredPermissions(page, html.toString(), PROTECTED);
  const pageHash = createHash('sha256').update(html).digest('hex');
  const record = records.get(page);

  if (TRAMPOLINE_PLATFORM.unsafeDesktop && record.unsafeDesktop !== pageHash) {
    if (TEST_ALLOW) {
      console.log(`Apargon: opened on X11 for the test: ${path.basename(page)}`);
    } else if (!(await ask(path.join(import.meta.dirname, 'html', 'unsafe-desktop.html'), {}))) {
      return null;
    }

    records.change(page, { unsafeDesktop: pageHash });
  }

  if (!permissions.tags.length) {
    return { page, permissions, pageHash: null };
  }

  const lines = describe(permissions);
  // The same bytes lead elsewhere once a papp-write folder becomes a link, or PATH finds another program: the popup lines show where.
  const approval = createHash('sha256').update(pageHash + JSON.stringify(lines)).digest('hex');

  if (record.approved === approval) {
    return { page, permissions, pageHash };
  }

  const downloadAddress = TRAMPOLINE_PLATFORM.downloadAddress(page);
  const site = downloadAddress === null ? null : (URL.parse(downloadAddress)?.hostname ?? '');
  const popup = {
    name: path.basename(page),
    folder: (path.dirname(page) + path.sep).replace(HOME + path.sep, `~${path.sep}`),
    source: site === null ? 'Made on this computer' : `Downloaded from ${site === '' ? 'another computer' : site}`,
    downloaded: site !== null,
    changed: record.approved === undefined ? null : 'This file, or what it asks for, changed since you said yes.',
    lines,
    tags: permissions.tags,
  };

  if (!TEST_ALLOW && !(await ask(path.join(import.meta.dirname, 'html', 'popup.html'), popup))) {
    return null;
  }

  records.change(page, { approved: approval });

  return { page, permissions, pageHash };
}
