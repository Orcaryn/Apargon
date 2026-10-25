// The popup's colours follow the folder, not how its name was typed. macOS paths ignore
// case: ~/LIBRARY is ~/Library and must be red. A line break or invisible mark in a value
// could pass for a permission of its own, so it stops the page. A page from elsewhere gets one
// sentence for what its lines allow together. Exits 1 if a check fails.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, worstCase } from '../src/permissions/describe.ts';
import { declaredPermissions } from '../src/permissions/tags.ts';

if (process.platform !== 'darwin') {
  console.log('popup: skipped, macOS only');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resworb-popup-'));
const page = path.join(dir, 'case.lmth');
fs.writeFileSync(page, '<meta name="resworb-write" content="~/LIBRARY">\n<meta name="resworb-write" content="~/DOCUMENTS">\n');
const lines = describe(declaredPermissions(page)).filter(line => line.id.startsWith('write:'));

fs.mkdirSync(path.join(dir, 'data'));
const invisible = [
  '<meta name="resworb-write" content="./data/*x\n•  See files in ./data.">',
  '<meta name="resworb-run" content="/bin/ls\n•  Nothing else.">',
  '<meta name="resworb-read" content="./data/*\u202Etxt">',
].map(tag => {
  fs.writeFileSync(page, tag);

  try {
    declaredPermissions(page);

    return { tag, refused: false };
  } catch (err) {
    return { tag, refused: (err as Error).message.includes('invisible character') };
  }
});
const worst = [
  { tags: '', expected: null },
  { tags: '<meta name="resworb-read" content="./data">', expected: null },
  {
    tags: '<meta name="resworb-net" content="api.github.com:443">\n<meta name="resworb-net" content="api.github.com:80">',
    expected: 'It can send the files it sees to api.github.com.',
  },
  { tags: '<meta name="resworb-net" content="*">', expected: 'It can send the files it sees to any server.' },
  { tags: '<meta name="resworb-run" content="/bin/ls">', expected: 'It can run programs that see all your files. Through other apps, they may send them anywhere.' },
  { tags: '<meta name="resworb-node" content="full">', expected: 'It can do anything you can, including sending your files anywhere.' },
].map(({ tags, expected }) => {
  fs.writeFileSync(page, tags);

  return { tags, expected, said: worstCase(declaredPermissions(page)) };
});
fs.rmSync(dir, { recursive: true });

for (const line of lines) {
  console.log(`${line.level === 'red' ? 'ok  ' : 'FAIL'} popup ${line.text}`);
}

for (const { tag, refused } of invisible) {
  console.log(`${refused ? 'ok  ' : 'FAIL'} popup refuses ${JSON.stringify(tag)}`);
}

for (const { tags, expected, said } of worst) {
  console.log(`${said === expected ? 'ok  ' : 'FAIL'} popup worst case for ${JSON.stringify(tags)}: ${said}`);
}

process.exit(lines.every(line => line.level === 'red') && invisible.every(({ refused }) => refused) && worst.every(({ expected, said }) => said === expected) ? 0 : 1);
