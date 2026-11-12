import assert from 'node:assert/strict';
import { test } from 'node:test';
import { socketFilter } from '../../src/trampoline/platform/seccomp.ts';

// A tiny BPF interpreter: enough for the filter's own instructions.
function run(filter: Buffer, data: { arch: number; nr: number; family?: number; type?: number }) {
  const words: Record<number, number> = { 0: data.nr, 4: data.arch, 16: data.family ?? 0, 24: data.type ?? 0 };
  let accumulator = 0;

  for (let pc = 0; pc < filter.length / 8; pc++) {
    const [code, jumpTrue, jumpFalse, value] = [filter.readUInt16LE(pc * 8), filter.readUInt8(pc * 8 + 2), filter.readUInt8(pc * 8 + 3), filter.readUInt32LE(pc * 8 + 4)];

    if (code === 0x20) {
      accumulator = words[value];
    } else if (code === 0x54) {
      accumulator &= value;
    } else if (code === 0x15) {
      pc += accumulator === value ? jumpTrue : jumpFalse;
    } else if (code === 0x35) {
      pc += accumulator >= value ? jumpTrue : jumpFalse;
    } else if (code === 0x06) {
      return value;
    } else {
      throw new Error(`no such instruction: ${code}`);
    }
  }

  throw new Error('fell off the end');
}

const ALLOW = 0x7fff0000;
const REFUSE = 0x0005000d;
const KILL = 0x80000000;
const [AF_UNIX, AF_INET, AF_INET6, AF_NETLINK, AF_PACKET, AF_BLUETOOTH, AF_VSOCK] = [1, 2, 10, 16, 17, 31, 40];
const [SOCK_STREAM, SOCK_DGRAM, SOCK_SEQPACKET] = [1, 2, 5];
const SOCK_NONBLOCK_CLOEXEC = 0x800 | 0x80000;

for (const [arch, id, socket, socketpair, connect] of [
  ['x64', 0xc000003e, 41, 53, 42],
  ['arm64', 0xc00000b7, 198, 199, 203],
] as const) {
  const filter = socketFilter(arch);

  test(`${arch}: socket() makes internet and netlink sockets only`, () => {
    for (const family of [AF_INET, AF_INET6, AF_NETLINK]) {
      assert.equal(run(filter, { arch: id, nr: socket, family, type: SOCK_STREAM }), ALLOW, `family ${family}`);
    }

    for (const family of [AF_UNIX, AF_PACKET, AF_BLUETOOTH, AF_VSOCK, 0, 45, 255]) {
      assert.equal(run(filter, { arch: id, nr: socket, family, type: SOCK_STREAM }), REFUSE, `family ${family}`);
    }
  });

  test(`${arch}: socketpair() makes AF_UNIX pairs, not datagram ones`, () => {
    assert.equal(run(filter, { arch: id, nr: socketpair, family: AF_UNIX, type: SOCK_STREAM }), ALLOW);
    assert.equal(run(filter, { arch: id, nr: socketpair, family: AF_UNIX, type: SOCK_SEQPACKET | SOCK_NONBLOCK_CLOEXEC }), ALLOW);
    assert.equal(run(filter, { arch: id, nr: socketpair, family: AF_UNIX, type: SOCK_DGRAM }), REFUSE, 'a datagram socket sends to any socket file by name');
    assert.equal(run(filter, { arch: id, nr: socketpair, family: AF_UNIX, type: SOCK_DGRAM | SOCK_NONBLOCK_CLOEXEC }), REFUSE, 'the flags above the type change nothing');
    assert.equal(run(filter, { arch: id, nr: socketpair, family: AF_VSOCK, type: SOCK_STREAM }), REFUSE);
  });

  test(`${arch}: every other call runs, io_uring and other architectures don't`, () => {
    assert.equal(run(filter, { arch: id, nr: connect }), ALLOW);
    assert.equal(run(filter, { arch: id, nr: 425 }), REFUSE, 'io_uring opens sockets past seccomp');
    assert.equal(run(filter, { arch: 0x40000003, nr: socket, family: AF_UNIX }), KILL, 'another architecture is killed');
  });
}

test('x64: an x32 call is refused', () => assert.equal(run(socketFilter('x64'), { arch: 0xc000003e, nr: 0x40000000 + 41, family: AF_INET }), REFUSE));
