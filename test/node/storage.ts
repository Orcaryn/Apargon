import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { followMove, noteContent } from '../../src/trampoline/storage.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-moved-'));
const pageData = path.join(root, 'data');
const seenFile = path.join(root, 'seen.json');

function setUp(content: string) {
  const dir = path.join(root, content);
  fs.mkdirSync(dir);
  const [old, moved] = [path.join(dir, 'old.papp'), path.join(dir, 'new.papp')];
  fs.writeFileSync(old, content);
  noteContent(old, pageData, seenFile);
  fs.mkdirSync(storage(old), { recursive: true });
  fs.writeFileSync(path.join(storage(old), 'data'), 'kept');

  return { old, moved };
}

function storage(page: string) {
  return path.join(pageData, 'Partitions', createHash('sha256').update(page).digest('hex'));
}

const has = (page: string) => fs.existsSync(path.join(storage(page), 'data'));
const cases: [string, () => boolean][] = [
  [
    'moved: the data follows',
    () => {
      const { old, moved } = setUp('a');
      fs.renameSync(old, moved);
      followMove(moved, pageData, seenFile, []);

      return has(moved) && !has(old);
    },
  ],
  [
    'copied: the old file is there, the copy starts empty',
    () => {
      const { old, moved } = setUp('b');
      fs.copyFileSync(old, moved);
      followMove(moved, pageData, seenFile, []);

      return has(old) && !has(moved);
    },
  ],
  [
    'other content: no match',
    () => {
      const { old, moved } = setUp('c');
      fs.rmSync(old);
      fs.writeFileSync(moved, 'c, changed');
      followMove(moved, pageData, seenFile, []);

      return has(old) && !has(moved);
    },
  ],
  [
    'edited while open, then moved: the close notes it',
    () => {
      const { old, moved } = setUp('d');
      fs.writeFileSync(old, 'd, edited');
      noteContent(old, pageData, seenFile);
      fs.renameSync(old, moved);
      followMove(moved, pageData, seenFile, []);

      return has(moved);
    },
  ],
  [
    'the old window still open: refused, the data stays',
    () => {
      const { old, moved } = setUp('e');
      fs.renameSync(old, moved);

      try {
        followMove(moved, pageData, seenFile, [old]);

        return false;
      } catch {
        return has(old) && !has(moved);
      }
    },
  ],
  [
    'the new path has data of its own: kept',
    () => {
      const { old, moved } = setUp('f');
      fs.renameSync(old, moved);
      fs.mkdirSync(storage(moved), { recursive: true });
      followMove(moved, pageData, seenFile, []);

      return has(old) && !has(moved);
    },
  ],
  [
    'forgotten only when file and data are both gone',
    () => {
      const gone = setUp('g');
      const movedAway = setUp('h');
      fs.rmSync(gone.old);
      fs.rmSync(storage(gone.old), { recursive: true });
      fs.renameSync(movedAway.old, movedAway.moved);
      noteContent(movedAway.moved, pageData, seenFile);
      const seen: Record<string, string> = JSON.parse(fs.readFileSync(seenFile, 'utf8'));

      return !(gone.old in seen) && movedAway.old in seen && movedAway.moved in seen;
    },
  ],
];
const failed = cases.filter(([, run]) => !run()).map(([name]) => name);
fs.rmSync(root, { recursive: true });
console.log(failed.length ? `storage: FAIL, ${failed.join('; ')}` : `storage: ok, ${cases.length} cases`);
process.exit(failed.length ? 1 : 0);
