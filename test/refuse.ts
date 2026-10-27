import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { declaredPermissions } from '../src/permissions/tags.ts';

const electron: string = createRequire(import.meta.url)('electron');
const result = path.join(import.meta.dirname, 'result.json');
fs.rmSync(result, { force: true });

const page = path.join(import.meta.dirname, 'selftest.papp');
const permissions = declaredPermissions(page);
const child = spawn(electron, ['.', page], {
  env: { ...process.env, APARGON: JSON.stringify({ page, permissions, proxy: null, bridges: [] }) },
  stdio: ['inherit', 'inherit', 'pipe'],
});
let stderr = '';
child.stderr!.setEncoding('utf8').on('data', (text: string) => {
  stderr += text;
  process.stderr.write(text);
});
setTimeout(() => {
  child.kill('SIGKILL');
  const failure =
    fs.existsSync(result) ? 'page opened with network'
    : !stderr.includes('can still open sockets') ? 'no refusal seen: did the app start?'
    : null;
  console.log(failure ? `refuse: FAIL, ${failure}` : 'refuse: ok, process with network refused');
  process.exit(failure ? 1 : 0);
}, 6000);
