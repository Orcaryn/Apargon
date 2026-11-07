import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

// Imported by the runner, or executed before the installed app's self-tests. No tests run here.
const pages = path.join(import.meta.dirname, 'pages');
const results = path.join(pages, 'results');
const home = fs.realpathSync.native(os.homedir());
const ssh = path.join(home, '.ssh');
const symlinks = process.platform !== 'win32';
fs.mkdirSync(ssh, { recursive: true, mode: 0o700 });
fs.mkdirSync(results, { recursive: true });

if (symlinks) {
  for (const name of ['scratch-link', 'scratch-dangling', 'scratch-target.txt']) {
    fs.rmSync(path.join(pages, name), { force: true });
  }

  fs.writeFileSync(path.join(pages, 'scratch-target.txt'), 'target kept', { flag: 'wx' });
  fs.symlinkSync(path.join(pages, 'scratch-target.txt'), path.join(pages, 'scratch-link'));
  fs.symlinkSync(path.join(pages, 'missing-trash-target'), path.join(pages, 'scratch-dangling'));
}

// The probe names a known existing directory, not a HOME guessed from the checkout path.
fs.writeFileSync(path.join(results, 'home-probe.json'), JSON.stringify({ sshURL: pathToFileURL(fs.realpathSync.native(ssh) + path.sep).href, symlinks }));
