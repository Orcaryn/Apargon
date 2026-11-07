import fs from 'fs';
import path from 'path';
import { realPath } from './paths.ts';
import { checkPermissions, type Permissions } from './tags.ts';

// A file or folder picked by the user, remembered until approval is taken back.
export type GivenFile = { path: string; write: boolean };

export function withGiven(permissions: Permissions, picks: GivenFile[], page: string): Permissions {
  // Validate every saved pick before checking availability: a missing path does not excuse invalid policy.
  checkPermissions({
    ...permissions,
    read: [...permissions.read, ...picks.filter(pick => !pick.write).map(pick => pick.path)],
    write: [...permissions.write, ...picks.filter(pick => pick.write).map(pick => pick.path)],
  }, page);

  const availablePicks = picks.filter(pick => {
    try {
      const pickedPath = path.resolve(pick.path);
      const stats = fs.lstatSync(pickedPath, { throwIfNoEntry: false });

      // Keep the original kind and real path; neither a link nor a replacement directory widens a grant.
      return !!stats && !stats.isSymbolicLink() && stats.isDirectory() === pick.path.endsWith(path.sep) && realPath(pickedPath) === pickedPath;
    } catch (err) {
      const { code } = err as NodeJS.ErrnoException;

      if (code && ['ENOENT', 'ENOTDIR', 'ELOOP', 'EPERM', 'EACCES'].includes(code)) {
        return false;
      }

      throw err;
    }
  });

  return {
    ...permissions,
    read: [...permissions.read, ...availablePicks.filter(pick => !pick.write).map(pick => pick.path)],
    write: [...permissions.write, ...availablePicks.filter(pick => pick.write).map(pick => pick.path)],
  };
}
