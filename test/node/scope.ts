import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { pageScope } from '../../src/page/api/scope.ts';

const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-scope-')));
after(() => fs.rmSync(dir, { recursive: true }));
const all = () => true;
const scope = pageScope(dir, { canSee: all, canList: all, canChange: all, canChangeAll: all });
fs.writeFileSync(path.join(dir, 'target.txt'), 'kept');
fs.symlinkSync(path.join(dir, 'target.txt'), path.join(dir, 'link'));
fs.symlinkSync(path.join(dir, 'gone.txt'), path.join(dir, 'dangling'));
fs.mkdirSync(path.join(dir, 'folder'));
fs.symlinkSync(path.join(dir, 'folder'), path.join(dir, 'folder-link'));

test('a link is named as itself, so rm and rename act on the link', () => {
  assert.equal(scope.entry('link'), path.join(dir, 'link'));
  assert.equal(scope.entry('folder-link'), path.join(dir, 'folder-link'));
  assert.equal(scope.entry('dangling'), path.join(dir, 'dangling'));
  fs.rmSync(scope.entry('link'));
  assert.equal(fs.readFileSync(path.join(dir, 'target.txt'), 'utf8'), 'kept');
  fs.symlinkSync(path.join(dir, 'target.txt'), path.join(dir, 'link'));
});

test('a folder on the way is resolved, as for any file', () => {
  assert.equal(scope.entry('folder-link/new.txt'), path.join(dir, 'folder', 'new.txt'));
  assert.equal(scope.entry('target.txt'), path.join(dir, 'target.txt'));
  assert.equal(scope.entry('missing.txt'), path.join(dir, 'missing.txt'));
});

// macOS and Windows disks ignore case: the checks see the real name, not the page's spelling.
test('a link keeps its real name', { skip: fs.existsSync(path.join(dir, 'LINK')) ? false : 'this disk tells case apart' }, () => {
  assert.equal(scope.entry('LINK'), path.join(dir, 'link'));
});

test('a link does not inspect unrelated siblings', t => {
  const blocked = path.join(dir, '.unrelated');
  fs.writeFileSync(blocked, 'not granted');
  const lstat = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', (file: fs.PathLike, options?: fs.StatOptions) => {
    if (file === blocked) {
      throw Object.assign(new Error('unrelated metadata denied'), { code: 'EACCES' });
    }

    return lstat(file, options);
  });
  assert.equal(scope.entry('link'), path.join(dir, 'link'));
});

test('a hard-linked symlink is not mistaken for its other name', { skip: process.platform === 'win32' }, t => {
  const alias = path.join(dir, 'alias');

  try {
    fs.linkSync(path.join(dir, 'link'), alias);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EOPNOTSUPP') {
      t.skip('this filesystem does not hard-link symlinks');

      return;
    }

    throw err;
  }

  assert.equal(scope.entry('link'), path.join(dir, 'link'));
  assert.equal(scope.entry('alias'), alias);
});
