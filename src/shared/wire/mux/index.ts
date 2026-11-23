import type { Duplex } from 'stream';
import { WINDOW } from '../streams/index.ts';

// Linux: the .papp file's sandbox can't open a socket file, so its way to the proxy, and to the sound server, is one pipe the trampoline gave it at start. Each connection inside is a stream in that pipe.
// A frame: kind (1 byte), stream id (4), length (4), then the bytes. OPEN's bytes name the target. CREDIT's are a count (4): so many more bytes of DATA the other side may send on this stream.
const OPEN = 1;
const DATA = 2;
const END = 3;
const CLOSE = 4;
const CREDIT = 5;

// Each stream is half-open, as TCP is: one side may end while the other still sends. Make the sockets with allowHalfOpen.
// Each stream starts with a window of credit and gets more as the other side's target takes its bytes: a slow target holds at most a window, and slows its own stream only.
// connectTo: on the trampoline's side, how to reach each target by name. The papp process opens streams with open().
export function startMux(channel: Duplex, connectTo: ((target: string) => Duplex | null) | null) {
  const streams = new Map<number, { stream: Duplex; credit: number }>();
  let pending = Buffer.alloc(0);
  let nextId = 1;

  const send = (kind: number, id: number, bytes: Buffer = Buffer.alloc(0)) => {
    const header = Buffer.alloc(9);
    header.writeUInt8(kind, 0);
    header.writeUInt32BE(id, 1);
    header.writeUInt32BE(bytes.length, 5);

    channel.write(Buffer.concat([header, bytes]));
  };

  const attach = (id: number, stream: Duplex) => {
    const attached = { stream, credit: WINDOW };
    streams.set(id, attached);
    stream.on('data', (bytes: Buffer) => {
      send(DATA, id, bytes);

      if ((attached.credit -= bytes.length) <= 0) {
        stream.pause();
      }
    });
    stream.on('end', () => send(END, id));
    stream.on('error', () => stream.destroy());
    stream.on('close', () => {
      if (streams.delete(id)) {
        send(CLOSE, id);
      }
    });
  };

  channel.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);

    while (pending.length >= 9 && pending.length >= 9 + pending.readUInt32BE(5)) {
      const kind = pending.readUInt8(0);
      const id = pending.readUInt32BE(1);
      const bytes = pending.subarray(9, 9 + pending.readUInt32BE(5));
      pending = pending.subarray(9 + bytes.length);
      const attached = streams.get(id);

      if (kind === OPEN && connectTo && !streams.has(id)) {
        const target = connectTo(bytes.toString());

        if (target) {
          attach(id, target);
        } else {
          send(CLOSE, id);
        }
      } else if (kind === DATA) {
        // Credit goes back for bytes the target took, never for ones a closed target dropped.
        attached?.stream.write(bytes, err => {
          if (!err) {
            const count = Buffer.alloc(4);
            count.writeUInt32BE(bytes.length);
            send(CREDIT, id, count);
          }
        });
      } else if (kind === END) {
        attached?.stream.end();
      } else if (kind === CREDIT && attached) {
        if ((attached.credit += bytes.readUInt32BE(0)) > 0) {
          attached.stream.resume();
        }
      } else if (kind === CLOSE && attached) {
        streams.delete(id);
        attached.stream.destroy();
      }
    }
  });
  channel.on('close', () => streams.forEach(({ stream }) => stream.destroy()));

  return {
    open(target: string, stream: Duplex) {
      const id = nextId++;
      send(OPEN, id, Buffer.from(target));
      attach(id, stream);
    },
  };
}
