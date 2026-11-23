import type { Rectangle } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Line } from '../../../permissions/describe/index.ts';
import { readJson, writeJson } from '../../json/index.ts';

// No Electron here: the Node tests load it.

// What Apargon keeps for one .papp file, in one file named after its path: one write changes it whole.
type PappRecord = {
  // hash: of the bytes the user said yes to, with the popup lines they saw: a change to either asks again. For a file whose changes the user trusts, of the lines alone. lines: only to mark the new ones when it asks again.
  approval?: { hash: string; lines: Line[] };
  // The hash of the bytes the user opened on X11, where Apargon can't keep its promise. Any change asks again.
  x11Approval?: string;
  // Where the user left the window.
  window?: Rectangle;
  // Its papp-id, as last opened: its secrets are kept by it.
  id?: string;
};

type SavedPapp = PappRecord & { path: string };

// The folder must exist. Each call reads the file again: another dialog may have saved meanwhile.
export function pappRecords(folder: string) {
  const fileOf = (papp: string) => path.join(folder, `${createHash('sha256').update(papp).digest('hex')}.json`);

  return {
    get: (papp: string) => readJson<PappRecord>(fileOf(papp)),
    // Sets the fields named. undefined removes one. A record left empty is deleted.
    change(papp: string, change: PappRecord) {
      const { path: _path, ...record } = { ...readJson<SavedPapp>(fileOf(papp)), ...change };

      if (Object.values(record).some(value => value !== undefined)) {
        writeJson(fileOf(papp), { path: papp, ...record });
      } else {
        fs.rmSync(fileOf(papp), { force: true });
      }
    },
    all: () =>
      fs
        .readdirSync(folder)
        .filter(name => name.endsWith('.json'))
        .map(name => readJson<SavedPapp>(path.join(folder, name))),
  };
}
