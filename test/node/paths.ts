import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { absolutePath, HOME, HOME_READS, SECRETS } from '../../src/permissions/paths.ts';
import { isInside } from '../../src/permissions/patterns.ts';

// Fonts and the desktop's settings go back into every .papp file's sandbox: none may be, or hold, a key or a login.
test('what every .papp file gets back in home holds no secret', () => {
  const secret = HOME_READS.filter(file => SECRETS.some(({ path: kept }) => isInside(file, kept) || isInside(kept, file)));
  assert.deepEqual(secret, []);
});

test('a Save suggestion is resolved without filesystem access', t => {
  t.mock.method(fs, 'lstatSync', () => { throw new Error('no filesystem access'); });
  t.mock.method(fs.realpathSync, 'native', () => { throw new Error('no filesystem access'); });
  assert.equal(absolutePath('Downloads/report.pdf', HOME), path.join(HOME, 'Downloads', 'report.pdf'));
});
