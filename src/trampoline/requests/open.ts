import { app, dialog, shell } from 'electron';
import { hostMatches } from '../../permissions/network.ts';
import { linkHost, viewable } from '../../permissions/open.ts';
import { realPath } from '../../permissions/paths.ts';
import { isInside } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { LINKS_FILE, readJson, writeJson, type Links } from '../../shared/data.ts';

// The browser is outside the sandbox, logged in. A declared or remembered host opens at once; any other asks here, address shown, so the page cannot fake the question or the answer.
export async function openLink(page: string, { open }: Permissions, url: string) {
  const host = linkHost(url);

  if (!host) {
    return;
  } else if (![...open, ...(readJson<Links>(LINKS_FILE)[page] ?? [])].some(pattern => hostMatches(pattern, host))) {
    app.focus({ steal: true });
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: 'question',
      message: 'Open this link in your browser?',
      detail: url.length > 400 ? `${url.slice(0, 400)}… (${url.length} characters)` : url,
      buttons: ['Open', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      checkboxLabel: `Always, for links to ${host} from this page`,
    });

    if (response !== 0) {
      return;
    } else if (checkboxChecked) {
      // Read again: another dialog may have saved a host while this one waited.
      const links = readJson<Links>(LINKS_FILE);
      writeJson(LINKS_FILE, { ...links, [page]: [...(links[page] ?? []), host] });
    }
  }

  shell.openExternal(url);
}

// A file goes to its viewer outside the sandbox; nothing leaves the machine. The real path: a symlink without an extension could lead to an app.
export function openFile(file: string, { hidden }: Permissions) {
  const target = realPath(file);

  if (viewable(target) && !hidden.some(secret => isInside(target, secret))) {
    shell.openPath(target);
  }
}
