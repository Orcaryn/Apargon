import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { pageRecords } from '../../src/trampoline/records/pageRecords/index.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-records-'));
fs.mkdirSync(path.join(dir, 'records'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a record keeps the yes, the picks and the window, and goes when empty', () => {
  const records = pageRecords(path.join(dir, 'records'));
  const page = path.join(dir, 'a.papp');
  records.change(page, { approved: 'hash', picks: [{ path: '/x', write: true, folder: false }], id: 'a' });
  assert.deepEqual(records.get(page), { page, approved: 'hash', picks: [{ path: '/x', write: true, folder: false }], id: 'a' });
  assert.equal(records.all().length, 1);
  records.change(page, { approved: undefined, picks: undefined, id: undefined });
  assert.deepEqual(records.all(), []);
});
