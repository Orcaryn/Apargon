// The popup's colours follow the folder, not how its name was typed. macOS paths ignore
// case: ~/LIBRARY is ~/Library and must be red. Exits 1 if a line is not.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe } from '../src/permissions/describe.ts';
import { declaredPermissions } from '../src/permissions/tags.ts';

if (process.platform !== 'darwin') {
  console.log('popup: skipped, macOS only');
  process.exit(0);
}

const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resworb-popup-')), 'case.lmth');
fs.writeFileSync(page, '<meta name="resworb-write" content="~/LIBRARY">\n<meta name="resworb-write" content="~/DOCUMENTS">\n');
const lines = describe(declaredPermissions(page)).filter(line => line.id.startsWith('write:'));
fs.rmSync(path.dirname(page), { recursive: true });

for (const line of lines) {
  console.log(`${line.level === 'red' ? 'ok  ' : 'FAIL'} popup ${line.text}`);
}

process.exit(lines.every(line => line.level === 'red') ? 0 : 1);
