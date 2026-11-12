import type { Rectangle } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { readJson, writeJson } from '../shared/json.ts';

// No Electron here: the Node tests load it.

// What Apargon keeps for one .papp file, in one file named after its path: one write changes it whole.
export type PageRecord = {
  // The hash of the bytes the user said yes to, with the popup lines they saw. A change to either asks again.
  approved?: string;
  // The hash of the bytes the user opened on a desktop where Apargon can't keep its promise, as X11. Any change asks again.
  unsafeDesktop?: string;
  // What the user picked in a dialog: to read, to write, or a folder to write in.
  picks?: Pick[];
  // Where the user left the window.
  window?: Rectangle;
  // Its papp-id, as last opened: its secrets are kept by it.
  id?: string;
};
export type Pick = { path: string; write: boolean; folder: boolean };

type SavedPage = PageRecord & { page: string };

// The folder must exist. Each call reads the file again: another dialog may have saved meanwhile.
export function pageRecords(folder: string) {
  const fileOf = (page: string) => path.join(folder, `${createHash('sha256').update(page).digest('hex')}.json`);

  return {
    get: (page: string) => readJson<PageRecord>(fileOf(page)),
    // Sets the fields named. undefined removes one. A record left empty is deleted.
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
