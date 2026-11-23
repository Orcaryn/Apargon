import fs from 'fs';
import os from 'os';
import path from 'path';

// Imported by the runner, or executed before the installed app's self-tests. No tests run here.
const papps = path.join(import.meta.dirname, 'papps');
const results = path.join(papps, 'results');
fs.mkdirSync(path.join(fs.realpathSync.native(os.homedir()), '.ssh'), { recursive: true, mode: 0o700 });
fs.mkdirSync(results, { recursive: true });
fs.mkdirSync(path.join(papps, 'touched'), { recursive: true });

// selftest.papp's picks, as if the user picked them: a folder to write in, emptied each run, and a file. Under APARGON_TEST_ALLOW, Apargon's pick dialog gives these.
const picked = path.join(results, 'picked');
const pickedFile = path.join(results, 'picked-file.txt');
fs.rmSync(picked, { recursive: true, force: true });
fs.mkdirSync(picked);
fs.writeFileSync(pickedFile, '');
export const TEST_PICKS = { APARGON_TEST_PICK_FOLDER: fs.realpathSync.native(picked), APARGON_TEST_PICK_FILE: fs.realpathSync.native(pickedFile) };

// Each .papp file writes its result in its own folder: the last run's go first.
const own = path.join(os.homedir(), '.apargon');

for (const folder of fs.existsSync(own) ? fs.readdirSync(own) : []) {
  for (const name of fs.readdirSync(path.join(own, folder)).filter(each => /^selftest-result-.+\.json$|^(papp|program)-written\.txt$/.test(each))) {
    fs.rmSync(path.join(own, folder, name));
  }
}
