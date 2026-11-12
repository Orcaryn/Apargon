// Linux: the filter that stops a .papp file and its programs from reaching another program through a socket. Read all is read all: every program's socket file is readable, and connecting to one needs no write.
// - socket(): only the kinds the .papp file needs, and its own empty network holds: internet (the relays on loopback) and netlink (Chromium watches the network with it). No AF_UNIX, so no socket file. No other kind: vsock, for one, ignores the network a sandbox has, and reaches virtual machines and their host.
// - socketpair(): AF_UNIX only, as Chromium talks to its own processes through them. Not datagram: one of those sends to any socket file by name, with no connect().
// - io_uring opens sockets past seccomp.
// A classic BPF program, as bwrap --seccomp reads it: 8 bytes per instruction.

const LOAD = 0x20; // BPF_LD | BPF_W | BPF_ABS
const AND = 0x54; // BPF_ALU | BPF_AND | BPF_K
const JUMP_IF = 0x15; // BPF_JMP | BPF_JEQ | BPF_K
const JUMP_IF_AT_LEAST = 0x35; // BPF_JMP | BPF_JGE | BPF_K
const RETURN = 0x06; // BPF_RET | BPF_K
const ALLOW = 0x7fff0000;
const REFUSE = 0x00050000 | 13; // SECCOMP_RET_ERRNO | EACCES
const KILL = 0x80000000; // SECCOMP_RET_KILL_PROCESS
const AF_UNIX = 1;
const AF_INET = 2;
const AF_INET6 = 10;
const AF_NETLINK = 16;
const SOCK_DGRAM = 2;
// The kernel's SOCK_TYPE_MASK: SOCK_NONBLOCK and SOCK_CLOEXEC sit above it.
const SOCK_TYPE = 0xf;
// struct seccomp_data: the call's number, its architecture, then its arguments, 8 bytes each from 16.
const NR = 0;
const ARCH = 4;
const FAMILY = 16;
const TYPE = 24;
const ARCHITECTURES: Partial<Record<string, { arch: number; socket: number; socketpair: number; ioUring: number; x32: boolean }>> = {
  x64: { arch: 0xc000003e, socket: 41, socketpair: 53, ioUring: 425, x32: true },
  arm64: { arch: 0xc00000b7, socket: 198, socketpair: 199, ioUring: 425, x32: false },
};

type Instruction = [number, number, number, number];

export function socketFilter(architecture = process.arch) {
  const target = ARCHITECTURES[architecture];

  if (!target) {
    throw new Error(`Apargon has no socket filter for ${architecture}.`);
  }

  // Each: [code, jump if true, jump if false, value]. A jump skips that many instructions.
  const program: Instruction[] = [
    [LOAD, 0, 0, ARCH],
    // Another architecture's calls, as a 32-bit program makes, have other numbers: none runs.
    [JUMP_IF, 1, 0, target.arch],
    [RETURN, 0, 0, KILL],
    [LOAD, 0, 0, NR],
    // x32 calls on x64 carry this bit.
    ...(target.x32 ? [[JUMP_IF_AT_LEAST, 0, 1, 0x40000000] as Instruction, [RETURN, 0, 0, REFUSE] as Instruction] : []),
    [JUMP_IF, 0, 1, target.ioUring],
    [RETURN, 0, 0, REFUSE],
    // To socket(), or to socketpair(). Any other call runs.
    [JUMP_IF, 2, 0, target.socket],
    [JUMP_IF, 6, 0, target.socketpair],
    [RETURN, 0, 0, ALLOW],
    // socket(): these kinds only.
    [LOAD, 0, 0, FAMILY],
    [JUMP_IF, 8, 0, AF_INET],
    [JUMP_IF, 7, 0, AF_INET6],
    [JUMP_IF, 6, 0, AF_NETLINK],
    [RETURN, 0, 0, REFUSE],
    // socketpair(): AF_UNIX, not datagram.
    [LOAD, 0, 0, FAMILY],
    [JUMP_IF, 0, 4, AF_UNIX],
    [LOAD, 0, 0, TYPE],
    [AND, 0, 0, SOCK_TYPE],
    [JUMP_IF, 1, 0, SOCK_DGRAM],
    [RETURN, 0, 0, ALLOW],
    [RETURN, 0, 0, REFUSE],
  ];
  const bytes = Buffer.alloc(program.length * 8);

  program.forEach(([code, jumpTrue, jumpFalse, value], i) => {
    bytes.writeUInt16LE(code, i * 8);
    bytes.writeUInt8(jumpTrue, i * 8 + 2);
    bytes.writeUInt8(jumpFalse, i * 8 + 3);
    bytes.writeUInt32LE(value >>> 0, i * 8 + 4);
  });

  return bytes;
}
