import { app } from 'electron';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { isInside, patternFolder } from '../../permissions/patterns.ts';
import type { Use } from '../../permissions/tags.ts';
import { APP_ROOT, DATA, PAGE_DATA, pageAppId, SECRETS_DATA } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

const DEVICE_CAPABILITIES: Partial<Record<Use, string>> = { camera: 'webcam', microphone: 'microphone', location: 'location', usb: 'usb', serial: 'serialcommunication', hid: 'humaninterfacedevice' };
const WXC_EXEC = app.isPackaged ? path.join(process.resourcesPath, 'mxc', 'wxc-exec.exe') : path.join(APP_ROOT, 'node_modules', '@microsoft', 'mxc-sdk', 'bin', process.arch, 'wxc-exec.exe');

export const windows: TrampolinePlatform = {
  async prepare(page, permissions) {
    const written = permissions.write.map(patternFolder);
    const reachesData = written.find(folder => isInside(DATA, folder) || isInside(folder, DATA));
    const reachesSecrets = [...permissions.read.map(patternFolder), ...written].find(folder => isInside(SECRETS_DATA, folder));

    // The sandbox nests no read-only folder in a writable one, and the reverse would let a page write in Apargon's data. A folder that holds the secrets would grant them too.
    if (reachesData) {
      throw new Error(`On Windows a page may not change ${reachesData}: it holds or is inside Apargon's data. Name another folder.`);
    } else if (reachesSecrets) {
      throw new Error(`On Windows a page may not see ${reachesSecrets}: it holds the secrets pages keep. Name a folder inside it.`);
    }

    const pageFolder = path.dirname(page);
    // A folder named twice keeps one grant: one also listed could not be read. So each folder is named once, with the most it needs.
    const writable = [fs.realpathSync(app.getPath('temp')), PAGE_DATA, ...written];
    // Every sandbox may read Windows' own folder already.
    const programFolders = Object.values(permissions.run).map(program => path.dirname(program)).filter(folder => !isInside(folder, process.env.SYSTEMROOT!) && !isInside(folder, pageFolder));
    const readable = [path.dirname(process.execPath), APP_ROOT, DATA, pageFolder, ...permissions.read.map(patternFolder), ...programFolders].filter(folder => !writable.some(writableFolder => isInside(folder, writableFolder)));
    const granted = [...readable, ...writable];
    fs.mkdirSync(PAGE_DATA, { recursive: true });
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
      command: (apargon, env) => {
        const request = {
          version: '1.0.0',
          containment: 'processcontainer',
          process: { commandLine: apargon.map(arg => `"${arg}"`).join(' '), env: Object.entries(env).map(([name, value]) => `${name}=${value}`), timeout: 0 },
          filesystem: { readonlyPaths: readable, readwritePaths: writable, deniedPaths: [...permissions.hidden.filter(secret => fs.existsSync(secret)), SECRETS_DATA] },
          // Deny for every page, not MXC's default. A proxy on this computer's loopback needs both directions of the private network allowed; the firewall rules still let the page reach only the proxy.
          ...(proxyPort === null
            ? { network: { egress: { default: 'deny' } } }
            : { network: { egress: { default: 'deny' }, ingress: { default: 'allow', hostLoopback: 'allow' } }, runtimeConfig: { networkProxy: `http://127.0.0.1:${proxyPort}` } }),
          // Chromium decides what the page may read from the clipboard; the user's own paste needs the rest.
          ui: { disable: false, clipboard: 'all' },
          processContainer: { filesystem: { enumeratePaths: [...parents] }, capabilities: permissions.use.flatMap(name => DEVICE_CAPABILITIES[name] ?? []) },
        };

        return [WXC_EXEC, '--config-base64', Buffer.from(JSON.stringify(request)).toString('base64')];
      },
      // MXC's executor passes the page only standard input, output and error, and input only once it closes: messages come on standard output, mixed with the page's other output, which is passed on.
      stdio: ['ignore', 'pipe', 'pipe'],
      requestFd: 1,
      repliesInFile: true,
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
};
