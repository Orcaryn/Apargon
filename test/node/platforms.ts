import fs from 'fs';
import path from 'path';

// What differs by OS lives in each folder's platform/macos.ts, linux.ts and windows.ts, picked in the platform.ts beside it: no other file asks which OS this is. Naming it, as in ${process.platform}, is not asking.
const src = path.join(import.meta.dirname, '..', '..', 'src');
const asks = fs
  .readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter(file => /\.(ts|cjs)$/.test(file) && path.basename(file) !== 'platform.ts')
  .flatMap(file =>
    fs
      .readFileSync(path.join(src, file), 'utf8')
      .split('\n')
      .map((line, i) => ({ where: `src/${file}:${i + 1}`, line }))
  )
  .filter(({ line }) => /process\.platform(?!\})/.test(line));

asks.forEach(({ where, line }) => console.log(`FAIL ${where}: ${line.trim()}`));
console.log(asks.length ? `platforms: FAIL, ${asks.length} lines ask which OS this is outside platform.ts` : 'platforms: ok, only platform.ts asks which OS this is');
process.exit(asks.length ? 1 : 0);
