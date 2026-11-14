import { spawn, type StdioOptions } from 'child_process';
import { once } from 'events';
import type { Duplex, Readable, Writable } from 'stream';
import { MUX_FD, REPLY_FD, REQUEST_FD } from '../../../shared/wire/protocol/index.ts';
import type { PageProcess } from '../index.ts';

// macOS and Linux: the .papp file's requests and the trampoline's replies each have a pipe of their own, fds 3 and 5. Linux adds the mux, fd 6.
export async function startPiped([command, ...args]: string[], stdio: StdioOptions, env: NodeJS.ProcessEnv, requestFd = REQUEST_FD, replyFd = REPLY_FD): Promise<PageProcess> {
  const child = spawn(command, args, { stdio, env });
  await once(child, 'spawn');
  const mux = Array.isArray(stdio) && stdio[MUX_FD] === 'pipe' ? (child.stdio as unknown as Duplex[])[MUX_FD] : null;

  return Object.assign(child, { requests: child.stdio[requestFd] as Readable, output: child.stdout!, errors: child.stderr!, replies: child.stdio[replyFd] as Writable, mux });
}
