// resworb: a browser turned inside out. The page gets full Node; the process gets
// no network. Launched normally, this process is a trampoline: it relaunches itself
// inside the OS network jail. Inside the jail, it opens the page.

const { app, BrowserWindow, dialog, protocol, net: electronNet } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
const jail = {
  darwin: ['sandbox-exec', '-f', path.join(root, 'sandbox/macos.sb')],
  linux: ['bwrap', '--unshare-net', '--dev-bind', '/', '/', '--die-with-parent'],
}[process.platform];

let jailed = false;
let children = 0;

// Finder (macOS) sends the file as an event, everything else as an argument.
const pages = process.argv.filter((arg) => arg.endsWith('.lmth'));
app.on('open-file', (event, file) => {
  event.preventDefault();
  app.isReady() ? open(file) : pages.push(file);
});

app.whenReady().then(async () => {
  jailed = !(await internetReachable());

  if (!jailed && process.env.RESWORB_JAILED) {
    dialog.showErrorBox('resworb', 'The network jail did not hold: the internet is reachable. Refusing to open.');
    return app.quit();
  }
  if (!jailed && !jail) {
    dialog.showErrorBox('resworb', `No network jail for ${process.platform} yet.`);
    return app.quit();
  }
  if (!pages.length) {
    dialog.showErrorBox('resworb', 'Open a .lmth page.');
    return app.quit();
  }

  if (jailed) {
    // Chromium does not know .lmth and would offer it as a download. Serve it as HTML.
    protocol.handle('file', (request) => {
      if (!request.url.endsWith('.lmth')) return electronNet.fetch(request, { bypassCustomProtocolHandlers: true });
      const file = decodeURIComponent(new URL(request.url).pathname);
      return new Response(fs.readFileSync(file), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    });
  } else {
    app.dock?.hide();
  }

  pages.forEach(open);
});

app.on('window-all-closed', () => app.quit());

function open(file) {
  const page = path.resolve(file);
  if (!jailed) {
    // --no-sandbox: Chromium's own per-process sandbox cannot start inside an outer jail.
    const args = [...jail.slice(1), process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [root]), page];
    children++;
    spawn(jail[0], args, { stdio: 'inherit', env: { ...process.env, RESWORB_JAILED: '1' } })
      .on('exit', () => --children || app.quit());
    return;
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  win.loadFile(page);

  // Saving the page, or any code next to it, reloads the window.
  fs.watch(path.dirname(page), { recursive: true }, (_event, name) => {
    if (/\.(lmth|css|js)$/.test(name)) win.webContents.reloadIgnoringCache();
  });
}

// Inside the jail, connecting fails instantly with EPERM. Connecting, or
// silently timing out (a firewall drop), means we are not jailed.
function internetReachable() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '1.1.1.1', port: 53, timeout: 1500 });
    socket.once('connect', () => resolve(true));
    socket.once('timeout', () => resolve(true));
    socket.once('error', () => resolve(false));
  });
}
