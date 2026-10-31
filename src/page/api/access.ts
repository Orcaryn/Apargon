import path from 'path';
import { changeableSources, isInside, PAGE_FILE, patternSource } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { DATA, INSTALL_FOLDER } from '../../shared/data.ts';

export function pageAccess(permissions: Permissions) {
  const { files, pages } = changeableSources(permissions);
  const changeable = files.map(source => new RegExp(source));
  const changeablePages = pages.map(source => new RegExp(source));
  const visible = [permissions.own ?? [], permissions.read, permissions.write].flat().map(pattern => new RegExp(patternSource(pattern)));
  const listable = [...permissions.write, ...permissions.read].flatMap(pattern => {
    const { root } = path.parse(pattern);
    const names = pattern.slice(root.length).split(path.sep).filter(Boolean);
    const firstWild = names.findIndex(name => name.includes('*'));

    return firstWild === -1 ? [] : names.slice(firstWild).map((_, i) => new RegExp(patternSource(path.join(root, ...names.slice(0, firstWild + i)), false)));
  });
  const apargonFolders = [DATA, INSTALL_FOLDER ?? []].flat();
  const isSecret = (file: string) => permissions.hidden.some(secret => isInside(file, secret));
  const canSee = (file: string) => visible.some(pattern => pattern.test(file)) && !isSecret(file);

  return {
    isSecret,
    canSee,
    canList: (file: string) => canSee(file) || listable.some(pattern => pattern.test(file)),
    canChange: (file: string) => (PAGE_FILE.test(file) ? changeablePages : changeable).some(pattern => pattern.test(file)) && !isSecret(file) && !apargonFolders.some(folder => isInside(file, folder)),
  };
}
