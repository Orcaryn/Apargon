import { execFileSync, spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';

// The page quits when the trampoline dies: its pipe from the trampoline ends. Control: until then, it stays open.
const electron: string = createRequire(import.meta.url)('electron');
const page = path.join(import.meta.dirname, 'pages', 'stay.papp');
const trampoline = spawn(electron, ['.', page], { stdio: 'inherit', env: { ...process.env, APARGON_TEST_ALLOW: '1' } });

// Apargon's page processes for this page: each names it, and only Chromium's helpers have --type=.
const pageProcesses = () => {
  const list =
    process.platform === 'win32' ?
      execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }'], { encoding: 'utf8' })
    : execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' });

  return list
    .split(/\r?\n/)
    .map(line => line.trim().match(/^(\d+) (.*)$/))
    .filter(
      match => match && match[2].includes('stay.papp') && !match[2].includes('--type=') && !/\b(?:bwrap|sandbox-exec)\b/.test(match[2]) && Number(match[1]) !== trampoline.pid
    )
    .map(match => Number(match![1]));
};

const waitFor = async (done: () => boolean, ms: number) => {
  for (const end = Date.now() + ms; !done(); await sleep(250)) {
    if (Date.now() > end) {
      return false;
    }
  }

  return true;
};

const started = await waitFor(() => pageProcesses().length > 0, 60_000);
const pids = pageProcesses();
await sleep(3000);
const stayed = pageProcesses().length > 0;
trampoline.kill('SIGKILL');
const quit = await waitFor(() => pageProcesses().length === 0, 15_000);
pageProcesses().forEach(pid => process.kill(pid, 'SIGKILL'));

const failure =
  !started ? 'the page process never started'
  : !stayed ? 'the page quit with the trampoline still running'
  : !quit ? 'the page still ran 15 s after the trampoline died'
  : null;
console.log(failure ? `trampoline-gone: FAIL, ${failure}` : `trampoline-gone: ok, page ${pids.join(', ')} quit with the trampoline`);
process.exit(failure ? 1 : 0);
