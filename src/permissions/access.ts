import { isInside } from './paths.ts';
import type { Permissions } from './tags.ts';

// No Electron here: the Node tests load it.

// What a .papp file may change, as its sandbox allows. protectedFolders: Apargon's data, the .papp files' folders and the app.
export function pageAccess(permissions: Permissions, own: string, protectedFolders: string[]) {
  return (file: string) => {
    if (permissions.system || isInside(file, own)) {
      return true;
    } else if (protectedFolders.some(folder => isInside(file, folder))) {
      return false;
    }

    return permissions.writeAll || permissions.write.some(folder => isInside(file, folder));
  };
}
