# Security model

## The promise

**A `.papp` file can't send anything off your computer, unless you allowed it.**

That's all. Everything else is your job.

## The one question

**Can data leave the computer without the user saying yes?**

- No: out of scope.
- Yes: blocked, or put behind a tag the user approves.

## Decisions

Every hole found was the same: the app asked **another program** to go online for it. So:

- Reading local files is allowed. A read sends nothing.
- Other programs are blocked: no services for programs, no sockets, no mounts, no devices beyond the basic ones, no typing into other windows.
- The sandbox has no network and no DNS. All network goes through Apargon's proxy.
- Chromium in the sandbox looks up no name itself: every name goes to the proxy. `papp-system` has no sandbox and looks names up as usual.
- At each start the sandboxed process checks that it is offline, and refuses to open if it is not. `papp-system` has no sandbox and skips the check.
- These tags ask nothing: `papp-window`, `papp-use` `notifications` and `sound`, a `papp-run` program that isn't `unfenced`, and `papp-env`. A `.papp` file with only those opens with no popup. Every other tag asks.
- A yes is kept as a hash of the file's bytes and the popup's lines. A change to either asks again.
- The lines themselves are kept too, only to mark the new ones when it asks again. The hash alone decides.
- "Trust changes to this file", a checkbox in the popup that asks again, keeps the yes as a hash of the popup's lines alone. Then a change to the file's bytes doesn't ask, and whatever can write the file gets what the user approved: another program, a newer download, a `.papp` file with `papp-write` on its folder.
- A pick in a system dialog is a yes for that file or folder. So is the system print panel.
- An unknown tag or attribute refuses the file.
- `papp-run unfenced` runs the program's real file, past any link. A program the `.papp` file could change is refused.
- Nothing is passed to another app without a tag. A link opens only to a site in `papp-net`.
- The window never shows a web page, in a frame either.

## The sandbox

### macOS

- One Seatbelt profile for the `.papp` file's process, set once at start.
- Reads: everything but network drives and cloud folders.
  - Network drives: any mount that isn't local, and all of `/Volumes` but the local disks attached at start.
  - Cloud folders: `~/Library/CloudStorage` and `~/Library/Mobile Documents`, unless `papp-use cloud`.
- Writes: its own folder, a temp folder of its own and its `papp-write` folders. Never Apargon's data, the other `.papp` files' folders or the app.
- Network: only the proxy's port, over IPv4 TCP.
- No mounting (`file-mount`), no opening other apps (`lsopen`), no Apple Events, no writing other apps' settings.
- No resolver service (`com.apple.dnssd.service`): Network.framework looks names up through it, off the computer. Other lookups go through a socket that `network*` already refuses.
- Devices: `/dev/null`, `/dev/zero`, `/dev/random`, `/dev/urandom`, `/dev/fd`, `/dev/dtracehelper`, `/dev/autofs_nowait`. With `papp-use serial`, `/dev/cu.*` too. No terminal.
- Services stay open to the `.papp` file's process: Electron needs them.
- Programs: the trampoline starts them under the same profile, plus no services (`deny mach-lookup`).
- Files marked as downloaded, so the Mac asks before running them:
  - A new file or a copy that `papp.*` writes: at once.
  - What its programs wrote in its own folder and its `papp-write` folders: when the `.papp` file closes.
  - Not marked: a file that `papp.*` writes over, and what programs wrote under `papp-write all`.

### Linux

- Wayland: GNOME only. Other desktops are refused.
- X11: any app can type into and read any window, so Apargon can't keep its promise there.
  - Before a `.papp` file opens, a popup says: "On X11, Apargon can't keep your data in."
  - It asks again when the file's bytes change, even for a file with no tags.
  - Only this computer's screen. A `DISPLAY` from elsewhere, as over ssh, is refused.
- bwrap: an empty network of its own, `/` read-only, a minimal `/dev`, a private `/tmp`.
- Reads: local disks, as mounted at start.
  - Network and FUSE mounts present at start are hidden. Four FUSE kinds stay: `fuseblk`, `fuse.portal`, `fuse.snapfuse`, `fuse.lxcfs`.
  - The sandbox keeps a private copy of the mounts, so a drive mounted later never reaches it ([test](redesign/tests/linux-late-mount.md)).
  - A `papp-write` folder on a network drive is not hidden.
- Writes: its own folder and its `papp-write` folders. Apargon's data, the `.papp` files' folders and the app (the AppImage, or the `.deb`'s folder) stay read-only.
- Sockets: a seccomp filter covers the `.papp` file and its programs.
  - Allowed: internet and netlink sockets, which reach only the empty network, and `AF_UNIX` pairs that are not datagram.
  - Refused: every other socket, so no D-Bus, no socket file and no vsock. Datagram pairs, which send to any socket file by name. `io_uring`, which opens sockets past seccomp.
  - Refused too: the keyring calls (`add_key`, `request_key`, `keyctl`). Through `request_key`, the host's helper can look up a name outside the empty network.
- Wayland: the trampoline connects before the sandbox starts and hands the connection over as `WAYLAND_SOCKET`.
- One pipe from the trampoline carries the proxy, the sound server (with `papp-use sound` or `microphone`) and, on X11, the screen. The trampoline connects only what this `.papp` file was given.
- On X11 the `.papp` file gets `DISPLAY=127.0.0.1:N` and your `XAUTHORITY`. The socket filter stays on.
- Sound: the trampoline reads every command to the sound server.
  - Passed: connecting, reading what is there, and its own streams on the default device. Playing needs `sound`, recording needs `microphone`.
  - A stream's properties can't name a device.
  - Anything else, like loading a module or moving a stream, closes the connection.
  - The sound card's files in `/dev` aren't there. MIDI's are, with `papp-use midi`.
- `papp-socket` turns the socket filter off: it can't allow one path. Every kind of socket opens then, vsock too. It's the "trust me" tag, and the popup says "Control: any program on this computer".
- Programs: started inside the same sandbox, with the same limits.
- `papp-use location` and `papp-use bluetooth` are refused.

### Windows

- MXC ProcessContainer. Apargon asks MXC at start and refuses if it isn't there.
- Reads: the folders at the root of every local drive, and each item in your user folder.
  - Network drives are skipped. OneDrive is skipped unless `papp-use cloud`.
  - A folder made at a root after start isn't readable until the next start.
- Writes: its own folder, your temp folder and its `papp-write` folders. Never Apargon's data, the `.papp` files' folders or the app.
- Network: Apargon tells MXC to refuse every address but the proxy's.
- Programs: started inside the same container, with the same limits.
- `papp-socket` and `papp-use bluetooth` are refused: not tested yet.

## The proxy

- One per `.papp` file with `papp-net`, on this computer's loopback, run by the trampoline. A file without `papp-net` has none.
- Exact host and port only. `localhost` goes through it too.
- It checks the name first and looks up only allowed names.
- A name that leads to a cloud computer's metadata server is refused: a link-local address, `fd00:ec2::254` or `100.100.100.200`. An address in `papp-net` itself is not.

## Apargon is careful

The trampoline is the only part with network. It works for a `.papp` file that may be hostile. So:

- It writes only where you picked, or where the tags allow.
- It checks the file it opened, not just the name: no links, a plain file, still in the folder you picked.
- It keeps approvals, picks and secrets in its own data. No `.papp` file may write there, or read the secrets.
- It shows the `.papp` file's output as plain text, never as terminal codes.
- It refuses a `.papp` file whose name or folder has a line break or another control character.

## We tell you, but don't block

- An allowed site can receive any file you have.
- Code written with `papp-write` can run later, outside the sandbox: a launch agent, a shell's startup file.
- Dropbox and iCloud upload what's written in their folders.
- A hard link already inside a `papp-write` folder reaches the file it links to. macOS and Linux refuse new ones ([macOS](redesign/tests/macos-hard-links.md), [Linux](redesign/tests/linux-hard-links.md)).
- On Linux, a `papp-write` folder on a network drive sends what's written there.
- On Linux in a virtual machine, `papp-socket` reaches the machine's host through vsock.
- On Linux, if your default speakers are on the network, `papp-use sound` plays to them.
- On Linux with X11, once you say yes, the `.papp` file can type into and read your other windows, a terminal's or a browser's too.
- On Windows, your temp folder is shared with other apps.
- On Windows, a program can make Windows look up a name, as in `\\<data>.example.com\x`. That's Microsoft's to fix; it has been reported.

## Not our problem

- Bugs in Chromium, Electron or the OS.
- Things you do: copy, paste, screenshot, share, print, open a file.
- Anything that stays on the computer: files, the clipboard, other `.papp` files.
- Another file that claims the same `papp-id`: it reaches that id's folder and secrets, which stay on the computer.
- What an allowed site does with the data.

## Not tested yet, so not supported

- Linux: a real desktop with a user logged in. CI runs headless GNOME.
- Linux: the sound filter against a real sound server. It is tested against recorded commands.
- Linux on X11: a real desktop, and a GPU. It passes under Xvfb.
- Linux: a real GPU.
- macOS: a network drive mounted after start outside `/Volumes`. The `.papp` file can't mount one itself.
- macOS: writing to a network drive under `papp-write`. The profile refuses reads there, not writes.
- macOS: input methods (like Japanese) under the profile.
- Windows: x64 Windows 11, and a real PC. CI runs Windows 11 on arm64.
- Windows: new hard links, and OneDrive online-only files.

## Supported versions

- macOS: 13 or newer, Electron's own minimum.
- Windows: any Windows 11 where MXC says ProcessContainer works.
- Linux: GNOME on Wayland, or any desktop on X11 after its popup, with util-linux 2.38 or newer (Ubuntu 24.04 and newer).
- Older: refused.

## Verification

`pnpm test` runs every check in the real app. `test/selftest/check.ts` lists them. The tests behind the design are in [redesign/tests/](redesign/tests/index.md).

| Platform | Last verified                                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | 2026-11-08, `pnpm test` on the `redesign` branch: the Node tests and 137 app checks, all passing. Again on the built app (unsigned arm64 build, mock keychain): all 137 passing                                                                                                        |
| Linux    | 2026-11-08, `pnpm test` on GitHub's ubuntu-24.04 under headless GNOME (mutter) on Wayland, run 42494914504 of the spike repo: all passing. 2026-11-09, the installed `.deb` (sha256 `9bae50b1…`) on the Ubuntu 24.04 VPS: 120 checks on Wayland and 118 on X11 under Xvfb, all passing |
| Windows  | 2026-11-08, `pnpm test` on windows-11-arm, the same run: all passing, no leak in the packet capture                                                                                                                                                                                    |

## Reporting

Open an issue if a `.papp` file reaches a site or another program it wasn't allowed, or if the offline check passes outside the sandbox. Include the `.papp` file and the platform. Leave out secrets.
