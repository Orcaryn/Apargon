import fs from 'fs';
import path from 'path';
import { isInside } from '../../../permissions/paths/index.ts';

// Live reload: an edit to a .papp, .css or .js file the .papp file loaded reloads its windows; a file the .papp file may change itself does not, or every save would reload it.
// Folders are watched, not files: an editor that saves by replacing a file would end a watch on it.
export function liveReload(papp: string, canChange: (file: string) => boolean, reload: () => void) {
  // A watch also fires when only a file's attributes change, such as its Finder icon or tags. Those keep the modified time.
  const modifiedAtLoad = new Map<string, number | undefined>();
  const watched = new Set<string>();
  let pendingReload: NodeJS.Timeout | undefined = undefined;

  // A folder whose watch fails leaves the set, so the next load from it tries again; the load itself goes on.
  const stopWatching = (folder: string, err: Error) => {
    watched.delete(folder);
    console.error(`Apargon: live reload stopped for ${folder} (${err.message}). Reload the .papp file to try again.`);
  };

  return (file: string) => {
    if (!/\.(papp|css|js)$/.test(file) || (file !== papp && canChange(file))) {
      return;
    }

    modifiedAtLoad.set(file, fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs);
    let folder = path.dirname(file);

    // A dependency may be missing with its parent: watch the nearest existing ancestor.
    while (!fs.existsSync(folder) && path.dirname(folder) !== folder) {
      folder = path.dirname(folder);
    }

    if (watched.has(folder)) {
      return;
    }

    watched.add(folder);

    try {
      fs.watch(folder, (_event, name) => {
        if (name && [...modifiedAtLoad].some(([dependency, modified]) => isInside(dependency, path.join(folder, name)) && fs.statSync(dependency, { throwIfNoEntry: false })?.mtimeMs !== modified)) {
          clearTimeout(pendingReload);
          pendingReload = setTimeout(reload, 100);
        }
      }).on('error', err => stopWatching(folder, err));
    } catch (err) {
      stopWatching(folder, err as Error);
    }
  };
}
