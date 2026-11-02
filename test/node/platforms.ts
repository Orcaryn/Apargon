import fs from 'fs';
import path from 'path';

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
  // Naming the OS, as in ${process.platform}, is not asking which it is.
  .filter(({ line }) => /process\.platform(?!\})/.test(line));

asks.forEach(({ where, line }) => console.log(`FAIL ${where}: ${line.trim()}`));
console.log(asks.length ? `platforms: FAIL, ${asks.length} lines ask which OS this is outside platform.ts` : 'platforms: ok, only platform.ts asks which OS this is');
process.exit(asks.length ? 1 : 0);
