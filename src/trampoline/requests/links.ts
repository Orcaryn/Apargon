import { shell } from 'electron';
import type { Permissions } from '../../permissions/tags.ts';

// Links open only to a site in papp-net, in the user's browser. Any other is dropped: Apargon passes nothing to other apps without a tag.
export function openLink({ net }: Permissions, href: string) {
  const url = URL.parse(href);

  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return;
  }

  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port;

  if (net.includes(`${url.hostname}:${port}`)) {
    void shell.openExternal(url.href);
  } else {
    console.error(`Apargon: a link to ${url.host} stays closed: it isn't in papp-net.`);
  }
}
