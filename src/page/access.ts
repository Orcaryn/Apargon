import fs from 'fs';
import path from 'path';
import { PAGE_FILE, patternSource } from '../permissions/patterns.ts';
import { changeableSources, type Permissions } from '../permissions/tags.ts';
import { APP_BUNDLE, DATA } from '../shared.ts';

export function pageAccess(permissions: Permissions) {
  const { files, pages } = changeableSources(permissions);
  const changeable = files.map(source => new RegExp(source));
  const changeablePages = pages.map(source => new RegExp(source));
  const visible = [permissions.own ?? [], permissions.read, permissions.write].flat().map(pattern => new RegExp(patternSource(pattern)));
  const listable = [...permissions.write, ...permissions.read].flatMap(pattern => {
    const names = pattern.split('/').filter(Boolean);
    const firstWild = names.findIndex(name => name.includes('*'));

    return firstWild === -1 ? [] : names.slice(firstWild).map((_, i) => new RegExp(patternSource('/' + names.slice(0, firstWild + i).join('/'), false)));
  });
  const pappFolders = [DATA, APP_BUNDLE ?? []].flat();
  const isSecret = (file: string) => permissions.hidden.some(secret => file === secret || file.startsWith(secret + '/'));
  const canSee = (file: string) => visible.some(pattern => pattern.test(file)) && !isSecret(file);

  return {
    canSee,
    canList: (file: string) => canSee(file) || listable.some(pattern => pattern.test(file)),
    canChange: (file: string) => (PAGE_FILE.test(file) ? changeablePages : changeable).some(pattern => pattern.test(file)) && !isSecret(file) && !pappFolders.some(dir => file === dir || file.startsWith(dir + '/')),
  };
}

export function realPath(file: string): string {
  if (fs.lstatSync(file, { throwIfNoEntry: false })) {
    return fs.realpathSync.native(file); // throws for a dangling link, which a write would follow
  }

  return path.dirname(file) === file ? file : path.join(realPath(path.dirname(file)), path.basename(file));
}
