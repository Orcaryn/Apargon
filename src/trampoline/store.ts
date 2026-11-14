import path from 'path';
import { DATA, PAGE_RECORDS } from '../shared/data.ts';
import type { MenuState } from '../shared/protocol.ts';
import { readJson, writeJson } from './json.ts';
import { pageRecords } from './records.ts';

// Apargon's own JSON files. Only the trampoline reads or writes them, through here.

function jsonFile<T extends object>(name: string) {
  const file = path.join(DATA, name);

  return {
    get: () => readJson<T>(file),
    set: (change: T) => writeJson(file, { ...readJson<T>(file), ...change }),
  };
}

export const records = pageRecords(PAGE_RECORDS);
export const updates = jsonFile<{ automatic?: boolean; checked?: string; noticed?: string }>('update.json');
export const welcomeState = jsonFile<{ welcomed?: true }>('welcome.json');

export function menuState(): MenuState {
  return {
    approved: records
      .all()
      .filter(saved => saved.approved || saved.picks)
      .map(saved => saved.page),
    automaticUpdates: updates.get().automatic !== false,
  };
}
