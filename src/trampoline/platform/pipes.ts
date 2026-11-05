import { spawn, type StdioOptions } from 'child_process';
import { once } from 'events';
import type { Readable, Writable } from 'stream';
import { REPLY_FD, REQUEST_FD } from '../../shared/channel.ts';
import type { PageProcess } from '../platform.ts';

// macOS and Linux: the page's requests and the trampoline's replies each have a pipe of their own, fds 3 and 5.
export async function startPiped([command, ...args]: string[], stdio: StdioOptions, env: NodeJS.ProcessEnv): Promise<PageProcess> {
  const child = spawn(command, args, { stdio, env });
  await once(child, 'spawn');

  return Object.assign(child, { requests: child.stdio[REQUEST_FD] as Readable, output: child.stdout!, errors: child.stderr!, replies: child.stdio.at(REPLY_FD) as Writable });
}
