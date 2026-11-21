import { app } from 'electron';
import { spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import type { ContainerRequest } from '@microsoft/mxc-sdk/v1';
import { HOME, isInside } from '../../../permissions/paths/index.ts';
import type { Use } from '../../../permissions/tags/index.ts';
import { APP_ROOT, pageAppId, SECRETS_DATA } from '../../../shared/data/index.ts';
import type { PageProcess, TrampolinePlatform } from '../index.ts';
import { startPiped } from '../pipes/index.ts';

const DEVICE_CAPABILITIES: Partial<Record<Use, string>> = { camera: 'webcam', microphone: 'microphone', location: 'location', usb: 'usb', serial: 'serialcommunication', hid: 'humaninterfacedevice', bluetooth: 'bluetooth' };
// The root's folders Windows keeps for itself.
const SKIPPED_ROOTS = ['$recycle.bin', 'system volume information', '$windows.~bt', '$windows.~ws', '$winreagent', 'recovery'];

export const windows: TrampolinePlatform = {
  // Asked of MXC: only its ProcessContainer is tested.
  async unsupported() {
    // The installed app keeps the library beside the others in its resources, outside the archive it can't load one from.
    if (app.isPackaged) {
      process.env.MXC_FFI_DIR = path.join(process.resourcesPath, 'mxc');
    }

    try {
      const { probe } = await import('@microsoft/mxc-sdk/v1');
      const { tier, error } = probe();

      return tier === 'base-container' ? null : `Apargon needs Windows 11 with ProcessContainer, which this Windows doesn't have${error ? ` (${error})` : ''}. Update Windows, then try again.`;
    } catch (err) {
      return `Apargon needs Windows 11 with ProcessContainer, which this Windows doesn't have (${(err as Error).message}).`;
    }
  },
  unsafeDesktop: false,
  installed: app.isPackaged ? path.dirname(process.execPath) : null,
  async prepare(sandbox) {
    const { page, permissions, own, protectedFolders, proxyPort } = sandbox;
    const everything = readableRoots(permissions.use.includes('cloud'));
    const temp = fs.realpathSync(app.getPath('temp'));
    // papp-write all: every folder but Apargon's own, which stay read-only.
    const writable = [temp, own, ...(permissions.writeAll ? everything.flatMap(root => around(root, protectedFolders)) : permissions.write.map(folder => folder.replace(/[\\/]$/, '')))];
    // The sandbox nests no read-only folder in a writable one: each is named once, with the most it needs.
    const readable = [...everything, path.dirname(process.execPath), APP_ROOT].filter(folder => !writable.some(writableFolder => isInside(folder, writableFolder)));
    const granted = [...readable, ...writable];
    // Node and Electron check every folder from the drive root down, so the sandbox lists each folder above what it may open.
    const parents = new Set<string>();

    for (let folder of granted) {
      while (folder !== path.dirname(folder)) {
        folder = path.dirname(folder);

        if (!granted.some(grantedFolder => isInside(folder, grantedFolder))) {
          parents.add(folder);
        }
      }
    }

    const request = (command: string[], environment: NodeJS.ProcessEnv): ContainerRequest => ({
      command: command.map(arg => `"${arg}"`).join(' '),
      environment,
      // Not where Apargon was started from: MXC would grant that folder.
      workingDirectory: path.dirname(page),
      containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: [...parents] }, capabilities: permissions.use.flatMap(name => DEVICE_CAPABILITIES[name] ?? []) } },
      filesystem: { readonlyPaths: [...new Set(readable)], readwritePaths: [...new Set(writable)], deniedPaths: [SECRETS_DATA] },
      // Deny for every .papp file. A proxy on this computer's loopback needs both directions allowed; the firewall rules still let it reach only the proxy.
      network: proxyPort === null ? { egress: { default: 'deny' } } : { egress: { default: 'deny' }, ingress: { default: 'allow', hostLoopback: 'allow' }, runtimeConfig: { networkProxy: `http://127.0.0.1:${proxyPort}` } },
      ui: { disable: false, clipboard: 'all' },
    });

    return {
      start: (apargon, env) => (permissions.system ? startPiped(apargon, ['pipe', 'pipe', 'pipe'], env, 1, 0) : startContained(request(apargon, env))),
      // The requests come on its standard output, mixed with its other output. The replies go to its standard input.
      requestFd: 1,
      replyFd: 0,
      muxFd: null,
      proxy: proxyPort === null ? null : `127.0.0.1:${proxyPort}`,
      relays: [],
      relayTargets: {},
      // Started inside the container, they keep its limits.
      programsHere: true,
      close: () => undefined,
    };
  },
  downloadAddress(page) {
    try {
      return /^(?:HostUrl|ReferrerUrl)=(.+)$/m.exec(fs.readFileSync(`${page}:Zone.Identifier`, 'utf8'))?.[1].trim() ?? '';
    } catch {
      return null;
    }
  },
  markWritten(file) {
    try {
      fs.writeFileSync(`${file}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
    } catch {
      // A drive without file streams, like a USB stick, takes no mark.
    }
  },
  startAtLogin(page, on) {
    app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [...(app.isPackaged ? [] : [APP_ROOT]), page].map(arg => `"${arg}"`), name: pageAppId(page) });
  },
  // Windows has none. Making a link there needs an administrator or developer mode.
  noFollow: 0,
  autoUpdates: false,
  trayClicks: true,
};

// What a .papp file reads: the folders at the root of every local drive, and each item in the user's folder. MXC can't grant a drive whole. Network drives are skipped, and OneDrive unless papp-use cloud. A folder made at a root after start isn't readable until the next start.
function readableRoots(cloud: boolean) {
  const drives = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -in 'Fixed','Removable','CDRom' } | ForEach-Object { $_.RootDirectory.FullName }"], { encoding: 'utf8', windowsHide: true })
    .stdout.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[A-Z]:\\$/i.test(line));
  const entries = (folder: string) => fs.readdirSync(folder, { withFileTypes: true }).filter(entry => !entry.isSymbolicLink());
  const rootFolders = drives.flatMap(drive => entries(drive).filter(entry => entry.isDirectory() && !SKIPPED_ROOTS.includes(entry.name.toLowerCase())).map(entry => path.join(drive, entry.name)));
  // Not the registry's own files: Windows holds them open, and MXC can't grant one in use.
  const homeItems = entries(HOME).filter(entry => !/^ntuser\./i.test(entry.name) && (cloud || !/^onedrive/i.test(entry.name))).map(entry => path.join(HOME, entry.name));

  return [...rootFolders, ...homeItems];
}

// A folder, as folders that cover all of it but the kept ones: each kept one, and the folders above it, stay out.
function around(folder: string, kept: string[]): string[] {
  const inside = kept.filter(each => isInside(each, folder));

  if (!inside.length) {
    return [folder];
  } else if (inside.some(each => path.relative(folder, each) === '')) {
    return [];
  }

  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
      .flatMap(entry => around(path.join(folder, entry.name), inside));
  } catch {
    return [];
  }
}

// Through MXC's library, not its wxc-exec.exe: that one hands the process its standard input only once it closes, so no reply could arrive while it runs.
async function startContained(request: ContainerRequest): Promise<PageProcess> {
  // Loaded here: it loads a Windows library, which the other systems' builds leave out. unsupported() ran first, at start, and said where the library is.
  const { spawn } = await import('@microsoft/mxc-sdk/v1');
  const contained = await spawn(request, { telemetry: { enabled: false } });
  const output = contained.standardOutput!;
  const page = Object.assign(new EventEmitter(), { requests: output, output, errors: contained.standardError!, replies: contained.standardInput!, mux: null });
  // wait() settles on process exit, not on consumption of the streams. Attach now, but let the readers drain them before disposing.
  void Promise.allSettled([contained.wait(), finished(output, { readable: true, writable: false, cleanup: true }), finished(page.errors, { readable: true, writable: false, cleanup: true })])
    .then(results => {
      try {
        contained.dispose();
      } finally {
        page.emit('close');
      }

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(`Apargon: ${(result.reason as Error).message}`);
        }
      }
    })
    .catch((err: Error) => console.error(`Apargon: ${err.message}`));

  return page;
}

