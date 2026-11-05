import type { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { patternSource } from '../../permissions/patterns.ts';
import { callTrampoline } from '../../shared/channel.ts';
import type { Scope } from './scope.ts';

export function fileApi(dir: string, { where, canSee, canList, canChange, need, picked, loaded }: Scope, win: BrowserWindow) {
  const watchers = new Map<string, fs.FSWatcher>();

  const needChangeAll = (file: string) => {
    need(canChange(file), 'change');

    if (fs.lstatSync(file).isDirectory()) {
      fs.readdirSync(file).forEach(name => needChangeAll(path.join(file, name)));
    }
  };

  const visibleStats = (file: string, stats: fs.Stats) => {
    const kind = { isFile: stats.isFile(), isDirectory: stats.isDirectory() };

    return canSee(file) ? { ...kind, size: stats.size, mtimeMs: stats.mtimeMs } : kind;
  };

  return {
    // Any other key could be a Node option passed through. A string, as Node takes the encoding, is refused too: it spreads into keys 0, 1, ….
    async readFile(file: string, options: { encoding?: BufferEncoding | null; offset?: number; length?: number } = {}) {
      const { encoding = 'utf8', offset = 0, length, ...rest } = options;

      if (Object.keys(rest).length) {
        throw new Error('Apargon: readFile takes the options encoding, offset and length, as in readFile(path, { encoding: null }) for bytes.');
      } else if (encoding !== null && !Buffer.isEncoding(encoding)) {
        throw new Error('Apargon: readFile takes an encoding name, or null for bytes.');
      }

      const target = where(file);
      need(canSee(target), 'see');

      if (offset === 0 && length === undefined) {
        return fs.promises.readFile(target, encoding);
      }

      const handle = await fs.promises.open(target);

      try {
        const { size } = await handle.stat();
        const { bytesRead, buffer } = await handle.read(Buffer.alloc(Math.max(0, Math.min(length ?? size, size - offset))), 0, undefined, offset);
        const bytes = buffer.subarray(0, bytesRead);

        return encoding === null ? bytes : bytes.toString(encoding);
      } finally {
        await handle.close();
      }
    },
    writeFile(file: string, data: string | Uint8Array) {
      const target = where(file);
      need(canChange(target), 'change');

      return fs.promises.writeFile(target, data);
    },
    appendFile(file: string, data: string | Uint8Array) {
      const target = where(file);
      need(canChange(target), 'change');

      return fs.promises.appendFile(target, data);
    },
    async copyFile(from: string, to: string) {
      const [source, destination] = [where(from), where(to)];
      need(canSee(source), 'see');
      need(canChange(destination), 'change');

      // Only the bytes: a copied mode could make the page a program to run.
      await pipeline(fs.createReadStream(source), fs.createWriteStream(destination));
    },
    async readdir(file: string, { stats = false }: { stats?: boolean } = {}) {
      const target = where(file);
      need(canList(target), 'see');
      const names = (await fs.promises.readdir(target)).filter(name => canList(path.join(target, name)));

      // A link is described as itself, not where it leads, which the page may not see.
      return stats ? names.map(name => ({ name, ...visibleStats(path.join(target, name), fs.lstatSync(path.join(target, name))) })) : names;
    },
    stat(file: string) {
      const target = where(file);
      need(canList(target), 'see');

      return visibleStats(target, fs.statSync(target));
    },
    exists(file: string) {
      const target = where(file);
      need(canList(target), 'see');

      return fs.existsSync(target);
    },
    mkdir(file: string) {
      const target = where(file);
      // Before looking: a folder that exists would otherwise pass unchecked, and tell the page it is there.
      need(canChange(target), 'change');

      for (let created = path.dirname(target); !fs.existsSync(created); created = path.dirname(created)) {
        need(canChange(created), 'change');
      }

      fs.mkdirSync(target, { recursive: true });
    },
    // A folder only with recursive, as in Node, which refuses one without it.
    rm(file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = where(file);

      if (recursive) {
        needChangeAll(target);
      } else {
        need(canChange(target), 'change');
      }

      fs.rmSync(target, { recursive });
    },
    rename(from: string, to: string) {
      const [source, destination] = [where(from), where(to)];
      needChangeAll(source);
      need(canChange(destination), 'change');

      fs.renameSync(source, destination);
    },
    watch(id: string, file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = where(file);
      need(canList(target), 'see');
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      const watcher = fs.watch(watched, { recursive: isFolder && recursive }, (_event, name) => {
        const file = name && path.join(watched, name);

        if (file && (isFolder ? canList(file) : file === target)) {
          win.webContents.send('apargon-change', id, path.relative(dir, file).replaceAll(path.sep, '/'), fs.existsSync(file) ? 'changed' : 'removed');
        }
      });
      // A recursive watch can fail on a new subfolder, or when the system runs out of watches; it then stops, and the page's closed says why.
      watcher.on('error', err => {
        watcher.close();
        watchers.delete(id);
        win.webContents.send('apargon-unwatched', id, err.message);
      });
      watchers.set(id, watcher);
    },
    unwatch(id: string) {
      watchers.get(id)?.close();
      watchers.delete(id);
    },
    // The trampoline shows the dialog and keeps the pick: this process may not write beside the approvals. A pick with write comes back once the sandbox is built again.
    async pick({ folder = false, multiple = false, write = false }: { folder?: boolean; multiple?: boolean; write?: boolean } = {}) {
      const stillLoaded = loaded();
      const paths = await callTrampoline('pick', { folder: Boolean(folder), multiple: Boolean(multiple), write: Boolean(write) });

      // A reload while the dialog was open: the page that asked is gone.
      if (stillLoaded()) {
        picked.push(...paths.map(file => new RegExp(patternSource(file, folder))));
      }

      return paths;
    },
    // The trampoline keeps the picks, beside the approvals.
    given() {
      return callTrampoline('given');
    },
    reset() {
      watchers.forEach(watcher => watcher.close());
      watchers.clear();
    },
  };
}
