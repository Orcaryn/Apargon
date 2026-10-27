import { execFile, execFileSync } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

if (process.platform !== 'darwin') {
  console.log('daemons: skipped, macOS only');
  process.exit(0);
}

const leak = path.join(import.meta.dirname, 'leak');
execFileSync('swiftc', ['-O', path.join(import.meta.dirname, 'leak.swift'), '-o', leak], { stdio: 'inherit' });
const answers = [
  ...['download', 'webkit'].map(mode => ({ mode, answered: execFileSync(leak, [mode, 'https://example.com/'], { encoding: 'utf8' }).trim() === 'answered' })),
  { mode: 'trust', answered: await trustFetches() },
];

answers.forEach(({ mode, answered }) =>
  console.log(answered ? `daemons: ok, ${mode} answers outside the sandbox` : `daemons: FAIL, ${mode} does not answer even outside the sandbox`)
);
process.exit(answers.every(({ answered }) => answered) ? 0 : 1);

async function trustFetches() {
  let fetched = false;
  const listener = http.createServer((_request, response) => {
    fetched = true;
    response.writeHead(404).end();
  });
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-leak-'));
  fs.writeFileSync(path.join(dir, 'leaf.cnf'), `[leaf]\nauthorityInfoAccess=caIssuers;URI:http://127.0.0.1:${(listener.address() as AddressInfo).port}/apargon-leak\n`);
  const openssl = (args: string) => execFileSync('/usr/bin/openssl', args.split(' '), { cwd: dir, stdio: 'ignore' });
  openssl('req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -subj /CN=apargon-leak-ca -days 1');
  openssl('req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj /CN=apargon-leak');
  openssl('x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out leaf.der -outform DER -days 1 -extfile leaf.cnf -extensions leaf');
  fs.copyFileSync(path.join(dir, 'leaf.der'), path.join(import.meta.dirname, 'leak.der'));
  fs.rmSync(dir, { recursive: true });

  await promisify(execFile)(leak, ['trust', path.join(import.meta.dirname, 'leak.der')]);
  listener.close();

  return fetched;
}
