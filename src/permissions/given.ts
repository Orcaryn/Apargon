import { checkPermissions, type Permissions } from './tags.ts';

// A file or folder the user picked for the page, kept until its approval is taken back.
export type GivenFile = { path: string; write: boolean };

// The picks as if the tags named them: the sandbox, the checks and the page's menu follow from one rule. A pick must pass what a tag must.
export function withGiven(permissions: Permissions, given: GivenFile[], page: string): Permissions {
  const merged = {
    ...permissions,
    read: [...permissions.read, ...given.filter(file => !file.write).map(file => file.path)],
    write: [...permissions.write, ...given.filter(file => file.write).map(file => file.path)],
  };
  checkPermissions(merged, page);

  return merged;
}
