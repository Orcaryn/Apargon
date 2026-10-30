import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// Path to a hash of the page's content, as last opened or closed.
type Seen = Record<string, string>;

// A page that opens from a new path with the exact content of a page whose file is gone was moved: its storage, Electron's partition `persist:<hash of the path>`, moves with it. Same content is the same page, so no other page can take the data this way. Without Electron, so test/moved.ts can run it.
export function followMove(page: string, pageData: string, seenFile: string, running: string[]) {
  const seen: Seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : {};
  const content = createHash('sha256').update(fs.readFileSync(page)).digest('hex');
  const storage = (file: string) => path.join(pageData, 'Partitions', createHash('sha256').update(file).digest('hex'));
  const old = Object.keys(seen).find(file => seen[file] === content && !fs.existsSync(file) && fs.existsSync(storage(file)));

  if (!old || fs.existsSync(storage(page))) {
    return;
  } else if (running.includes(old)) {
    throw new Error(`This page is still open from where it was, ${old}. Close that window, then open the page again to keep its data.`);
  }

  fs.renameSync(storage(old), storage(page));
}

// On open and on close: a page edited while open, then moved, still matches.
export function noteContent(page: string, seenFile: string) {
  if (!fs.existsSync(page)) {
    return;
  }

  const seen: Seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : {};
  seen[page] = createHash('sha256').update(fs.readFileSync(page)).digest('hex');
  fs.writeFileSync(`${seenFile}.tmp`, JSON.stringify(seen, null, 2) + '\n');
  fs.renameSync(`${seenFile}.tmp`, seenFile);
}
