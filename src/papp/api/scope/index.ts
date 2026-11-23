import path from 'path';
import { absolutePath, realPath } from '../../../permissions/paths/index.ts';

export type Scope = ReturnType<typeof pappScope>;

// Paths from the .papp file's folder, as on disk, and the check for a change.
export function pappScope(dir: string, canChange: (file: string) => boolean) {
  return {
    canChange,
    needChange(file: string) {
      if (!canChange(file)) {
        throw new Error(`Apargon: this .papp file may not change ${file}. It writes its own folder, papp.folder. For another folder, ask for it with <meta name="papp-write" content="...">, or let the user pick it with papp.pick({ write: true }).`);
      }
    },
    where: (file: string) => realPath(absolutePath(file, dir)),
    // rm, rename and trash act on a link itself, not what it leads to.
    entry: (file: string) => {
      const absolute = absolutePath(file, dir);

      return path.join(realPath(path.dirname(absolute)), path.basename(absolute));
    },
  };
}
