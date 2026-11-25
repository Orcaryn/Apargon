import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { describe, type Line } from '../../../permissions/describe/index.ts';
import { realPath } from '../../../permissions/paths/index.ts';
import { declaredPermissions } from '../../../permissions/tags/index.ts';

const PAPP_FILE = /\.papp$/i;

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

// fetchFile is Chromium's own file loader. It names each file's type, but ignores Range, which media seeks by.
export function fileServer(papp: string, pappHash: string | null, linesAtOpen: Line[], served: (file: string) => void, fetchFile: (request: Request) => Promise<Response>, restart: () => void) {
  const name = path.basename(papp).replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
    } else if (PAPP_FILE.test(file)) {
      // Read once: the bytes checked are the bytes the window renders.
      const html = await fs.promises.readFile(file);

      if (file === papp) {
        // pappHash is null for a file that opened without a popup, or whose changes the user trusts. It reloads freely until an edit changes what the popup would show.
        const changedSinceYes = pappHash !== null && createHash('sha256').update(html).digest('hex') !== pappHash;
        let asksSomethingElse = false;

        if (pappHash === null) {
          try {
            asksSomethingElse = JSON.stringify(describe(declaredPermissions(papp, html.toString(), []))) !== JSON.stringify(linesAtOpen);
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
