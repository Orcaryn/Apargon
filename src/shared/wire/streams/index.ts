import { randomUUID } from 'crypto';
import { finished, Readable } from 'stream';

// Bytes between the trampoline and a .papp file's process go as streams inside the JSON lines, so no line is large and neither side holds a whole file.
// The receiver asks first: the sender sends nothing, not even its end, before the first credit, and never more than it was given. A slow receiver slows its own stream, and no other.
export type StreamLine = { stream: string; data: string } | { stream: string; end: true } | { stream: string; error: string } | { stream: string; credit: number };

// 48 KB is 64 KB as base64.
const CHUNK = 48 * 1024;
// What one side holds unread before the other waits.
export const WINDOW = 1024 * 1024;

export function byteStreams(sendLine: (line: StreamLine) => void) {
  // started: whether it has been asked for yet. Until then it is not read at all, so streams sent together can share what they read from, each in its turn.
  type Sending = { source: Readable; credit: number; started: boolean };
  const sources = new Map<string, Sending>();
  const sinks = new Map<string, { sink: Readable; asked: number }>();

  const pump = (id: string, sending: Sending) => {
    while (sending.credit > 0 && sending.source.readableLength > 0) {
      const chunk = sending.source.read(Math.min(sending.credit, CHUNK, sending.source.readableLength)) as Buffer;
      sending.credit -= chunk.length;
      sendLine({ stream: id, data: chunk.toString('base64') });
    }

    // A read of nothing lets an empty source fill again, or end.
    if (!sending.source.readableLength) {
      sending.source.read(0);
    }
  };

  return {
    // The id to name in a call or an event. source: a stream of bytes, not of objects. Destroying it gives the stream up.
    send(source: Readable) {
      const id = randomUUID();
      sources.set(id, { source, credit: 0, started: false });
      finished(source, { writable: false }, err => {
        if (sources.delete(id)) {
          sendLine(err ? { stream: id, error: err.message } : { stream: id, end: true });
        }
      });

      return id;
    },
    // Destroying it stops the sender.
    receive(id: string) {
      const receiving = {
        asked: 0,
        sink: new Readable({
          highWaterMark: WINDOW,
          // Node asks before it hands the reader its bytes: the room is counted a moment later, once they are out.
          read() {
            queueMicrotask(() => {
              const room = WINDOW - receiving.sink.readableLength - receiving.asked;

              // Half a window at a time, not a line of credit for each line of bytes. With none asked, whatever fits: nothing more would come to ask again.
              if (sinks.get(id) === receiving && room > 0 && (receiving.asked === 0 || room >= WINDOW / 2)) {
                receiving.asked += room;
                sendLine({ stream: id, credit: room });
              }
            });
          },
          destroy(err, done) {
            if (sinks.delete(id)) {
              sendLine({ stream: id, error: 'closed' });
            }

            done(err);
          },
        }),
      };
      sinks.set(id, receiving);

      return receiving.sink;
    },
    handle(line: StreamLine) {
      const sending = sources.get(line.stream);
      const receiving = sinks.get(line.stream);

      if ('credit' in line && sending) {
        sending.credit += line.credit;

        if (!sending.started) {
          sending.started = true;
          sending.source.on('readable', () => pump(line.stream, sending));
        }

        pump(line.stream, sending);
      } else if ('credit' in line) {
        // Asked for a stream already given up: the receiver must not wait for it.
        sendLine({ stream: line.stream, error: 'closed' });
      } else if ('data' in line && receiving) {
        const bytes = Buffer.from(line.data, 'base64');
        receiving.asked -= bytes.length;
        receiving.sink.push(bytes);
      } else if ('end' in line && receiving) {
        sinks.delete(line.stream);
        receiving.sink.push(null);
      } else if ('error' in line) {
        sources.delete(line.stream);
        sinks.delete(line.stream);
        sending?.source.destroy();
        receiving?.sink.destroy(new Error(line.error));
      }
    },
    // The other side is gone: nothing more is sent.
    closeAll() {
      const [sending, receiving] = [[...sources.values()], [...sinks.values()]];
      sources.clear();
      sinks.clear();
      sending.forEach(({ source }) => source.destroy());
      receiving.forEach(({ sink }) => sink.destroy());
    },
  };
}
