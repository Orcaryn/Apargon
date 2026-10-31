import { app } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { localPorts } from '../../permissions/network.ts';
import { patternFolder } from '../../permissions/patterns.ts';
import { PRIVATE } from '../../permissions/platform/linux.ts';
import type { Permissions } from '../../permissions/tags.ts';
import { REQUEST_FD, relay, type Bridge } from '../../shared/channel.ts';
import { DATA, NET_DATA, PAGE_DATA } from '../../shared/data.ts';
import type { TrampolinePlatform } from '../platform.ts';
import { startProxy } from '../network/proxy.ts';

const RUNTIME = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;

export const linux: TrampolinePlatform = {
  // The page's network holds only its own loopback, so the proxy and declared ports reach it as socket files.
  async prepare(page, permissions) {
    fs.mkdirSync(NET_DATA, { recursive: true });
    const socketFolder = permissions.net.length ? fs.mkdtempSync(path.join(NET_DATA, 'page-')) : null;
    const localBridges = socketFolder ? localPorts(permissions).map(port => ({ port: +port, socket: path.join(socketFolder, `${port}.sock`) })) : [];
    const proxyBridge = socketFolder ? { port: unusedPort(localBridges), socket: path.join(socketFolder, 'proxy.sock') } : null;
    const proxy = proxyBridge ? await startProxy(permissions.net, proxyBridge.socket) : null;
    const localRelays = await Promise.all(localBridges.map(({ port, socket }) => relay({ path: socket }, { host: '127.0.0.1', port })));
    // The page proves it is offline against the trampoline's network, at TRAMPOLINE_NETWORK_FD.
    const networkFd = fs.openSync('/proc/self/ns/net', 'r');

    return {
      command: apargon => ['bwrap', ...bwrapArgs(page, permissions, socketFolder), ...apargon],
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', networkFd, 'pipe'],
      requestFd: REQUEST_FD,
      repliesInFile: false,
      proxyPort: proxyBridge?.port ?? null,
      bridges: proxyBridge ? [proxyBridge, ...localBridges] : [],
      close() {
        fs.closeSync(networkFd);
        proxy?.close();
        localRelays.forEach(server => server.close());

        if (socketFolder) {
          fs.rmSync(socketFolder, { recursive: true });
        }
      },
    };
  },
  installHint: '. Install Apargon from the .deb: it brings bwrap and the AppArmor profile Ubuntu needs.',
  // Browsers mark a download with where it came from.
  downloadAddress(page) {
    const mark = spawnSync('getfattr', ['--only-values', '-n', 'user.xdg.origin.url', page], { encoding: 'utf8' });

    return mark.status === 0 ? mark.stdout : null;
  },
  autoUpdates: false,
};

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
  const disk = permissions.node ? '--dev-bind' : '--ro-bind';
  const sound = permissions.use.includes('sound') || permissions.use.includes('microphone');
  const soundSockets = sound ? ['pipewire-0', 'pulse'].map(name => path.join(RUNTIME, name)).filter(file => fs.existsSync(file)) : [];
  const named = [path.dirname(page), ...permissions.read.map(patternFolder), ...permissions.sockets, ...displaySockets(), ...soundSockets];
  [...writable, PAGE_DATA].forEach(folder => fs.mkdirSync(folder, { recursive: true }));
  const covered = permissions.hidden.filter(file => fs.existsSync(file)).flatMap(file => (fs.statSync(file).isDirectory() ? ['--tmpfs', file] : ['--ro-bind', '/dev/null', file]));

  // Later mounts cover earlier ones: Apargon's own data must stay last.
  return [
    ...['--unshare-net', '--unshare-pid', '--unshare-user', '--disable-userns', '--new-session', '--die-with-parent', disk, '/', '/', '--dev', '/dev', '--proc', '/proc'],
    ...(fs.existsSync('/dev/dri') ? ['--dev-bind', '/dev/dri', '/dev/dri'] : []),
    ...(sound && fs.existsSync('/dev/snd') ? ['--dev-bind', '/dev/snd', '/dev/snd'] : []),
    ...(permissions.use.includes('camera') ? fs.readdirSync('/dev').filter(name => /^video\d+$/.test(name)).flatMap(name => ['--dev-bind', `/dev/${name}`, `/dev/${name}`]) : []),
    ...PRIVATE.flatMap(folder => ['--tmpfs', folder]),
    ...named.flatMap(file => [disk, file, file]),
    ...(permissions.node ? [] : writable.flatMap(folder => ['--bind', folder, folder])),
    ...covered,
    ...['--ro-bind', DATA, DATA, '--tmpfs', NET_DATA, ...(socketFolder ? ['--ro-bind', socketFolder, socketFolder] : []), '--bind', PAGE_DATA, PAGE_DATA],
  ];
}

function displaySockets() {
  const wayland = process.env.WAYLAND_DISPLAY ? [path.resolve(RUNTIME, process.env.WAYLAND_DISPLAY)] : [];
  const x11 = /^:(\d+)/.exec(process.env.DISPLAY ?? '');

  return [...wayland, ...(x11 ? [`/tmp/.X11-unix/X${x11[1]}`] : []), ...(process.env.XAUTHORITY ? [process.env.XAUTHORITY] : [])].filter(file => fs.existsSync(file));
}
