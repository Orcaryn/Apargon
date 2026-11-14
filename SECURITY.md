# Security model

## The promise

**A `.papp` file can't send anything off your computer, unless you allowed it.**

That's all. Everything else is your job.

Apargon is a reverse browser:

- A browser: all of the internet, none of your computer.
- Apargon: your files, none of the internet.

## The one question

Every issue is judged by one question: **can data leave the computer without the user saying yes?**

- No: out of scope.
- Yes: blocked, or put behind a tag the user approves.

## Identity

Every `.papp` file carries `<meta name="papp-id" content="<uuid>">`. A file without one is refused. Its own folder and its secrets are kept by the id, so a new version finds its data under any name or path. Another file could claim the same id and change that data: that stays on the computer, so it is not Apargon's problem.

## Without permission tags

- Reads every local disk.
- Writes only to its own folder, `~/.apargon/<id>`.
- No network.
- Safe even if the `.papp` file is hostile.

A file with no permission tags opens at once, with no popup.

## Tags

A tag is your yes. The popup lists one line per tag. A yes belongs to the file's exact bytes and to what the popup showed: any change, even a comment, asks again, and so does a tag that now leads to another folder or program.

| Tag                                                                     | Allows                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `<meta name="papp-write" content="~/notes/">`                           | Change files in one folder. Not your home folder, and not Apargon's own |
| `<meta name="papp-write" all>`                                          | Change any file, but Apargon's own                                      |
| `<meta name="papp-run" content="git">`                                  | Run a program, with the same limits as the `.papp` file                 |
| `<meta name="papp-run" content="git" unfenced>`                         | Run one program with no limits                                          |
| `<meta name="papp-net" content="x.com">`                                | Talk to this exact site, port 443 unless named, and open its links      |
| `<meta name="papp-listen">`                                             | Answer connections from this computer                                   |
| `<meta name="papp-listen" network>`                                     | Answer connections from the network                                     |
| `<meta name="papp-socket" content="/var/run/docker.sock">`              | Talk to one other program                                               |
| `<meta name="papp-use" content="camera">`                               | One device or extra feature                                             |
| `<meta name="papp-window" on-top frame="no">`                           | Window settings                                                         |
| `<meta name="papp-env" content="AWS_PROFILE">`                          | Pass one variable to its programs                                       |
| `<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N">` | A key that works in every app                                           |
| `<meta name="papp-system">`                                             | Everything: the `.papp` file becomes a Node script, with the internet   |

- `content` holds the one thing. Attributes hold the options. An unknown attribute refuses the file.
- Old tags (`papp-read`, `papp-open`) and old forms (`content="on-top=yes"`, `content="localhost"`, `content="full"`) refuse the file.
- `papp-net` takes a host and a port. No scheme, no `*`. An IP address and `localhost` are fine: you said yes to them.
- `papp-run unfenced` runs the program's real file, past any link, and refuses one the `.papp` file could change.

## Picking files

You pick in a system dialog. That's a yes, so no tag is needed. Nothing restarts.

- **Pick to read:** the `.papp` file reads it itself.
- **Pick to write:** Apargon writes the file for it.
- **Pick a folder to write:** Apargon writes inside it for it, by plain file names only.
- The place always comes from the dialog, never from the `.papp` file.
- Picks are kept in Apargon's own data, where no `.papp` file writes. They stay after a restart.

## How we keep the promise

Every hole found was the same: the app asked **another program** to go online for it. So:

- Files: allowed.
- Other programs: blocked. No services for programs, no sockets, no mounts, no devices beyond the basic ones, no typing into other windows.
- Apargon passes nothing to other apps without a tag. Links open only to sites in `papp-net`.
- The window shows only the `.papp` file. A frame may hold a local file, never a web page.
- All network goes through Apargon's proxy. The sandbox has no network and no DNS.

### macOS

- One Seatbelt profile for the `.papp` file's process, set once at start.
- Reads: everything, but network drives (any mount that isn't local, and all of `/Volumes` but the local disks attached at start) and cloud folders (`~/Library/CloudStorage`, `~/Library/Mobile Documents`), unless `papp-use cloud`.
- Writes: its own folder, its temp folder and its `papp-write` folders. Never Apargon's data, the other `.papp` files' folders or the app.
- No network but the proxy's port, over IPv4 TCP, where the proxy listens. No mounting (`file-mount`). Devices: only `/dev/null`, `/dev/zero`, the random devices, `/dev/fd` and the tracing helper. No terminal.
- No opening other apps (`lsopen`), no Apple Events, no writing other apps' settings.
- Services stay open to the `.papp` file's process: Electron needs them, and its code reaches them only through `papp.*`.
- Programs: the trampoline starts them, as a sandbox can't start a stricter one inside it. Same profile, plus no services at all (`deny mach-lookup`).
- Written files are marked as downloaded, so the Mac asks before running them: at once for what `papp.*` writes, and when the `.papp` file closes for what its programs wrote.

### Linux

- Wayland: GNOME only. KDE, sway and other desktops are refused until tested.
- X11: Apargon can't keep its promise there, as any app can type into and read any window. Before a `.papp` file opens, a popup says so: "On X11, Apargon can't keep your data in." It asks again when the file's bytes change, even for a file with no tags. Only the screen on this computer: a `DISPLAY` from elsewhere, as over ssh, is refused.
- bwrap: a network of its own, with nothing in it; `/` read-only; a minimal `/dev`; a private `/tmp`.
- Reads: local disks only, as mounted at start. Network and FUSE mounts present at start are hidden, and the sandbox keeps a private copy of the mounts, so a drive mounted later never reaches it ([test](redesign/tests/linux-late-mount.md)).
- Writes: its own folder and its `papp-write` folders. Apargon's data, the `.papp` files' folders and the app (the AppImage, or the `.deb`'s folder) stay read-only.
- Sockets: a seccomp filter lets the `.papp` file and its programs make only internet and netlink sockets, which their empty network holds, and `AF_UNIX` pairs, not datagram ones. So no D-Bus, no socket file, and no vsock, which ignores the sandbox's network and reaches virtual machines and their host. A datagram pair is refused because it sends to any socket file by name. `io_uring` is refused too: it opens sockets past seccomp.
- Wayland is connected by the trampoline before the block, and handed over as `WAYLAND_SOCKET`.
- The proxy, the sound server with `papp-use sound` or `microphone`, and on X11 the screen, are reached through one pipe the trampoline gives at start. The trampoline connects only the ones this `.papp` file was given. On X11 the `.papp` file gets `DISPLAY=127.0.0.1:N` and your `XAUTHORITY`; the trampoline connects each X connection to the real screen. The socket filter stays on.
- The trampoline reads every command to the sound server and passes only a list: connecting, reading what is there, and its own streams on the default device, playing with `sound` and recording with `microphone`. A stream's properties can't name a device. Anything else, like loading a module or moving a stream, closes the connection: those can send sound to any address. Sound goes only this way: the sound card's own files in `/dev` aren't there, only MIDI's with `papp-use midi`.
- `papp-socket` turns the socket filter off: it can't allow one path. It's the "trust me" tag, and the popup says "Control: any program on this computer".
- Programs: started inside the same sandbox, with the same limits.

### Windows

- MXC ProcessContainer. Apargon asks MXC at start and refuses if it isn't there.
- Reads: the folders at the root of every local drive, and each item in your user folder. Network drives are skipped. OneDrive is skipped unless `papp-use cloud`. A folder made at a root after start isn't readable until the next start.
- Writes: its own folder, its temp folder and its `papp-write` folders. Never Apargon's data, the `.papp` files' folders or the app.
- Network: only through Apargon's proxy. No sockets.
- Programs: started inside the same container, with the same limits.
- `papp-socket` and `papp-use bluetooth` are refused: not tested yet.

## The proxy

- One per `.papp` file, on this computer's loopback, run by the trampoline.
- It checks the name first and looks up only allowed names: even a lookup can leak.
- Exact host and port only. `localhost` goes through it too.
- Every try, allowed or not, goes in the egress log: Permissions > Show Egress Log.
- A program's other traffic (like `git` over SSH) works only if the program can tunnel through the proxy to an allowed host and port.

## Apargon is careful

The trampoline is the only part with network. It works for a `.papp` file that may be hostile. So:

- It writes only where you picked, or where the tags allow. The `.papp` file can't change that.
- It checks a site is allowed before looking it up.
- It checks the file it opened, not just the name: no links, a plain file, still in the folder you picked.
- It keeps approvals, picks and secrets in its own data, which no `.papp` file may write.
- It shows the `.papp` file's output as plain text, never as terminal codes.
- It refuses a `.papp` file whose name or folder has a line break or another control character: the path goes into files the OS reads line by line, as Linux's launcher entry.

## We tell you, but don't block

- An allowed site can receive any file you have.
- Code written with `papp-write` can run later, outside the sandbox: a launch agent, a shell's startup file.
- Dropbox and iCloud upload what's written in their folders.
- A hard link already inside a `papp-write` folder reaches the file it links to. New hard links are refused.
- On Linux, if your default speakers are on the network, `papp-use sound` plays to them.
- On Linux with X11, once you say yes, the `.papp` file can type into and read your other windows, a terminal's or a browser's too.
- On Windows, a program can make Windows look up a name, as in `\\<data>.example.com\x`. That's Microsoft's to fix; it has been reported.

## Not our problem

- Bugs in Chromium, Electron or the OS.
- Things you do: copy, paste, screenshot, share, print, open a file.
- Anything that stays on the computer: files, the clipboard, other `.papp` files.
- What an allowed site does with the data.

## Not tested yet, so not supported

- Linux: passes on CI under headless GNOME, but not yet on a real desktop with a user logged in, and the sound filter is tested only against recorded commands, not a real sound server.
- Linux on X11: passes under Xvfb on the Ubuntu 24.04 VPS (2026-11-09, the installed `.deb`, 118 checks), but not yet on a real desktop or with a GPU.
- macOS: a network drive mounted after start outside `/Volumes`. The `.papp` file can't mount one itself.
- macOS: input methods (like Japanese) under the profile.
- Windows: x64 Windows 11, and a real PC. Only Windows 11 on arm64 in CI.
- A real GPU on Linux, and OneDrive online-only files.

## Supported versions

- macOS: Electron's own minimum (macOS 12).
- Windows: any Windows 11 where MXC says ProcessContainer works.
- Linux: GNOME on Wayland, or any desktop on X11 after its popup, with util-linux 2.38 or newer: Ubuntu 24.04 and newer.
- Older: refused.

## Verification

`pnpm test` runs every check in the real app. `test/selftest/check.ts` lists them. The tests behind the design are in [redesign/tests/](redesign/tests/index.md).

| Platform | Last verified                                                                                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | 2026-11-08, `pnpm test` on the `redesign` branch: the Node tests and 137 app checks, all passing. Again on the built app (unsigned arm64 build, mock keychain): all 137 passing                                                                                                                                                           |
| Linux    | 2026-11-08, `pnpm test` on GitHub's ubuntu-24.04 under headless GNOME (mutter) on Wayland, run 42494914504 of the spike repo: all passing. The installed `.deb` (sha256 `9bae50b1…`) on the Ubuntu 24.04 VPS, the same way, 2026-11-09: 120 checks, all passing, the socket filter's included. Not yet on a desktop with a user logged in |
| Windows  | 2026-11-08, `pnpm test` on windows-11-arm, the same run: all passing, no leak in the packet capture. x64 not tested                                                                                                                                                                                                                       |

## Reporting

Open an issue if a `.papp` file reaches a site or another program it wasn't allowed, or if the offline check passes outside the sandbox. Include the `.papp` file, the platform and the egress log. Leave out secrets.
