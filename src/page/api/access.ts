import { isInside } from '../../permissions/paths.ts';
import type { Permissions } from '../../permissions/tags.ts';

// What the .papp file may change itself, as its sandbox allows: its own folder and its papp-write folders, or with papp-write all any file but Apargon's own. It reads every local disk. protectedFolders: Apargon's data, the .papp files' folders and the app.
export function pageAccess(permissions: Permissions, own: string, protectedFolders: string[]) {
  const canChange = (file: string) => {
    if (permissions.system || isInside(file, own)) {
      return true;
    } else if (protectedFolders.some(folder => isInside(file, folder))) {
      return false;
    }

    return permissions.writeAll || permissions.write.some(folder => isInside(file, folder));
  };

  return { canChange };
}
