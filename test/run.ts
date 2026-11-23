import { execFileSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import './selftest/fixtures.ts';

// pnpm test, on macOS, Linux and Windows: each step in turn, from the repo's root. The first that fails, or still runs after 5 minutes, stops the run.
// listen.ts serves the ports and socket files a .papp file declares, and ones it does not, while the .papp file runs.
const electron: string = createRequire(import.meta.url)('electron');
const node = process.execPath;
const papps = 'test/selftest/papps';
const steps = [
  // Node's test runner takes the pattern itself, and runs each file in a process of its own.
  [node, '--test', 'test/node/*.ts'],
  [node, 'test/selftest/refuse.ts'],
  [node, 'test/selftest/daemons.ts'],
  [electron, '.', `${papps}/selftest.papp`],
  [node, 'test/selftest/trampoline-gone.ts'],
  ...(process.platform === 'win32' ?
    [
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-win.papp`],
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-win-programs.papp`],
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-system.papp`],
      [electron, '.', `${papps}/selftest-win-devices.papp`],
    ]
  : [
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-system.papp`],
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-net.papp`],
      [node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-socket.papp`],
      ...(process.platform === 'darwin' ? [[node, 'test/selftest/listen.ts', electron, '.', `${papps}/selftest-mac.papp`]] : []),
    ]),
  [node, 'test/selftest/check.ts'],
];
const root = path.join(import.meta.dirname, '..');

// fixtures.ts clears the last run's results. The Windows checks need a real Documents folder.
if (process.platform === 'win32') {
  fs.mkdirSync(path.join(os.homedir(), 'Documents'), { recursive: true });
}

for (const [command, ...args] of steps) {
  // APARGON_TEST_ALLOW answers the popup, in dev builds only.
  execFileSync(command, args, { cwd: root, stdio: 'inherit', timeout: 5 * 60 * 1000, env: { ...process.env, APARGON_TEST_ALLOW: '1', APARGON_TEST_ENV: 'passed' } });
}
