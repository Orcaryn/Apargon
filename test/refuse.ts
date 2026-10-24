// The offline check must not trust the environment: RESWORB set by hand, with nothing
// holding the network shut, must refuse to open the page. Exits 1 if a page opened.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const electron: string = createRequire(import.meta.url)('electron');
const result = path.join(import.meta.dirname, 'result.json');
fs.rmSync(result, { force: true });

const child = spawn(electron, ['.', 'test/selftest.lmth'], { env: { ...process.env, RESWORB: '{"hosts":[],"proxy":null}' }, stdio: 'inherit' });
setTimeout(() => {
  child.kill('SIGKILL'); // the error dialog is modal and shrugs off SIGTERM
  const opened = fs.existsSync(result);
  console.log(opened ? 'refuse: FAIL, page opened with network' : 'refuse: ok, process with network refused');
  process.exit(opened ? 1 : 0);
}, 6000);
