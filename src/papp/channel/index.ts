import { app } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import type { Answer, Calls, EventHandlers, PappConfig, PappEvents, Tell, TrampolineEvents } from '../../shared/wire/protocol/index.ts';
import { byteStreams, type StreamLine } from '../../shared/wire/streams/index.ts';

export const PAPP_CONFIG: PappConfig | null = process.env.APARGON ? JSON.parse(process.env.APARGON) : null;

// The trampoline can die under the papp process: its proxy and dialogs go with it, so the papp process quits, as bwrap's --die-with-parent already makes it on Linux.
function sendToTrampoline(message: object) {
  const line = Buffer.from(JSON.stringify(message) + '\n');

  try {
    for (let written = 0; written < line.length; ) {
      written += fs.writeSync(PAPP_CONFIG!.requestFd, line, written);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
      throw err;
    }

    app.exit();
  }
}

export const tellTrampoline: Tell<PappEvents> = (event, ...args) => sendToTrampoline({ event, args: args[0] });

export const trampolineBytes = byteStreams(sendToTrampoline);

const waiting = new Map<string, PromiseWithResolvers<unknown>>();

export function callTrampoline<K extends keyof Calls>(call: K, ...args: Calls[K]['args'] extends undefined ? [] : [Calls[K]['args']]) {
  const id = randomUUID();
  const answer = Promise.withResolvers<unknown>();
  waiting.set(id, answer);
  sendToTrampoline({ call, id, args: args[0] });

  return answer.promise as Promise<Calls[K]['result']>;
}

// A socket, not process.stdin: in Electron's main process on Windows, that one ends at once.
export function onTrampolineEvent(events: EventHandlers<TrampolineEvents>) {
  const read = (line: string) => {
    const message: { event: keyof TrampolineEvents; args: unknown } | Answer | StreamLine = JSON.parse(line);

    if ('stream' in message) {
      trampolineBytes.handle(message);
    } else if ('event' in message) {
      (events[message.event] as (args: unknown) => void)(message.args);
    } else {
      const { resolve, reject } = waiting.get(message.id)!;
      waiting.delete(message.id);

      if ('error' in message) {
        reject(new Error(message.error));
      } else {
        resolve(message.value);
      }
    }
  };

  readline
    .createInterface({ input: new net.Socket({ fd: PAPP_CONFIG!.replyFd, readable: true, writable: false }) })
    .on('line', read)
    .on('close', () => app.exit());
}
