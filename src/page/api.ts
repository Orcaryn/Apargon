import { dialog, type BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import path from 'path';
import { patternSource } from '../permissions/patterns.ts';
import { absolutePath, HOME, PROGRAM_ENV, type Permissions } from '../permissions/tags.ts';
import { realPath, tellTrampoline } from '../shared.ts';
import type { pageAccess } from './access.ts';
import { PAGE_PLATFORM } from './platform.ts';

export function pageApi(dir: string, permissions: Permissions, access: ReturnType<typeof pageAccess>, win: BrowserWindow, toFront: () => void, saveAs: (files: Record<string, string | Uint8Array>) => Promise<string[]>) {
  const watchers = new Map<string, fs.FSWatcher>();
  const jobs = new Map<string, ChildProcessWithoutNullStreams>();
  const runs = new Set<ChildProcessWithoutNullStreams>();
  // What the user picked in this window's dialog, until the page reloads.
  const picked: RegExp[] = [];
  let resets = 0;
  const canSee = (file: string) => access.canSee(file) || (picked.some(pattern => pattern.test(file)) && !access.isSecret(file));
  const canList = (file: string) => access.canList(file) || canSee(file);
  const { canChange } = access;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => PROGRAM_ENV.includes(name) || permissions.env.includes(name)));
  const where = (file: string) => realPath(absolutePath(file, dir));

  const need = (allowed: boolean, file: string, verb: 'see' | 'change') => {
    if (!allowed) {
      const tag = verb === 'see' ? 'papp-read' : 'papp-write';

      throw new Error(`Apargon: this page may not ${verb} ${file}. Ask for it with <meta name="${tag}" content="...">.`);
    }
  };

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

  const startProgram = (name: string, args: string[], cwd = '.', detached = false) => {
    if (!Object.hasOwn(permissions.run, name)) {
      throw new Error(`Apargon: this page may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
    } else if (!Array.isArray(args)) {
      throw new Error('Apargon: a program takes its arguments as an array.');
    }

    const folder = where(cwd);
    need(canList(folder), folder, 'see');

    return spawn(permissions.run[name], args, { cwd: folder, env, detached });
  };

  const killGroup = (child: ChildProcessWithoutNullStreams) => {
    try {
      process.kill(-child.pid!);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw err;
      }
    }
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
      await fs.promises.writeFile(destination, await fs.promises.readFile(source));
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
    async run(name: string, args: string[] = [], { cwd, input, encoding = 'utf8', timeout }: { cwd?: string; input?: string | Uint8Array; encoding?: 'utf8' | null; timeout?: number } = {}) {
      const child = startProgram(name, args, cwd, true);
      await once(child, 'spawn');
      runs.add(child);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      const timer = timeout && setTimeout(() => killGroup(child), timeout);

      return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (status, signal) => {
          clearTimeout(timer);
          runs.delete(child);
          resolve({
            status,
            signal,
            stdout: encoding === null ? Buffer.concat(stdout) : Buffer.concat(stdout).toString(),
            stderr: encoding === null ? Buffer.concat(stderr) : Buffer.concat(stderr).toString(),
          });
        });
      });
    },
    async spawn(id: string, name: string, args: string[] = [], options: { cwd?: string } = {}) {
      const child = startProgram(name, args, options.cwd, true);
      await once(child, 'spawn');
      jobs.set(id, child);

      for (const stream of ['stdout', 'stderr'] as const) {
        child[stream].setEncoding('utf8').on('data', text => {
          if (jobs.has(id)) {
            win.webContents.send('apargon-output', id, stream, text);
          }
        });
      }

      child.stdin.on('error', () => {});
      child.on('close', (status, signal) => {
        if (jobs.delete(id)) {
          win.webContents.send('apargon-exit', id, { status, signal });
        }
      });
    },
    write(id: string, data: string | Uint8Array) {
      jobs.get(id)?.stdin.write(data);
    },
    endInput(id: string) {
      jobs.get(id)?.stdin.end();
    },
    kill(id: string) {
      const child = jobs.get(id);

      if (child) {
        killGroup(child);
      }
    },
    watch(id: string, file: string, { recursive = false }: { recursive?: boolean } = {}) {
      const target = where(file);
      need(canList(target), target, 'see');
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      const watcher = fs.watch(watched, { recursive: isFolder && recursive }, (_event, name) => {
        const file = name && path.join(watched, name);

        if (file && (isFolder ? canList(file) : file === target)) {
          win.webContents.send('apargon-change', id, path.relative(dir, file), fs.existsSync(file) ? 'changed' : 'removed');
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
    async pick({ folder = false, multiple = false }: { folder?: boolean; multiple?: boolean } = {}) {
      const resetsBefore = resets;
      const { filePaths } = await dialog.showOpenDialog(win, { properties: [folder ? 'openDirectory' : 'openFile', 'noResolveAliases', ...(multiple ? ['multiSelections' as const] : [])] });
      // A link the page planted could lead the user to a file they did not mean.
      const linked = filePaths.find(file => realPath(file) !== file);
      // patternSource reads * as a wildcard.
      const starred = filePaths.find(file => file.includes('*'));
      const holdsHome = folder && filePaths.find(file => !path.relative(file, HOME).startsWith('..'));

      if (resets !== resetsBefore) {
        return [];
      } else if (linked) {
        throw new Error(`Apargon: ${linked} goes through a link. Pick what it leads to instead.`);
      } else if (starred) {
        throw new Error(`Apargon: a picked name may not hold *: ${starred}.`);
      } else if (holdsHome) {
        throw new Error(`Apargon: ${holdsHome} holds your whole home folder. Pick a folder inside it.`);
      }

      picked.push(...filePaths.map(file => new RegExp(patternSource(file, folder))));

      return filePaths;
    },
    saveAs,
    notify(title: string, body = '') {
      if (!permissions.use.includes('notifications')) {
        throw new Error('Apargon: this page may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
      }

      PAGE_PLATFORM!.notify({ title: String(title), body: String(body) }, toFront);
    },
    tray(title: string | null) {
      tellTrampoline({ tray: title === null ? null : String(title).slice(0, 24) });
    },
    reset() {
      watchers.forEach(watcher => watcher.close());
      watchers.clear();
      jobs.forEach(killGroup);
      jobs.clear();
      runs.forEach(killGroup);
      runs.clear();
      picked.length = 0;
      resets++;
    },
  };
}
