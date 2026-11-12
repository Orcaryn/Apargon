import { execFileSync, spawn } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';

// Runs a command while a page's servers listen: a port and a socket file it declares, and a port and a socket file it does not. Windows pages have no socket files.
const sockets = process.platform === 'win32' ? [] : ['declared.sock', 'other.sock'].map(name => path.join(import.meta.dirname, 'pages', 'results', name));
// A run stopped with Ctrl-C leaves them.
sockets.forEach(socket => fs.rmSync(socket, { force: true }));

// Who reached 47184, a plain TCP port: a mount from inside the sandbox must not.
let hits = 0;
await once(net.createServer(socket => (hits++, socket.destroy())).listen(47184, '127.0.0.1'), 'listening');

// GET /hits counts them. GET /post?name=N posts another app's announcement, on macOS. GET /reach?port=N answers whether this process, outside the sandbox, reaches port N on loopback and on this computer's network address: a page tests its own listener with it.
const server = async (request: http.IncomingMessage, response: http.ServerResponse) => {
  const url = new URL(request.url!, 'http://listener');

  if (url.pathname === '/hits') {
    response.end(String(hits));
  } else if (url.pathname === '/post') {
    const script = `ObjC.import('Foundation'); $.NSDistributedNotificationCenter.defaultCenter.postNotificationNameObjectUserInfoDeliverImmediately(${JSON.stringify(url.searchParams.get('name'))}, $(), $({ said: 'hello' }), true)`;
    execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script]);
    response.end();
  } else if (url.pathname === '/reach') {
    const port = Number(url.searchParams.get('port'));
    const address = Object.values(os.networkInterfaces())
      .flat()
      .find(each => each!.family === 'IPv4' && !each!.internal)!.address;
    response.end(JSON.stringify({ loopback: await reach('127.0.0.1', port), network: await reach(address, port), address }));
  } else {
    response.end();
  }
};

for (const address of [{ port: 47181, host: '127.0.0.1' }, { port: 47182, host: '127.0.0.1' }, ...sockets.map(socket => ({ path: socket }))]) {
  await once(http.createServer(server).listen(address), 'listening');
}

const [command, ...args] = process.argv.slice(2);
const [code] = await once(spawn(command, args, { stdio: 'inherit' }), 'exit');
// Killed by a signal, the page has no code: a failure.
process.exit(code ?? 1);

// connected, or the error's code.
function reach(host: string, port: number) {
  return new Promise<string | undefined>(done => {
    const socket = net.connect(port, host);
    socket.on('connect', () => {
      socket.destroy();
      done('connected');
    });
    socket.on('error', (err: NodeJS.ErrnoException) => done(err.code));
  });
}
