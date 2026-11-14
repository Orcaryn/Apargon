import { app } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import type { Use } from '../../permissions/tags.ts';
import { APP_ROOT, DATA, pageAppId } from '../../shared/data.ts';
import { MUX_FD, REPLY_FD, REQUEST_FD, WAYLAND_FD } from '../../shared/protocol.ts';
import type { Sandbox, TrampolinePlatform } from '../platform.ts';
import { startPiped } from './pipes.ts';
import { filterSound } from './pulse.ts';
import { socketFilter } from './seccomp.ts';

const RUNTIME = process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`;
const APPLICATIONS = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'applications');
const ICONS = path.join(DATA, 'icons');
const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autostart');
const SECCOMP_FD = 8;
// Inside bwrap: a private copy of the mounts as they are now. bwrap shares later ones with the sandbox, so a network drive mounted while the .papp file runs would reach it.
const MOUNTS_AT_START = ['unshare', '--user', `--map-user=${os.userInfo().uid}`, `--map-group=${os.userInfo().gid}`, '--mount', '--propagation', 'private', '--'];
// Ports inside the sandbox, where the relays listen.
const PROXY_PORT = 3128;
const SOUND_PORT = 4713;
// GNOME on Wayland keeps each app's typing to its own windows.
const WAYLAND = process.env.XDG_SESSION_TYPE === 'wayland' && !!process.env.WAYLAND_DISPLAY;
// Otherwise X11, where any app can type into and read any window: the number of this computer's own screen, as in :0 or unix:0.0. One elsewhere, as over ssh, is null.
const X11_DISPLAY = WAYLAND ? null : (/^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(process.env.DISPLAY ?? '')?.[1] ?? null);
// The files in /dev each kind of device gets.
const DEVICE_FILES: Partial<Record<Use, RegExp>> = { hid: /^hidraw\d+$/, serial: /^tty(?:USB|ACM)\d+$/, camera: /^video\d+$/ };
// MIDI's own files in /dev/snd: the rest play and record past the sound server's filter.
const MIDI_FILES = /^(?:seq|timer|controlC\d+|midiC\d+D\d+)$/;
// Disks on this computer, and the kernel's own. Any other kind, a network drive or a FUSE one, is hidden: reading one could send a request.
const LOCAL_TYPES = new Set('ext2 ext3 ext4 xfs btrfs f2fs vfat exfat ntfs ntfs3 fuseblk hfsplus zfs jfs reiserfs erofs squashfs iso9660 udf tmpfs ramfs devtmpfs devpts proc sysfs cgroup cgroup2 overlay nsfs bpf tracefs debugfs securityfs pstore efivarfs configfs fusectl mqueue hugetlbfs binfmt_misc autofs fuse.portal fuse.snapfuse fuse.lxcfs'.split(' '));

export const linux: TrampolinePlatform = {
  async unsupported() {
    const desktops = (process.env.XDG_CURRENT_DESKTOP ?? '').split(':');

    if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) {
      return `Apargon doesn't run on ${process.platform} ${process.arch}.`;
    } else if (!WAYLAND && X11_DISPLAY === null) {
      return 'Apargon needs a desktop: GNOME on Wayland, or X11 on this computer.';
    } else if (WAYLAND && !desktops.includes('GNOME')) {
      return `Apargon runs only on GNOME for now. ${desktops.join(', ') === '' ? 'This desktop' : desktops.join(', ')} isn't tested yet: on some desktops, any app can type into other windows.`;
    } else if (spawnSync('bwrap', ['--version']).status !== 0) {
      return 'Apargon needs bwrap. Install Apargon from the .deb: it brings bwrap and the AppArmor profile Ubuntu needs.';
    } else if (spawnSync('unshare', ['--map-user=0', '--help']).status !== 0) {
      return 'Apargon needs util-linux 2.38 or newer, as in Ubuntu 24.04.';
    }

    return null;
  },
  unsafeDesktop: X11_DISPLAY !== null,
  // An AppImage is one file, often in the home folder. The .deb's folder belongs to root.
  installed: app.isPackaged ? (process.env.APPIMAGE ?? path.dirname(process.execPath)) : null,
  async prepare(sandbox) {
    const { page, permissions, proxyPort } = sandbox;
    writeLauncherEntry(page);
    // papp-system has no sandbox: it reaches the sound server itself, with no relay.
    const sound = !permissions.system && (permissions.use.includes('sound') || permissions.use.includes('microphone'));
    // On X11 the screen is a relay, at 6000 and its number, as X numbers its ports: Chromium connects to it more than once, and when it likes. The user said yes to X11 for this file.
    const x11 = !WAYLAND && !permissions.system;
    const relays = [
      ...(proxyPort === null ? [] : [{ port: PROXY_PORT, target: 'proxy' }]),
      ...(sound ? [{ port: SOUND_PORT, target: 'sound' }] : []),
      ...(x11 ? [{ port: 6000 + Number(X11_DISPLAY), target: 'x11' }] : []),
    ];
    // Connected now, before the block: the window's way to the desktop.
    const wayland = WAYLAND && !permissions.system ? await connectUnix(path.resolve(RUNTIME, process.env.WAYLAND_DISPLAY!)) : null;
    const filtered = !permissions.system && permissions.sockets.length === 0;
    const filterFile = filtered ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-seccomp-')), 'filter') : null;

    if (filterFile) {
      fs.writeFileSync(filterFile, socketFilter());
    }

    const filterFd = filterFile ? fs.openSync(filterFile, 'r') : null;
    // The trampoline's network, for the offline check: the .papp file's must be another.
    const trampolineNetworkFd = fs.openSync('/proc/self/ns/net', 'r');
    const stdio = ['ignore', 'pipe', 'pipe', 'pipe', trampolineNetworkFd, 'pipe', relays.length ? 'pipe' : 'ignore', wayland ?? 'ignore', filterFd ?? 'ignore'] as const;
    const env = (base: NodeJS.ProcessEnv) => ({
      ...base,
      ...(wayland && { WAYLAND_SOCKET: String(WAYLAND_FD) }),
      // X looks up the cookie for 127.0.0.1 as for this computer's own screen: the user's XAUTHORITY works as it is.
      ...(x11 && { DISPLAY: `127.0.0.1:${X11_DISPLAY}` }),
      ...(sound && { PULSE_SERVER: `tcp:127.0.0.1:${SOUND_PORT}` }),
    });

    return {
      start: (apargon, base) => startPiped(permissions.system ? apargon : ['bwrap', ...bwrapArgs(sandbox, filtered), ...MOUNTS_AT_START, ...apargon, `--ozone-platform=${x11 ? 'x11' : 'wayland'}`], [...stdio], env(base)),
      requestFd: REQUEST_FD,
      replyFd: REPLY_FD,
      muxFd: relays.length ? MUX_FD : null,
      proxy: proxyPort === null ? null : `127.0.0.1:${PROXY_PORT}`,
      relays,
      relayTargets: {
        proxy: () => net.connect({ port: proxyPort!, host: '127.0.0.1', allowHalfOpen: true }),
        sound: () => filterSound(net.connect({ path: path.join(RUNTIME, 'pulse', 'native'), allowHalfOpen: true }), permissions.use),
        x11: () => net.connect({ path: `/tmp/.X11-unix/X${X11_DISPLAY}`, allowHalfOpen: true }),
      },
      // Started inside the sandbox, they keep its limits: its network, its disks, its socket filter.
      programsHere: true,
      close() {
        wayland?.destroy();
        fs.closeSync(trampolineNetworkFd);

        if (filterFd !== null) {
          fs.closeSync(filterFd);
        }

        if (filterFile) {
          fs.rmSync(path.dirname(filterFile), { recursive: true, force: true });
        }
      },
    };
  },
  downloadAddress(page) {
    const mark = spawnSync('getfattr', ['--only-values', '-n', 'user.xdg.origin.url', page], { encoding: 'utf8' });

    return mark.status === 0 ? mark.stdout : null;
  },
  pageIcon(page, png) {
    fs.mkdirSync(ICONS, { recursive: true });
    fs.writeFileSync(path.join(ICONS, `${pageAppId(page)}.png`), Buffer.from(png, 'base64'));
    writeLauncherEntry(page);
  },
  // A copy of the launcher entry, which prepare writes first.
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
  trayClicks: false,
};

function connectUnix(file: string) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect(file, () => resolve(socket));
    socket.once('error', reject);
  });
}

// Reads: every local disk. Writes: its own folder and papp-write. No network: the relays are its way to the proxy. No socket file: the filter.
function bwrapArgs({ permissions, own, protectedFolders }: Sandbox, filtered: boolean) {
  const devicePatterns = Object.entries(DEVICE_FILES).filter(([use]) => permissions.use.includes(use as Use)).map(([, pattern]) => pattern);
  const devices = [
    '/dev/dri',
    ...(permissions.use.includes('midi') && fs.existsSync('/dev/snd') ? fs.readdirSync('/dev/snd').filter(name => MIDI_FILES.test(name)).map(name => `/dev/snd/${name}`) : []),
    ...(permissions.use.includes('usb') ? ['/dev/bus/usb'] : []),
    ...fs.readdirSync('/dev').filter(name => devicePatterns.some(pattern => pattern.test(name))).map(name => `/dev/${name}`),
  ].filter(file => fs.existsSync(file));

  // Later mounts cover earlier ones.
  return [
    ...['--unshare-net', '--unshare-pid', '--unshare-user', '--unshare-ipc', '--new-session', '--die-with-parent'],
    ...(permissions.writeAll ? ['--bind', '/', '/'] : ['--ro-bind', '/', '/']),
    ...['--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp'],
    // X11's cookie file may be in /tmp, as xvfb-run and SDDM keep it: the same file, read-only.
    ...(!WAYLAND && process.env.XAUTHORITY ? ['--ro-bind-try', process.env.XAUTHORITY, process.env.XAUTHORITY] : []),
    ...devices.flatMap(file => ['--dev-bind', file, file]),
    ...remoteMounts().flatMap(folder => ['--tmpfs', folder]),
    // Apargon's data holds the approvals, the .papp files' folders hold each other, and the app is the app: read-only, even under papp-write all.
    ...protectedFolders.filter(folder => fs.existsSync(folder)).flatMap(folder => ['--ro-bind', folder, folder]),
    ...[own, ...permissions.write].flatMap(folder => ['--bind', folder, folder]),
    ...(filtered ? ['--seccomp', String(SECCOMP_FD)] : []),
  ];
}

// Where a disk that is not on this computer is mounted now.
function remoteMounts() {
  return fs
    .readFileSync('/proc/self/mountinfo', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [before, after] = line.split(' - ');

      // The kernel writes a space in a name as \040.
      return { where: before.split(' ')[4].replace(/\\(\d{3})/g, (_match, code: string) => String.fromCharCode(parseInt(code, 8))), type: after.split(' ')[0] };
    })
    .filter(mount => !LOCAL_TYPES.has(mount.type) && fs.statSync(mount.where, { throwIfNoEntry: false })?.isDirectory())
    .map(mount => mount.where);
}

// The dock names a window after the launcher entry its class matches, and shows that entry's icon: one per .papp file, under its title, that reopens it. Hidden from the app grid.
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
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, reference: string) => {
      const code = Number(`0${reference}`);

      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ')
    .trim();

  return text || path.basename(page, path.extname(page));
}

// As the Desktop Entry specification quotes an Exec argument.
function quoteExecArgument(arg: string) {
  const escaped = arg.replace(/\\/g, '\\\\\\\\').replace(/["$`]/g, '\\\\$&').replace(/%/g, '%%');

  return '"' + escaped + '"';
}
