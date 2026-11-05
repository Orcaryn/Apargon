import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import fs from 'fs';
import { after, test } from 'node:test';
import os from 'os';
import path from 'path';
import { followMove, noteContent, pageRecords } from '../../src/trampoline/storage.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-moved-'));
const pageData = path.join(root, 'data');
fs.mkdirSync(path.join(root, 'records'));
const records = pageRecords(path.join(root, 'records'));
after(() => fs.rmSync(root, { recursive: true }));

function setUp(content: string) {
  const dir = path.join(root, content);
  fs.mkdirSync(dir);
  const [old, moved] = [path.join(dir, 'old.papp'), path.join(dir, 'new.papp')];
  fs.writeFileSync(old, content);
  noteContent(old, storage, records);
  fs.mkdirSync(storage(old), { recursive: true });
  fs.writeFileSync(path.join(storage(old), 'data'), 'kept');

  return { old, moved };
}

function storage(page: string) {
  return path.join(pageData, 'Partitions', createHash('sha256').update(page).digest('hex'));
}

// Where the data is: with the old path, the new one, both or neither.
const where = (old: string, moved: string) => ({ old: fs.existsSync(path.join(storage(old), 'data')), moved: fs.existsSync(path.join(storage(moved), 'data')) });

test('moved: the data follows', () => {
  const { old, moved } = setUp('a');
  fs.renameSync(old, moved);
  followMove(moved, storage, records, []);
  assert.deepEqual(where(old, moved), { old: false, moved: true });
});

test('copied: the old file is there, the copy starts empty', () => {
  const { old, moved } = setUp('b');
  fs.copyFileSync(old, moved);
  followMove(moved, storage, records, []);
  assert.deepEqual(where(old, moved), { old: true, moved: false });
});

test('other content: no match', () => {
  const { old, moved } = setUp('c');
  fs.rmSync(old);
  fs.writeFileSync(moved, 'c, changed');
  followMove(moved, storage, records, []);
  assert.deepEqual(where(old, moved), { old: true, moved: false });
});

test('edited while open, then moved: the close notes it', () => {
  const { old, moved } = setUp('d');
  fs.writeFileSync(old, 'd, edited');
  noteContent(old, storage, records);
  fs.renameSync(old, moved);
  followMove(moved, storage, records, []);
  assert.equal(where(old, moved).moved, true);
});

test('the old window still open: refused, the data stays', () => {
  const { old, moved } = setUp('e');
  fs.renameSync(old, moved);
  assert.throws(() => followMove(moved, storage, records, [old]));
  assert.deepEqual(where(old, moved), { old: true, moved: false });
});

test('the new path has data of its own: kept', () => {
  const { old, moved } = setUp('f');
  fs.renameSync(old, moved);
  fs.mkdirSync(storage(moved), { recursive: true });
  followMove(moved, storage, records, []);
  assert.deepEqual(where(old, moved), { old: true, moved: false });
});

test('forgotten only when file and data are both gone', () => {
  const gone = setUp('g');
  const movedAway = setUp('h');
  fs.rmSync(gone.old);
  fs.rmSync(storage(gone.old), { recursive: true });
  fs.renameSync(movedAway.old, movedAway.moved);
  noteContent(movedAway.moved, storage, records);
  assert.equal(records.get(gone.old).content, undefined);
  assert.ok(records.get(movedAway.old).content);
  assert.ok(records.get(movedAway.moved).content);
});

test('moved: the window follows, the approval stays', () => {
  const { old, moved } = setUp('i');
  records.change(old, { window: { x: 1, y: 2, width: 3, height: 4 }, grant: ['own:x'] });
  fs.renameSync(old, moved);
  followMove(moved, storage, records, []);
  assert.equal(records.get(moved).window?.x, 1);
  assert.equal(records.get(moved).grant, undefined);
  assert.equal(records.get(old).window, undefined);
  assert.deepEqual(records.get(old).grant, ['own:x']);
});

test('a record left empty is deleted, and listed only while it holds something', () => {
  const page = path.join(root, 'j.papp');
  records.change(page, { grant: ['own:x'], links: ['a.example'] });
  assert.ok(records.all().some(saved => saved.page === page));
  records.change(page, { grant: undefined, links: undefined });
  assert.ok(!records.all().some(saved => saved.page === page));
  assert.deepEqual(records.get(page), {});
});
