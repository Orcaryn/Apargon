import { app } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { localPorts } from '../../permissions/network.ts';
import { patternFolder } from '../../permissions/patterns.ts';
import { PRIVATE } from '../../permissions/platform/linux.ts';
import type { Permissions, Use } from '../../permissions/tags.ts';
import { REQUEST_FD, relay, type Bridge } from '../../shared/channel.ts';
import { APP_ROOT, DATA, NET_DATA, PAGE_DATA, pageAppId } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

const RUNTIME = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;
const APPLICATIONS = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'applications');
const ICONS = path.join(DATA, 'icons');
const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autostart');
// The files in /dev each kind of device gets.
const DEVICE_FILES: Partial<Record<Use, RegExp>> = { hid: /^hidraw\d+$/, serial: /^tty(USB|ACM)\d+$/, camera: /^video\d+$/ };
// MIDI's own files in /dev/snd: the rest record from every microphone.
const MIDI_FILES = /^(seq|timer|controlC\d+|midiC\d+D\d+)$/;

export const linux: TrampolinePlatform = {
  // The page's network holds only its own loopback, so the proxy and declared ports reach it as socket files.
  async prepare(page, permissions) {
    writeLauncherEntry(page);
    fs.mkdirSync(NET_DATA, { recursive: true });
    const socketFolder = permissions.net.length ? fs.mkdtempSync(path.join(NET_DATA, 'page-')) : null;
    const localBridges = socketFolder ? localPorts(permissions).map(port => ({ port: +port, socket: path.join(socketFolder, `${port}.sock`) })) : [];
    const proxyBridge = socketFolder ? { port: unusedPort(localBridges), socket: path.join(socketFolder, 'proxy.sock') } : null;
    const proxy = proxyBridge ? await startProxy(permissions.net, proxyBridge.socket) : null;
    const localRelays = await Promise.all(localBridges.map(({ port, socket }) => relay({ path: socket }, { host: '127.0.0.1', port })));
    const trampolineNetworkFd = fs.openSync('/proc/self/ns/net', 'r');

    return {
      command: apargon => ['bwrap', ...bwrapArgs(page, permissions, socketFolder), ...apargon],
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', trampolineNetworkFd, 'pipe'],
      requestFd: REQUEST_FD,
      repliesInFile: false,
      proxyPort: proxyBridge?.port ?? null,
      bridges: proxyBridge ? [proxyBridge, ...localBridges] : [],
      close() {
        fs.closeSync(trampolineNetworkFd);
        proxy?.close();
        localRelays.forEach(server => server.close());

        if (socketFolder) {
          fs.rmSync(socketFolder, { recursive: true });
        }
      },
    };
  },
  installHint: '. Install Apargon from the .deb: it brings bwrap and the AppArmor profile Ubuntu needs.',
  downloadAddress(page) {
    const mark = spawnSync('getfattr', ['--only-values', '-n', 'user.xdg.origin.url', page], { encoding: 'utf8' });

    return mark.status === 0 ? mark.stdout : null;
  },
  pageIcon(page, png) {
    fs.mkdirSync(ICONS, { recursive: true });
    fs.writeFileSync(path.join(ICONS, `${pageAppId(page)}.png`), Buffer.from(png, 'base64'));
    writeLauncherEntry(page);
  },
  // A copy of the page's launcher entry, which prepare writes first.
  startAtLogin(page, on) {
    const entry = `${pageAppId(page)}.desktop`;

    if (on) {
      fs.mkdirSync(AUTOSTART, { recursive: true });
      fs.copyFileSync(path.join(APPLICATIONS, entry), path.join(AUTOSTART, entry));
    } else {
      fs.rmSync(path.join(AUTOSTART, entry), { force: true });
    }
  },
  noFollow: fs.constants.O_NOFOLLOW,
  autoUpdates: false,
};

// The dock names a window after the launcher entry its class matches, and shows that entry's icon: one per page, under its title, that reopens it. Hidden from the app grid, so opening a page installs nothing visible.
function writeLauncherEntry(page: string) {
  const id = pageAppId(page);
  const icon = path.join(ICONS, `${id}.png`);
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${pageTitle(page)}`,
    `Icon=${fs.existsSync(icon) ? icon : app.isPackaged ? 'apargon' : path.join(APP_ROOT, 'build', 'icon.png')}`,
    `Exec=${[process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), page].map(quoteExecArgument).join(' ')}`,
    `StartupWMClass=${id}`,
    'NoDisplay=true',
    `X-Apargon-Page=${page}`,
  ];
  fs.mkdirSync(APPLICATIONS, { recursive: true });

  for (const entry of fs.readdirSync(APPLICATIONS).filter(name => /^apargon-page-[0-9a-f]+\.desktop$/.test(name))) {
    const other = /^X-Apargon-Page=(.*)$/m.exec(fs.readFileSync(path.join(APPLICATIONS, entry), 'utf8'))?.[1];

    if (other && !fs.existsSync(other)) {
      fs.rmSync(path.join(APPLICATIONS, entry));
      fs.rmSync(path.join(AUTOSTART, entry), { force: true });
      fs.rmSync(path.join(ICONS, entry.replace(/\.desktop$/, '.png')), { force: true });
    }
  }

  fs.writeFileSync(path.join(APPLICATIONS, `${id}.desktop`), lines.join('\n') + '\n');
}

function pageTitle(page: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(fs.readFileSync(page, 'utf8'))?.[1] ?? '';
  const text = title
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]!)
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(+dec))
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ')
    .trim();

  return text || path.basename(page, path.extname(page));
}

// As the Desktop Entry specification quotes an Exec argument: in double quotes, with its own escapes under the string escapes of the value.
function quoteExecArgument(arg: string) {
  const escaped = arg.replace(/\\/g, '\\\\\\\\').replace(/["$`]/g, '\\\\$&').replace(/%/g, '%%');

  return '"' + escaped + '"';
}

// The page's network starts empty and only the declared bridges bind in it, so the proxy's port need only differ from theirs.
function unusedPort(declared: Bridge[]) {
  let port = 3128;

  while (declared.some(bridge => bridge.port === port)) {
    port++;
  }

  return port;
}

function bwrapArgs(page: string, permissions: Permissions, socketFolder: string | null) {
  const temp = fs.realpathSync(app.getPath('temp'));
  const writable = [...(PRIVATE.includes(temp) ? [] : [temp]), ...permissions.write.map(patternFolder)];
  const sound = permissions.use.includes('sound') || permissions.use.includes('microphone');
  const soundSockets = sound ? ['pipewire-0', 'pulse'].map(name => path.join(RUNTIME, name)).filter(file => fs.existsSync(file)) : [];
  const printSocket = permissions.use.includes('print') && fs.existsSync('/run/cups/cups.sock') ? ['/run/cups/cups.sock'] : [];
  // The udev database lists devices; its control socket takes only root.
  const udev = permissions.use.some(name => ['usb', 'serial', 'hid', 'midi'].includes(name)) && fs.existsSync('/run/udev') ? ['/run/udev'] : [];
  const devicePatterns = Object.entries(DEVICE_FILES).filter(([use]) => permissions.use.includes(use as Use)).map(([, pattern]) => pattern);
  const devices = [
    '/dev/dri',
    ...(sound ? ['/dev/snd'] : []),
    ...(permissions.use.includes('midi') && !sound && fs.existsSync('/dev/snd') ? fs.readdirSync('/dev/snd').filter(name => MIDI_FILES.test(name)).map(name => `/dev/snd/${name}`) : []),
    ...(permissions.use.includes('usb') ? ['/dev/bus/usb'] : []),
    ...fs.readdirSync('/dev').filter(name => devicePatterns.some(pattern => pattern.test(name))).map(name => `/dev/${name}`),
  ].filter(file => fs.existsSync(file));
  const named = [path.dirname(page), ...permissions.read.map(patternFolder), ...permissions.sockets, ...displaySockets(), ...soundSockets, ...printSocket, ...udev];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true }));
  const covered = permissions.hidden.filter(file => fs.existsSync(file)).flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  // Later mounts cover earlier ones: Apargon's own data must stay last.
  return [
    ...['--unshare-net', '--unshare-pid', '--unshare-user', '--disable-userns', '--new-session', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'],
    ...devices.flatMap(file => ['--dev-bind', file, file]),
    ...PRIVATE.flatMap(folder => ['--tmpfs', folder]),
    ...named.flatMap(file => ['--ro-bind', file, file]),
    ...writable.flatMap(folder => ['--bind', folder, folder]),
    ...covered,
    ...['--ro-bind', DATA, DATA, '--tmpfs', NET_DATA, ...(socketFolder ? ['--ro-bind', socketFolder, socketFolder] : []), '--bind', PAGE_DATA, PAGE_DATA],
  ];
}

function displaySockets() {
  const wayland = process.env.WAYLAND_DISPLAY ? [path.resolve(RUNTIME, process.env.WAYLAND_DISPLAY)] : [];
  const x11 = /^:(\d+)/.exec(process.env.DISPLAY ?? '');

  return [...wayland, ...(x11 ? [`/tmp/.X11-unix/X${x11[1]}`] : []), ...(process.env.XAUTHORITY ? [process.env.XAUTHORITY] : [])].filter(file => fs.existsSync(file));
}
