// What a page without full Node may touch, checked on real paths: links resolved and, on
// macOS, the case fixed (~/LIBRARY is ~/Library).

import fs from 'fs';
import path from 'path';
import { PAGE_SOURCE, patternSource } from '../permissions/patterns.ts';
import { changeableSources, type Permissions } from '../permissions/tags.ts';
import { APP_BUNDLE, DATA } from '../shared.ts';

// Listing a folder above a wildcard is allowed, so the page can find its matches.
export function pageAccess(permissions: Permissions) {
  const { files, pages } = changeableSources(permissions);
  const change = files.map(source => new RegExp(source));
  const changePages = pages.map(source => new RegExp(source));
  const isPage = new RegExp(PAGE_SOURCE);
  const see = [permissions.own ?? [], permissions.read, permissions.write].flat().map(pattern => new RegExp(patternSource(pattern)));
  const list = [...permissions.write, ...permissions.read].flatMap(pattern => {
    const names = pattern.split('/').filter(Boolean);
    const firstWild = names.findIndex(name => name.includes('*'));

    return firstWild === -1 ? [] : names.slice(firstWild).map((_, i) => new RegExp(patternSource('/' + names.slice(0, firstWild + i).join('/'), false)));
  });
  const resworbFolders = [DATA, APP_BUNDLE ?? []].flat();
  // Keys and logins the OS hides too; refusing here says why. ~/Library would otherwise reach browser profiles.
  const hidden = (file: string) => permissions.hidden.some(secret => file === secret || file.startsWith(secret + '/'));
  const canSee = (file: string) => see.some(pattern => pattern.test(file)) && !hidden(file);

  return {
    canSee,
    canList: (file: string) => canSee(file) || list.some(pattern => pattern.test(file)),
    canChange: (file: string) => (isPage.test(file) ? changePages : change).some(pattern => pattern.test(file)) && !hidden(file) && !resworbFolders.some(dir => file === dir || file.startsWith(dir + '/')),
  };
}

// The real path of a file that may not exist yet: its nearest existing folder resolved, the rest as given.
export function realPath(file: string): string {
  if (fs.lstatSync(file, { throwIfNoEntry: false })) {
    return fs.realpathSync.native(file); // throws for a link to nowhere, which a write would follow
  }

  return path.dirname(file) === file ? file : path.join(realPath(path.dirname(file)), path.basename(file));
}
