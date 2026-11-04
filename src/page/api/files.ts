import type { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { GivenFile } from '../../permissions/given.ts';
import { patternSource } from '../../permissions/patterns.ts';
import { PAGE_CONFIG, type Ask } from '../../shared/channel.ts';
import { GIVEN_FILE, readJson, type Given } from '../../shared/data.ts';
import type { Scope } from './scope.ts';

export function fileApi(dir: string, { where, canSee, canList, canChange, need, picked }: Scope, win: BrowserWindow, ask: Ask) {
  const watchers = new Map<string, fs.FSWatcher>();
  let resets = 0;

  const needChangeAll = (file: string) => {
    need(canChange(file), file, 'change');

    if (fs.lstatSync(file).isDirectory()) {
      fs.readdirSync(file).forEach(name => needChangeAll(path.join(file, name)));
    }
  };

  const visibleStats = (file: string, stats: fs.Stats) => {
    const kind = { isFile: stats.isFile(), isDirectory: stats.isDirectory() };

    return canSee(file) ? { ...kind, size: stats.size, mtimeMs: stats.mtimeMs } : kind;
  };

  return {
    async readFile(file: string, encoding: BufferEncoding | null, range?: { offset?: number; length?: number }) {
      if (encoding !== null && !Buffer.isEncoding(encoding)) {
        throw new Error('Apargon: readFile takes an encoding name, or null for bytes.');
      }

      const target = where(file);
      need(canSee(target), target, 'see');

      if (!range) {
        return fs.promises.readFile(target, encoding);
      }

      const handle = await fs.promises.open(target);

      try {
        const { size } = await handle.stat();
        const { offset = 0, length = size } = range;
        const { bytesRead, buffer } = await handle.read(Buffer.alloc(Math.max(0, Math.min(length, size - offset))), 0, undefined, offset);
        const bytes = buffer.subarray(0, bytesRead);

        return encoding === null ? bytes : bytes.toString(encoding);
      } finally {
        await handle.close();
      }
    },
    writeFile(file: string, data: string | Uint8Array) {
      const target = where(file);
      need(canChange(target), target, 'change');

      return fs.promises.writeFile(target, data);
    },
    appendFile(file: string, data: string | Uint8Array) {
      const target = where(file);
      need(canChange(target), target, 'change');

      return fs.promises.appendFile(target, data);
    },
    async copyFile(from: string, to: string) {
      const [source, destination] = [where(from), where(to)];
      need(canSee(source), source, 'see');
      need(canChange(destination), destination, 'change');

      // Only the bytes: a copied mode could make the page a program to run.
      await pipeline(fs.createReadStream(source), fs.createWriteStream(destination));
    },
    async readdir(file: string, { stats = false }: { stats?: boolean } = {}) {
      const target = where(file);
      need(canList(target), target, 'see');
      const names = (await fs.promises.readdir(target)).filter(name => canList(path.join(target, name)));

      // A link is described as itself, not where it leads, which the page may not see.
      return stats ? names.map(name => ({ name, ...visibleStats(path.join(target, name), fs.lstatSync(path.join(target, name))) })) : names;
    },
    stat(file: string) {
      const target = where(file);
      need(canList(target), target, 'see');

      return visibleStats(target, fs.statSync(target));
    },
    exists(file: string) {
      const target = where(file);
      need(canList(target), target, 'see');

      return fs.existsSync(target);
    },
    mkdir(file: string) {
      const target = where(file);

      for (let created = target; !fs.existsSync(created); created = path.dirname(created)) {
        need(canChange(created), created, 'change');
      }

      fs.mkdirSync(target, { recursive: true });
    },
    rm(file: string) {
      const target = where(file);
      needChangeAll(target);
      fs.rmSync(target, { recursive: true });
    },
    rename(from: string, to: string) {
      const [source, destination] = [where(from), where(to)];
      needChangeAll(source);
      need(canChange(destination), destination, 'change');

      fs.renameSync(source, destination);
    },
    watch(id: string, file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = where(file);
      need(canList(target), target, 'see');
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      const watcher = fs.watch(watched, { recursive: isFolder && recursive }, (_event, name) => {
        const file = name && path.join(watched, name);

        if (file && (isFolder ? canList(file) : file === target)) {
          win.webContents.send('apargon-change', id, path.relative(dir, file).replaceAll(path.sep, '/'), fs.existsSync(file) ? 'changed' : 'removed');
        }
      });
      // A recursive watch can fail on a new subfolder, or when the system runs out of watches; it then stops.
      watcher.on('error', () => watcher.close());
      watchers.set(id, watcher);
    },
    unwatch(id: string) {
      watchers.get(id)?.close();
      watchers.delete(id);
    },
    // The trampoline shows the dialog and keeps the pick: this process may not write beside the approvals. A pick with write comes back once the sandbox is built again.
    async pick({ folder = false, multiple = false, write = false }: { folder?: boolean; multiple?: boolean; write?: boolean } = {}) {
      const resetsBefore = resets;
      const paths = await ask<string[]>(id => ({ pick: { id, folder: Boolean(folder), multiple: Boolean(multiple), write: Boolean(write) } }));

      // A reload while the dialog was open: the page that asked is gone.
      if (resets === resetsBefore) {
        picked.push(...paths.map(file => new RegExp(patternSource(file, folder))));
      }

      return paths;
    },
    given(): GivenFile[] {
      return readJson<Given>(GIVEN_FILE)[PAGE_CONFIG!.page] ?? [];
    },
    reset() {
      watchers.forEach(watcher => watcher.close());
      watchers.clear();
      resets++;
    },
  };
}
