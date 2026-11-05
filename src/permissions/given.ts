import path from 'path';
import { realPath } from './paths.ts';
import { checkPermissions, type Permissions } from './tags.ts';

// A file or folder the user picked for the page, kept until its approval is taken back.
export type GivenFile = { path: string; write: boolean };

// The picks as if the tags named them: the sandbox, the checks and the page's menu follow from one rule. A pick must pass what a tag must.
// One that now goes through a link is dropped: the sandbox would grant what it leads to, which a program could have changed.
export function withGiven(permissions: Permissions, given: GivenFile[], page: string): Permissions {
  // resolve drops a folder pick's trailing separator, as the real path does.
  const kept = given.filter(file => realPath(file.path) === path.resolve(file.path));
  const merged = {
    ...permissions,
    read: [...permissions.read, ...kept.filter(file => !file.write).map(file => file.path)],
    write: [...permissions.write, ...kept.filter(file => file.write).map(file => file.path)],
  };
  checkPermissions(merged, page);

  return merged;
}
