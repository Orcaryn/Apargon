import { app } from 'electron';
import { spawn, spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { HOME } from '../../../permissions/paths/index.ts';
import { PERMISSIONS_PLATFORM } from '../../../permissions/platform/index.ts';
import { APP_ROOT, SECRETS_DATA } from '../../../shared/data/index.ts';
import { REPLY_FD, REQUEST_FD } from '../../../shared/wire/protocol/index.ts';
import type { Sandbox, TrampolinePlatform } from '../index.ts';
import { startPiped } from '../pipes/index.ts';

const USER_TEMP = fs.realpathSync(app.getPath('temp'));
// The devices every .papp file gets. Any other, like the SMB device or BPF, could reach past "no network".
const DEVICES = ['(literal "/dev/null")', '(literal "/dev/zero")', '(literal "/dev/random")', '(literal "/dev/urandom")', '(literal "/dev/dtracehelper")', '(subpath "/dev/fd")', '(literal "/dev/autofs_nowait")'];

export const macos: TrampolinePlatform = {
  os: 'darwin',
  // Electron itself refuses a macOS older than it supports, and every macOS has sandbox-exec.
  unsupported: async () => null,
  isX11: false,
  // The .app bundle: Apargon.app/Contents/MacOS/Apargon.
  installed: app.isPackaged ? path.resolve(process.execPath, '../../..') : null,
  async prepare(sandbox) {
    const { proxyPort, permissions } = sandbox;
    // A temp folder of its own: the shared one holds other apps' files. Chromium takes its own variable for it, Node TMPDIR.
    const temp = fs.mkdtempSync(path.join(USER_TEMP, 'apargon-papp-'));
    const profile = permissions.system ? null : pappProfile(sandbox, temp);
    const programProfile = permissions.system ? null : `${profile}\n; Programs get no Mach services (except the offline Metal shader compiler), IOKit property writes, kernel control sockets or NECP.\n(deny mach-lookup mach-per-user-lookup mach-cross-domain-lookup mach-register iokit-set-properties system-socket necp-client-open)\n(allow mach-lookup (xpc-service-name "com.apple.MTLCompilerService"))\n`;

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
        // A folder the process left read-only, or a program still writing there, makes this fail. Logged, not thrown.
        try {
          fs.rmSync(temp, { recursive: true });
        } catch (err) {
          console.error(`Apargon: could not remove ${temp}: ${(err as Error).message}`);
        }
      },
    };
  },
  // The quarantine mark says the file was downloaded. Spotlight keeps where from, the .papp file last.
  downloadAddress(papp) {
    if (spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', papp]).status !== 0) {
      return null;
    }

    const whereFroms = spawnSync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemWhereFroms', papp], { encoding: 'utf8' }).stdout;

    return [...whereFroms.matchAll(/"([^"]+)"/g)].at(-1)?.[1] ?? '';
  },
  pappIcon(papp, png) {
    const hash = createHash('sha256').update(png).digest('hex');

    if (fs.lstatSync(papp).isSymbolicLink() || spawnSync('/usr/bin/xattr', ['-p', 'com.apargon.icon', papp], { encoding: 'utf8' }).stdout.trim() === hash) {
      return;
    }

    const script = `function run([papp, png]) {
      ObjC.import('AppKit');
      const image = $.NSImage.alloc.initWithData($.NSData.alloc.initWithBase64EncodedStringOptions(png, 0));
      $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, papp, 0);
    }`;
    spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, papp, png]);
    spawnSync('/usr/bin/xattr', ['-w', 'com.apargon.icon', hash, papp]);
  },
  markWritten(file) {
    spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};Apargon;${randomUUID().toUpperCase()}`, file]);
  },
  // A launch agent: login items take no arguments, so they could not name the .papp file. Written only when it changes, as macOS tells the user each time.
  startAtLogin(papp, on) {
    const label = `com.apargon.papp.${createHash('sha256').update(papp).digest('hex').slice(0, 16)}`;
    const agent = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const args = [process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), papp].map(arg => `<string>${arg.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</string>`);
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

// Seatbelt takes the last rule that matches. Reads: every local disk, but not the secrets. Writes: its own folder and papp-write. No network but the proxy. No mounting, no other devices, no opening other apps.
function pappProfile({ permissions, own, storage, protectedFolders, proxyPort }: Sandbox, temp: string) {
  const quote = (file: string) => {
    if (/["\\\p{Cc}]/u.test(file)) {
      throw new Error(`${file} has a " or a \\ in its name, which the sandbox can't take. Rename it.`);
    }

    return `"${file}"`;
  };

  const { remote, local } = mounts();
  const offLimits = [...remote, '/Network', ...(permissions.use.includes('cloud') ? [] : PERMISSIONS_PLATFORM.cloudFolders(HOME))].map(folder => `(subpath ${quote(folder)})`).join(' ');
  const localVolumes = local.map(folder => `(subpath ${quote(folder)})`).join(' ');

  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    // The resolver's service: Network.framework looks names up through it, off this computer, past "no network".
    '(deny mach-lookup (global-name "com.apple.dnssd.service"))',
    ...(proxyPort === null ? [] : [`(allow network-outbound (remote tcp4 "localhost:${proxyPort}"))`]),
    ...permissions.sockets.map(socket => `(allow network-outbound (literal ${quote(socket)}))`),
    // Network drives and cloud folders: reading one sends a request. /Volumes is refused whole, so a drive attached later is too, and the local ones attached now are put back. Seatbelt keeps the last rule that matches, so the rest are refused after them.
    '(deny file-read* (subpath "/Volumes"))',
    `(allow file-read* (literal "/Volumes") ${localVolumes})`,
    `(deny file-read* ${offLimits})`,
    `(deny file-read* (subpath ${quote(SECRETS_DATA)}))`,
    // The kernel connects for a mount or automount, past "no network".
    '(deny file-mount system-automount)',
    // Another app, an Apple Event, a broadcast, a background job or fake input would reach outside the sandbox. Receiving Apple Events stays: Quit, logout, and a .papp file opened while it runs.
    '(deny lsopen appleevent-send distributed-notification-post hid-control job-creation user-preference-write)',
    ...(permissions.use.includes('camera') ? [] : ['(deny device-camera)']),
    ...(permissions.use.includes('microphone') ? [] : ['(deny device-microphone)']),
    ...(permissions.writeAll ?
      ['(deny file-write* (subpath "/Volumes"))', ...(local.length ? [`(allow file-write* ${localVolumes})`] : []), `(deny file-write* ${offLimits})`]
    : ['(deny file-write*)', `(allow file-write* ${[own, storage, temp, ...permissions.write].map(folder => `(subpath ${quote(folder.replace(/[\\/]$/, ''))})`).join(' ')})`]),
    // The .papp files' folders hold each other and Apargon's data, and the app is the app: none is written, even under papp-write all.
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
