import { absolutePath, realPath } from '../../permissions/paths.ts';
import type { pageAccess } from './access.ts';

export type Scope = ReturnType<typeof pageScope>;

// What the page may see and change: its tags, plus what the user picked for it since the last reload.
export function pageScope(dir: string, access: ReturnType<typeof pageAccess>) {
  const picked: RegExp[] = [];
  const canSee = (file: string) => access.canSee(file) || (picked.some(pattern => pattern.test(file)) && !access.isOffLimits(file));
  const canList = (file: string) => access.canList(file) || canSee(file);

  const need = (allowed: boolean, file: string, verb: 'see' | 'change') => {
    if (!allowed) {
      const tag = verb === 'see' ? 'papp-read' : 'papp-write';

      throw new Error(`Apargon: this page may not ${verb} ${file}. Ask for it with <meta name="${tag}" content="...">.`);
    }
  };

  return { picked, canSee, canList, canChange: access.canChange, need, where: (file: string) => realPath(absolutePath(file, dir)) };
}
