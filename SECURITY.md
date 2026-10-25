# Security model

A page asks for what it needs in `<meta>` tags.

| Page      | May use                                                             |
| --------- | ------------------------------------------------------------------- |
| no tags   | to see its own folder; no changes, no programs, no network          |
| with tags | what the tags list, after the user allows the whole list in a popup |

The guarantees below hold for any page **without** `resworb-node`, whoever wrote it.

A page **with** `resworb-node` runs with your permissions, like a script. Open it only if you trust it.

## Enforced

### The sandbox

- The page's process and every process it starts run in an OS network sandbox:
  - macOS: Seatbelt (`sandbox-exec`, with `sandbox/macos.sb` plus rules for each page);
  - Linux: `bwrap --unshare-net --unshare-pid --new-session`, which gives the process a network of its own, holding only a loopback, and a process list of its own, and detaches it from the terminal resworb was started from.
- Connections, binds and DNS lookups fail in the kernel. The only exceptions are the proxy port and declared `localhost` ports. On Linux the sandbox's own loopback works but leads nowhere. resworb relays the proxy and each declared `localhost` port into it through socket files.
- macOS: two system services fetch for a process from outside its sandbox: background downloads (`nsurlsessiond`) and WebKit's network process. The page and its children cannot reach them.
  - `test/daemons.ts` checks that both answer outside the sandbox.
  - `selftest-node` checks that both fail inside it.
- The sandboxed process checks that it is offline before it opens a page, and refuses if it cannot tell. No flag skips this check; `test/refuse.ts` tests it.
  - macOS: it must fail to bind a loopback port.
  - Linux: its network must hold only `lo`, plus the tunnel stubs the kernel adds to every network, and must not be the trampoline's.
- Linux: tmux's and screen's socket folders (`/tmp/tmux-<uid>` or `$TMUX_TMPDIR`, `/run/screen` or `$SCREENDIR`) and Docker's socket (`/run/docker.sock`) are covered by empty ones. Through tmux or screen a program could type a command into a shell that has network; through Docker it could act as root. resworb makes tmux's folder before the page opens, so a tmux started later is covered too. `selftest-node` checks that none of them holds a socket.
- Linux: the session's runtime folder (`/run/user/<uid>`) is replaced by an empty one, but for the Wayland socket. It holds the session D-Bus, through which `systemd-run --user` runs a command and the portal opens a link outside the sandbox, and the sound server, which can load a module that streams to a server. `selftest-node` checks that the folder is empty, that the process sees only its own processes, and that its session started inside the sandbox.

### Tags

- resworb reads the tags from the file on disk before the page runs. A running page cannot add tags.
- An unknown `resworb-*` tag or a bad value stops the page from opening.
- So does a line break or another invisible character in a value, or in the path of the page or anything it names: it could make one permission look like two in the popup.

### Files

- A page without full Node has no Node. Its only way out is `window.resworb`.
- `window.resworb` checks every call against the granted folders, on real paths with symlinks resolved.
- Every `file:` request gets the same check, including the page's own scripts and images.
- Hidden files and folders (names that start with a dot) are outside every grant unless a tag names them. A `*` never matches one.
- The own folder is to see only, with its subfolders. A page changes only what `resworb-write` lists.
- A page (`.lmth`) can be changed only through a `resworb-write` pattern that ends in `.lmth`, such as `./*.lmth`, which the popup marks red. Any other pattern skips pages, so a page cannot rewrite another page that was approved for more.
- Deleting or moving a folder needs every file in it to be changeable, hidden files and pages included.

### Keys and logins

- For a page without full Node, the OS hides a fixed list of folders and files that hold keys and logins from the page and from every program it runs: `~/.ssh`, `~/.gnupg`, `~/.aws`, cloud and GitHub CLI logins, saved passwords, browser profiles. `SECRETS` in `src/permissions/tags.ts` is the list, and [docs/permissions.md](docs/permissions.md#keys-and-logins) repeats it.
  - macOS: Seatbelt denies reading and writing them, at their real paths.
  - Linux: `bwrap` lays an empty folder, or an empty file, over each.
- resworb's own checks refuse them too, so `~/Library` does not reach a browser profile.
- A `resworb-read` or `resworb-write` that starts inside one opens it. The line shows red and says what it holds. A tag above one, such as `~` or `~/Library`, does not open it.
- `selftest-net` checks that a program cannot list `~/.ssh`.

### Programs' environment

- A program gets `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `TERM`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TZ`, resworb's proxy settings, and the variables `resworb-env` names (`PROGRAM_ENV` in `src/permissions/tags.ts`). Nothing else of the environment resworb was started with.
- A `resworb-env` name that reads like a secret (`KEY`, `TOKEN` and the like) shows red.
- A full-Node page sees the whole environment, and so do the programs it starts.
- `selftest-net` checks that a named variable arrives and an unnamed one does not.

### Writes

For a page without full Node, the OS also limits where the page and its programs may write:

| Writable                     | Why                 |
| ---------------------------- | ------------------- |
| its `resworb-write` folders  | granted             |
| the temp folder              | Electron needs it   |
| `/dev`                       | the system needs it |
| the page's own Electron data | Electron needs it   |

- macOS: the OS and resworb's checks use the same patterns, and the OS also keeps pages out of every pattern that does not name them.
- macOS: the programs cannot open other apps (`open`, LaunchServices).
- macOS: they cannot write app settings (`defaults write`). `cfprefsd` would otherwise write them from outside the sandbox.
- Linux: `bwrap` makes the disk read-only and each of these folders writable. It takes folders, not patterns, so the limit is looser than on macOS (see "Not enforced").

### Network

For a page with `resworb-net`, a proxy in the trampoline:

- forwards requests only to the declared `host:port` patterns;
- looks up names itself;
- refuses any name that points at this computer: loopback, `0.0.0.0/8`, `::`, and the current addresses of its network interfaces;
- answers 403 to everything else;
- sends the requested name as `Host` for plain http;
- appends every request, allowed or refused, to `egress.log`;
- stops taking new connections if it cannot write the log.

Declared `localhost` and `127.0.0.1` ports bypass the proxy, so they are not logged.

### resworb's own files

- A page without full Node cannot write resworb's approvals (`grants.json`).
- No page can write them, not even a full-Node page. On macOS, no page can write the packaged app either.
- A page's own Electron data lives apart, in `pages/`.
- The Permissions menu asks the trampoline to revoke approvals. Nothing a page sends can add one.

### Approvals

- The popup is resworb's own static page, in a window of its own, before the page runs. Its policy allows no network, and it shows every value as text, never as HTML.
- An approval covers one file path and one exact list of permissions.
- If the list changes, resworb asks again and marks what is new.
- **Permissions → Approved Pages** revokes one page; **Revoke All Approvals** revokes them all.

### The window

- It loads only `file:` URLs. A link to a declared host does not navigate, and no new windows open.
- A page gets only three web permissions: clipboard writing, fullscreen and pointer lock. Camera, microphone, screen capture, clipboard reading, notifications and location are denied, for full-Node pages too.
- A page marked as downloaded gets a popup that leads with the site and with what its lines allow together. It must be trusted with a checkbox if a line is red or it can send files out. With no tags it opens without asking: it can see its folder but not change it. The mark stays, so a later change of tags is asked about the same way. A page made here gets the lines, without the checkbox.
  - macOS: the quarantine attribute, which browsers, Mail, Messages and AirDrop set; Spotlight keeps the site.
  - Linux: `user.xdg.origin.url`, which Chrome sets, read with `getfattr`.

### The packaged app

- It cannot run as plain Node (`ELECTRON_RUN_AS_NODE`).
- It ignores `NODE_OPTIONS` and the inspector flags.
- It loads code only from `app.asar`, and refuses to start if `app.asar` does not match the hash recorded at build time (Electron fuses).
- Its one network call of its own is the update check: once a day at most, when a page opens, the trampoline fetches one file from GitHub. On macOS it then downloads the new version and installs it on the next start; macOS takes only a build signed with the same Developer ID. On Linux it shows a notice with a link. Permissions → Check for Updates Automatically turns it off. The page process never has network, update or not.
- No telemetry and no crash reports.
- It installs no background service and does not start at login.

## Not enforced

### For a page without full Node

**Reading**

- resworb enforces read grants, not the OS. Chromium's own sandbox cannot start inside `sandbox-exec` or `bwrap`, so the page's renderer runs without it.
- A page that exploits a Chromium bug could read any file but keys and logins. It would still have no sockets beyond its declared hosts, and the same write limits.
- Listing a folder above a wildcard (`~/git` for `~/git/*/docs`) shows every name in it, not only the names that lead to a match. The page sees the names, not the files.

**Programs**

- A program allowed by `resworb-run` can read every file but keys and logins, and takes any arguments.
- A variable `resworb-env` names reaches the program, and through it the page and any declared host.
- Some programs run others (`git -c core.sshCommand=…`).
- Its network and its writes are limited like the page's, more loosely on Linux. That is why the popup marks it red.

**Writable folders**

- A program the page runs can move a folder that holds pages, or make a hard link to a page. The OS checks the paths it names, not what is inside them or what they point to.
- A writable folder can hold files other tools later run without asking: `package.json` scripts, a `Makefile`. Hidden ones (`.git/hooks`, `.envrc`, `.vscode`) are excluded unless named. On Linux that holds for the page only, not for the programs it runs.
- If iCloud Drive, Dropbox, OneDrive or a git auto-push syncs a writable folder, what the page writes there leaves the machine.
- The temp folder is writable, because Electron needs it.

**Keys and logins**

- The list is fixed. A key kept elsewhere, such as `~/keys/id_rsa` or a project's `.env`, is not hidden.
- Naming part of one, such as `~/.ssh/config`, opens all of it to the programs the page runs. The OS hides whole folders; resworb holds the page itself to the pattern.
- Linux: only those that exist when the page opens are hidden. macOS hides one made later too.
- macOS: the Keychain is reached through a system service, not its files. The list does not cover it; macOS asks before it hands out another app's password.

**Network**

- The popup judges wildcard hosts by how they are written: `*.github.io` shows yellow, though anyone can publish under it.
- `*` also reaches machines on your local network; only this computer is refused.
- For https, the proxy sees only `host:port`. A program the page runs can ask a declared server that hosts many sites, such as a CDN, for another site inside the encrypted connection (domain fronting). Whether that works depends on the server.
- If `egress.log` stops being writable, connections already open keep forwarding, unlogged.

**macOS**

- The profile allows Mach messages to system services, because the GUI needs them.
- It blocks the two services known to fetch for a process, not every service that might. Another such service would be a way out for a program the page runs, or for a page that exploits Chromium.

**Linux**

- The OS limits a program's writes by folder, not by pattern. A program the page runs may change any file in the page's writable folders: for `~/notes/*.md` or `~/notes/todo.md`, all of `~/notes`, hidden files (`.git/hooks`, `.envrc`) and pages too. The popup's `resworb-run` line names those folders. resworb's own checks still hold the page itself to the patterns.
- `--unshare-net` isolates IP networking only. Unix sockets outside the runtime folder remain, and each can be a way out for a program the page runs, or for a page that exploits Chromium:
  - on X11, the display, which the window needs: a program can type into another window, such as a terminal;
  - tmux, screen or Docker at a place other than their usual one, such as `tmux -S /some/socket` or Docker started with `-H`;
  - a session D-Bus started outside the runtime folder (`dbus-launch` puts it in `/tmp`);
  - the system D-Bus, where most actions ask for a password first.
- A declared `localhost` port must be a number. resworb relays each port on its own, so it refuses `localhost:*`.

**Everywhere**

- Clipboard writing, printing, and files the user picks or drops into the page.
- Where a page came from is read from a mark that not every route leaves: `git clone`, `curl`, USB sticks and Firefox on Linux leave none, and Linux needs `getfattr` installed. Such a page gets the popup for a page made here. A page can also drop its own mark by rewriting itself, as in "Approvals follow the path".

### For a page with full Node

The sandbox blocks sockets, writes to resworb's own files and, on macOS, the two fetch services. Nothing else.

With `child_process` and your files, the page can:

- launch another app that has network (`open`, `osascript`, `launchctl`; on Linux, through X11 or a Unix socket outside the runtime folder);
- write to a synced folder, or to shell startup files and launch agents that run later;
- ask another app to write resworb's approvals (Apple Events to Terminal; on Linux, a shell startup file);
- ask a local daemon or another process to act for it.

### Approvals follow the path, not the content

resworb remembers an approval by file path and permission list. Editing an approved page without changing its tags does not ask again.

This matters because pages can change each other:

- No page without full Node can change a page unless a `resworb-write` pattern names pages.
- A page with `resworb-write` can still change the `.js` and `.css` files in those folders. If an approved page loads them, its new code runs with the approved permissions.
- An open page reloads when its files change, so new code runs at once.

So:

- keep approved pages where only you can write;
- keep a page that asks for servers or programs in a folder of its own.

### The update check

- Once a day, GitHub learns your IP address and that resworb ran. Turning the check off stops that.
- Whoever controls the GitHub repository can tell Linux users a new version is out. They cannot ship one to macOS users without resworb's Developer ID: Squirrel refuses a build signed by anyone else.
- On macOS the downloaded update waits in resworb's cache folder under `~/Library/Caches`, which a full-Node page could change. A changed build fails the signature check and is not installed.

### No hard guarantee

A firm "nothing leaves" guarantee needs a VM with no network card, no shared folders and no shared clipboard. This version has none.

## Platform notes

**macOS**

- The profile starts from `(allow default)` on purpose. The GUI needs Mach IPC and the WindowServer.
- That is also why Apple Events stay reachable: `appleevent-send` does not stop `osascript` here.
- `sandbox-exec` is deprecated, but it is still the way to apply a profile to a process tree.
- The `app.asar` hash lives in the app's `Info.plist`, which only the code signature protects. Without a Developer ID signature, anyone can edit the app and update the hash.
- `sandbox/macos.sb` sits outside `app.asar` and is not hash-checked. Pages cannot write it, as they cannot write the app.

**Linux**

- The sandbox's network has its own loopback, so it cannot reach the trampoline's proxy or your real `localhost`. The trampoline listens on socket files in resworb's data, which the page can see but not change. The sandboxed process relays a port on its own loopback to each.
- On Ubuntu 23.10 and later, an unprivileged `bwrap` may create a user namespace but not use it (`bwrap: loopback: Failed RTM_NEWADDR`). The `.deb` installs an AppArmor profile that lets resworb, and the `bwrap` it starts, use one. From source there is no profile: `bwrap` fails, and resworb shows "Could not start the sandbox".
- The `.deb` depends on `bubblewrap`, so installing it installs `bwrap`.
- Hiding the runtime folder also hides the sound server, so a page may play no sound. Untested on a desktop.

## Verification

`pnpm test` runs every check in the real app and fails if one fails. [docs/verification.md](docs/verification.md) lists the checks, the egress matrix, and manual canaries for channels the suite cannot cover.

| Platform      | Last verified                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS         | 2026-10-25, `pnpm test`: every check                                                                                                                                                                             |
| Linux         | 2026-10-25, the installed `.deb` on a headless Ubuntu 24.04 server with the AppArmor limit on: every Linux check, hidden keys and logins, `resworb-env` and the covered tmux, screen and Docker sockets included |
| Linux desktop | not yet: no run with a real display and a double-click                                                                                                                                                           |

## Reporting

Open an issue if a page reaches a host or file it did not declare, or if the offline check passes outside the sandbox.

- Include the page, the platform and the egress log.
- Leave out secrets and private file contents.
