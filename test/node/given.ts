import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { withGiven } from '../../src/permissions/given.ts';
import type { Permissions } from '../../src/permissions/tags.ts';

const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.homedir(), 'apargon-given-')));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const page = path.join(dir, 'case.papp');
fs.writeFileSync(page, '');
const permissions: Permissions = { own: dir + path.sep, read: [], write: [], net: [], open: [], run: {}, env: [], sockets: [], system: false, use: [], shortcuts: [], anyShortcut: false, window: null, listen: null, tags: [] };

for (const name of ['missing', 'dangling', 'loop']) {
  test(`an unavailable ${name} pick grants nothing and does not prevent startup`, () => {
    const file = path.join(dir, name);

    if (name !== 'missing') {
      fs.symlinkSync(name === 'loop' ? file : path.join(dir, 'absent-target'), file);
    }

    const picks = [{ path: file, write: false }];
    assert.deepEqual(withGiven(permissions, picks, page).read, []);
  });
}

test('a picked file replaced by a directory does not gain a folder grant', () => {
  const file = path.join(dir, 'replaced');
  fs.mkdirSync(file);
  assert.deepEqual(withGiven(permissions, [{ path: file, write: false }], page).read, []);
  assert.deepEqual(withGiven(permissions, [{ path: file + path.sep, write: false }], page).read, [file + path.sep]);
});

test('availability does not bypass validation of an invalid pick', () => {
  const file = path.join(dir, 'not-there"');
  assert.throws(() => withGiven(permissions, [{ path: file, write: true }], page), /has a "/);
});
