import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// Path to a hash of the page's content, as last opened or closed.
type Seen = Record<string, string>;

// A page that opens from a new path with the exact content of a page whose file is gone was moved: its storage, Electron's partition `persist:<hash of the path>`, moves with it. Same content is the same page, so no other page can take the data this way. Returns where it moved from, or null.
export function followMove(page: string, pageData: string, seenFile: string, running: string[]): string | null {
  const seen: Seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : {};
  const content = createHash('sha256').update(fs.readFileSync(page)).digest('hex');
  const old = Object.keys(seen).find(file => seen[file] === content && !fs.existsSync(file) && fs.existsSync(storageOf(pageData, file)));

  if (!old || fs.existsSync(storageOf(pageData, page))) {
    return null;
  } else if (running.includes(old)) {
    throw new Error(`This page is still open from where it was, ${old}. Close that window, then open the page again to keep its data.`);
  }

  fs.renameSync(storageOf(pageData, old), storageOf(pageData, page));

  return old;
}

// On open and on close: a page edited while open, then moved, still matches. A page whose file and storage are both gone has nothing left to follow, and is forgotten.
export function noteContent(page: string, pageData: string, seenFile: string) {
  if (!fs.existsSync(page)) {
    return;
  }

  const seen: Seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : {};
  seen[page] = createHash('sha256').update(fs.readFileSync(page)).digest('hex');
  const kept = Object.entries(seen).filter(([file]) => fs.existsSync(file) || fs.existsSync(storageOf(pageData, file)));
  fs.writeFileSync(`${seenFile}.tmp`, JSON.stringify(Object.fromEntries(kept), null, 2) + '\n');
  fs.renameSync(`${seenFile}.tmp`, seenFile);
}

function storageOf(pageData: string, page: string) {
  return path.join(pageData, 'Partitions', createHash('sha256').update(page).digest('hex'));
}
