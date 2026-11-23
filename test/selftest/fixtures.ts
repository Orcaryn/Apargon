import fs from 'fs';
import os from 'os';
import path from 'path';
import { pappRecords } from '../../src/trampoline/records/pappRecords/index.ts';

// Imported by the runner, or executed before the installed app's self-tests. No tests run here.
const papps = path.join(import.meta.dirname, 'papps');
const results = path.join(papps, 'results');
fs.mkdirSync(path.join(fs.realpathSync.native(os.homedir()), '.ssh'), { recursive: true, mode: 0o700 });
fs.mkdirSync(results, { recursive: true });
fs.mkdirSync(path.join(papps, 'touched'), { recursive: true });

// selftest.papp's picks, as if the user picked them: a folder to write in, emptied each run, and a file. In Apargon's records, in the data folder Electron gives `electron .`.
const picked = path.join(results, 'picked');
const pickedFile = path.join(results, 'picked-file.txt');
fs.rmSync(picked, { recursive: true, force: true });
fs.mkdirSync(picked);
fs.writeFileSync(pickedFile, '');
const appData = {
  darwin: path.join(os.homedir(), 'Library', 'Application Support'),
  linux: process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
  win32: process.env.APPDATA!,
}[process.platform as 'darwin' | 'linux' | 'win32'];
const records = path.join(appData, 'apargon', 'papps');
fs.mkdirSync(records, { recursive: true });
pappRecords(records).change(fs.realpathSync.native(path.join(papps, 'selftest.papp')), {
  picks: [
    { path: fs.realpathSync.native(picked), write: true, folder: true },
    { path: fs.realpathSync.native(pickedFile), write: true, folder: false },
  ],
});

// Each .papp file writes its result in its own folder: the last run's go first.
const own = path.join(os.homedir(), '.apargon');

for (const folder of fs.existsSync(own) ? fs.readdirSync(own) : []) {
  for (const name of fs.readdirSync(path.join(own, folder)).filter(each => /^selftest-result-.+\.json$|^(papp|program)-written\.txt$/.test(each))) {
    fs.rmSync(path.join(own, folder, name));
  }
}
