// The popup's colours follow the folder, not how its name was typed. macOS paths ignore
// case: ~/LIBRARY is ~/Library and must be red. A line break or invisible mark in a value
// could pass for a permission of its own, so it stops the page. Changing pages is red: an
// approved one could be rewritten. A page from elsewhere gets one sentence for what its lines
// allow together. A variable named like a secret is red, a folder of keys or logins says what it
// holds, and a variable with no program to take it stops the page. A socket is red and must exist.
// Exits 1 if a check fails.
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { describe, worstCase } from '../src/permissions/describe.ts';
import { declaredPermissions } from '../src/permissions/tags.ts';

if (process.platform !== 'darwin') {
  console.log('popup: skipped, macOS only');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'papp-popup-'));
const page = path.join(dir, 'case.papp');
fs.writeFileSync(page, '<meta name="papp-write" content="~/LIBRARY">\n<meta name="papp-write" content="~/DOCUMENTS">\n<meta name="papp-write" content="./*.papp">\n');
const lines = describe(declaredPermissions(page)).filter(line => line.id.startsWith('write:'));

fs.mkdirSync(path.join(dir, 'data'));
const listener = net.createServer().listen(path.join(dir, 'data', 'a.sock')); // a real socket for papp-socket to find
const refusals = [
  { tag: '<meta name="papp-write" content="./data/*x\n•  See files in ./data.">', reason: 'invisible character' },
  { tag: '<meta name="papp-run" content="/bin/ls\n•  Nothing else.">', reason: 'invisible character' },
  { tag: '<meta name="papp-read" content="./data/*\u202Etxt">', reason: 'invisible character' },
  { tag: '<meta name="papp-env" content="AWS_PROFILE">', reason: 'Add papp-run' },
  { tag: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="AWS_*">', reason: 'Bad papp-env value' },
  { tag: '<meta name="papp-socket" content="./data/*.sock">', reason: 'no wildcards' },
  { tag: '<meta name="papp-socket" content="./data/missing.sock">', reason: 'does not exist' },
  { tag: '<meta name="papp-socket" content="./case.papp">', reason: 'not a socket' },
  { tag: '<meta name="papp-read" content="./data" data-x="a​b">', reason: 'invisible character' },
  { tag: '<meta name="papp-read" content=./data>', reason: 'quoted name and content' },
  { tag: '<meta name=papp-read content="./data">', reason: 'quoted name and content' },
].map(({ tag, reason }) => {
  fs.writeFileSync(page, tag);

  try {
    declaredPermissions(page);

    return { tag, refused: false };
  } catch (err) {
    return { tag, refused: (err as Error).message.includes(reason) };
  }
});
const worst = [
  { tags: '', expected: null },
  { tags: '<meta name="papp-read" content="./data">', expected: null },
  { tags: '<meta name="papp-net" content="api.github.com:443">\n<meta name="papp-net" content="api.github.com:80">', expected: 'It can send the files it sees to api.github.com.' },
  { tags: '<meta name="papp-net" content="*">', expected: 'It can send the files it sees to any server.' },
  { tags: '<meta name="papp-run" content="/bin/ls">', expected: 'It can run programs that see all your files. Through other apps, they may send them anywhere.' },
  { tags: '<meta name="papp-node" content="full">', expected: 'It can do anything you can, including sending your files anywhere.' },
  { tags: '<meta name="papp-socket" content="./data">', expected: 'It can talk to other programs on this computer. Through them, it may send the files it sees anywhere.' },
].map(({ tags, expected }) => {
  fs.writeFileSync(page, tags);

  return { tags, expected, said: worstCase(declaredPermissions(page)) };
});
const secrets = [
  { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="OPENAI_API_KEY">', kind: 'env:', level: 'red', says: '' },
  { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="AWS_PROFILE">', kind: 'env:', level: 'plain', says: '' },
  { tags: '<meta name="papp-read" content="~/.netrc">', kind: 'read:', level: 'red', says: 'saved server passwords' }, // red as hidden too; it must say what it holds
  { tags: '<meta name="papp-socket" content="./data/a.sock">', kind: 'socket:', level: 'red', says: 'act as you' },
].map(({ tags, kind, level, says }) => {
  fs.writeFileSync(page, tags);
  const line = describe(declaredPermissions(page)).find(line => line.id.startsWith(kind))!;

  return { tags, ok: line.level === level && line.text.includes(says), said: `${line.level}: ${line.text}` };
});
// The tags come back as written, on one line each, for the popup's folded view.
fs.writeFileSync(page, '<meta\n  name="papp-read"\n  content="./data">\n<meta charset="utf-8">');
const written = declaredPermissions(page).tags;
const tagsAsWritten = written.length === 1 && written[0] === '<meta name="papp-read" content="./data">';
// Only the head before any script counts, outside comments; a " value may hold a '.
fs.mkdirSync(path.join(dir, "Jon's notes"));
fs.writeFileSync(
  page,
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<!-- <meta name="papp-net" content="*"> -->',
    '<meta name="papp-read" content="./Jon\'s notes">',
    '<script>const tpl = `<meta name="papp-node" content="full">`;</script>',
    '</head><body><meta name="papp-write" content="./data"></body></html>',
  ].join('\n')
);
const head = declaredPermissions(page);
const headOnly = head.tags.length === 1 && head.read[0].endsWith("/Jon's notes") && !head.net.length && !head.write.length && !head.node;
listener.close();
fs.rmSync(dir, { recursive: true });

for (const line of lines) {
  console.log(`${line.level === 'red' ? 'ok  ' : 'FAIL'} popup ${line.text}`);
}

for (const { tag, refused } of refusals) {
  console.log(`${refused ? 'ok  ' : 'FAIL'} popup refuses ${JSON.stringify(tag)}`);
}

for (const { tags, expected, said } of worst) {
  console.log(`${said === expected ? 'ok  ' : 'FAIL'} popup worst case for ${JSON.stringify(tags)}: ${said}`);
}

for (const { tags, ok, said } of secrets) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} popup for ${JSON.stringify(tags)}: ${said}`);
}

console.log(`${tagsAsWritten ? 'ok  ' : 'FAIL'} popup shows the tags as written: ${JSON.stringify(written)}`);
console.log(`${headOnly ? 'ok  ' : 'FAIL'} popup reads the head before any script, outside comments: ${JSON.stringify(head.tags)}`);

process.exit(
  (
    lines.every(line => line.level === 'red') &&
      refusals.every(({ refused }) => refused) &&
      worst.every(({ expected, said }) => said === expected) &&
      secrets.every(({ ok }) => ok) &&
      tagsAsWritten &&
      headOnly
  ) ?
    0
  : 1
);
