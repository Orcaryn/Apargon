import type { BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { PassThrough, type Readable, type Writable } from 'stream';
import { StringDecoder } from 'string_decoder';
import { programEnv } from '../../permissions/env.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { callTrampoline, MUX_FD, REPLY_FD, REQUEST_FD, tellTrampoline, TRAMPOLINE_NETWORK_FD, trampolineBytes, WAYLAND_FD, type ProgramExit } from '../../shared/channel.ts';
import { WINDOW } from '../../shared/streams.ts';
import { PAGE_PLATFORM } from '../platform.ts';
import type { Scope } from './scope.ts';

// One running program, wherever it runs: here, inside this sandbox, or in the trampoline. Output not read makes the program wait, as on any pipe. exited: once it has exited and its output is read to the end.
type Running = { stdin: Writable; stdout: Readable; stderr: Readable; exited: Promise<ProgramExit>; kill(): void };

// run keeps a program's output whole, so only so much of it.
const RUN_OUTPUT_LIMIT = 64 * 1024 * 1024;
// Programs the trampoline started for this .papp file, by id: each exit comes as an event.
const trampolineExits = new Map<string, (exit: ProgramExit) => void>();

export function remoteProgramExit({ id, ...exit }: { id: string } & ProgramExit) {
  trampolineExits.get(id)?.(exit);
  trampolineExits.delete(id);
}

export function programApi(permissions: Permissions, programsHere: boolean, proxy: string | null, { where }: Scope, win: BrowserWindow) {
  // unread: output sent to the window that it has not yet taken.
  const jobs = new Map<string, { child: Running; unread: number }>();
  const runs = new Set<Running>();

  // Here, a fenced program starts inside this sandbox and keeps its limits. Elsewhere, and for an unfenced one, the trampoline starts it.
  // The window's JavaScript has no types: options in place of the arguments is a common slip, and gets a clear answer.
  const startProgram = async (name: string, args: string[], cwd = '.'): Promise<Running> => {
    if (!Object.hasOwn(permissions.run, name)) {
      throw new Error(`Apargon: this .papp file may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
    } else if (!Array.isArray(args)) {
      throw new Error('Apargon: a program takes its arguments as a list, as in papp.run("git", ["status"], { cwd: "." }).');
    }

    const folder = where(cwd);

    if (programsHere && !permissions.run[name].unfenced) {
      return startHere(permissions.run[name].file, args, folder, programEnv(process.env, permissions, proxy));
    }

    const id = randomUUID();
    const stdin = new PassThrough();
    const exited = new Promise<ProgramExit>(resolve => trampolineExits.set(id, resolve));

    try {
      const output = await callTrampoline('startProgram', { id, name, args, cwd: folder, input: trampolineBytes.send(stdin) });
      const [stdout, stderr] = [trampolineBytes.receive(output.stdout), trampolineBytes.receive(output.stderr)];
      // The exit can come before the last of the output is read: it waits for it, as a child process's close does.
      const outputsRead = [stdout, stderr].map(output => new Promise(resolve => output.on('error', () => undefined).on('close', resolve)));

      return { stdin, stdout, stderr, exited: Promise.all([exited, ...outputsRead]).then(([exit]) => exit), kill: () => tellTrampoline('programKill', { id }) };
    } catch (err) {
      trampolineExits.delete(id);
      stdin.destroy();

      throw err;
    }
  };

  return {
    async run(name: string, args: string[] = [], { cwd, input, encoding = 'utf8', timeout }: { cwd?: string; input?: string | Uint8Array; encoding?: 'utf8' | null; timeout?: number } = {}) {
      const child = await startProgram(name, args, cwd);
      runs.add(child);
      const kept = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
      let size = 0;

      for (const stream of ['stdout', 'stderr'] as const) {
        child[stream].on('data', (bytes: Buffer) => {
          if ((size += bytes.length) > RUN_OUTPUT_LIMIT) {
            child.kill();
          } else {
            kept[stream].push(bytes);
          }
        });
      }

      if (input !== undefined) {
        child.stdin.write(Buffer.from(input));
      }

      child.stdin.end();
      const timer = timeout && setTimeout(() => child.kill(), timeout);
      const { status, signal, error } = await child.exited;
      clearTimeout(timer);
      runs.delete(child);

      if (size > RUN_OUTPUT_LIMIT) {
        throw new Error('Apargon: run keeps up to 64 MB of output, and this program wrote more, so it was stopped. Use papp.spawn, which hands the output over as it comes.');
      } else if (error && status === null && signal === null) {
        throw new Error(error);
      }

      const [stdout, stderr] = [Buffer.concat(kept.stdout), Buffer.concat(kept.stderr)];

      return { status, signal, stdout: encoding === null ? stdout : stdout.toString(), stderr: encoding === null ? stderr : stderr.toString() };
    },
    async spawn(id: string, name: string, args: string[] = [], options: { cwd?: string } = {}) {
      const child = await startProgram(name, args, options.cwd);
      const job = { child, unread: 0 };
      jobs.set(id, job);

      for (const stream of ['stdout', 'stderr'] as const) {
        // A character cut in two by a chunk's end waits here for its rest.
        const decoder = new StringDecoder();
        child[stream].on('data', (bytes: Buffer) => {
          if (jobs.get(id) !== job) {
            return;
          }

          win.webContents.send('apargon-output', id, stream, decoder.write(bytes), bytes.length);

          // The window says what it took, with outputRead. With a window's worth untaken, the program waits.
          if ((job.unread += bytes.length) > WINDOW) {
            child.stdout.pause();
            child.stderr.pause();
          }
        });
      }

      void child.exited.then(({ status, signal }) => jobs.delete(id) && win.webContents.send('apargon-exit', id, { status, signal }));
    },
    outputRead(id: string, count: number) {
      const job = jobs.get(id);

      if (job && (job.unread -= count) <= WINDOW) {
        job.child.stdout.resume();
        job.child.stderr.resume();
      }
    },
    // Answered once the program's pipe took it, or closed: a page that waits for the answer never runs ahead of the program.
    async write(id: string, data: string | Uint8Array) {
      const stdin = jobs.get(id)?.child.stdin;

      if (stdin) {
        await new Promise<void>(taken => stdin.write(Buffer.from(data), () => taken()));
      }
    },
    endInput(id: string) {
      jobs.get(id)?.child.stdin.end();
    },
    kill: (id: string) => jobs.get(id)?.child.kill(),
    // A stopped program's output is still read to its end, unsent: left waiting, it would never close.
    reset() {
      jobs.forEach(({ child }) => {
        child.kill();
        child.stdout.resume();
        child.stderr.resume();
      });
      jobs.clear();
      runs.forEach(child => child.kill());
      runs.clear();
    },
  };
}

// Inside this sandbox. On Linux through sh, which closes this process's pipes to the trampoline first: with them, the program could ask the trampoline anything as this .papp file.
function startHere(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Running {
  const options = { cwd, env, detached: PAGE_PLATFORM.processGroups, windowsHide: true };
  const closed = [REQUEST_FD, TRAMPOLINE_NETWORK_FD, REPLY_FD, MUX_FD, WAYLAND_FD].map(fd => `${fd}>&-`).join(' ');
  const child: ChildProcess = PAGE_PLATFORM.programsInheritFds ? spawn('/bin/sh', ['-c', `exec ${closed}; exec "$@"`, 'sh', file, ...args], options) : spawn(file, args, options);
  let error: string | null = null;
  child.stdin!.on('error', () => undefined);
  child.on('error', err => (error = err.message));

  return {
    stdin: child.stdin!,
    stdout: child.stdout!,
    stderr: child.stderr!,
    exited: new Promise(resolve => child.on('close', (status, signal) => resolve({ status, signal, error }))),
    kill() {
      if (!PAGE_PLATFORM.processGroups) {
        child.kill();
      } else {
        try {
          process.kill(-child.pid!);
        } catch {
          child.kill();
        }
      }
    },
  };
}
