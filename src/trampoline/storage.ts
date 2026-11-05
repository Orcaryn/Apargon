import { createHash } from 'crypto';
import type { Rectangle } from 'electron';
import fs from 'fs';
import path from 'path';
import type { GivenFile } from '../permissions/given.ts';
import { readJson, writeJson } from '../shared/json.ts';

// No Electron here: the Node tests load it.

// What Apargon keeps for one page, in one file named after its path: one write changes it whole, and two pages never write the same file.
export type PageRecord = {
  // What the user approved: the popup's line ids, and the content's hash for a downloaded page.
  grant?: string[];
  // The link hosts the user ticked "Always" for.
  links?: string[];
  // What the user picked for the page.
  given?: GivenFile[];
  // Where the user left the window. Not in the page's storage, which the page writes.
  window?: Rectangle;
  // A hash of the page's content, as last opened or closed, so a move can be followed.
  content?: string;
};

type SavedPage = PageRecord & { page: string };

// The folder must exist. Each call reads the file again: another dialog, or on Linux and Windows another Apargon, may have saved meanwhile.
export function pageRecords(folder: string) {
  const fileOf = (page: string) => path.join(folder, `${createHash('sha256').update(page).digest('hex')}.json`);

  return {
    get: (page: string) => readJson<PageRecord>(fileOf(page)),
    // Sets the fields named; undefined removes one. A record left empty is deleted.
    change(page: string, change: PageRecord) {
      const { page: _page, ...record } = { ...readJson<SavedPage>(fileOf(page)), ...change };

      if (Object.values(record).some(value => value !== undefined)) {
        writeJson(fileOf(page), { page, ...record });
      } else {
        fs.rmSync(fileOf(page), { force: true });
      }
    },
    all: () =>
      fs
        .readdirSync(folder)
        .filter(name => name.endsWith('.json'))
        .map(name => readJson<SavedPage>(path.join(folder, name))),
  };
}

export type PageRecords = ReturnType<typeof pageRecords>;

// A page that opens from a new path with the exact content of a page whose file is gone was moved: its storage, the folder `pageStorage` names after the path, moves with it, and so does its window. Same content is the same page, so no other page can take the data this way. Its approval, links and picks stay with the old path, so it is asked again. Returns where it moved from, or null.
export function followMove(page: string, storageOf: (page: string) => string, records: PageRecords, running: string[]): string | null {
  const content = createHash('sha256').update(fs.readFileSync(page)).digest('hex');
  const old = records.all().find(saved => saved.content === content && !fs.existsSync(saved.page) && fs.existsSync(storageOf(saved.page)))?.page;

  if (!old || fs.existsSync(storageOf(page))) {
    return null;
  } else if (running.includes(old)) {
    throw new Error(`This page is still open from where it was, ${old}. Close that window, then open the page again to keep its data.`);
  }

  fs.renameSync(storageOf(old), storageOf(page));
  records.change(page, { window: records.get(old).window });
  records.change(old, { window: undefined, content: undefined });

  return old;
}

// On open and on close: a page edited while open, then moved, still matches. A page whose file and storage are both gone has nothing left to follow: its content and window are forgotten.
export function noteContent(page: string, storageOf: (page: string) => string, records: PageRecords) {
  if (!fs.existsSync(page)) {
    return;
  }

  records.change(page, { content: createHash('sha256').update(fs.readFileSync(page)).digest('hex') });
  records
    .all()
    .filter(saved => saved.content && !fs.existsSync(saved.page) && !fs.existsSync(storageOf(saved.page)))
    .forEach(saved => records.change(saved.page, { window: undefined, content: undefined }));
}
