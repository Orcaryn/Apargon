// The offline check must not trust the environment: PAPP set by hand, with nothing
// holding the network shut, must refuse to open the page. Exits 1 if a page opened.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { declaredPermissions } from '../src/permissions/tags.ts';

const electron: string = createRequire(import.meta.url)('electron');
const result = path.join(import.meta.dirname, 'result.json');
fs.rmSync(result, { force: true });

const page = path.join(import.meta.dirname, 'selftest.papp');
// The page's own tags, so that it could write result.json if it opened.
const permissions = declaredPermissions(page);
const child = spawn(electron, ['.', page], { env: { ...process.env, PAPP: JSON.stringify({ page, permissions, proxy: null, bridges: [] }) }, stdio: 'inherit' });
setTimeout(() => {
  child.kill('SIGKILL'); // the error dialog is modal and shrugs off SIGTERM
  const opened = fs.existsSync(result);
  console.log(opened ? 'refuse: FAIL, page opened with network' : 'refuse: ok, process with network refused');
  process.exit(opened ? 1 : 0);
}, 6000);
