import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import path from 'path';
import { noPermissions } from '../../src/permissions/tags/index.ts';

const electron: string = createRequire(import.meta.url)('electron');
// Started as a .papp file's process, but outside any sandbox: it must see its network and refuse to open.
const own = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-refuse-'));
const papp = path.join(import.meta.dirname, 'papps', 'refuse.papp');
const config = {
  papp,
  permissions: noPermissions('00000000-0000-4000-8000-000000000000'),
  pappHash: null,
  own,
  proxy: null,
  relays: [],
  requestFd: 1,
  replyFd: 0,
  muxFd: null,
  bounds: null,
  menu: { approved: [], automaticUpdates: false },
  programsHere: true,
};
const child = spawn(electron, ['.', papp], { env: { ...process.env, APARGON: JSON.stringify(config) }, stdio: ['inherit', 'inherit', 'pipe'] });
// The refusal, the file the papp writes, or the app's end: whichever comes first.
const failure = await new Promise<string | null>(done => {
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    stderr += text;
    process.stderr.write(text);

    if (stderr.includes('can still reach the network')) {
      done(null);
    }
  });
  // Electron keeps its own data in there too.
  fs.watch(own, (_event, name) => name === 'opened' && done('the .papp file opened with network'));
  child.on('exit', () => done('no refusal seen: did the app start?'));
});
child.kill('SIGKILL');
fs.rmSync(own, { recursive: true, force: true });
console.log(failure ? `refuse: FAIL, ${failure}` : 'refuse: ok, process with network refused');
process.exit(failure ? 1 : 0);
