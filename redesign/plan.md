# Apargon redesign: the plan

Status: written 2026-11-07, built on the `redesign` branch 2026-11-08. Tests: [tests/index.md](tests/index.md).

## For the agent building this

- **This plan is the only source of truth.** It wins over `AGENTS.md`, `SECURITY.md`, the `papp` skill, the tests and the code.
- **The current code is the old design. It's not a reference.** Every piece of it is either deleted or changed to match this plan. Don't keep old behaviour "to be safe".
- If the plan doesn't need something, delete it. If the plan needs it, rewrite it to the plan.
- If the plan is silent or unclear, ask the user. Don't fall back to what the old code does.
- One exception: the old code may be used as a **list** of features that exist (every `papp-use` feature, every `papp-window` setting). Keep each one unless the plan removes it. Don't copy how it works.
- Work on a branch. `pnpm test` is green at the end, not during.
- Ask the user before touching the VPS. It runs production.
- Draft every popup line in the plan's style. The user approves the wording.
- `SECURITY.md`, the `papp` skill and the test `.papp` files are rewritten to match at the end.

## The idea

A reverse browser.

- A browser: all of the internet, none of your computer.
- Apargon: your files, none of the internet.

## The promise

**A `.papp` file can't send anything off your computer, unless the user allowed it.**

That's all. Everything else is the user's job.

## The one question

Ask this about every issue:

**Can data leave the computer without the user saying yes?**

- No: ignore it.
- Yes: block it, or put it behind a tag.

## Not our problem

- Bugs in Chromium, Electron or the OS.
- Things a person does: copy, paste, screenshot, share, print, open a file.
- Anything that stays on the computer: files, the clipboard, other `.papp` files.
- What an allowed host does with the data.
- Leaks in Windows itself, like the DNS leak. Microsoft has to fix it. We say so.

## How we keep the promise

Every hole we found was the same: the app asked **another program** to go online for it.

So:

- Files: allowed.
- Other programs: blocked. No services, sockets, mounts, devices, or typing into other windows.
- Apargon passes nothing to other apps without a tag. Links open only to allowed hosts.
- The window shows only the `.papp` file. No other pages.

## Without tags

- Reads every local disk.
- Writes only to its own folder, `~/.apargon/<papp>`.
- No network.
- Safe even if the `.papp` file is hostile.

## Picking files

The user picks in a system dialog. That's a yes, so no tag is needed. Nothing restarts.

- **Pick to read:** the `.papp` file reads the file itself.
- **Pick to write:** Apargon writes the file for it.
- **Pick a folder to write:** Apargon writes inside that folder for it. Simple file names only.
- The place always comes from the dialog, never from the `.papp` file.
- Picks are remembered, even after a restart.

## Tags

A tag is the user's yes. The popup says what it allows.

Rule: `content` holds the one thing (a folder, site, program, feature). Attributes hold the options (`all`, `unfenced`, `network`, window settings). An unknown attribute refuses the file.

| Tag                                                                     | Allows                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `<meta name="papp-write" content="~/notes/">`                           | Write to one folder (not your home folder, not Apargon's own)      |
| `<meta name="papp-write" all>`                                          | Write anywhere                                                     |
| `<meta name="papp-run" content="git">`                                  | Run a program, with the same limits                                |
| `<meta name="papp-run" content="git" unfenced>`                         | One program with no limits                                         |
| `<meta name="papp-net" content="x.com">`                                | Talk to this exact site, and open its links (replaces `papp-open`) |
| `<meta name="papp-listen">`                                             | Listen, for this computer only                                     |
| `<meta name="papp-listen" network>`                                     | Listen, for the whole network                                      |
| `<meta name="papp-socket" content="/var/run/docker.sock">`              | Talk to one other program                                          |
| `<meta name="papp-use" content="usb">`                                  | Devices and extras (USB, camera, notifications…)                   |
| `<meta name="papp-use" content="sound">`                                | Play sound                                                         |
| `<meta name="papp-use" content="cloud">`                                | Read cloud folders                                                 |
| `<meta name="papp-window" on-top frame="no" size="320x80">`             | Window settings                                                    |
| `<meta name="papp-env" content="AWS_PROFILE">`                          | Pass a named variable to programs                                  |
| `<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N">` | A key that works in every app                                      |
| `<meta name="papp-system">`                                             | Everything (the `.papp` file becomes a Node script)                |

Old tags not listed here refuse the file.

### Details

- **A program from `papp-run`** gets the same as its `.papp` file: reads everything, writes its `papp-write` folders, reaches its `papp-net` sites through Apargon's proxy, and gets only its `papp-env` settings.
- **A site in `papp-net`** is a host and an optional port (443 if none). No scheme, no `*`. IP addresses and `localhost` are allowed: the user said yes.
- **All network goes through Apargon's proxy.** The sandbox has no network and no DNS. The proxy checks the name first and looks up only allowed names. A program's non-web traffic (like `git` over SSH) works only if the program can tunnel through the proxy to an allowed host and port. Otherwise it has no way out.
- **`papp-socket` wins on every OS.** macOS and Windows allow connecting to that one socket path, and no other. On Linux the socket block can't allow one path, so `papp-socket` turns the block off. It's the "trust me bro" tag anyway.
- **The full `papp-use` list.** Kept from today: `notifications`, `clipboard`, `location`, `sound`, `camera`, `microphone`, `screen`, `background`, `login`, `usb`, `serial`, `hid`, `midi`, `print`, `cursor`, `broadcasts`, `share`. New: `cloud`, `bluetooth`.
- **The full `papp-window` list.** Kept from today, now as attributes: `size`, `width`, `height`, `min-width`, `min-height`, `resizable`, `title-bar`, `frame`, `transparent`, `on-top`, `all-spaces`, `click-through`, `private`, `dock`, `blur`, `mark`. A bare attribute means yes (`on-top`). `="no"` means no (`frame="no"`). Sizes take a value (`size="320x80"`).

### What changes from today's tags

The tags are being changed, not only added. No backward compatibility: a `.papp` file using the old form is refused.

- `papp-read`: removed. Reading is always allowed.
- `papp-open`: removed. Its sites go in `papp-net`.
- `papp-write`: paths only, no `*` patterns. New: the `all` attribute.
- `papp-run`: new `unfenced` attribute.
- `papp-net`: exact sites only, no `*`. Now also covers opening links.
- `papp-listen`: `content="localhost"` and `content="network"` become no attribute and the `network` attribute.
- `papp-window`: settings move from `content="on-top=yes, frame=no"` to attributes (`on-top`, `frame="no"`, `size="320x80"`).
- `papp-system`: `content="full"` is dropped. The tag alone means everything.
- `papp-use`: new features `cloud` and `bluetooth`.
- `papp-socket`, `papp-env`, `papp-global-shortcut`: unchanged.
- The `papp` skill (`skills/papp/SKILL.md`) and the test `.papp` files must be updated to match.

Popup words: a few plain words a non-developer understands. Say what it can do, with real names (the folder, the site, the program). No tech words, no explanations. One line per tag. An attribute changes that tag's line. The builder drafts the line for every tag, attribute and feature, and the user approves.

A yes belongs to the file's exact bytes (a hash). Any change, even a comment, asks again.

## Apargon is careful

Apargon (the trampoline) is the only part with internet. It works for a `.papp` file that may be hostile. So:

- It writes only where the user picked. The `.papp` file can't change that.
- It checks a site is allowed before looking it up. Even a lookup can leak.
- It checks the file it opened, not just the name.

## Release rules

- Tested and passed: supported.
- Not tested yet: refused. This is for features and desktops, not OS versions (see "Supported versions").
- Can't be tested: we don't say it works.
- **A test finds a leak: it's critical.** Stop and tell the user. That feature or setup doesn't ship until it's solved by removing a capability, never by a patch.

## Building rules

- Block by default: network, mounts, devices, links, and services for programs.
- If something breaks, allow it. Never patch a leak with a new block.
- The limits are set once, at start.
- Programs stop when the `.papp` file closes.
- Keep the offline check.
- Refuse old and unsafe systems.

## macOS

- Recent macOS only.
- Reads: all, except network drives and cloud folders.
- Writes: own folder, plus `papp-write`.
- No network, no mounting.
- Services stay open, but the `.papp` file can't reach them itself. Opening links and controlling other apps stay blocked.
- Devices: only the basic ones and the GPU.
- Programs get no services.
- Written files are marked, so the Mac asks before running them.

## Linux

- Wayland, or X11 after a popup: "On X11, Apargon can't keep your data in. Log in with Wayland to be safe." [Cancel] [Open anyway]. Asked once per hash of the `.papp` file's bytes. On X11 the screen is a relay, like sound; the socket filter stays.
- GNOME: allowed.
- KDE: refused until tested.
- sway and similar: refused until tested.
- Other desktops: refused.
- Reads: local disks only. No D-Bus.
- Sockets: connecting to any socket file is blocked at the system level (seccomp), for the `.papp` file and its programs. Wayland is connected before the block. No path lists.
- Sound: only with `papp-use sound`. Then the sound system (PipeWire or PulseAudio) is connected before the block too. The sound system can also send sound over the network, so the popup says so.
- Cloud: nothing to do (Dropbox keeps full local copies).
- Writes: own folder, plus `papp-write`.
- No network.
- Programs: same limits.

## Windows

- MXC ProcessContainer.
- Reads: the top-level folders of every local drive, plus each item in the user's folder. Network drives skipped. OneDrive folders skipped unless `papp-use cloud`. Folders made after start aren't readable until the next start.
- Writes: own folder, plus `papp-write`.
- Network: only through Apargon's proxy. No sockets.
- `papp-run`: on. Tested: no Windows helper sent data for it ([tests/windows-helpers.md](tests/windows-helpers.md)).

## We tell users, but don't block

- An allowed site can receive any file.
- Code written with `papp-write` can run later.
- Dropbox and iCloud upload what's written in their folders.
- The Windows DNS leak.
- On Linux, `papp-use sound` also lets the sound system send sound over the network.
- On Linux with X11, after the popup: the `.papp` file can type into and read other windows.

## Remove from the code

- The old pick system (it restarted the app).
- `plans/home-fence.md`.
- The path block lists (`HOME_FOLDERS`, `HOME_READS`, `refusePath`).
- Wildcard hosts.
- `papp-read`.

## Supported versions

The oldest version that should work, based on what each part needs. One line for all. Not tested on each version, by the user's decision. The release rule "not tested: refused" doesn't apply to versions.

- macOS: Electron's own minimum (macOS 12 for Electron 45; check when building).
- Windows: any Windows 11 where MXC says ProcessContainer works. Apargon asks MXC at start and refuses if not.
- Linux: GNOME on Wayland, Ubuntu 22.04 and newer (Wayland is the default there). KDE and sway on Wayland stay refused until their typing tests pass. Any desktop on X11, after its popup.
- Older: refused.

## To do

### Tests

We have: this Mac, the VPS (production, so only for the final `.deb`) and GitHub Actions (no GPU).

This Mac:

- written files get marked
- the device list (Electron still starts)
- a network drive connected after start, outside `/Volumes`

GitHub Actions, Linux:

- programs can't talk to other programs' sockets
- a drive mounted after start: does it show inside?
- sway blocks typing with `security-context-v1`
- KDE blocks typing (headless only)
- Wayland for the release tests

GitHub Actions, Windows: done.

After the build:

- the Mac tests again, on the real app
- the final `.deb` on the VPS
- a `.papp` file can't change an outside file through a link in its folder
- every hole found becomes a permanent test

Can't test with what we have:

- a real GPU on Linux
- real Linux desktops with a user logged in
- OneDrive online-only files
- Windows on a real PC, and x64 Windows 11

### Then

1. Build the limits, the program starter, the X11 and desktop refusal, and the popup text.
2. Rewrite `SECURITY.md`.
3. `pnpm test` green.

## Appendix: optional extra

Not part of the plan. Only for protection against Chromium bugs, which are out of scope.

- macOS: allow the `.papp` file's process only the 10 services Electron needs. None of them goes online. See [tests/macos-electron-services.md](tests/macos-electron-services.md).
- Cost: input methods, screen readers, tray, notifications, share and printing aren't tested with it, and macOS updates can change the list.
