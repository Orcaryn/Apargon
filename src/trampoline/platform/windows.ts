import { app } from 'electron';
import { EventEmitter } from 'events';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { finished } from 'stream/promises';
import type { ContainerRequest } from '@microsoft/mxc-sdk/v1';
import { isInside, literalBase } from '../../permissions/patterns.ts';
import type { Use } from '../../permissions/tags.ts';
import { APP_ROOT, DATA, pageAppId, pageStorage, SECRETS_DATA } from '../../shared/data.ts';
import type { PageProcess, TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

const DEVICE_CAPABILITIES: Partial<Record<Use, string>> = { camera: 'webcam', microphone: 'microphone', location: 'location', usb: 'usb', serial: 'serialcommunication', hid: 'humaninterfacedevice' };

export const windows: TrampolinePlatform = {
  async prepare(page, permissions) {
    const seen = permissions.read.map(literalBase);
    const written = permissions.write.map(literalBase);
    const pageFolder = path.dirname(page);
    // Every sandbox may read Windows' own folder already.
    const programFolders = Object.values(permissions.run).map(program => path.dirname(program)).filter(folder => !isInside(folder, process.env.SYSTEMROOT!) && !isInside(folder, pageFolder));
    const reachesData = written.find(folder => isInside(DATA, folder) || isInside(folder, DATA));
    const holdsPagesSecrets = [...seen, ...written, pageFolder, ...programFolders].find(folder => isInside(SECRETS_DATA, folder));

    // The sandbox nests no read-only folder in a writable one, and the reverse would let a page write in Apargon's data. A folder that holds the secrets would grant them too: a tag's, the page's own, or a program's.
    if (reachesData) {
      throw new Error(`On Windows a page may not change ${reachesData}: it holds or is inside Apargon's data. Name another folder.`);
    } else if (holdsPagesSecrets) {
      throw new Error(`On Windows a page may not see ${holdsPagesSecrets}: it holds the secrets Apargon keeps for pages. Keep the page, its programs and its folders inside a folder of their own.`);
    }

    // A folder named twice keeps one grant: one also listed could not be read. So each folder is named once, with the most it needs.
    const storage = pageStorage(page);
    const writable = [fs.realpathSync(app.getPath('temp')), storage, ...written];
    const readable = [path.dirname(process.execPath), APP_ROOT, DATA, pageFolder, ...seen, ...programFolders].filter(folder => !writable.some(writableFolder => isInside(folder, writableFolder)));
    const granted = [...readable, ...writable];
    fs.mkdirSync(storage, { recursive: true });
    const proxy = permissions.net.length ? await startProxy(permissions.net, null) : null;
    const proxyPort = proxy && (proxy.address() as AddressInfo).port;
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

    return {
      start: (apargon, env) =>
        startContained({
          command: apargon.map(arg => `"${arg}"`).join(' '),
          environment: env,
          // Not where Apargon was started from: MXC would grant that folder.
          workingDirectory: pageFolder,
          containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: [...parents] }, capabilities: permissions.use.flatMap(name => DEVICE_CAPABILITIES[name] ?? []) } },
          filesystem: { readonlyPaths: readable, readwritePaths: writable, deniedPaths: [SECRETS_DATA] },
          // Deny for every page, not MXC's default. A proxy on this computer's loopback needs both directions of the private network allowed; the firewall rules still let the page reach only the proxy.
          network: proxyPort === null ? { egress: { default: 'deny' } } : { egress: { default: 'deny' }, ingress: { default: 'allow', hostLoopback: 'allow' }, runtimeConfig: { networkProxy: `http://127.0.0.1:${proxyPort}` } },
          // Chromium decides what the page may read from the clipboard; the user's own paste needs the rest.
          ui: { disable: false, clipboard: 'all' },
        }),
      // The page's requests come on its standard output, mixed with its other output, which is passed on. The replies go to its standard input.
      requestFd: 1,
      replyFd: 0,
      proxyPort,
      bridges: [],
      close: () => proxy?.close(),
    };
  },
  installHint: '. Apargon needs Windows 11 24H2 or later, updated to September 2026 or later.',
  downloadAddress(page) {
    try {
      return /^(?:HostUrl|ReferrerUrl)=(.+)$/m.exec(fs.readFileSync(`${page}:Zone.Identifier`, 'utf8'))?.[1].trim() ?? '';
    } catch {
      return null;
    }
  },
  markDownloaded(file) {
    try {
      fs.writeFileSync(`${file}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
    } catch {
      // A drive without file streams, like a USB stick, takes no mark: the file stays, unmarked.
    }
  },
  // A Run value of its own per page, named as its taskbar button.
  startAtLogin(page, on) {
    app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [...(app.isPackaged ? [] : [APP_ROOT]), page].map(arg => `"${arg}"`), name: pageAppId(page) });
  },
  // Windows has none; making a link there needs an administrator or developer mode.
  noFollow: 0,
  autoUpdates: false,
  trayClicks: true,
};

// Through MXC's library, not its wxc-exec.exe: that one hands the page its standard input only once it closes, so no reply could arrive while the page runs.
async function startContained(request: ContainerRequest): Promise<PageProcess> {
  // The installed app keeps the library beside the others in its resources, outside the archive it cannot load one from.
  if (app.isPackaged) {
    process.env.MXC_FFI_DIR = path.join(process.resourcesPath, 'mxc');
  }

  // Loaded here: it loads a Windows library, which the other systems' builds leave out.
  const { spawn } = await import('@microsoft/mxc-sdk/v1');
  const contained = await spawn(request, { telemetry: { enabled: false } });
  const output = contained.standardOutput!;
  const page = Object.assign(new EventEmitter(), { requests: output, output, errors: contained.standardError!, replies: contained.standardInput! });
  // wait() settles on process exit, not on consumption of the transferred streams.
  // Attach immediately, but let the caller's readers drain them before disposing the SDK handles.
  void Promise.allSettled([contained.wait(), finished(output, { readable: true, writable: false, cleanup: true }), finished(page.errors, { readable: true, writable: false, cleanup: true })]).then(results => {
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
  }).catch((err: Error) => console.error(`Apargon: ${err.message}`));

  return page;
}
