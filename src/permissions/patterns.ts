import fs from 'fs';
import path from 'path';

// Seatbelt misreads [^./], so [^.]: paths here are normalized and never meet a /.
export function patternSource(pattern: string, withContents = true) {
  const names = pattern
    .split('/')
    .filter(Boolean)
    .map(name =>
      name
        .split('*')
        .map(text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*')
        .replace(/^\[\^\/\]\*/, '[^.][^/]*')
    );

  return `^${names.map(name => '/' + name).join('')}${withContents ? '(/[^.][^/]*)*' : ''}/?$`;
}

export function literalBase(pattern: string) {
  const names = pattern.split('/').filter(Boolean);
  const firstWild = names.findIndex(name => name.includes('*'));

  return '/' + (firstWild === -1 ? names : names.slice(0, firstWild)).join('/');
}

export function patternFolder(pattern: string) {
  const base = literalBase(pattern);

  return pattern.includes('*') || fs.statSync(base, { throwIfNoEntry: false })?.isDirectory() ? base : path.dirname(base);
}

export const PAGE_SOURCE = '\\.[pP][aA][pP][pP]/?$';
export const PAGE_FILE = new RegExp(PAGE_SOURCE);
