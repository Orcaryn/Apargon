// Folder patterns: an absolute path in which * stands for part of one name.

// One source for resworb's checks and for Seatbelt. A * stays within one name and never
// starts a hidden one; below a match, every name but hidden ones matches. Seatbelt reads
// [^./] wrongly, so [^.] it is: paths here are normalized, so it never meets a /.
export function patternSource(pattern: string, withContents = true) {
  const names = pattern
    .split('/')
    .filter(Boolean)
    .map(name =>
      name
        .split('*')
        .map(text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*')
        .replace(/^\[\^\/\]\*/, '[^.][^/]*')
    );

  return `^${names.map(name => '/' + name).join('')}${withContents ? '(/[^.][^/]*)*' : ''}/?$`;
}

// The folders of a pattern before its first *.
export function literalBase(pattern: string) {
  const names = pattern.split('/').filter(Boolean);
  const firstWild = names.findIndex(name => name.includes('*'));

  return '/' + (firstWild === -1 ? names : names.slice(0, firstWild)).join('/');
}
