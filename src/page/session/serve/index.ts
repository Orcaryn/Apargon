import { createHash } from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { realPath } from '../../../permissions/paths/index.ts';

const PAGE_FILE = /\.papp$/i;

// fetchFile is Chromium's own file loader. It names each file's type, but ignores Range, which media seeks by.
export function fileServer(page: string, pageHash: string | null, served: (file: string) => void, fetchFile: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const url = new URL(request.url);

    // A file URL with a host is a network path on Windows, and no file elsewhere.
    if (url.host) {
      return new Response(`Apargon: a .papp file may not load files from ${url.host}\n`, { status: 403 });
    }

    const file = realPath(fileURLToPath(url));

    // A missing dependency is still a dependency: creating it must trigger live reload.
    served(file);

    if (!fs.statSync(file, { throwIfNoEntry: false })) {
      return new Response(`Apargon: there is no file at ${file}\n`, { status: 404 });
    } else if (PAGE_FILE.test(file)) {
      // Read once: the bytes checked are the bytes the window renders.
      const html = await fs.promises.readFile(file);

      if (file === page && pageHash && createHash('sha256').update(html).digest('hex') !== pageHash) {
        return new Response('Apargon: this .papp file changed since you said yes. Open it again to be asked again.\n', { status: 409 });
      }

      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    // Media asks for bytes=start- or bytes=start-end. Any other range gets the whole file, as HTTP allows.
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');

    if (!range) {
      return fetchFile(request);
    }

    const { size } = fs.statSync(file);
    const start = Number(range[1]);
    const end = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);

    if (start > end) {
      return fetchFile(request);
    }

    // Media plays without a type: Chromium sniffs it.
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' },
    });
  };
}
