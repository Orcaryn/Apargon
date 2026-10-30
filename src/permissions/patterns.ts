import fs from 'fs';
import path from 'path';

// A pattern is a real path, so each name sits between separators: \ on Windows, / elsewhere.
const SEPARATOR = path.sep === '/' ? '/' : '\\\\';

// Seatbelt misreads [^./], so [^.]: paths here are normalized and never meet a separator.
export function patternSource(pattern: string, withContents = true) {
  const { root } = path.parse(pattern);
  const names = pattern
    .slice(root.length)
    .split(path.sep)
    .filter(Boolean)
    .map(name => (name.startsWith('*') ? '[^.]' : '') + name.split('*').map(text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join(`[^${SEPARATOR}]*`));

  // The root without its separator: nothing on macOS and Linux, the drive, such as C:, on Windows.
  return `^${root.slice(0, -1)}${names.map(name => SEPARATOR + name).join('')}${withContents ? `(${SEPARATOR}[^.][^${SEPARATOR}]*)*` : ''}${SEPARATOR}?$`;
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

export function patternFolder(pattern: string) {
  const base = literalBase(pattern);

  return pattern.includes('*') || fs.statSync(base, { throwIfNoEntry: false })?.isDirectory() ? base : path.dirname(base);
}

export const PAGE_SOURCE = '\\.[pP][aA][pP][pP]/?$';
export const PAGE_FILE = new RegExp(PAGE_SOURCE);
