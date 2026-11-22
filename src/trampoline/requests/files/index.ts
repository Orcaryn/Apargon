import { shell } from 'electron';
import path from 'path';
import type { Readable } from 'stream';
import { pageAccess } from '../../../permissions/access/index.ts';
import { realPath } from '../../../permissions/paths/index.ts';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { Tell, TrampolineEvents } from '../../../shared/wire/protocol/index.ts';
import { PROTECTED } from '../../platform/index.ts';
import { pickHandlers } from './picks/index.ts';
import { printPdf } from './print/index.ts';

// What the trampoline does to files for a .papp file, where its sandbox may not: the user's picks, the Trash and the printer. receive: the bytes of a stream the .papp file named.
export function fileRequests(page: string, permissions: Permissions, own: string, receive: (id: string) => Readable, tell: Tell<TrampolineEvents>) {
  return {
    calls: {
      ...pickHandlers(page, permissions, receive, tell),
      trash: trashHandler(pageAccess(permissions, own, PROTECTED)),
      print: ({ data }: { data: string }) => printPdf(receive(data)),
    },
  };
}

// To the user's Trash, for the .papp file: its sandbox may not write there.
function trashHandler(canChange: (file: string) => boolean) {
  return async ({ file }: { file: string }) => {
    const target = path.join(realPath(path.dirname(file)), path.basename(file));

    if (!canChange(target)) {
      throw new Error('Apargon: this .papp file may not change that. Ask for it with <meta name="papp-write" content="...">.');
    }

    await shell.trashItem(target);

    return null;
  };
}
