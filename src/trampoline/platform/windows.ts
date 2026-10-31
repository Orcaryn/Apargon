import { app } from 'electron';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { isInside, patternFolder } from '../../permissions/patterns.ts';
import { APP_ROOT, DATA, PAGE_DATA } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

// MXC's executor, from the package in development and from the app's resources once built.
const WXC_EXEC = app.isPackaged ? path.join(process.resourcesPath, 'mxc', 'wxc-exec.exe') : path.join(APP_ROOT, 'node_modules', '@microsoft', 'mxc-sdk', 'bin', process.arch, 'wxc-exec.exe');

export const windows: TrampolinePlatform = {
  // ProcessContainer: Windows' own sandbox, through MXC. The page reaches no address but the proxy's.
  async prepare(page, permissions) {
    const written = permissions.write.map(patternFolder);
    const reachesData = written.find(folder => isInside(DATA, folder));

    // The sandbox cannot make a folder read-only inside a writable one, so a page may not write around Apargon's approvals.
    if (reachesData) {
      throw new Error(`On Windows a page may not change ${reachesData}: it holds Apargon's approvals. Name a folder inside it.`);
    }

    // A folder named twice keeps one grant: one also listed could not be read. So each folder is named once, with the most it needs.
    const writable = [fs.realpathSync(app.getPath('temp')), PAGE_DATA, ...written];
    const readable = [path.dirname(process.execPath), APP_ROOT, DATA, path.dirname(page), ...permissions.read.map(patternFolder)].filter(folder => !writable.some(writableFolder => isInside(folder, writableFolder)));
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
          filesystem: { readonlyPaths: readable, readwritePaths: writable, deniedPaths: permissions.hidden.filter(secret => fs.existsSync(secret)) },
          // Deny for every page, not MXC's default. A proxy on this computer's loopback needs both directions of the private network allowed; the firewall rules still let the page reach only the proxy.
          ...(proxyPort === null
            ? { network: { egress: { default: 'deny' } } }
            : { network: { egress: { default: 'deny' }, ingress: { default: 'allow', hostLoopback: 'allow' } }, runtimeConfig: { networkProxy: `http://127.0.0.1:${proxyPort}` } }),
          // Chromium decides what the page may read from the clipboard; the user's own paste needs the rest.
          ui: { disable: false, clipboard: 'all' },
          processContainer: { filesystem: { enumeratePaths: [...parents] } },
        };

        return [WXC_EXEC, '--config-base64', Buffer.from(JSON.stringify(request)).toString('base64')];
      },
      // MXC's executor passes the page only standard input, output and error, and input only once it closes: messages come on standard output, mixed with the page's other output, which is passed on.
      stdio: ['ignore', 'pipe', 'inherit'],
      requestFd: 1,
      repliesInFile: true,
      proxyPort,
      bridges: [],
      close: () => proxy?.close(),
    };
  },
  installHint: '. Apargon needs Windows 11 24H2 or later, updated to September 2026 or later.',
  // Windows marks a download in a stream beside the file, with the address it came from.
  downloadAddress(page) {
    try {
      return /^(?:HostUrl|ReferrerUrl)=(.+)$/m.exec(fs.readFileSync(`${page}:Zone.Identifier`, 'utf8'))?.[1].trim() ?? '';
    } catch {
      return null;
    }
  },
  autoUpdates: false,
};
