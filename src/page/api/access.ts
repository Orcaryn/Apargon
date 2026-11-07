import fs from 'fs';
import path from 'path';
import { changeableSources, isInside, listableSources, PAGE_FILE, patternSource } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { APARGON_FOLDERS } from '../../shared/data.ts';

export function pageAccess(permissions: Permissions) {
  const { files, pages } = changeableSources(permissions);
  const changeable = files.map(source => new RegExp(source));
  const changeablePages = pages.map(source => new RegExp(source));
  const visible = [permissions.own ?? [], permissions.read, permissions.write].flat().map(pattern => new RegExp(patternSource(pattern)));
  const listable = listableSources(permissions).map(source => new RegExp(source));
  // Apargon's data holds other .papp files' storage and the approvals: a papp-system .papp file's process may read it, the .papp file may not; any other's process sees only its own storage. The secrets, no process may.
  const isOffLimits = (file: string) => APARGON_FOLDERS.some(folder => isInside(file, folder));
  const canSee = (file: string) => visible.some(pattern => pattern.test(file)) && !isOffLimits(file);
  const canChange = (file: string) => (PAGE_FILE.test(file) ? changeablePages : changeable).some(pattern => pattern.test(file)) && !isOffLimits(file);
  // A folder and everything in it: a hidden file inside is one the patterns never grant.
  const canChangeAll = (file: string): boolean => canChange(file) && (!fs.lstatSync(file).isDirectory() || fs.readdirSync(file).every(name => canChangeAll(path.join(file, name))));

  return {
    canSee,
    canList: (file: string) => canSee(file) || listable.some(pattern => pattern.test(file)),
    canChange,
    canChangeAll,
  };
}
