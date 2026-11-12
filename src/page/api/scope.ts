import path from 'path';
import { absolutePath, realPath } from '../../permissions/paths.ts';
import type { pageAccess } from './access.ts';

export type Scope = ReturnType<typeof pageScope>;

// Paths from the .papp file's folder, as on disk, and the check for a change.
export function pageScope(dir: string, access: ReturnType<typeof pageAccess>) {
  return {
    ...access,
    needChange(file: string) {
      if (!access.canChange(file)) {
        throw new Error(`Apargon: this .papp file may not change ${file}. It writes its own folder, papp.folder. For another folder, ask for it with <meta name="papp-write" content="...">, or let the user pick it with papp.pick({ write: true }).`);
      }
    },
    where: (file: string) => realPath(absolutePath(file, dir)),
    // rm, rename and trash act on a link itself, not what it leads to: the folder as on disk, the name as given.
    entry: (file: string) => {
      const absolute = absolutePath(file, dir);

      return path.join(realPath(path.dirname(absolute)), path.basename(absolute));
    },
  };
}
