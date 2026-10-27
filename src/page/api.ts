import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { HOME, PROGRAM_ENV, type Permissions } from '../permissions/tags.ts';
import { realPath, type pageAccess } from './access.ts';

export function pageApi(dir: string, permissions: Permissions, { canSee, canList, canChange }: ReturnType<typeof pageAccess>, notify: (id: string, file: string) => void) {
  const watchers = new Map<string, fs.FSWatcher>();
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => PROGRAM_ENV.includes(name) || permissions.env.includes(name)));
  const where = (file: string) => realPath(path.resolve(dir, file === '~' ? HOME : file.replace(/^~\//, HOME + '/')));

  const need = (allowed: boolean, file: string, verb: 'see' | 'change') => {
    if (!allowed) {
      const tag = verb === 'see' ? 'papp-read' : 'papp-write';

      throw new Error(`papp: this page may not ${verb} ${file}. Ask for it with <meta name="${tag}" content="...">.`);
    }
  };

  const needChangeAll = (file: string) => {
    need(canChange(file), file, 'change');

    if (fs.lstatSync(file).isDirectory()) {
      fs.readdirSync(file).forEach(name => needChangeAll(path.join(file, name)));
    }
  };

  return {
    readFile(file: string, encoding: BufferEncoding | null) {
      // Node would read an object here as options: { flag: 'w' } empties a file the page may only see.
      if (encoding !== null && !Buffer.isEncoding(encoding)) {
        throw new Error('papp: readFile takes an encoding name, or null for bytes.');
      }

      const target = where(file);
      need(canSee(target), target, 'see');

      return encoding === null ? fs.promises.readFile(target) : fs.promises.readFile(target, encoding);
    },
    writeFile(file: string, data: string | Uint8Array) {
      const target = where(file);
      need(canChange(target), target, 'change');

      return fs.promises.writeFile(target, data);
    },
    async readdir(file: string) {
      const target = where(file);
      need(canList(target), target, 'see');

      return (await fs.promises.readdir(target)).filter(name => canList(path.join(target, name)));
    },
    stat(file: string) {
      const target = where(file);
      need(canList(target), target, 'see');
      const stats = fs.statSync(target);
      const kind = { isFile: stats.isFile(), isDirectory: stats.isDirectory() };

      return canSee(target) ? { ...kind, size: stats.size, mtimeMs: stats.mtimeMs } : kind;
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
    run(name: string, args: string[] = [], options: { cwd?: string; input?: string } = {}) {
      if (!Object.hasOwn(permissions.run, name)) {
        throw new Error(`papp: this page may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
      } else if (!Array.isArray(args)) {
        // Node would read an object here as the options, an unchecked cwd included.
        throw new Error('papp: run takes its arguments as an array.');
      }

      const cwd = where(options.cwd ?? '.');
      need(canList(cwd), cwd, 'see');
      const child = spawn(permissions.run[name], args, { cwd, env });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', text => (stdout += text));
      child.stderr.setEncoding('utf8').on('data', text => (stderr += text));
      child.stdin.on('error', () => {});
      child.stdin.end(options.input);

      return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', status => resolve({ status, stdout, stderr }));
      });
    },
    watch(id: string, file: string) {
      const target = where(file);
      need(canList(target), target, 'see');
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      watchers.set(
        id,
        fs.watch(watched, (_event, name) => {
          const changed = name && path.join(watched, name);

          if (changed && (isFolder ? canList(changed) : changed === target)) {
            notify(id, path.relative(dir, changed));
          }
        })
      );
    },
    unwatch(id?: string) {
      for (const [key, watcher] of watchers) {
        if (id === undefined || key === id) {
          watcher.close();
          watchers.delete(key);
        }
      }
    },
  };
}
