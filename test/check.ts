// Every check a selftest page records must be true. Prints the results, exits 1 if one is not.
import fs from 'fs';
import path from 'path';

const checks = ['result.json', 'result-node.json', 'result-net.json'].flatMap(name => {
  const file = path.join(import.meta.dirname, name);
  const result: Record<string, unknown> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { written: false };

  return Object.entries(result).map(([check, value]) => ({ name, check, value }));
});

checks.forEach(({ name, check, value }) => console.log(`${value === true ? 'ok  ' : 'FAIL'} ${name} ${check}${value === true ? '' : ` = ${JSON.stringify(value)}`}`));
process.exit(checks.every(({ value }) => value === true) ? 0 : 1);
