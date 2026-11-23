import path from 'path';
import { DATA, PAPP_RECORDS } from '../../shared/data/index.ts';
import type { MenuState } from '../../shared/wire/protocol/index.ts';
import { readJson, writeJson } from '../json/index.ts';
import { pappRecords } from './pappRecords/index.ts';

// Apargon's own JSON files. Only the trampoline reads or writes them, through here.

function jsonFile<T extends object>(name: string) {
  const file = path.join(DATA, name);

  return {
    get: () => readJson<T>(file),
    set: (change: T) => writeJson(file, { ...readJson<T>(file), ...change }),
  };
}

export const records = pappRecords(PAPP_RECORDS);
export const updates = jsonFile<{ automatic?: boolean; checked?: string; noticed?: string }>('update.json');
export const welcomeState = jsonFile<{ welcomed?: true }>('welcome.json');

export function menuState(): MenuState {
  return {
    approved: records
      .all()
      .filter(saved => saved.approval || saved.picks)
      .map(saved => saved.path),
    automaticUpdates: updates.get().automatic !== false,
  };
}
