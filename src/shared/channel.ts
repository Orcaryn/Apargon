import { once } from 'events';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import type { Permissions } from '../permissions/tags.ts';

export type Bridge = { port: number; socket: string };
// requestFd: where the page writes its PageRequests. replies: the file the trampoline writes PageReplies to, where the sandbox passes no more pipes; else they come on REPLY_FD.
export type PageConfig = { page: string; permissions: Permissions; pageHash: string | null; proxy: string | null; bridges: Bridge[]; requestFd: number; replies: string | null };
export type SavedFile = { name: string; data: string };
export type PageRequest = { open: string } | { revoke: string[] } | { showEgressLog: true } | { automaticUpdates: boolean } | { fileIcon: string } | { notify: { title: string; body: string } } | { tray: string | null } | { saveAs: { id: string; files: SavedFile[] } } | { installSkill: true } | { openLink: string } | { openFile: string };
export type PageReply = { trayClick: true } | { saved: string; paths: string[] } | { saved: string; error: string };

// The page process's pipes, after standard input, output and error, where the sandbox passes them.
export const REQUEST_FD = 3;
export const TRAMPOLINE_NETWORK_FD = 4;
export const REPLY_FD = 5;
// Set by the trampoline for the page process.
export const PAGE_CONFIG: PageConfig | null = process.env.APARGON ? JSON.parse(process.env.APARGON) : null;

export function tellTrampoline(request: PageRequest) {
  const line = Buffer.from(JSON.stringify(request) + '\n');

  // A large request, such as a save, can go out in more than one write.
  for (let written = 0; written < line.length; ) {
    written += fs.writeSync(PAGE_CONFIG!.requestFd, line, written);
  }
}

// The trampoline's replies, from the file where the sandbox passes no more pipes, else on REPLY_FD.
export function onTrampolineReply(handle: (reply: PageReply) => void) {
  const { replies } = PAGE_CONFIG!;
  const read = (line: string) => handle(JSON.parse(line));

  if (replies) {
    // The trampoline only appends. A last line without its newline is still being written: it is read next time.
    let done = 0;
    fs.watchFile(replies, { interval: 100 }, () => {
      const text = fs.readFileSync(replies, 'utf8');
      text.slice(done).split('\n').slice(0, -1).forEach(read);
      done = text.lastIndexOf('\n') + 1;
    });
  } else {
    readline.createInterface({ input: new net.Socket({ fd: REPLY_FD, writable: false }) }).on('line', read);
  }
}

export async function relay(from: net.ListenOptions, to: net.NetConnectOpts) {
  const server = net.createServer(socket => {
    const upstream = net.connect(to);
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });
  server.listen(from);
  await once(server, 'listening');

  return server;
}
