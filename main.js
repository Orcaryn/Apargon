// resworb: a browser turned inside out. The page gets full Node; the process gets
// no network. Launched normally, this process is a trampoline: it relaunches itself
// offline, with the OS holding the network shut. The offline process opens the page.
//
// A .lmth page gets no network, ever. A .nmth page declares hosts in its head,
// <meta name="resworb-net" content="host:port">, and the user approves the list once.
// Its offline process may reach one loopback port, where this trampoline runs a proxy
// that forwards to the declared hosts and nothing else.

const { app, BrowserWindow, dialog, protocol, net: electronNet } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
const PAGE = /\.[ln]mth$/;

// Which of the two processes this is. The trampoline hands the child it spawns one
// variable, RESWORB = { hosts, proxy }; the child proves it is offline before opening
// anything, so the variable alone is no key.
const inside = process.env.RESWORB && JSON.parse(process.env.RESWORB);
const open = inside ? openWindow : openOffline;
let children = 0;

// In the offline process of a .nmth page: fetch goes through the proxy.
if (inside?.proxy) app.commandLine.appendSwitch('proxy-server', inside.proxy);

// Finder (macOS) sends the file as an event, everything else as an argument.
// Resolved here: the offline child does not share this process's working directory.
const pages = process.argv.filter((arg) => PAGE.test(arg)).map((arg) => path.resolve(arg));
app.on('open-file', (event, file) => {
  event.preventDefault();
  app.isReady() ? open(path.resolve(file)) : pages.push(path.resolve(file));
});

app.whenReady().then(async () => {
  if (inside && await canOpenSockets()) {
    dialog.showErrorBox('resworb', 'This process can still open sockets. Refusing to open the page.');
    return app.quit();
  }
  if (!inside && !['darwin', 'linux'].includes(process.platform)) {
    dialog.showErrorBox('resworb', `No offline mode for ${process.platform} yet.`);
    return app.quit();
  }
  if (!pages.length) {
    dialog.showErrorBox('resworb', 'Open a .lmth or .nmth page.');
    return app.quit();
  }

  // Chromium does not know .lmth and would offer it as a download. Serve it as HTML.
  if (inside) protocol.handle('file', (request) => {
    if (!PAGE.test(request.url)) return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
    const file = decodeURIComponent(new URL(request.url).pathname);
    return new Response(fs.readFileSync(file), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });

  pages.forEach(open);
});

app.on('window-all-closed', () => app.quit());

// --- Outside: one offline process per page --------------------------------------------

async function openOffline(page) {
  let hosts = [];
  if (page.endsWith('.nmth')) {
    try { hosts = await approvedHosts(page); }
    catch (err) { dialog.showErrorBox('resworb', err.message); return children || app.quit(); }
  }

  const proxy = hosts.length ? await startProxy(hosts) : null;
  const port = proxy?.address().port;
  const env = { ...process.env, RESWORB: JSON.stringify({ hosts, proxy: proxy && `127.0.0.1:${port}` }) };
  let profile = fs.readFileSync(path.join(root, 'sandbox/macos.sb'), 'utf8');
  if (proxy) {
    // curl in child_process honours these. Loopback goes direct, as Chromium's does.
    env.http_proxy = env.https_proxy = `http://127.0.0.1:${port}`;
    env.no_proxy = 'localhost,127.0.0.1';
    // Seatbelt can only open loopback ports: the proxy's, and the ones the page declared.
    const ports = [port, ...hosts.filter((host) => /^(localhost|127\.0\.0\.1):/.test(host)).map((host) => host.split(':')[1])];
    profile += ports.map((port) => `(allow network-outbound (remote ip "localhost:${port}"))\n`).join('');
  }

  app.dock?.hide();
  const wrapper = process.platform === 'darwin'
    ? ['sandbox-exec', '-p', profile]
    : ['bwrap', '--unshare-net', '--dev-bind', '/', '/', '--die-with-parent'];
  // --no-sandbox: Chromium's own per-process sandbox cannot start under sandbox-exec or bwrap.
  const [command, ...args] = [...wrapper, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [root]), page];
  children++;
  spawn(command, args, { stdio: 'inherit', env }).on('exit', () => {
    proxy?.close();
    --children || app.quit();
  });
}

// Asks once per page and host list; remembers only a yes. RESWORB_ALLOW=1 is the same
// yes typed on the command line, for scripts and tests. Declined means no hosts.
async function approvedHosts(page) {
  if (process.platform !== 'darwin') throw new Error('.nmth pages open on macOS only for now: no other platform can open a port yet.');
  const hosts = declaredHosts(page);
  if (!hosts.length) throw new Error(`${path.basename(page)} declares no hosts. Add <meta name="resworb-net" content="host:port">, or name it .lmth.`);

  const grantsFile = path.join(app.getPath('userData'), 'grants.json');
  const grants = fs.existsSync(grantsFile) ? JSON.parse(fs.readFileSync(grantsFile, 'utf8')) : {};
  const grant = `${page} → ${hosts.join(' ')}`;
  if (grants[grant] || process.env.RESWORB_ALLOW) return hosts;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: `${path.basename(page)} wants to reach:`,
    detail: hosts.join('\n'),
    buttons: ['Allow and open', 'Open without network'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 1) return [];

  grants[grant] = new Date().toISOString();
  fs.writeFileSync(grantsFile, JSON.stringify(grants, null, 2) + '\n');
  return hosts;
}

// The hosts a page names in <meta name="resworb-net" content="host:port">. Strict on
// purpose: one host and one port per line, nothing else parses.
function declaredHosts(page) {
  const hosts = [];
  for (const [, attrs] of fs.readFileSync(page, 'utf8').matchAll(/<meta\s+([^>]*)>/gi)) {
    if (!/\bname=["']resworb-net["']/i.test(attrs)) continue;
    const host = (/\bcontent=["']([^"']*)["']/i.exec(attrs)?.[1] || '').trim().toLowerCase();
    const port = +host.split(':')[1];
    if (!/^[a-z0-9][a-z0-9.-]*:\d+$/.test(host) || port < 1 || port > 65535) throw new Error(`Bad resworb-net host "${host}". One host:port per <meta>.`);
    hosts.push(host);
  }
  return hosts.sort();
}

// An HTTP proxy on a loopback port that forwards to the declared hosts and refuses
// everything else. It runs here, in the process that has network, so the page cannot touch it.
function startProxy(hosts) {
  const declared = new Set(hosts);

  // http:// requests arrive whole.
  const server = http.createServer((request, response) => {
    const url = URL.parse(request.url);
    if (!url || !declared.has(`${url.hostname}:${url.port || 80}`)) {
      response.writeHead(403);
      return response.end('resworb: host not declared\n');
    }
    const upstream = http.request({ host: url.hostname, port: url.port || 80, method: request.method, path: url.pathname + url.search, headers: request.headers },
      (reply) => { response.writeHead(reply.statusCode, reply.headers); reply.pipe(response); });
    upstream.on('error', () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });

  // https:// arrives as CONNECT: the proxy relays bytes and sees only host:port; TLS stays end to end.
  server.on('connect', (request, socket) => {
    if (!declared.has(request.url.toLowerCase())) return socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    const [host, port] = request.url.split(':');
    const upstream = net.connect(+port, host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.end());
    socket.on('error', () => upstream.destroy());
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --- Offline: the page -----------------------------------------------------------------

function openWindow(page) {
  const hosts = inside.hosts.join(' ');   // '' for a .lmth, or a .nmth opened without network
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // A .nmth page talks to servers it named; CORS is a browser rule for pages that did not.
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity: !hosts },
  });
  win.loadFile(page);

  // The window always says what the page may reach.
  if (hosts) win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    win.setTitle(`${title} · ${hosts}`);
  });

  // Saving the page, or any code next to it, reloads the window. The network does not
  // change: a new host list takes effect when the page is reopened and approved.
  fs.watch(path.dirname(page), { recursive: true }, (_event, name) => {
    if (/\.(lmth|nmth|css|js)$/.test(name)) win.webContents.reloadIgnoringCache();
  });
}

// Offline, even binding a loopback port is EPERM (a .nmth process may connect to its
// ports, never bind). Outside, it works with or without a network, so the check does
// not depend on the internet being up, and a RESWORB typed by hand still refuses.
function canOpenSockets() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
