import type net from 'net';
import { Duplex } from 'stream';
import type { Use } from '../../../../permissions/tags/index.ts';

// Linux: what the .papp file may ask the sound server. The server can also load modules that send sound to any address, and move sound to network speakers. So only the commands below pass, new streams go to the default device, and their properties can't name another. Anything else closes the connection.

// A frame: length, channel, offset (two), flags, 4 bytes each, then the bytes. Channel 0xffffffff is a command, any other a stream's sound.
const HEADER = 20;
const COMMAND_CHANNEL = 0xffffffff;
// Numbers from PulseAudio's native-common.h.
const CREATE_PLAYBACK_STREAM = 3;
const CREATE_RECORD_STREAM = 5;
// Connecting, and reading what is there.
const ALWAYS = [8, 9, 10, 11, 13, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 82, 85, 88, 89];
// Its own playback streams, and the volume of any.
const PLAY = [CREATE_PLAYBACK_STREAM, 4, 12, 14, 37, 41, 42, 43, 46, 60, 69, 72, 74, 81, 84];
// Its own record streams, and the microphone's volume.
const RECORD = [CREATE_RECORD_STREAM, 6, 38, 47, 57, 58, 59, 73, 75, 80, 83, 98, 99];
// PipeWire takes a stream's target from its properties, as target.object: only these names pass.
const PROPERTY = /^(?:application\.[\w.-]+|window\.[\w.-]+|format\.[\w.-]+|media\.(?:name|role|icon_name))$/;
// Bytes after each tag of a fixed size. A property list (P) and a format (f) are only marks: their parts are tags of their own.
const SIZES: Partial<Record<string, number>> = { N: 0, L: 4, B: 1, R: 8, r: 8, a: 6, '1': 0, '0': 0, T: 8, U: 8, V: 4, P: 0, f: 0 };

export function filterSound(server: net.Socket, use: Use[]) {
  const allowed = new Set([...ALWAYS, ...(use.includes('sound') ? PLAY : []), ...(use.includes('microphone') ? RECORD : [])]);
  let pending = Buffer.alloc(0);
  const papp = new Duplex({
    allowHalfOpen: true,
    read: () => server.resume(),
    // Passes each whole frame once checked, and keeps the rest for the next write.
    write(chunk: Buffer, _encoding, done) {
      pending = Buffer.concat([pending, chunk]);
      let checked = 0;

      try {
        while (pending.length >= checked + HEADER && pending.length >= checked + HEADER + pending.readUInt32BE(checked)) {
          const end = checked + HEADER + pending.readUInt32BE(checked);

          if (pending.readUInt32BE(checked + 4) === COMMAND_CHANNEL) {
            checkCommand(pending.subarray(checked + HEADER, end), allowed);
          }

          checked = end;
        }
      } catch (err) {
        return done(new Error(`Apargon: refused the .papp file's command to the sound server: ${(err as Error).message}`));
      }

      server.write(pending.subarray(0, checked), done);
      pending = pending.subarray(checked);
    },
    final(done) {
      server.end();
      done();
    },
    destroy(err, done) {
      server.destroy();
      done(err);
    },
  });

  papp.on('error', err => console.error(err.message));
  server.on('data', (bytes: Buffer) => {
    if (!papp.push(bytes)) {
      server.pause();
    }
  });
  server.on('end', () => papp.push(null));
  server.on('error', err => papp.destroy(err));

  return papp;
}

// A command is tags: its number, its sequence number, then its fields. A part cut short throws too, as Buffer reads past the end.
function checkCommand(packet: Buffer, allowed: Set<number>) {
  const fields = [];

  for (let at = 0; at < packet.length; ) {
    const tag = String.fromCharCode(packet[at]);
    const start = at + 1;
    const end =
      tag === 't' ? packet.indexOf(0, start) + 1
      : tag === 'x' ? start + 4 + packet.readUInt32BE(start)
      : tag === 'm' ? start + 1 + packet.readUInt8(start)
      : tag === 'v' ? start + 1 + 4 * packet.readUInt8(start)
      : start + (SIZES[tag] ?? NaN);

    // NaN: a tag the server doesn't know. Before start: a text with no end.
    if (!(start <= end && end <= packet.length)) {
      throw new Error(`a field it can't read, at byte ${at}`);
    }

    fields.push({ tag, bytes: packet.subarray(start, tag === 't' ? end - 1 : end) });
    at = end;
  }

  const tags = fields.map(field => field.tag).join('');
  const command = tags.startsWith('LL') ? fields[0].bytes.readUInt32BE() : null;

  if (command === null || !allowed.has(command)) {
    throw new Error(`command ${command}`);
  } else if ((command === CREATE_PLAYBACK_STREAM || command === CREATE_RECORD_STREAM) && !(tags.startsWith('LLamLN') && fields[4].bytes.readUInt32BE() === 0xffffffff)) {
    throw new Error('a stream on a named device');
  }

  // A property list: name, length, value, until a null name.
  for (let i = tags.indexOf('P'); i !== -1; i = tags.indexOf('P', i)) {
    for (i++; tags[i] !== 'N'; i += 3) {
      if (tags.slice(i, i + 3) !== 'tLx' || !PROPERTY.test(fields[i].bytes.toString())) {
        throw new Error(`the property ${tags[i] === 't' ? fields[i].bytes.toString() : 'list'}`);
      }
    }
  }
}
