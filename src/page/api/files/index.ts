import type { BrowserWindow } from 'electron';
import fs from 'fs';
import { once } from 'events';
import path from 'path';
import { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import { pipeline } from 'stream/promises';
import type { Pick } from '../../../shared/wire/protocol/index.ts';
import { callTrampoline, trampolineBytes } from '../../channel/index.ts';
import { PAGE_PLATFORM } from '../../platform/index.ts';
import type { Scope } from '../scope/index.ts';

// picks: the user's picks, as the trampoline last sent them.
export function fileApi(dir: string, { where, entry, canChange, needChange }: Scope, win: BrowserWindow, picks: () => Pick[]) {
  const watchers = new Map<string, fs.FSWatcher>();
  // Apargon writes where the user picked: a picked file, or a plain name in a picked folder. The .papp file may not write there itself.
  const picked = (file: string) => !canChange(file) && picks().some(pick => pick.write && (pick.folder ? path.dirname(file) === pick.path : pick.path === file));

  // data: the bytes as they come. Neither this process nor the trampoline holds the file whole.
  const write = async (file: string, data: Readable, append: boolean) => {
    const target = where(file);

    if (picked(target)) {
      return callTrampoline('writePicked', { file: target, data: trampolineBytes.send(data), append });
    }

    needChange(target);
    const fresh = !fs.existsSync(target);
    await pipeline(data, fs.createWriteStream(target, { flags: append ? 'a' : 'w' }));

    if (fresh) {
      PAGE_PLATFORM.markWritten?.(target);
    }
  };

  // The file's bytes as a stream, which closes the file. Any other key could be a Node option passed through.
  const openBytes = async (file: string, { encoding = 'utf8', offset = 0, length, ...rest }: { encoding?: BufferEncoding | null; offset?: number; length?: number } = {}) => {
    if (Object.keys(rest).length) {
      throw new Error('Apargon: readFile takes the options encoding, offset and length, as in readFile(path, { encoding: null }) for bytes.');
    } else if (encoding !== null && !Buffer.isEncoding(encoding)) {
      throw new Error('Apargon: readFile takes an encoding name, or null for bytes.');
    }

    const handle = await fs.promises.open(where(file));
    const { size } = await handle.stat();
    const count = Math.max(0, Math.min(length ?? size, size - offset));
    const whole = offset === 0 && length === undefined;

    // Node takes a first and a last byte, so cannot be asked for none.
    if (!whole && count === 0) {
      await handle.close();

      return Readable.from([]);
    }

    // Whole, it is read to its end, whatever size it claims: a file the system makes up as it is read claims none.
    const bytes = handle.createReadStream(whole ? {} : { start: offset, end: offset + count - 1 });
    // What cannot be read at all, as a folder, fails here with its own error, not later as a stream cut short.
    await once(bytes, 'readable');

    return bytes;
  };

  return {
    // Text comes whole, as a string is wherever it is held.
    readFile: async (file: string, options?: { encoding?: BufferEncoding; offset?: number; length?: number }) => (await buffer(await openBytes(file, options))).toString(options?.encoding),
    // Bytes go to the window as a stream.
    readBytes: openBytes,
    writeFile: (data: Readable, file: string) => write(file, data, false),
    appendFile: (data: Readable, file: string) => write(file, data, true),
    async copyFile(from: string, to: string) {
      const [source, destination] = [where(from), where(to)];

      if (picked(destination)) {
        const bytes = fs.createReadStream(source);

        return write(destination, bytes, false).finally(() => bytes.destroy());
      }

      needChange(destination);
      // As Node's copyFile: onto itself, under any name or a hard link, nothing to do. Opening it to write would empty it before the read.
      const [sourceStats, destinationStats] = [fs.statSync(source, { bigint: true }), fs.statSync(destination, { bigint: true, throwIfNoEntry: false })];

      if (sourceStats.ino === destinationStats?.ino && sourceStats.dev === destinationStats.dev) {
        return;
      }

      // Only the bytes: a copied mode could make the file a program to run.
      await pipeline(fs.createReadStream(source), fs.createWriteStream(destination));
      PAGE_PLATFORM.markWritten?.(destination);
    },
    async readdir(file: string, { stats = false }: { stats?: boolean } = {}) {
      const target = where(file);
      const names = await fs.promises.readdir(target);

      // A link is described as itself, not where it leads.
      return stats ? Promise.all(names.map(name => fs.promises.lstat(path.join(target, name)).then(found => ({ name, isFile: found.isFile(), isDirectory: found.isDirectory(), size: found.size, mtimeMs: found.mtimeMs })))) : names;
    },
    stat(file: string) {
      const stats = fs.statSync(where(file));

      return { isFile: stats.isFile(), isDirectory: stats.isDirectory(), size: stats.size, mtimeMs: stats.mtimeMs };
    },
    // A link that leads nowhere is not there, as in Node.
    exists: (file: string) => fs.existsSync(entry(file)),
    mkdir(file: string) {
      const target = where(file);
      needChange(target);
      fs.mkdirSync(target, { recursive: true });
    },
    // A folder only with recursive, as in Node.
    rm(file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = entry(file);
      needChange(target);
      fs.rmSync(target, { recursive });
    },
    // To the user's Trash, where they can bring it back. The trampoline moves it: the sandbox may not write there.
    trash(file: string) {
      const target = entry(file);
      needChange(target);

      return callTrampoline('trash', { file: target });
    },
    rename(from: string, to: string) {
      const [source, destination] = [entry(from), entry(to)];
      needChange(source);
      needChange(destination);
      fs.renameSync(source, destination);
    },
    watch(id: string, file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = where(file);
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      const watcher = fs.watch(watched, { recursive: isFolder && recursive }, (_event, name) => {
        const changed = name && path.join(watched, name);

        if (changed && (isFolder || changed === target)) {
          win.webContents.send('apargon-change', id, path.relative(dir, changed).replaceAll(path.sep, '/'), fs.existsSync(changed) ? 'changed' : 'removed');
        }
      });
      // A recursive watch can fail on a new subfolder, or when the system runs out of watches. It then stops, and the .papp file's closed says why.
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
    // The trampoline shows the dialog and writes: the sandbox may not write where the user picks.
    // body: every file's bytes, one after another. Each file takes its size of them as the trampoline writes it, and it writes them in this order.
    saveAll(body: Readable, files: { name: string; size: number }[]) {
      const chunks = (body as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
      let chunk: Buffer = Buffer.alloc(0);
      const parts = files.map(({ size }) =>
        Readable.from(
          (async function* () {
            for (let left = size; left > 0; ) {
              if (!chunk.length) {
                chunk = (await chunks.next()).value as Buffer;
              }

              const piece = chunk.subarray(0, left);
              chunk = chunk.subarray(piece.length);
              left -= piece.length;
              yield piece;
            }
          })(),
          { objectMode: false }
        )
      );

      return callTrampoline('saveAll', { files: files.map(({ name }, index) => ({ name, data: trampolineBytes.send(parts[index]) })) }).finally(() => parts.forEach(part => part.destroy()));
    },
    // A suggestion is only a name. The file the user picks is kept as a pick to write.
    save(body: Readable, file: string) {
      return callTrampoline('save', { file, data: trampolineBytes.send(body) });
    },
    // The user picks in Apargon's dialog. Nothing restarts.
    pick({ folder = false, multiple = false, write: writable = false }: { folder?: boolean; multiple?: boolean; write?: boolean } = {}) {
      return callTrampoline('pick', { folder, multiple, write: writable });
    },
    picks,
    reset() {
      watchers.forEach(watcher => watcher.close());
      watchers.clear();
    },
  };
}
