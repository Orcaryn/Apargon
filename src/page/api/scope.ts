import { absolutePath, realPath } from '../../permissions/paths.ts';
import type { pageAccess } from './access.ts';

export type Scope = ReturnType<typeof pageScope>;

// What the page may see and change: its tags, plus what the user picked for it since the last reload.
export function pageScope(dir: string, access: ReturnType<typeof pageAccess>) {
  const picked: RegExp[] = [];
  let loads = 0;
  const canSee = (file: string) => access.canSee(file) || (picked.some(pattern => pattern.test(file)) && !access.isOffLimits(file));
  const canList = (file: string) => access.canList(file) || canSee(file);

  // The refusal names no path: the resolved one would tell the page what is there, its real case or where a link leads.
  const need = (allowed: boolean, verb: 'see' | 'change') => {
    if (!allowed) {
      const tag = verb === 'see' ? 'papp-read' : 'papp-write';

      throw new Error(`Apargon: this page may not ${verb} that. Ask for it with <meta name="${tag}" content="...">.`);
    }
  };

  // Before an await: the function it returns says whether the page that asked is still there, or reloaded or closed meanwhile.
  const loaded = () => {
    const at = loads;

    return () => loads === at;
  };

  return {
    picked,
    canSee,
    canList,
    canChange: access.canChange,
    canChangeAll: access.canChangeAll,
    need,
    // The sandbox may refuse to resolve a path the page never asked for, as MXC does with EPERM: that is this refusal, in the OS's words.
    where: (file: string) => {
      try {
        return realPath(absolutePath(file, dir));
      } catch (err) {
        const { code } = err as NodeJS.ErrnoException;
        need(code !== 'EPERM' && code !== 'EACCES', 'see');

        throw err;
      }
    },
    loaded,
    reset() {
      picked.length = 0;
      loads++;
    },
  };
}
