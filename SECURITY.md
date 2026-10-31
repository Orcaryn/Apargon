# Security model

## In short

| Page             | Network                 | Files                         | Keys and logins      |
| ---------------- | ----------------------- | ----------------------------- | -------------------- |
| no tags          | none                    | its own folder, read only     | hidden               |
| with tags        | only what the tags name | only what the tags name       | hidden, unless named |
| with `papp-node` | only what the tags name | everything but Apargon's data | all yours            |

- The OS blocks all network. Only Apargon's proxy, declared `localhost` ports and declared socket files get through.
- The proxy only goes to declared hosts.
- A `papp-node` page runs as you. Trust it like a script.
- Windows: only the proxy gets through. Windows refuses `localhost` ports, `papp-socket`, `papp-run`, `papp-node` and `papp-env`.
- A page in `/`, `~`, `~/Desktop`, `~/Documents` or `~/Downloads` gets no own folder.

## Key decisions

- **Two processes.** The trampoline has network. The page runs in an OS sandbox.
- **Offline check.** The page must prove it is offline before its window opens. No flag skips this.
- **Apargon checks reads, not the OS.** Chromium's own sandbox cannot run inside `sandbox-exec`, `bwrap` or MXC. The OS only enforces network, writes, and keys and logins.
- **Tags are read from the file on disk**, before the page runs. Only the part before the first `<script`, `<body` or `</head` counts. An unknown tag, a bad value or an invisible character refuses the page.
- **An approval = a path + the exact popup lines.** A downloaded page is also tied to its content. If the content changes, Apargon asks again.
- **No page can write Apargon's data** (`grants.json`, `links.json`, `seen.json`). The page's file API can't read it either.
- **The sandbox gets no terminal.** Its output reaches the terminal as plain text. On macOS, Seatbelt also denies `/dev/tty`, so a page can't type commands into the shell that started Apargon.
- **The window shows only the page.** No navigation. No frame of another file.
- **Hidden files** (dot names) are never matched by `*`. A tag must name them.
- **A page can only write a `.papp`** through a `papp-write` pattern that ends in `.papp`. That line is red.
- **Windows runs no programs.** A program could open `\\host\x`. A Windows service then looks up the name, and the DNS query leaks data. This leaked in every MXC mode tested.
- **The app's only network call** is the update check. No telemetry, no crash reports, nothing at login.

## How each OS enforces it

### macOS

- Sandbox: Seatbelt (`sandbox-exec`). The profile starts from `(allow default)`, because the GUI needs it.
- Offline check: binding a loopback port must fail with `EPERM`.
- Writes: limited by pattern. Not for `papp-node`.
- Keys and logins: denied, even ones made later.
- Blocked: `nsurlsessiond`, `trustd`, WebKit services. These fetch from outside the sandbox.
- Blocked, but not for `papp-node`: opening apps, sending Apple Events, `defaults write`.

### Linux

- Sandbox: `bwrap --unshare-net --unshare-pid --unshare-user --disable-userns --new-session --die-with-parent`.
- Offline check: the network has only `lo` and is not the trampoline's.
- Writes: limited by folder.
- Keys and logins: hidden, but only those that exist when the page opens.
- `/run`, `/tmp` and `/var/tmp` are emptied. Their socket files bypass `--unshare-net`: D-Bus, DNS, sound, tmux, Docker.
- Apargon puts back only the display, the page's folders and sockets, and sound with `papp-use sound` or `microphone`.
- A tag folder, or the page's own folder, that would expose `/tmp`, `/var/tmp` or `/run` is refused.

### Windows

- Sandbox: MXC (an AppContainer). Outbound traffic is denied.
- Offline check: connecting to `127.0.0.1:9` must fail with `EACCES`. This is weak, see "Not enforced".
- Writes: limited by folder. A write folder in or around Apargon's data is refused.
- Keys and logins: hidden, but only those that exist when the page opens.
- Apargon refuses `\\` paths, `file://host/`, `:` streams and names ending in a dot or a space.

### Every OS

- The OS lets a page write only to: its `papp-write` folders, the temp folder, `/dev`, and its own Electron data.
- Keys and logins: `SECRETS` in `src/permissions/paths.ts`, plus each OS's list.

## The proxy

- It runs in the trampoline and looks up names itself.
- It answers 403 to any undeclared `host:port`.
- It refuses local addresses: loopback, `0/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `169.254/16`, `fc00::/7`, `fe80::/10`, `64:ff9b::/96`, and this machine's own addresses.
- A local IPv4 address works only if declared in numbers, with its port.
- It logs to `egress.log`. If the log fails to write, it stops taking connections.
- Declared `localhost` ports skip the proxy and are not logged. Each needs a number: `localhost:*` would reach other pages' proxies.

## Popup colours

- **Red:** a way to send data somewhere the tags don't name. This includes any server, `*.com`, any port, an IP address, `localhost`, a socket, `papp-node`, and writing hidden files, `~/Library`, `AppData` or pages.
- **Yellow:** worth a look. This includes `*.example.com`, wide folders, keys and logins, clipboard, location, camera, microphone, screen, shortcuts, and `papp-run` on macOS.
- **Checkbox:** needed for any red line. Also needed when the page can run programs, or send what it sees to a host.

## Not enforced

### Reading

- A page that exploits Chromium can read:
  - macOS: every file but keys and logins.
  - Linux: the same, except `/run`, `/tmp` and `/var/tmp`.
  - Windows: only the granted folders.
- Listing a folder above a wildcard shows its names.

### Writing

- Linux and Windows limit writes by folder. For `~/notes/*.md`, a program can change any file in `~/notes`, hidden files and pages included.
- A writable folder can hold files other tools run later, like `package.json` scripts or `.git/hooks`. The popup doesn't show these as red.
- A synced folder sends what the page writes off the machine.

### Saving (`papp.saveAs`)

- Any page can open the save dialog, with no tag, again and again.
- The trampoline writes only new files, into the folder the user picks.
- Hidden folders and `~/Library` or `AppData` are refused: files saved there can run on their own. macOS cloud drives in `~/Library` (iCloud Drive, `~/Library/CloudStorage`) are allowed: files there only sync.
- Saved files have no download mark. So they open without the OS warning.
- A program could swap the picked folder for a link between check and write.

### Programs (`papp-run`)

- They can read every file but keys and logins.
- They take any arguments, like `git -c core.sshCommand=…`.
- They can change every page's storage in `pages/`.
- macOS: programs can't open terminal devices (`/dev/ttys…`). Tools that need a pseudo-terminal likely fail. Untested.
- macOS: they can probably use the camera, microphone or screen once Apargon has that access. Untested.

### Keys and logins

- The list is fixed. A key in `~/keys/` or a `.env` file is not hidden.
- Naming part of one (`~/.ssh/config`) unhides the whole folder from the OS sandbox.

### Network

- `*.github.io` is yellow, though anyone can publish there.
- A declared local address or socket reaches whatever answers there.
- The proxy tells "local" by address range. A VPN with public addresses counts as the internet.
- For https, the proxy sees only `host:port`. Domain fronting works.
- Deleting `egress.log` while it runs loses later entries silently.
- Ways out for a program, or a page that exploits Chromium:
  - macOS: messages to system services (the GUI needs them).
  - Linux: a socket file elsewhere (`tmux -S ~/sock`), `vsock` in a VM, the X11 display to type into other windows.

### Windows

- A page that exploits Chromium can leak data through DNS. No MXC setting stops this.
- The offline check only proves loopback is blocked. A Windows sandbox blocks loopback even when it has internet. What keeps the page offline is the deny rule Apargon sends to MXC.
- With OneDrive backup, the PowerShell startup folders are not on the list.

### Links and files

- The link dialog is the only check. "Always" remembers the host for that page.
- Only the first address is checked. After that, the site can go anywhere.
- `papp.open` opens only viewable types, like images, PDF and text. The viewer decides what the file does: Acrobat runs PDF scripts.
- A page can open the dialog as often as it likes.

### Devices and the desktop

- With `papp-use`, the page gets everything the device picks up. This includes a password copied to the clipboard.
- Apargon shows no sign that the camera or microphone is on.
- macOS asks once for Apargon, not for each page.
- A shortcut takes those keys from every app.
- Any page can show a tray icon, with no tag. It and notifications show under Apargon's name.
- A page's icon can look like another app. Only the badge shows it is a page.

### Storage after a move

- Same `.papp` content means same storage. The `.js` and `.css` it loads don't count.
- A file on an unplugged drive counts as gone. A copy of it takes its storage.

### Where a page came from

- `git clone`, `curl`, USB sticks, and Firefox on Linux leave no download mark.
- Linux needs `getfattr` to read the mark. The `.deb` doesn't require it. Without it, every page counts as made here.
- A page with no mark: no content check, and no popup if it has no tags.
- A page with `papp-write` can change `.js` and `.css` that an approved page loads. Keep approved pages where only you write.

### Full-Node pages

The sandbox still blocks their network and writes to Apargon's data. Nothing else. Such a page can:

- launch an app that has network (`open`, `osascript`);
- write startup files;
- read and change other pages' storage;
- ask the trampoline to revoke approvals or turn off updates;
- remove its badge.

Untested: whether it can rename a folder above Apargon's data and plant a `grants.json`.

### The update check

- At most once a day, GitHub learns your IP address. **Permissions** turns it off.
- macOS installs only a build signed with the same Developer ID. Linux and Windows only show a notice.

### The packaged app

- macOS checks `app.asar` against its build hash. Linux doesn't.
- Linux: Ubuntu 23.10+ needs the AppArmor profile from the `.deb`. Without it, pages silently don't open.

### Scope

Apargon is not a VM. For a hard "nothing leaves" guarantee, use a VM with no network.

## Verification

`pnpm test` runs every check in the real app. `test/selftest/check.ts` lists them. [AGENTS.md](AGENTS.md#tests) has the Linux `.deb` run.

| Platform      | Last verified                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| macOS         | 2026-10-31, `pnpm test` on `eba0470`: every check                                                                |
| Linux         | 2026-10-31, `.deb` from `eba0470` on Ubuntu 24.04 with AppArmor: 86 checks, the refusal test, and the Node tests |
| Linux desktop | not yet                                                                                                          |
| Windows       | 2026-10-30, Windows 11 on arm64: 48 checks, no leak in the packet capture                                        |

Not tested: the NAT64 refusal, the proxy refusing this Mac's own LAN address, and two pages reaching each other's `localhost` ports.

## Reporting

Open an issue if a page reaches a host or file it did not declare, or if the offline check passes outside the sandbox. Include the page, the platform and the egress log. Leave out secrets.
