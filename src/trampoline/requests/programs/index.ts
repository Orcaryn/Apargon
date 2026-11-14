import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { PassThrough, pipeline } from 'stream';
import { programEnv } from '../../../permissions/env/index.ts';
import { realPath } from '../../../permissions/paths/index.ts';
import type { Permissions } from '../../../permissions/tags/index.ts';
import type { ProgramStart, Tell, TrampolineEvents } from '../../../shared/wire/protocol/index.ts';
import type { byteStreams } from '../../../shared/wire/streams/index.ts';
import type { Prepared } from '../../platform/index.ts';

// The programs the trampoline starts for a .papp file: an unfenced one on every OS, with no limits, and on macOS every fenced one, as a sandbox can't start a stricter one inside it. Each stops when the .papp file closes.
// Its input and output are streams: a program that writes faster than the .papp file reads waits, as on any pipe.
export function programStarter(page: string, permissions: Permissions, prepared: Prepared, tell: Tell<TrampolineEvents>, bytes: ReturnType<typeof byteStreams>) {
  const running = new Map<string, ChildProcess>();

  const stop = (child: ChildProcess) => {
    try {
      // Its whole group: what it started too.
      process.kill(-child.pid!);
    } catch {
      child.kill();
    }
  };

  return {
    start({ id, name, args, cwd, input }: ProgramStart) {
      const program = Object.hasOwn(permissions.run, name) ? permissions.run[name] : undefined;

      if (!program) {
        throw new Error(`Apargon: this .papp file may not run ${name}. Ask for it with <meta name="papp-run" content="${name}">.`);
      } else if (running.has(id)) {
        throw new Error('Apargon: that program id is in use.');
      } else if (!program.unfenced && !prepared.startProgram) {
        throw new Error('Apargon: here, the .papp file starts its programs itself.');
      }

      const folder = realPath(path.resolve(path.dirname(page), cwd));
      const child = program.unfenced ? spawn(program.file, args, { cwd: folder, env: process.env, detached: true, windowsHide: true }) : prepared.startProgram!(program.file, args, folder, programEnv(process.env, permissions, prepared.proxy));
      running.set(id, child);
      // A program that exits with input unread closes the pipe: the .papp file's stream is given up with it.
      pipeline(bytes.receive(input), child.stdin!, () => undefined);
      let error: string | null = null;
      child.on('error', err => (error = err.message));
      child.on('close', (status, signal) => {
        running.delete(id);
        tell('programExit', { id, status, signal, error });
      });

      // Read at once: Node throws away the output of a program that exits before anything reads it, and the .papp file asks for it only later.
      return { stdout: bytes.send(child.stdout!.pipe(new PassThrough())), stderr: bytes.send(child.stderr!.pipe(new PassThrough())) };
    },
    kill({ id }: { id: string }) {
      const child = running.get(id);

      if (child) {
        stop(child);
      }
    },
    // Programs stop when the .papp file closes.
    stopAll: () => running.forEach(stop),
  };
}
