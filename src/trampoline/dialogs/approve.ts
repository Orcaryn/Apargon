import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe } from '../../permissions/describe.ts';
import { HOME } from '../../permissions/paths.ts';
import { declaredPermissions, type Permissions } from '../../permissions/tags.ts';
import { TEST_ALLOW } from '../../shared/data.ts';
import { PROTECTED, TRAMPOLINE_PLATFORM } from '../platform.ts';
import { forgetSecrets } from '../requests/secrets.ts';
import { records } from '../store.ts';
import { ask } from './ask.ts';

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
    } else if (!(await ask('unsafe-desktop.html', {}))) {
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

  if (!TEST_ALLOW && !(await ask('popup.html', popup))) {
    return null;
  }

  records.change(page, { approved: approval });

  return { page, permissions, pageHash };
}

// Everything the user gave the .papp file goes with its yes: the picks and the secrets too.
export function revoke(pages: string[]) {
  for (const page of pages) {
    const { id } = records.get(page);
    TRAMPOLINE_PLATFORM.startAtLogin(page, false);

    if (id) {
      forgetSecrets(id);
    }

    records.change(page, { approved: undefined, unsafeDesktop: undefined, picks: undefined, id: undefined });
  }
}
