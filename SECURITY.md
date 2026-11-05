# Security model

## In short

| Page               | Network                 | Files                                                     |
| ------------------ | ----------------------- | --------------------------------------------------------- |
| no tags            | none                    | its own folder, read only                                 |
| with tags          | only what the tags name | only what the tags name                                   |
| with `papp-system` | only what the tags name | sees all (Windows: less); changes only what the tags name |

Keys and logins are files like any other. A tag that names one, the popup names: "See your SSH keys".

- The OS blocks all network. Only Apargon's proxy, declared `localhost` ports and declared socket files get through.
- The proxy only goes to declared hosts.
- With `papp-listen`, the trampoline listens and passes each request to the page as data. The page's process never listens.
- A `papp-system` page runs any program, with all your variables. Trust it like a script.
- Windows: only the proxy gets through. Declared `localhost` ports go through it too. `papp-socket` is refused. A page's programs can send data out through Windows itself, see "Not enforced".
- A page in `/`, `~`, `~/Desktop`, `~/Documents` or `~/Downloads` gets no own folder.

## Key decisions

- **Two processes.** The trampoline has network. The page runs in an OS sandbox.
- **Offline check.** The page must prove it is offline before its window opens. No flag skips this.
- **Apargon checks reads, not the OS.** Chromium's own sandbox cannot run inside `sandbox-exec`, `bwrap` or MXC. The OS only enforces network and writes.
- **Tags are read from the file on disk**, before the page runs. Only the part before the first `<script`, `<body` or `</head` counts. An unknown tag, a bad value or an invisible character refuses the page.
- **An approval = a path + the exact popup lines.** A downloaded page is also tied to its content. If the content changes, Apargon asks again.
- **No page can write Apargon's data** (`grants.json`, `links.json`, `seen.json`, `given.json`). The page's file API can't read it either.
- **A pick is kept** in `given.json`, and granted as if a tag named it: the sandbox, the checks and the page's menu follow the same rule. The trampoline shows the dialog, which says what the page gets, and refuses a link, Apargon's data, and for write a hidden file, a page or a launch folder. A pick then passes every check a tag does, when picked and again each time the sandbox is built: no `"` in a written path, no line break or invisible character, on Linux not `/tmp` or `/var/tmp` itself, a folder that holds one, or anything in `/run`, and no write over a program the page runs. A pick that widens the sandbox restarts the page. Taking back the approval forgets the picks.
- **Secrets** (`papp.getSecret`, `papp.setSecret`, `papp.deleteSecret`) live in `apargon-secrets` beside Apargon's data, one file per page, each value sealed with the OS's store for this user (`safeStorage`). Every sandbox hides the folder, so no page's process, `papp-system` included, reads another page's secrets or its own file. The trampoline answers only the page that asked, by the pipe it asked on. Taking back the approval deletes them.
- **The sandbox gets no terminal.** Its output reaches the terminal as plain text. On macOS, Seatbelt also denies `/dev/tty`, so a page can't type commands into the shell that started Apargon.
- **The window shows only the page.** No navigation. No frame of another file.
- **Hidden files** (dot names) are never matched by `*` or `**`. A tag must name them.
- **A page can only write a `.papp`** through a `papp-write` pattern that ends in `.papp`. That line is red.
- **Windows runs programs, though they can leak.** A program can open `\\host\x`. A Windows service then looks up the name outside the sandbox, and the DNS query carries data. This leaked in every MXC mode tested. So Allow needs "I trust this page," and this file and the README say why.
- **The app's only network call** is the update check. No telemetry, no crash reports. Nothing starts at login unless a page declares `papp-use login`.

## How each OS enforces it

### macOS

- Sandbox: Seatbelt (`sandbox-exec`). The profile starts from `(allow default)`, because the GUI needs it.
- Offline check: binding a loopback port must fail with `EPERM`.
- Writes: limited by pattern.
- The secrets folder is denied.
- Blocked: `nsurlsessiond`, `trustd`, WebKit services. These fetch from outside the sandbox.
- Blocked: opening apps, sending Apple Events, `defaults write`.
- With `papp-use print`, the print server's socket (`/private/var/run/cupsd`) is allowed.

### Linux

- Sandbox: `bwrap --unshare-net --unshare-pid --unshare-user --disable-userns --new-session --die-with-parent`.
- Offline check: the network has only `lo` and is not the trampoline's.
- Writes: limited by path. A named file or folder is granted itself, a wildcard's folder whole. A named file can be changed in place, not deleted or renamed.
- `/run`, `/tmp` and `/var/tmp` are emptied. Their socket files bypass `--unshare-net`: D-Bus, DNS, sound, tmux, Docker. The secrets folder is emptied too.
- Apargon puts back only the display, the page's folders and sockets, sound with `papp-use sound` or `microphone`, the print server's socket with `papp-use print`, and the udev database (`/run/udev`, read-only) and the device files of each declared kind with `papp-use usb`, `serial`, `hid` or `midi`. For `midi` that is the sequencer, the MIDI ports and each sound card's controls, not its recording and playback files.
- A tag path, or the page's own folder, in or holding `/tmp`, `/var/tmp` or `/run` is refused: a socket file bound into the emptied folder would reach its program.
- A page that runs programs, or has `papp-system`, may not write a folder that holds the page. `./out*` would grant the page's own folder whole, so a program could rewrite the page. Write to a folder of its own, like `./out/*`. Picks follow the same rule.

### Windows

- Sandbox: MXC (an AppContainer). Outbound traffic is denied.
- Offline check: connecting to `127.0.0.1:9` and to `192.0.2.1:9`, an address no network routes, must both fail with `EACCES`. MXC refuses every address that way at once. A sandbox that only blocks loopback, or no sandbox, answers differently for the second.
- Writes: limited by path, as on Linux. A named file can be changed in place or deleted, not renamed. A write folder in or around Apargon's data is refused, and a folder that holds the secrets.
- As on Linux, a page that runs programs, or has `papp-system`, may not write a folder that holds the page.
- The secrets folder is on the denied list. Untested: the folder is outside every granted one, so it is unreadable either way.
- The trampoline answers a page through a file, as MXC passes no more pipes. A reply can hold a secret, so each page's file is in a folder of its own beside Apargon's data, which only that page's sandbox may read. Untested on Windows.
- `localhost` ports: through the proxy. Chromium is told not to bypass it for loopback. A program that ignores `http_proxy` is refused by MXC.
- Programs: only `.com` and `.exe`. A batch file runs through `cmd.exe`, which reads its arguments as commands.
- Apargon refuses `\\` paths, `file://host/`, `:` streams and names ending in a dot or a space.

### Every OS

- The OS lets a page write only to: its `papp-write` paths, the temp folder, `/dev`, and its own Electron data.
- Keys and logins: `SECRETS` in `src/permissions/paths.ts`, plus each OS's list, is a popup list only. A tag that names a path in one (`~/.ssh/config`) is yellow and says what it holds. `*` and `**` never match a hidden name, so `~/**` does not reach them; `~/` as a folder does, on the OSes that grant folders whole.
- A `papp-read` or `papp-write` path that is a link is refused: the sandbox would grant what it leads to, which the page could change between opens.
- A folder in a tag ends in `/`, anything else is a file. Apargon refuses a tag that does not match the disk.
- A written path that is not there is made when the page starts: a folder, or a wildcard's, as a folder, a file as an empty file. Linux and Windows can only grant what is there.

## The proxy

- It runs in the trampoline and looks up names itself.
- It answers 403 to any undeclared `host:port`.
- It refuses local addresses: loopback, `0/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `169.254/16`, `fc00::/7`, `fe80::/10`, `64:ff9b::/96`, and this machine's own addresses.
- A local IPv4 address works only if declared in numbers, with its port.
- It logs to `egress.log`. If the log fails to write, it stops taking connections.
- A declared `localhost` port: the page reaches it directly on macOS and Linux, through the proxy on Windows. Its programs go through the proxy on every OS, so those connections are logged. Each needs a number: `localhost:*` would reach other pages' proxies.

## Popup colours

- **Red:** a way to send data somewhere the tags don't name. This includes any server, `*.com`, any port, an IP address, `localhost`, a socket, `papp-listen`, `papp-system`, and writing hidden files, `~/Library`, `AppData` or pages.
- **Yellow:** worth a look. This includes `*.example.com`, wide folders, a `papp-system` page's "All your files" (macOS and Linux), keys and logins, clipboard, location, camera, microphone, screen, shortcuts, and `papp-run`. `papp-run` is red on Windows, and on Linux if the page also writes a folder.
- **Checkbox:** needed for any red line. Also needed when the page can run programs, or send what it sees to a host.

## Not enforced

### Reading

- A page that exploits Chromium can read:
  - macOS: every file, keys and logins included.
  - Linux: the same, except `/run`, `/tmp` and `/var/tmp`.
  - Windows: only the granted folders.
- Listing a folder above a wildcard shows its names.
- A `papp-system` page reads the same, without an exploit.

### Writing

- Linux and Windows grant a wildcard's folder, or a named folder, whole. For `~/notes/*.md`, a program can change any file in `~/notes`, hidden files and pages included.
- A writable folder can hold files other tools run later, like `package.json` scripts or `.git/hooks`. The popup doesn't show these as red.
- A synced folder sends what the page writes off the machine.

### Saving (`papp.save`, `papp.saveAll`)

- Any page can open the save dialog, with no tag, again and again.
- `papp.saveAll` writes only new files, into the folder the user picks.
- `papp.save` can replace a file. The OS asks first, but the page suggests the name and folder, so the user only has to press Save and Replace.
- On Windows, `papp.save` follows a link at the chosen name. Windows has no flag that refuses one.
- Hidden folders and `~/Library` or `AppData` are refused: files saved there can run on their own. macOS cloud drives in `~/Library` (iCloud Drive, `~/Library/CloudStorage`) are allowed: files there only sync.
- On macOS and Windows, saved files get the download mark, so the OS warns before one runs. Linux has no such mark, nor does a drive that cannot hold one, like a USB stick on Windows: the file is saved without it.
- A program could swap the picked folder for a link between check and write.

### Picks (`papp.pick`)

- Any page can open the dialog, with no tag, again and again. The dialog names the page and says what it gets.
- A page with `papp-net` can send what you pick. The pick dialog does not say so; the popup did, when the page asked for the host.
- A folder you pick with write is granted whole on Linux and Windows, as a `papp-write` folder is.

### Secrets (`papp.getSecret`, `papp.setSecret`, `papp.deleteSecret`)

- The page, and the programs it runs, see a secret while it runs. A page with `papp-net` can send it.
- On Linux without a keyring, Electron seals them with a fixed key. They are then only obscured on disk.
- A `papp-system` page cannot read the folder, but could ask the trampoline for its own secrets by writing the request line itself: those are its own.

### Listening (`papp-listen`)

- Whoever reaches the port gets what the page answers. With `network`, that is every device on the network, and the trampoline does not say who asked beyond the request's own headers.
- The trampoline listens on `0.0.0.0` for `network`: every interface, VPN included.
- A page's handler that throws answers 500; the reason goes to the page's console.
- Windows: untested. Windows asks its firewall question for Apargon on the first `network` listener.

### Programs (`papp-run`)

- A program the page ships (`./bin/tool`) is refused if a `papp-write` tag covers it, by its real path. The page's own folder is read-only otherwise, so the program is what the page came with.
- They can read every file but keys and logins. Windows: the granted folders, each program's own folder, and what every sandbox may read, like `C:\Windows` and Program Files.
- They take any arguments, like `git -c core.sshCommand=…`.
- They can change every page's storage in `pages/`.
- Windows: stopping a program (`kill`, a timeout, a reload) stops only that program. Programs it started keep running in the sandbox until they end. If they share its output, `papp.run` waits for them.
- macOS: programs can't open terminal devices (`/dev/ttys…`). Tools that need a pseudo-terminal likely fail. Untested.
- macOS: they can probably use the camera, microphone or screen once Apargon has that access. Untested.
- macOS: the profile does not block launchd. Untested whether a program can start a job through it that runs outside the sandbox.

### Keys and logins

- Nothing hides them. A `papp-system` page, or a program a page runs, reads them like any file on macOS and Linux. That is what `papp-system` is for.
- The popup list is fixed. A key in `~/keys/` or a `.env` file gets no colour of its own.

### Network

- `*.github.io` is yellow, though anyone can publish there.
- A declared local address or socket reaches whatever answers there.
- The proxy tells "local" by address range. A VPN with public addresses counts as the internet.
- For https and `papp.connect`, the proxy sees only `host:port`. Domain fronting works, and a connection can carry any protocol.
- Deleting `egress.log` while it runs loses later entries silently.
- Ways out for a program, or a page that exploits Chromium:
  - macOS: messages to system services (the GUI needs them).
  - Linux: a socket file elsewhere (`tmux -S ~/sock`), `vsock` in a VM, the X11 display to type into other windows.

### Windows

- A page's programs, and a `papp-system` page, can send any file they see anywhere: they open `\\<data>.example.com\x`, and Windows looks the name up outside the sandbox. No MXC setting stops this. The popup shows these programs red, and Allow needs "I trust this page."
- A page that exploits Chromium can leak data the same way.
- On macOS and Linux a program a page runs starts through `/bin/sh`, which closes Apargon's pipes to the trampoline (fds 3-5) first, so the program cannot send the trampoline requests as the page. On Windows the child gets only the handles libuv passes, not every open handle; that this holds has not been verified on Windows.
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
- Any page can show a tray icon and a progress bar on its dock or taskbar icon, with no tag. The tray icon and notifications show under Apargon's name.
- Notifications show the page's icon and up to three buttons. On Linux and Windows the trampoline decodes the icon's PNG, which the page sends.
- A page's menus and tray items can use any label, also one like Apargon's own. In the tray, Apargon's Show and Quit stay last.
- Any page can learn, with no tag, when the computer sleeps, wakes, locks, unlocks or changes to battery, and how long it has been idle.
- `papp-window` with `frame=no`, `transparent=yes` or `on-top=yes` lets the window pass for another app's. The popup shows these yellow.
- `papp-use background` keeps the page running with its window hidden, while its tray icon stays; its own `window.close()` hides it too. The tray menu quits it.
- `papp-use login` opens the page at every login: a launch agent in `~/Library/LaunchAgents` (macOS), an entry in `~/.config/autostart` (Linux) or a Run value (Windows). It goes when the page is revoked, opens without the tag, or is gone at login.
- With `papp-use usb`, `serial` or `hid`, the user picks one device in Apargon's dialog; the page then gets everything that device does. An input device can be a keyboard. On macOS serial ports include Bluetooth ones, so macOS asks for Bluetooth. On Windows the sandbox gets the device capabilities `usb`, `serialcommunication` and `humaninterfacedevice`; that a real device then opens is untested, as CI runners have none.
- On Linux, `papp-use midi` gives each sound card's controls, so the page can change its volume and mixer.
- With `papp-use midi`, the page can also send system-exclusive messages, which change an instrument's settings and can update its firmware: Chromium grants no MIDI without them.
- With `papp-use print`, the page can print what it shows on every printer the print server knows, network ones too.
- On Windows the sandbox does not keep any page from the print spooler. `papp.print` and `window.print()` check the tag, but a page that works around Apargon's `window.print` reaches the spooler without it.
- A page's icon can look like another app. Only the badge shows it is a page.
- On Linux and Windows a page shows on the dock or taskbar under its own title and icon, and a pin of it reopens the page in Apargon. On Linux this is a hidden launcher entry per page in `~/.local/share/applications`, removed the next time a page opens and its page is gone. The title is the page's to choose, so it can name another app. On macOS the Dock says Apargon for every page.

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
- ask the trampoline to revoke its own approval, or turn update checks back on, with no prompt; revoking another page, or turning update checks off, needs the user to confirm a prompt first;
- remove its badge.

Untested: whether it can rename a folder above Apargon's data and plant a `grants.json`.

### The update check

- At most once a day, GitHub learns your IP address. **Permissions** turns it off.
- macOS installs only a build signed with the same Developer ID. Linux and Windows only show a notice.

### The packaged app

- macOS checks `app.asar` against its build hash. Windows has the same check turned on, untested. Linux doesn't.
- Windows: the installer is not signed. Windows warns before it runs. `SHA256SUMS` comes from the same release, so it only shows the download arrived whole, not who published it.
- Linux: Ubuntu 23.10+ needs the AppArmor profile from the `.deb`. Without it, pages silently don't open.

### Scope

Apargon is not a VM. For a hard "nothing leaves" guarantee, use a VM with no network.

## Verification

`pnpm test` runs every check in the real app. `test/selftest/check.ts` lists them. [AGENTS.md](AGENTS.md#tests) has the Linux `.deb` run.

| Platform      | Last verified                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS         | 2026-11-05, `pnpm test` on `aea2a9e` with the staged proxy-loopback and program-fd fixes: 289 checks                                                                                                                                             |
| Linux         | 2026-11-05, locally built `.deb` (`aea2a9e` plus the staged fixes) on the Ubuntu 24.04 VPS: 116 checks, the refusal test and its control, and the Node tests. A program was confirmed to reach the trampoline's fds before the fix and not after |
| Linux desktop | not yet                                                                                                                                                                                                                                          |
| Windows       | 2026-11-01, Windows 11 on arm64 (GitHub `windows-11-arm`, run 41315097711 of the spike repo, this tree on `3b3d16e`): 77 checks from source with no leak in the packet capture, and 77 in the installed arm64 app. x64 not tested                |

Not tested: the NAT64 refusal, the proxy refusing this Mac's own LAN address, and two pages reaching each other's `localhost` ports.

## Reporting

Open an issue if a page reaches a host or file it did not declare, or if the offline check passes outside the sandbox. Include the page, the platform and the egress log. Leave out secrets.
