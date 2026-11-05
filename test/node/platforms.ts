import assert from 'node:assert/strict';
import fs from 'fs';
import { test } from 'node:test';
import path from 'path';

test('only platform.ts asks which OS this is', () => {
  const src = path.join(import.meta.dirname, '..', '..', 'src');
  const asks = fs
    .readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(ts|cjs)$/.test(file) && path.basename(file) !== 'platform.ts')
    .flatMap(file =>
      fs
        .readFileSync(path.join(src, file), 'utf8')
        .split('\n')
        .map((line, i) => `src/${file}:${i + 1}: ${line.trim()}`)
    )
    // Naming the OS, as in ${process.platform}, is not asking which it is.
    .filter(line => /process\.platform(?!\})/.test(line));
  assert.deepEqual(asks, []);
});
