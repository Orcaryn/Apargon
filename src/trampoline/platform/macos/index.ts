import { app } from 'electron';
import { spawn, spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APP_ROOT } from '../../../shared/data/index.ts';
import { REPLY_FD, REQUEST_FD } from '../../../shared/wire/protocol/index.ts';
import type { Sandbox, TrampolinePlatform } from '../index.ts';
import { startPiped } from '../pipes/index.ts';

const USER_TEMP = fs.realpathSync(app.getPath('temp'));
const HOME = fs.realpathSync(os.homedir());
// Where macOS keeps iCloud Drive, Dropbox, OneDrive and Google Drive. Reading an online-only file there downloads it.
const CLOUD = ['Library/CloudStorage', 'Library/Mobile Documents'].map(name => path.join(HOME, name));
// The devices every .papp file gets. Any other, like the SMB device or BPF, could reach past "no network".
const DEVICES = ['(literal "/dev/null")', '(literal "/dev/zero")', '(literal "/dev/random")', '(literal "/dev/urandom")', '(literal "/dev/dtracehelper")', '(subpath "/dev/fd")', '(literal "/dev/autofs_nowait")'];

export const macos: TrampolinePlatform = {
  // Electron itself refuses a macOS older than it supports, and every macOS has sandbox-exec.
  unsupported: async () => null,
  unsafeDesktop: false,
  // The .app bundle: Apargon.app/Contents/MacOS/Apargon.
  installed: app.isPackaged ? path.resolve(process.execPath, '../../..') : null,
  async prepare(sandbox) {
    const { proxyPort, permissions } = sandbox;
    // A temp folder of its own: the shared one holds other apps' files. Chromium takes its own variable for it, Node TMPDIR.
    const temp = fs.mkdtempSync(path.join(USER_TEMP, 'apargon-page-'));
    const profile = permissions.system ? null : pageProfile(sandbox, temp);
    // Files its programs write are marked when it closes: the ones newer than this.
    const started = path.join(temp, '.started');
    fs.writeFileSync(started, '');
    const programProfile = permissions.system ? null : `${profile}\n; Programs get no services: through one, a program could ask another to go online for it.\n(deny mach-lookup)\n`;

    return {
      start: (apargon, env) => startPiped([...(profile ? ['/usr/bin/sandbox-exec', '-p', profile] : []), ...apargon], ['ignore', 'pipe', 'pipe', 'pipe', 'ignore', 'pipe'], { ...env, TMPDIR: temp, MAC_CHROMIUM_TMPDIR: temp }),
      requestFd: REQUEST_FD,
      replyFd: REPLY_FD,
      muxFd: null,
      proxy: proxyPort === null ? null : `127.0.0.1:${proxyPort}`,
      relays: [],
      relayTargets: {},
      // A sandbox can't start a stricter one inside it, so the trampoline starts the programs.
      programsHere: false,
      startProgram: (file, args, cwd, env) => spawn('/usr/bin/sandbox-exec', ['-p', programProfile!, file, ...args], { cwd, env: { ...env, TMPDIR: temp }, detached: true }),
      close() {
        markNewFiles(permissions.system || permissions.writeAll ? [] : [sandbox.own, ...permissions.write], started);

        // A folder the process left read-only, or a program still writing there, makes this fail. Logged, not thrown.
        try {
          fs.rmSync(temp, { recursive: true });
        } catch (err) {
          console.error(`Apargon: could not remove ${temp}: ${(err as Error).message}`);
        }
      },
    };
  },
  // The quarantine mark says the file was downloaded. Spotlight keeps where from, the page last.
  downloadAddress(page) {
    if (spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', page]).status !== 0) {
      return null;
    }

    const whereFroms = spawnSync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemWhereFroms', page], { encoding: 'utf8' }).stdout;

    return [...whereFroms.matchAll(/"([^"]+)"/g)].at(-1)?.[1] ?? '';
  },
  pageIcon(page, png) {
    const hash = createHash('sha256').update(png).digest('hex');

    if (fs.lstatSync(page).isSymbolicLink() || spawnSync('/usr/bin/xattr', ['-p', 'com.apargon.icon', page], { encoding: 'utf8' }).stdout.trim() === hash) {
      return;
    }

    const script = `function run([page, png]) {
      ObjC.import('AppKit');
      const image = $.NSImage.alloc.initWithData($.NSData.alloc.initWithBase64EncodedStringOptions(png, 0));
      $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, page, 0);
    }`;
    spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, page, png]);
    spawnSync('/usr/bin/xattr', ['-w', 'com.apargon.icon', hash, page]);
  },
  markWritten(file) {
    spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};Apargon;${randomUUID().toUpperCase()}`, file]);
  },
  // A launch agent: login items take no arguments, so they could not name the .papp file. Written only when it changes, as macOS tells the user each time.
  startAtLogin(page, on) {
    const label = `com.apargon.page.${createHash('sha256').update(page).digest('hex').slice(0, 16)}`;
    const agent = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const args = [process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), page].map(arg => `<string>${arg.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</string>`);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.join('')}</array><key>RunAtLoad</key><true/></dict></plist>
`;

    if (!on) {
      fs.rmSync(agent, { force: true });
    } else if (!fs.existsSync(agent) || fs.readFileSync(agent, 'utf8') !== plist) {
      fs.mkdirSync(path.dirname(agent), { recursive: true });
      fs.writeFileSync(agent, plist);
    }
  },
  noFollow: fs.constants.O_NOFOLLOW,
  autoUpdates: true,
  trayClicks: true,
};

// What its programs wrote, as macOS marks a download, so the Mac asks before running it. Not its Electron data.
function markNewFiles(folders: string[], since: string) {
  const mark = `0083;${Math.floor(Date.now() / 1000).toString(16)};Apargon;${randomUUID().toUpperCase()}`;

  for (const folder of folders.map(each => each.replace(/\/$/, '')).filter(each => fs.existsSync(each))) {
    spawnSync('/usr/bin/find', [folder, '-path', path.join(folder, '.electron'), '-prune', '-o', '-type', 'f', '-newer', since, '-exec', '/usr/bin/xattr', '-w', 'com.apple.quarantine', mark, '{}', '+']);
  }
}

// Seatbelt takes the last rule that matches. Reads: every local disk. Writes: its own folder and papp-write. No network but the proxy. No mounting, no other devices, no opening other apps.
function pageProfile({ permissions, own, storage, protectedFolders, proxyPort }: Sandbox, temp: string) {
  const quote = (file: string) => {
    if (/["\\\p{Cc}]/u.test(file)) {
      throw new Error(`${file} has a " or a \\ in its name, which the sandbox can't take. Rename it.`);
    }

    return `"${file}"`;
  };

  const { remote, local } = mounts();
  const unread = [...remote, '/Volumes', '/Network', ...(permissions.use.includes('cloud') ? [] : CLOUD)];
  const writable = permissions.writeAll ? null : [own, storage, temp, ...permissions.write];

  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    // The resolver's service: Network.framework looks names up through it, off this computer, past "no network".
    '(deny mach-lookup (global-name "com.apple.dnssd.service"))',
    ...(proxyPort === null ? [] : [`(allow network-outbound (remote tcp4 "localhost:${proxyPort}"))`]),
    ...permissions.sockets.map(socket => `(allow network-outbound (literal ${quote(socket)}))`),
    // Network drives and cloud folders: reading one sends a request. /Volumes is refused whole, so a drive attached later is too, and the local ones attached now are put back.
    `(deny file-read* ${unread.map(folder => `(subpath ${quote(folder)})`).join(' ')})`,
    `(allow file-read* (literal "/Volumes") ${local.map(folder => `(subpath ${quote(folder)})`).join(' ')})`,
    // The kernel connects for a mount, past "no network".
    '(deny file-mount)',
    // Another app, or an Apple Event to one, would run outside the sandbox. Receiving them stays: Quit, logout, and a .papp file opened while it runs.
    '(deny lsopen)',
    '(deny appleevent-send)',
    '(deny user-preference-write)',
    '(deny file-write*)',
    writable ? `(allow file-write* ${writable.map(folder => `(subpath ${quote(folder.replace(/[\\/]$/, ''))})`).join(' ')})` : '(allow file-write*)',
    // Apargon's data holds the approvals, the .papp files' folders hold each other, and the app is the app: none is written, even under papp-write all.
    `(deny file-write* ${protectedFolders.map(folder => `(subpath ${quote(folder)})`).join(' ')})`,
    `(allow file-write* (subpath ${quote(own)}))`,
    // Last: the devices it may open. No terminal, not even by name: through it the .papp file could type into the shell that started Apargon.
    '(deny file-read* file-write* file-ioctl (subpath "/dev"))',
    `(allow file-read* file-write* file-ioctl ${DEVICES.join(' ')})`,
    '(allow file-read-metadata (literal "/dev"))',
    // Web Serial opens the port from this process.
    ...(permissions.use.includes('serial') ? ['(allow file-read* file-write* file-ioctl (regex #"^/dev/cu\\."))'] : []),
  ].join('\n');
}

// Every disk mounted now, by whether it is on this computer. A network drive is refused wherever it is mounted.
function mounts() {
  const lines = spawnSync('/sbin/mount', { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const parsed = lines.map(line => /^.+? on (.+) \(([^)]*)\)$/.exec(line)).filter(match => match !== null).map(([, where, flags]) => ({ where, local: flags.split(', ').includes('local') }));

  return { remote: parsed.filter(mount => !mount.local).map(mount => mount.where), local: parsed.filter(mount => mount.local && mount.where.startsWith('/Volumes/')).map(mount => mount.where) };
}
