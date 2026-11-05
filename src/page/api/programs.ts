import type { BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { once } from 'events';
import { PROGRAM_ENV } from '../../permissions/env.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { REPLY_FD, REQUEST_FD, TRAMPOLINE_NETWORK_FD } from '../../shared/channel.ts';
import { PAGE_PLATFORM } from '../platform.ts';
import type { Scope } from './scope.ts';

export function programApi(permissions: Permissions, { where, canList, need }: Scope, win: BrowserWindow) {
  const jobs = new Map<string, ChildProcessWithoutNullStreams>();
  const runs = new Set<ChildProcessWithoutNullStreams>();
  // By name, as Windows finds Path for PATH.
  const env = Object.fromEntries([...PROGRAM_ENV, ...permissions.env].filter(name => name in process.env).map(name => [name, process.env[name]]));

  const startProgram = (name: string, args: string[], cwd = '.') => {
    if (!Object.hasOwn(permissions.run, name)) {
      throw new Error(`Apargon: this page may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
    } else if (!Array.isArray(args)) {
      throw new Error('Apargon: a program takes its arguments as an array.');
    }

    const folder = where(cwd);
    need(canList(folder), 'see');

    const options = { cwd: folder, env, detached: PAGE_PLATFORM.processGroups, windowsHide: true };

    if (!PAGE_PLATFORM.programsInheritFds) {
      return spawn(permissions.run[name], args, options);
    }

    // Through sh, which closes the page's pipes to the trampoline and execs the program in its place: with them, it could ask the trampoline anything as this page. Only these fds: dash keeps its own on 10 and up.
    return spawn('/bin/sh', ['-c', `exec ${REQUEST_FD}>&- ${TRAMPOLINE_NETWORK_FD}>&- ${REPLY_FD}>&-; exec "$@"`, 'sh', permissions.run[name], ...args], options);
  };

  const stopProgram = (child: ChildProcessWithoutNullStreams) => {
    if (!PAGE_PLATFORM.processGroups) {
      child.kill();
    } else {
      try {
        process.kill(-child.pid!);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
          throw err;
        }
      }
    }
  };

  return {
    async run(name: string, args: string[] = [], { cwd, input, encoding = 'utf8', timeout }: { cwd?: string; input?: string | Uint8Array; encoding?: 'utf8' | null; timeout?: number } = {}) {
      const child = startProgram(name, args, cwd);
      await once(child, 'spawn');
      runs.add(child);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      const timer = timeout && setTimeout(() => stopProgram(child), timeout);

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
      const child = startProgram(name, args, options.cwd);
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
        stopProgram(child);
      }
    },
    reset() {
      jobs.forEach(stopProgram);
      jobs.clear();
      runs.forEach(stopProgram);
      runs.clear();
    },
  };
}
