import { Notification, type BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import path from 'path';
import { HOME, PROGRAM_ENV, type Permissions } from '../permissions/tags.ts';
import { MESSAGE_FD, type ChildMessage } from '../shared.ts';
import { realPath, type pageAccess } from './access.ts';

// One per window: its watchers and programs end with it, or when it loads anew.
export function pageApi(dir: string, permissions: Permissions, { canSee, canList, canChange }: ReturnType<typeof pageAccess>, win: BrowserWindow, toFront: () => void) {
  const watchers = new Map<string, fs.FSWatcher>();
  const jobs = new Map<string, ChildProcessWithoutNullStreams>();
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

  const startProgram = (name: string, args: string[], cwd = '.', detached = false) => {
    if (!Object.hasOwn(permissions.run, name)) {
      throw new Error(`papp: this page may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
    } else if (!Array.isArray(args)) {
      // Node would read an object here as the options, an unchecked cwd included.
      throw new Error('papp: a program takes its arguments as an array.');
    }

    const folder = where(cwd);
    need(canList(folder), folder, 'see');

    return spawn(permissions.run[name], args, { cwd: folder, env, detached });
  };

  // A spawned program leads a group of its own, so what it starts stops with it.
  const killGroup = (child: ChildProcessWithoutNullStreams) => {
    try {
      process.kill(-child.pid!);
    } catch {
      // The group ended before close reported it.
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
      const child = startProgram(name, args, options.cwd);
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
    // Output reaches the window as it comes, and the exit once all of it has.
    // A job reset dropped, for a closed or reloaded window, sends nothing.
    async spawn(id: string, name: string, args: string[] = [], options: { cwd?: string } = {}) {
      const child = startProgram(name, args, options.cwd, true);
      await once(child, 'spawn');
      jobs.set(id, child);
      child.stdout.setEncoding('utf8').on('data', text => {
        if (jobs.has(id)) {
          win.webContents.send('papp-output', id, 'stdout', text);
        }
      });
      child.stderr.setEncoding('utf8').on('data', text => {
        if (jobs.has(id)) {
          win.webContents.send('papp-output', id, 'stderr', text);
        }
      });
      child.stdin.on('error', () => {});
      child.on('close', (status, signal) => {
        if (jobs.delete(id)) {
          win.webContents.send('papp-exit', id, { status, signal });
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
    watch(id: string, file: string) {
      const target = where(file);
      need(canList(target), target, 'see');
      const isFolder = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory();
      const watched = isFolder ? target : path.dirname(target);
      watchers.set(
        id,
        fs.watch(watched, (_event, name) => {
          const file = name && path.join(watched, name);

          if (file && (isFolder ? canList(file) : file === target)) {
            win.webContents.send('papp-change', id, path.relative(dir, file));
          }
        })
      );
    },
    unwatch(id: string) {
      watchers.get(id)?.close();
      watchers.delete(id);
    },
    // The page may send anything, so what goes to the trampoline is made text here.
    notify(title: string, body = '') {
      const text = { title: String(title), body: String(body) };

      if (!permissions.use.includes('notifications')) {
        throw new Error('papp: this page may not show notifications. Ask for it with <meta name="papp-use" content="notifications">.');
      } else if (process.platform === 'linux') {
        // Notifications travel on D-Bus, which the sandbox hides, so the trampoline shows it.
        fs.writeSync(MESSAGE_FD, JSON.stringify({ notify: text } satisfies ChildMessage) + '\n');
      } else {
        new Notification(text).on('click', toFront).show();
      }
    },
    tray(title: string | null) {
      // On Linux the tray talks over D-Bus, which the sandbox hides, so the trampoline owns it on both.
      fs.writeSync(MESSAGE_FD, JSON.stringify({ tray: title === null ? null : String(title).slice(0, 24) } satisfies ChildMessage) + '\n');
    },
    reset() {
      watchers.forEach(watcher => watcher.close());
      watchers.clear();
      jobs.forEach(killGroup);
      jobs.clear();
    },
  };
}
