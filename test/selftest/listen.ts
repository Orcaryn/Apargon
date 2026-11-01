import { spawn } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import path from 'path';

// Runs a command while selftest-net's servers listen: a port and a socket file it declares, and a port and a socket file it does not.
const [declaredSocket, otherSocket] = ['declared.sock', 'other.sock'].map(name => path.join(import.meta.dirname, 'pages', 'results', name));
// A run stopped with Ctrl-C leaves them.
fs.rmSync(declaredSocket, { force: true });
fs.rmSync(otherSocket, { force: true });

for (const address of [{ port: 47181, host: '127.0.0.1' }, { port: 47182, host: '127.0.0.1' }, { path: declaredSocket }, { path: otherSocket }]) {
  await once(http.createServer((_request, response) => response.end()).listen(address), 'listening');
}

const [command, ...args] = process.argv.slice(2);
const [code] = await once(spawn(command, args, { stdio: 'inherit' }), 'exit');
process.exit(code ?? 1);
