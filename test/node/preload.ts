import assert from 'node:assert/strict';
import fs from 'fs';
import { createRequire } from 'module';
import { test } from 'node:test';
import path from 'path';

// A page outside Apargon's folder finds @electron/remote only through the paths node-preload.cjs adds.
test('a papp-system page finds @electron/remote', () => {
  const page = { paths: [] as string[] };
  Object.assign(globalThis, { module: page });
  createRequire(import.meta.url)('../../src/page/api/preload/node-preload.cjs');
  assert.ok(
    page.paths.some(folder => fs.existsSync(path.join(folder, '@electron', 'remote'))),
    `no @electron/remote in ${page.paths.join(', ')}`
  );
});
