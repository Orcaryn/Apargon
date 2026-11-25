import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { describe, type Line } from '../../../permissions/describe/index.ts';
import { realPath } from '../../../permissions/paths/index.ts';
import { declaredPermissions } from '../../../permissions/tags/index.ts';
import type { Yes } from '../../../shared/wire/protocol/index.ts';

// What a .papp file runs or renders as written: the user's yes covers these bytes.
const CODE_TYPES: Record<string, string> = { '.papp': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

// Shown in place of the .papp file. The Restart button asks for it again with ?restart.
function notice(status: number, heading: string, text: string, restartButton: boolean) {
  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>Apargon</title>
<style>
  html { height: 100%; }
  body { margin: 0; min-height: 100%; display: grid; place-items: center; background: Canvas; color: CanvasText; font: 14px/1.5 system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 28rem; padding: 2rem; text-align: center; }
  h1 { margin: 0 0 0.4rem; font-size: 17px; font-weight: 600; overflow-wrap: anywhere; }
  p { margin: 0; opacity: 0.7; overflow-wrap: anywhere; }
  button { margin-top: 1.5rem; padding: 0.45rem 1.4rem; border: 0; border-radius: 7px; background: AccentColor; color: AccentColorText; font: inherit; font-weight: 500; cursor: pointer; }
  button:focus-visible { outline: 2px solid AccentColor; outline-offset: 2px; }
</style>
<main>
  <h1>${heading}</h1>
  <p>${text}</p>
  ${restartButton ? '<form><button name="restart" autofocus>Restart</button></form>' : ''}
</main>
`;

  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// yes: null for a file that opened without a popup, or whose changes the user trusts. It reloads freely until an edit changes what the popup would show.
// codeLoaded: a script, style or other .papp file loaded for the first time since the yes, unless the papp may write it. The yes covers it from then on, and the trampoline keeps it.
// fetchFile is Chromium's own file loader. It names each file's type, but ignores Range, which media seeks by.
export function fileServer(papp: string, yes: Yes | null, linesAtOpen: Line[], canChange: (file: string) => boolean, served: (file: string) => void, codeLoaded: (file: string, hash: string) => void, fetchFile: (request: Request) => Promise<Response>, reload: () => void, restart: () => void) {
  const name = path.basename(papp).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let codeChanged = false;

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
      return file === papp
        ? notice(404, `${name} isn't there any more.`, `It was moved, renamed or deleted from:<br>${path.dirname(papp).replace(/&/g, '&amp;').replace(/</g, '&lt;')}<br>Put it back to reload, or open it from its new place.`, false)
        : new Response(`Apargon: there is no file at ${file}\n`, { status: 404 });
    }

    const type = CODE_TYPES[path.extname(file).toLowerCase()];

    if (type) {
      // Read once: the bytes checked are the bytes the window renders.
      const bytes = await fs.promises.readFile(file);
      const hash = createHash('sha256').update(bytes).digest('hex');

      if (file === papp) {
        const changedSinceYes = yes !== null && (hash !== yes.pappHash || codeChanged);
        let asksSomethingElse = false;

        if (yes === null) {
          try {
            asksSomethingElse = JSON.stringify(describe(declaredPermissions(papp, bytes.toString(), []))) !== JSON.stringify(linesAtOpen);
          } catch {
            // The sandbox can't see every folder the tags name. The trampoline parses again on restart and shows the real error.
            asksSomethingElse = true;
          }
        }

        if (changedSinceYes || asksSomethingElse) {
          // 204 keeps the page that asked: no page loads into a window the trampoline is about to close.
          if (url.searchParams.has('restart')) {
            restart();

            return new Response(null, { status: 204 });
          }

          return changedSinceYes
            ? notice(409, `${name} changed since you said yes.`, 'Restart it to be asked again.', true)
            : notice(409, `${name} now asks for something else.`, 'Restart it to see what it asks for.', true);
        }
      } else if (yes !== null && !canChange(file)) {
        if (yes.code[file] === undefined) {
          yes.code[file] = hash;
          codeLoaded(file, hash);
        } else if (yes.code[file] !== hash) {
          // The window loads again, and the .papp file itself answers with the notice.
          codeChanged = true;
          reload();

          return new Response(null, { status: 409 });
        }
      }

      return new Response(bytes, { headers: { 'content-type': type } });
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
