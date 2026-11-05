import path from 'path';
import type { Permissions } from './tags.ts';

const SEPARATOR = path.sep === '/' ? '/' : '\\\\';
// A folder's contents, and **.
const ANY_NAMES = `(${SEPARATOR}[^.][^${SEPARATOR}]*)*`;

// Seatbelt misreads [^./], so [^.]: paths here are normalized and never meet a separator. * is any part of one name, ** any number of names; neither matches a hidden one.
export function patternSource(pattern: string, withContents = true) {
  const { root } = path.parse(pattern);
  const names = pattern
    .slice(root.length)
    .split(path.sep)
    .filter(Boolean)
    .map(name => (name === '**' ? ANY_NAMES : SEPARATOR + (name.startsWith('*') ? '[^.]' : '') + name.split('*').map(text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join(`[^${SEPARATOR}]*`)));
  const drive = root.slice(0, -1);

  return `^${drive}${names.join('')}${withContents ? ANY_NAMES : ''}${SEPARATOR}?$`;
}

export function literalBase(pattern: string) {
  const { root } = path.parse(pattern);
  const names = pattern.slice(root.length).split(path.sep).filter(Boolean);
  const firstWild = names.findIndex(name => name.includes('*'));

  return path.join(root, ...(firstWild === -1 ? names : names.slice(0, firstWild)));
}

// path.relative, not startsWith: a root such as / or C:\ already ends in a separator, and Windows ignores case.
export function isInside(file: string, folder: string) {
  const fromFolder = path.relative(folder, file);

  return fromFolder !== '..' && !fromFolder.startsWith('..' + path.sep) && !path.isAbsolute(fromFolder);
}

export const PAGE_SOURCE = `\\.[pP][aA][pP][pP]${SEPARATOR}?$`;
export const PAGE_FILE = new RegExp(PAGE_SOURCE);

export function changeableSources({ write }: Permissions) {
  return {
    files: write.map(pattern => patternSource(pattern)),
    pages: write.filter(pattern => PAGE_FILE.test(pattern)).map(pattern => patternSource(pattern)),
  };
}
