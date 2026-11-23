import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pappAccess } from '../../src/permissions/access/index.ts';
import { noPermissions } from '../../src/permissions/tags/index.ts';

const root = path.parse(process.cwd()).root;
const at = (...names: string[]) => path.join(root, ...names);
const own = at('home', '.apargon', 'notes');
const kept = [at('home', '.apargon')];

test('without tags: only its own folder', () => {
  const canChange = pappAccess(noPermissions('a'), own, kept);
  assert.equal(canChange(path.join(own, 'x.txt')), true);
  assert.equal(canChange(at('home', '.apargon', 'other', 'x.txt')), false);
  assert.equal(canChange(at('home', 'x.txt')), false);
});

test('papp-write: that folder too', () => {
  const canChange = pappAccess({ ...noPermissions('a'), write: [at('work') + path.sep] }, own, kept);
  assert.equal(canChange(at('work', 'deep', 'x.txt')), true);
  assert.equal(canChange(at('workshop', 'x.txt')), false);
});

test("papp-write all: any file but Apargon's own", () => {
  const canChange = pappAccess({ ...noPermissions('a'), writeAll: true }, own, kept);
  assert.equal(canChange(at('anywhere', 'x.txt')), true);
  assert.equal(canChange(at('home', '.apargon', '.data', 'papps', 'x.json')), false);
  assert.equal(canChange(at('home', '.apargon', 'other', 'x.txt')), false);
  assert.equal(canChange(path.join(own, 'x.txt')), true);
});
