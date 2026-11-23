import path from 'path';
import { DATA, PAPP_RECORDS } from '../../shared/data/index.ts';
import type { MenuState } from '../../shared/wire/protocol/index.ts';
import { readJson, writeJson } from '../json/index.ts';
import { pappRecords } from './pappRecords/index.ts';

// Apargon's own JSON files. Only the trampoline reads or writes them, through here.

type Settings = { automatic?: boolean; checked?: string; noticed?: string; welcomed?: true };
const SETTINGS = path.join(DATA, 'settings.json');

export const records = pappRecords(PAPP_RECORDS);
export const settings = {
  get: () => readJson<Settings>(SETTINGS),
  set: (change: Settings) => writeJson(SETTINGS, { ...readJson<Settings>(SETTINGS), ...change }),
};

export function menuState(): MenuState {
  return {
    approved: records
      .all()
      .filter(saved => saved.approval || saved.picks)
      .map(saved => saved.path),
    automaticUpdates: settings.get().automatic !== false,
  };
}
