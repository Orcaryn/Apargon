// resworb: a browser turned inside out. The page gets full Node; the OS denies the
// process sockets and DNS. This file is both processes. Launched normally it is the
// trampoline: it spawns itself inside an OS network sandbox, and that child opens the page.
//
// A .nmth page names hosts in its head, <meta name="resworb-net" content="host:port">.
// The user approves the list once; the child may then reach one loopback port, where
// the trampoline runs a proxy to those hosts and nothing else. See SECURITY.md.

import { app, BrowserWindow, dialog, Menu, net as electronNet, protocol, shell, type MenuItemConstructorOptions } from 'electron';
import { spawn, spawnSync } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import net, { type AddressInfo } from 'net';
import path from 'path';

type ChildConfig = { hosts: string[]; proxy: string | null };

const APP_ROOT = app.isPackaged ? process.resourcesPath : app.getAppPath();
const PAGE_FILE = /\.[ln]mth$/;
const GRANTS_FILE = path.join(app.getPath('userData'), 'grants.json');
const EGRESS_LOG = path.join(app.getPath('logs'), 'egress.log');
// RESWORB marks the child. It is not a key: the child checks it is offline before it opens anything.
const childConfig: ChildConfig | null = process.env.RESWORB ? JSON.parse(process.env.RESWORB) : null;
const openPage = childConfig ? (page: string) => openWindow(page, childConfig.hosts) : spawnSandboxed;
let runningChildren = 0;

if (childConfig?.proxy) {
  app.commandLine.appendSwitch('proxy-server', childConfig.proxy);
}

// Finder sends the file as an event, the command line as an argument. Resolve now:
// the child gets a different working directory.
const pages = process.argv.filter(arg => PAGE_FILE.test(arg)).map(arg => path.resolve(arg));
app.on('open-file', (event, file) => {
  event.preventDefault();

  if (app.isReady()) {
    openPage(path.resolve(file));
  } else {
    pages.push(path.resolve(file));
  }
});

app.whenReady().then(async () => {
  if (!pages.length) {
    dialog.showErrorBox('resworb', 'Open a .lmth or .nmth page.');

    return app.quit();
  } else if (!childConfig && !['darwin', 'linux'].includes(process.platform)) {
    dialog.showErrorBox('resworb', `No offline mode for ${process.platform} yet.`);

    return app.quit();
  } else if (childConfig && (await canBindLoopback())) {
    dialog.showErrorBox('resworb', 'This process can still open sockets. Refusing to open the page.');

    return app.quit();
  } else if (childConfig) {
    // Chromium does not know .lmth and would offer it as a download. Serve it as HTML.
    protocol.handle('file', request => {
      if (!PAGE_FILE.test(request.url)) {
        return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
      }

      const file = decodeURIComponent(new URL(request.url).pathname);

      return new Response(fs.readFileSync(file), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    });
    installMenu();
  }

  pages.forEach(openPage);
});

app.on('window-all-closed', () => app.quit());

// --- Trampoline: has network, no window; one sandboxed child per page ------------------

async function spawnSandboxed(page: string) {
  let hosts: string[] | null = null;

  try {
    hosts = (await confirmDownloaded(page)) ? await approveHosts(page) : null;
  } catch (err) {
    dialog.showErrorBox('resworb', (err as Error).message);
  }

  if (!hosts) {
    if (!runningChildren) {
      app.quit();
    }

    return;
  }

  const proxy = hosts.length ? await startProxy(hosts) : null;
  const proxyPort = proxy && (proxy.address() as AddressInfo).port;
  const env: NodeJS.ProcessEnv = { ...process.env, RESWORB: JSON.stringify({ hosts, proxy: proxy && `127.0.0.1:${proxyPort}` } satisfies ChildConfig) };
  let profile = fs.readFileSync(path.join(APP_ROOT, 'sandbox/macos.sb'), 'utf8');

  if (proxy) {
    // curl honours these. Loopback goes direct, as Chromium does with --proxy-server.
    env.http_proxy = env.https_proxy = `http://127.0.0.1:${proxyPort}`;
    env.no_proxy = 'localhost,127.0.0.1';
    const localPorts = hosts.filter(host => /^(localhost|127\.0\.0\.1):/.test(host)).map(host => host.split(':')[1]);
    profile += [proxyPort, ...localPorts].map(port => `(allow network-outbound (remote ip "localhost:${port}"))\n`).join('');
  }

  app.dock?.hide(); // the child's window is the app in the Dock
  const sandbox = process.platform === 'darwin' ? ['sandbox-exec', '-p', profile] : ['bwrap', '--unshare-net', '--dev-bind', '/', '/', '--die-with-parent'];
  // Chromium's own sandbox cannot start inside sandbox-exec or bwrap.
  const [command, ...args] = [...sandbox, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page];
  runningChildren++;
  spawn(command, args, { stdio: 'inherit', env }).on('exit', () => {
    proxy?.close();
    runningChildren--;

    if (!runningChildren) {
      app.quit();
    }
  });
}

// macOS marks downloads with a quarantine attribute. Warn once, then clear it, as Finder does.
async function confirmDownloaded(page: string) {
  const quarantined = process.platform === 'darwin' && spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', page]).status === 0;

  if (!quarantined) {
    return true;
  }

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `${path.basename(page)} was downloaded.`,
    detail: `It will run as code, with your permissions, with Node.\n\n${page}`,
    buttons: ['Cancel', 'Open anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  if (response === 0) {
    return false;
  }

  spawnSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', page]);

  return true;
}

// The hosts a page may reach: none for a .lmth or a declined list. Throws for a .nmth that cannot open.
async function approveHosts(page: string) {
  if (!page.endsWith('.nmth')) {
    return [];
  } else if (process.platform !== 'darwin') {
    throw new Error('.nmth pages open on macOS only for now: no other platform can open a port yet.');
  }

  const hosts = declaredHosts(page);

  if (!hosts.length) {
    throw new Error(`${path.basename(page)} declares no hosts. Add <meta name="resworb-net" content="host:port">, or name it .lmth.`);
  } else if (!app.isPackaged && process.env.RESWORB_TEST_ALLOW === '1') {
    return hosts;
  }

  // grants.json maps "page → hosts" to when it was approved.
  const grants: Record<string, string> = fs.existsSync(GRANTS_FILE) ? JSON.parse(fs.readFileSync(GRANTS_FILE, 'utf8')) : {};
  const grant = `${page} → ${hosts.join(' ')}`;

  if (grants[grant]) {
    return hosts;
  }

  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: `${path.basename(page)} wants to reach:`,
    detail: `${hosts.join('\n')}\n\n${page}`,
    buttons: ['Allow and open', 'Open without network'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });

  if (response === 1) {
    return [];
  }

  grants[grant] = new Date().toISOString();
  fs.writeFileSync(GRANTS_FILE, JSON.stringify(grants, null, 2) + '\n');

  return hosts;
}

function declaredHosts(page: string) {
  const hosts = new Set<string>();

  for (const [, attrs] of fs.readFileSync(page, 'utf8').matchAll(/<meta\s+([^>]*)>/gi)) {
    if (!/\bname=["']resworb-net["']/i.test(attrs)) {
      continue;
    }

    const host = (/\bcontent=["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').trim().toLowerCase();
    const port = +host.split(':')[1];

    if (!/^[a-z0-9][a-z0-9.-]*:\d+$/.test(host) || port < 1 || port > 65535) {
      throw new Error(`Bad resworb-net host "${host}". One host:port per <meta>.`);
    }

    hosts.add(host);
  }

  return [...hosts].sort();
}

async function startProxy(hosts: string[]) {
  fs.mkdirSync(path.dirname(EGRESS_LOG), { recursive: true });
  const log = fs.createWriteStream(EGRESS_LOG, { flags: 'a' });
  // http arrives as a full URL. A relative one was sent at the port, not through it;
  // URL.parse returns null for it and it is refused with the rest.
  const server = http.createServer((request, response) => {
    const requested = request.url!; // always set on a server's request
    const url = URL.parse(requested);
    const port = url?.port === '' ? '80' : url?.port; // URL.port is '' when the scheme's default
    const target = url ? `${url.hostname}:${port}` : requested;
    response.on('finish', () => log.write(`${new Date().toISOString()} ${request.method} ${target} ${response.statusCode}\n`));

    if (!url || !hosts.includes(target)) {
      response.writeHead(403);

      return response.end('resworb: host not declared\n');
    }

    const upstream = http.request({ host: url.hostname, port, method: request.method, path: url.pathname + url.search, headers: request.headers }, reply => {
      response.writeHead(reply.statusCode!, reply.headers);
      reply.pipe(response);
    });
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });

  // https arrives as CONNECT: relay the bytes, see only host:port, never the TLS.
  server.on('connect', (request, socket) => {
    const target = request.url!.toLowerCase();

    if (!hosts.includes(target)) {
      log.write(`${new Date().toISOString()} CONNECT ${target} 403\n`);

      return socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }

    const [host, port] = target.split(':');
    const upstream = net.connect(+port, host, () => {
      log.write(`${new Date().toISOString()} CONNECT ${target} 200\n`);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => {
      log.write(`${new Date().toISOString()} CONNECT ${target} 502\n`);
      socket.end();
    });
    socket.on('error', () => upstream.destroy());
  });

  log.on('error', () => server.close()); // cannot log: stop forwarding
  server.on('close', () => log.end());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return server;
}

// --- Sandboxed child: no network, opens the page -------------------------------------

// Inside the sandbox even a loopback bind is EPERM (a .nmth child may connect to its
// ports, never bind). Outside it succeeds with or without internet. So this tells
// sandbox from no sandbox, and a RESWORB typed by hand still refuses.
function canBindLoopback(): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

function installMenu() {
  const appMenu: MenuItemConstructorOptions[] = process.platform === 'darwin' ? [{ role: 'appMenu' }] : [];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...appMenu,
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'Network',
        submenu: [
          {
            label: 'Show Egress Log',
            click: async () => {
              if (!fs.existsSync(EGRESS_LOG)) {
                return dialog.showMessageBox({ type: 'info', message: 'No egress recorded yet.', detail: EGRESS_LOG });
              }

              const error = await shell.openPath(EGRESS_LOG);

              if (error) {
                dialog.showErrorBox('resworb', `Could not open ${EGRESS_LOG}\n\n${error}`);
              }
            },
          },
          {
            label: 'Revoke All Approvals',
            click: () => {
              fs.rmSync(GRANTS_FILE, { force: true });
              dialog.showMessageBox({ type: 'info', message: 'Approvals revoked.', detail: 'Every .nmth page asks again the next time it opens. Pages already open keep their hosts until closed.' });
            },
          },
        ],
      },
    ])
  );
}

function openWindow(page: string, hosts: string[]) {
  const icon = app.isPackaged ? undefined : path.join(APP_ROOT, 'build/icon.png'); // else Electron's logo shows

  if (icon) {
    app.dock?.setIcon(icon);
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon,
    // CORS is off for a .nmth: the host list is the boundary.
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity: !hosts.length },
  });
  win.loadFile(page);

  // A link to a declared host would otherwise load that site here, with Node.
  const stayOnFiles = (event: Electron.Event, url: string) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
    }
  };

  win.webContents.on('will-navigate', stayOnFiles);
  win.webContents.on('will-redirect', stayOnFiles);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (hosts.length) {
    win.on('page-title-updated', (event, title) => {
      event.preventDefault();
      win.setTitle(`${title} · ${hosts.join(' ')}`);
    });
  }

  // Reload on save, once per burst: editors write a temp file and rename, builds touch many
  // files. Subfolders count, except hidden ones and node_modules; a page sitting in the home
  // or root folder gets its own folder only. The host list is not re-read; a new one needs
  // the page reopened.
  const dir = path.dirname(page);
  const recursive = dir !== app.getPath('home') && dir !== path.parse(dir).root;
  let pendingReload: NodeJS.Timeout | undefined = undefined;
  const watcher = fs.watch(dir, { recursive }, (_event, name) => {
    if (!name || !/\.(lmth|nmth|css|js)$/.test(name) || /(^|\/)(\.[^/]*|node_modules)(\/|$)/.test(name)) {
      return;
    }

    clearTimeout(pendingReload);
    pendingReload = setTimeout(() => win.webContents.reloadIgnoringCache(), 100);
  });
  win.on('closed', () => {
    clearTimeout(pendingReload);
    watcher.close();
  });
}
