import { app, dialog } from 'electron';
import path from 'path';
import { withGiven } from '../../permissions/given.ts';
import { realPath, runsOutsideSandbox, SECRETS } from '../../permissions/paths.ts';
import { isInside, PAGE_FILE } from '../../permissions/patterns.ts';
import { PERMISSIONS_PLATFORM } from '../../permissions/platform.ts';
import type { Permissions } from '../../permissions/tags.ts';
import type { PickOptions } from '../../shared/channel.ts';
import { DATA, GIVEN_FILE, INSTALL_FOLDER, readJson, SECRETS_DATA, writeJson, type Given } from '../../shared/data.ts';

// The user picks in this process's dialog, which says what the page gets, and the pick is kept beside the approvals: a page that breaks out of its sandbox can plant neither. Resolves with the paths, and whether the sandbox must be built again to grant them.
export async function pickFiles(page: string, permissions: Permissions, { folder, multiple, write }: PickOptions) {
  // This process has no window of its own: without this, its dialog opens behind the page.
  app.focus({ steal: true });
  const { canceled, filePaths } = await dialog.showOpenDialog({
    message: `${path.basename(page)} will ${write ? 'see, change and delete' : 'see'} ${folder ? 'the files in the folder' : 'the file'}${multiple ? 's' : ''} you pick, each time it opens.`,
    buttonLabel: 'Give',
    properties: [folder ? 'openDirectory' : 'openFile', 'noResolveAliases', ...(multiple ? ['multiSelections' as const] : [])],
  });

  if (canceled) {
    return { paths: [], rebuild: false };
  }

  filePaths.forEach(file => checkPick(file, write));
  const given = readJson<Given>(GIVEN_FILE);
  const before = given[page] ?? [];
  // A pick keeps the write it had. The sandbox is built when the page starts: a new write, or on an OS that limits reads by folder a new path, needs it built again.
  const picks = filePaths.map(file => ({ path: file, write: write || before.some(old => old.path === file && old.write) }));
  const rebuild = picks.some(pick => {
    const old = before.find(each => each.path === pick.path);

    return old ? pick.write && !old.write : pick.write || !PERMISSIONS_PLATFORM.readsAll;
  });
  // Refused now, as the next start would refuse it: kept, it would stop the page from opening.
  withGiven(permissions, picks, page);
  writeJson(GIVEN_FILE, { ...given, [page]: [...before.filter(old => !filePaths.includes(old.path)), ...picks] });

  return { paths: filePaths, rebuild };
}

// A link the page planted could lead the user to a file they did not mean. A folder that holds keys and logins would unhide them. Hidden files, launch folders and pages run on their own, so a page may not change them.
function checkPick(file: string, write: boolean) {
  if (realPath(file) !== file) {
    throw new Error(`Apargon: ${file} goes through a link. Pick what it leads to instead.`);
  } else if (file.includes('*')) {
    throw new Error(`Apargon: a picked name may not hold *: ${file}.`);
  } else if ([DATA, SECRETS_DATA, INSTALL_FOLDER ?? []].flat().some(folder => isInside(file, folder) || isInside(folder, file))) {
    throw new Error(`Apargon: ${file} holds or is in Apargon's data. Pick another.`);
  } else if (SECRETS.some(secret => isInside(file, secret.path) || isInside(secret.path, file))) {
    throw new Error(`Apargon: ${file} holds or is among your keys and logins. Pick a folder without them.`);
  } else if (write && (runsOutsideSandbox(file) || PAGE_FILE.test(file))) {
    throw new Error(`Apargon: a page may not change ${file}: a hidden file, a page, or a folder whose files run on their own.`);
  }
}
