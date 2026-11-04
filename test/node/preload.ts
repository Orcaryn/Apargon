import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

// A page outside Apargon's folder finds @electron/remote only through the paths node-preload.cjs adds.
const page = { paths: [] as string[] };
Object.assign(globalThis, { module: page });
createRequire(import.meta.url)('../../src/page/api/preload/node-preload.cjs');
const found = page.paths.some(folder => fs.existsSync(path.join(folder, '@electron', 'remote')));

console.log(found ? 'preload: ok, a papp-system page finds @electron/remote' : `preload: FAIL, no @electron/remote in ${page.paths.join(', ')}`);
process.exit(found ? 0 : 1);
