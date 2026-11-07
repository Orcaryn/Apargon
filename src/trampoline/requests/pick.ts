import { app, dialog } from 'electron';
import path from 'path';
import { withGiven } from '../../permissions/given.ts';
import { realPath, runsOutsideSandbox } from '../../permissions/paths.ts';
import { isInside, PAGE_FILE } from '../../permissions/patterns.ts';
import type { Permissions } from '../../permissions/tags.ts';
import type { PickOptions } from '../../shared/channel.ts';
import { APARGON_FOLDERS } from '../../shared/data.ts';
import { records } from '../store.ts';

// The user picks in this process's dialog, which says what the page gets, and the pick is kept beside the approvals: a page that breaks out of its sandbox can plant neither. A new path, or a new write, restarts the .papp file: its sandbox and Apargon's checks are built when it starts.
export async function pickFiles(page: string, permissions: Permissions, { folder, multiple, write }: PickOptions, restart: () => void) {
  // This process has no window of its own: without this, its dialog opens behind the page.
  app.focus({ steal: true });
  const { canceled, filePaths } = await dialog.showOpenDialog({
    message: `${path.basename(page)} will ${write ? 'see, change and delete' : 'see'} ${folder ? 'the files in the folder' : 'the file'}${multiple ? 's' : ''} you pick, each time it opens.`,
    buttonLabel: 'Give',
    properties: [folder ? 'openDirectory' : 'openFile', 'noResolveAliases', ...(multiple ? ['multiSelections' as const] : [])],
  });

  if (canceled) {
    return [];
  }

  filePaths.forEach(file => checkPick(file, write));
  // Kept as a tag names it: a folder ends in the separator.
  const picked = filePaths.map(file => (folder ? file + path.sep : file));
  const before = records.get(page).given ?? [];
  // A pick keeps the write it had.
  const picks = picked.map(file => ({ path: file, write: write || before.some(old => old.path === file && old.write) }));
  // Refused now, as the next start would refuse it: kept, it would stop the page from opening.
  withGiven(permissions, picks, page);
  records.change(page, { given: [...before.filter(old => !picked.includes(old.path)), ...picks] });

  // After the answer, which goes out once this returns: the page takes the paths, then quits.
  if (picked.some(file => !before.some(old => old.path === file && (old.write || !write)))) {
    setImmediate(restart);
  }

  return filePaths;
}

// A link the page planted could lead the user to a file they did not mean. Hidden files, launch folders and pages run on their own, so a page may not change them.
function checkPick(file: string, write: boolean) {
  if (realPath(file) !== file) {
    throw new Error(`Apargon: ${file} goes through a link. Pick what it leads to instead.`);
  } else if (file.includes('*')) {
    throw new Error(`Apargon: a picked name may not hold *: ${file}.`);
  } else if (APARGON_FOLDERS.some(folder => isInside(file, folder) || isInside(folder, file))) {
    throw new Error(`Apargon: ${file} holds or is in Apargon's data. Pick another.`);
  } else if (write && (runsOutsideSandbox(file) || PAGE_FILE.test(file))) {
    throw new Error(`Apargon: a page may not change ${file}: a hidden file, a page, or a folder whose files run on their own.`);
  }
}
