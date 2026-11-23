import { isInside } from '../paths/index.ts';
import type { Permissions } from '../tags/index.ts';

// No Electron here: the Node tests load it.

// What a .papp file may change, as its sandbox allows. protectedFolders: the .papp files' folders, Apargon's data among them, and the app.
export function pappAccess(permissions: Permissions, own: string, protectedFolders: string[]) {
  return (file: string) => {
    if (permissions.system || isInside(file, own)) {
      return true;
    } else if (protectedFolders.some(folder => isInside(file, folder))) {
      return false;
    }

    return permissions.writeAll || permissions.write.some(folder => isInside(file, folder));
  };
}
