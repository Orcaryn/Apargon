import path from 'path';
import type { MenuState } from '../shared/channel.ts';
import { DATA, PAGE_RECORDS } from '../shared/data.ts';
import { readJson, writeJson } from '../shared/json.ts';
import { pageRecords } from './records.ts';

// Apargon's own JSON files. Only the trampoline reads or writes them, through here.

export type UpdateState = { automatic?: boolean; checked?: string; noticed?: string };

function single<T extends object>(name: string) {
  const file = path.join(DATA, name);

  return {
    get: () => readJson<T>(file),
    set: (change: T) => writeJson(file, { ...readJson<T>(file), ...change }),
  };
}

export const records = pageRecords(PAGE_RECORDS);
export const updates = single<UpdateState>('update.json');
export const welcomeState = single<{ welcomed?: true }>('welcome.json');

export function menuState(): MenuState {
  return {
    approved: records
      .all()
      .filter(saved => saved.approved || saved.picks)
      .map(saved => saved.page),
    automaticUpdates: updates.get().automatic !== false,
  };
}
