import { shell } from 'electron';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { PageEvents, Tell, TrampolineEvents } from '../../../shared/wire/protocol/index.ts';
import type { byteStreams } from '../../../shared/wire/streams/index.ts';
import { pageListeners } from './listen/index.ts';

// What reaches a .papp file from outside, and the links it opens: its listeners, and a site in papp-net in the user's browser.
export function networkRequests(permissions: Permissions, bytes: ReturnType<typeof byteStreams>, tell: Tell<TrampolineEvents>) {
  const listeners = pageListeners(permissions, request => tell('request', request), bytes.send);

  return {
    events: {
      respond: ({ id, status, headers, body }: PageEvents['respond']) => listeners.respond(id, status, headers, bytes.receive(body)),
      openLink: (href: string) => openLink(permissions, href),
    },
    calls: {
      listen: ({ server, port }: { server: string; port: number | null }) => listeners.listen(server, port),
      unlisten: ({ server }: { server: string }) => listeners.unlisten(server),
    },
    close: () => void listeners.closeAll(),
  };
}

// Only to a site in papp-net, in the user's browser: Apargon passes nothing to other apps without a tag.
function openLink(permissions: Permissions, href: string) {
  const url = URL.parse(href);

  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return;
  }

  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port;

  if (permissions.net.includes(`${url.hostname}:${port}`)) {
    void shell.openExternal(url.href);
  } else {
    console.error(`Apargon: a link to ${url.host} stays closed: it isn't in papp-net.`);
  }
}
