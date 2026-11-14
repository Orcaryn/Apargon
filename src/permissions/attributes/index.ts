// No Electron here: the Node tests load it.

// As the browser reads them: the first of each name wins, in any case. A bare attribute has the value ''. Quoted means name="value", no spaces around the =.
export function readAttributes(attrs: string) {
  const attributes = new Map<string, { value: string; quoted: boolean }>();

  for (const [, key, equals, double, single, bare] of attrs.matchAll(/([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (!attributes.has(key.toLowerCase())) {
      attributes.set(key.toLowerCase(), { value: double ?? single ?? bare ?? '', quoted: equals === undefined || ((double ?? single) !== undefined && equals === '=') });
    }
  }

  return attributes;
}

// A bare attribute is yes, and so is ="yes". ="no" is no.
export function isYes({ value, quoted }: { value: string; quoted: boolean }, tag: string) {
  const answer = value.trim().toLowerCase();

  if (!quoted || !['', 'yes', 'no'].includes(answer)) {
    throw new Error(`${tag}: write a setting bare for yes, as in on-top, or ="no" for no.`);
  }

  return answer !== 'no';
}
