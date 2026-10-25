// leak.swift asks system services to fetch a URL. Outside the sandbox both must answer, or
// selftest-node's checks that the sandbox blocks them prove nothing. Builds test/leak
// (needs swiftc, from the Xcode Command Line Tools) and exits 1 unless both answer. macOS only.
import { execFileSync } from 'child_process';
import path from 'path';

if (process.platform !== 'darwin') {
  console.log('daemons: skipped, macOS only');
  process.exit(0);
}

const leak = path.join(import.meta.dirname, 'leak');
execFileSync('swiftc', ['-O', path.join(import.meta.dirname, 'leak.swift'), '-o', leak], { stdio: 'inherit' });
const answers = ['download', 'webkit'].map(mode => ({ mode, answered: execFileSync(leak, [mode, 'https://example.com/'], { encoding: 'utf8' }).trim() === 'answered' }));

answers.forEach(({ mode, answered }) =>
  console.log(answered ? `daemons: ok, ${mode} answers outside the sandbox` : `daemons: FAIL, ${mode} does not answer even outside the sandbox`)
);
process.exit(answers.every(({ answered }) => answered) ? 0 : 1);
