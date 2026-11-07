import { absolutePath, realEntry, realPath } from '../../permissions/paths.ts';
import type { pageAccess } from './access.ts';

export type Scope = ReturnType<typeof pageScope>;

// The tags and picks the sandbox started with. Resolution failures must not reveal a hidden path.
export function pageScope(dir: string, access: ReturnType<typeof pageAccess>) {
  const need = (allowed: boolean, verb: 'see' | 'change') => {
    if (!allowed) {
      const tag = verb === 'see' ? 'papp-read' : 'papp-write';

      throw new Error(`Apargon: this page may not ${verb} that. Ask for it with <meta name="${tag}" content="...">.`);
    }
  };

  const resolvePath = (file: string, resolve: (absolute: string) => string) => {
    try {
      return resolve(absolutePath(file, dir));
    } catch (err) {
      const { code } = err as NodeJS.ErrnoException;
      need(code !== 'EPERM' && code !== 'EACCES', 'see');

      throw err;
    }
  };

  return {
    ...access,
    need,
    where: (file: string) => resolvePath(file, realPath),
    // rm, rename and trash act on the link itself, not its target.
    entry: (file: string) => resolvePath(file, realEntry),
  };
}
