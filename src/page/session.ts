import { desktopCapturer, net, session } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { realPath } from '../permissions/paths.ts';
import { PAGE_FILE } from '../permissions/patterns.ts';
import type { Permissions, Use } from '../permissions/tags.ts';

export function createPageSession(page: string, { use }: Permissions, pageHash: string | null, canSee: (file: string) => boolean) {
  const pageSession = session.fromPartition(`persist:${createHash('sha256').update(page).digest('hex')}`);

  pageSession.protocol.handle('file', request => {
    const url = new URL(request.url);

    // A file URL with a host is a network path on Windows, and no file elsewhere.
    if (url.host) {
      return new Response(`Apargon: this page may not load files from ${url.host}\n`, { status: 403 });
    }

    const file = realPath(fileURLToPath(url));

    if (!canSee(file)) {
      return new Response(`Apargon: this page may not see ${file}\n`, { status: 403 });
    } else if (PAGE_FILE.test(file)) {
      const html = fs.readFileSync(file);

      if (file === page && pageHash && createHash('sha256').update(html).digest('hex') !== pageHash) {
        return new Response('Apargon: this page changed since you allowed it. Reopen it to be asked again.\n', { status: 409 });
      }

      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  const webPermissions: Partial<Record<Use, string>> = { clipboard: 'clipboard-read', location: 'geolocation', camera: 'media:video', microphone: 'media:audio', screen: 'display-capture' };
  const allowed = ['clipboard-sanitized-write', 'fullscreen', 'pointerLock', ...use.flatMap(name => webPermissions[name] ?? [])];
  pageSession.setPermissionRequestHandler((_contents, permission, answer, details) => {
    const asked = permission === 'media' && 'mediaTypes' in details ? (details.mediaTypes ?? []).map(type => `media:${type}`) : [permission];
    answer(asked.length > 0 && asked.every(name => allowed.includes(name)));
  });
  pageSession.setPermissionCheckHandler((_contents, permission, _origin, details) => allowed.includes(permission === 'media' ? `media:${details.mediaType}` : permission));

  if (use.includes('screen')) {
    pageSession.setDisplayMediaRequestHandler(async (_request, answer) => {
      const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
      answer({ video: screen });
    });
  }

  return pageSession;
}
