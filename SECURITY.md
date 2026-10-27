# Security model

A page asks for what it needs in `<meta>` tags.

| Page      | May use                                                             |
| --------- | ------------------------------------------------------------------- |
| no tags   | to see its own folder; no changes, no programs, no network          |
| with tags | what the tags list, after the user allows the whole list in a popup |

The guarantees below hold for any page **without** `papp-node`, whoever wrote it.

A page **with** `papp-node` runs with your permissions, like a script. Open it only if you trust it.

## Enforced

### The sandbox

- The page's process and every process it starts run in an OS network sandbox:
  - macOS: Seatbelt (`sandbox-exec`, with `sandbox/macos.sb` plus rules for each page);
  - Linux: `bwrap --unshare-net --unshare-pid --unshare-user --disable-userns --new-session`, which gives the process a network of its own, holding only a loopback, a process list of its own, and a user namespace in which no further namespace can be made: most Linux privilege escalations need one to reach the vulnerable kernel code, and root would ignore the sandbox; and detaches it from the terminal papp was started from. Its `/dev` holds the devices `bwrap` makes and the GPU (`/dev/dri`), not the disks. The camera (`/dev/video*`) comes back only with `papp-use camera`, and the sound devices (`/dev/snd`) only with `papp-use sound` or `microphone`.
- Connections, binds and DNS lookups fail in the kernel. The only exceptions are the proxy port and declared `localhost` ports. On Linux the sandbox's own loopback works but leads nowhere. papp relays the proxy and each declared `localhost` port into it through socket files.
- macOS: three system services fetch for a process from outside its sandbox: background downloads (`nsurlsessiond`), WebKit's network process, and `trustd`, which fetches the issuer URL a certificate names. The page and its children cannot reach them.
  - `test/daemons.ts` checks that all three answer outside the sandbox.
  - `selftest-node` checks that all three fail inside it.
  - Without `trustd`, a program that checks a certificate through macOS gets an error, not a pass. Chromium checks the page's certificates without it.
- The sandboxed process checks that it is offline before it opens a page, and refuses if it cannot tell. No flag skips this check; `test/refuse.ts` tests it.
  - macOS: it must fail to bind a loopback port with `EPERM`, the sandbox's answer. Any other failure refuses too.
  - Linux: its network must hold only `lo`, plus the tunnel stubs the kernel adds to every network, and must not be the trampoline's.
- Linux: `--unshare-net` stops IP, not socket files, and each socket leads to a program outside the sandbox. The folders where they live, `/run`, `/tmp` and `/var/tmp`, are replaced by empty ones. That removes the session and system D-Bus, through which `systemd-run --user` runs a command and the portal opens a link; `systemd-resolved` and nscd, which carry data out in a name lookup; the sound server, which can stream to a server; tmux and screen, which type into a shell that has network; and Docker, which acts as root. Only the display's socket (Wayland or X11) and what the tags name come back: the page's own folder, its `papp-read` and `papp-write` folders, and its `papp-socket` files. `selftest-node` checks that those folders hold no socket but the display's, that the process sees only its own processes, and that its session started inside the sandbox.
- Linux: `bwrap` opens folders, not patterns, so a `papp-read` or `papp-write` that would open `/tmp`, `/var/tmp`, any folder at or under `/run` (sockets also sit below its top: `/run/user/<uid>/bus`, `/run/dbus`, `/run/docker.sock`) or a folder holding one, such as `/` or `/var`, and a page that sits in one of them, are refused before the popup: the folder would come back with its sockets, and a read-only mount does not stop a connection to a socket.
- Linux: the socket files that carry the proxy and the declared `localhost` ports into a sandbox are in a folder of that page's. A page sees its own folder and no other page's, so two pages open at once cannot use each other's servers. `selftest-net` checks that a page sees one folder, `selftest-node` that a page without servers sees none.

### Tags

- papp reads the tags from the file on disk before the page runs. A running page cannot add tags.
- Only `<head>` up to the first `<script`, `<body` or `</head` counts, with HTML comments skipped. A tag found anywhere else, or commented out, is not asked for and not granted.
- An unknown `papp-*` tag or a bad value stops the page from opening.
- So does a line break or another invisible character in a value, in a tag, or in the path of the page or anything it names: it could make one permission look like two in the popup, which also shows the tags as written.
- `papp-socket` names one socket file, or one folder of them, that exists when the page opens. The page and its programs may connect to it and to nothing else of the kind: on macOS Seatbelt allows that path, on Linux `bwrap` binds it back. The popup marks the line red: what answers there runs outside the sandbox.

### Files

- A page without full Node has no Node. Its only way out is `window.papp`.
- `window.papp` checks every call against the granted folders, on real paths with symlinks resolved.
- Every `file:` request gets the same check, including the page's own scripts and images.
- Hidden files and folders (names that start with a dot) are outside every grant unless a tag names them. A `*` never matches one.
- The own folder is to see only, with its subfolders. A page changes only what `papp-write` lists.
- A page (`.papp`) can be changed only through a `papp-write` pattern that ends in `.papp`, such as `./*.papp`, which the popup marks red. Any other pattern skips pages, so a page cannot rewrite another page that was approved for more.
- Deleting or moving a folder needs every file in it to be changeable, hidden files and pages included.

### Keys and logins

- For a page without full Node, the OS hides a fixed list of folders and files that hold keys and logins from the page and from every program it runs: `~/.ssh`, `~/.gnupg`, `~/.aws`, cloud and GitHub CLI logins, saved passwords, browser profiles. `SECRETS` in `src/permissions/tags.ts` is the list.
  - macOS: Seatbelt denies reading and writing them, at their real paths.
  - Linux: `bwrap` lays an empty folder, or an empty file, over each.
- papp's own checks refuse them too, so `~/Library` does not reach a browser profile.
- A `papp-read` or `papp-write` that starts inside one opens it. The line shows red and says what it holds. A tag above one, such as `~` or `~/Library`, does not open it.
- `selftest-net` checks that a program cannot list `~/.ssh`.

### Programs' environment

- A program gets a short list of variables (`PROGRAM_ENV` in `src/permissions/tags.ts`), papp's proxy settings, and the variables `papp-env` names. Nothing else of the environment papp was started with.
- A `papp-env` name that reads like a secret (`KEY`, `TOKEN` and the like) shows red.
- The page's own process holds the same list and what the window needs to open (`PAGE_ENV` in `src/permissions/tags.ts`): the display and desktop settings on Linux, the text encoding on macOS. On Linux a program the page runs could otherwise read the rest off it (`/proc/<pid>/environ`); macOS lets no process read another's environment. `selftest-net` checks on Linux that an unnamed variable is not in it.
- A full-Node page sees the whole environment, and so do the programs it starts.
- `selftest-net` checks that a named variable arrives and an unnamed one does not.

### Writes

For a page without full Node, the OS also limits where the page and its programs may write:

| Writable                     | Why                 |
| ---------------------------- | ------------------- |
| its `papp-write` folders     | granted             |
| the temp folder              | Electron needs it   |
| `/dev`                       | the system needs it |
| the page's own Electron data | Electron needs it   |

- macOS: the OS and papp's checks use the same patterns, and the OS also keeps pages out of every pattern that does not name them.
- macOS: the programs cannot open other apps (`open`, LaunchServices) or script them (`osascript`, Apple Events).
- macOS: they cannot write app settings (`defaults write`). `cfprefsd` would otherwise write them from outside the sandbox.
- Linux: `bwrap` makes the disk read-only and each of these folders writable. It takes folders, not patterns, so the limit is looser than on macOS (see "Not enforced").

### Network

For a page with `papp-net`, a proxy in the trampoline:

- forwards requests only to the declared `host:port` patterns;
- looks up names itself;
- refuses any name that points at this computer or the local network: loopback and `0.0.0.0/8`; the private ranges `10/8`, `172.16/12` and `192.168/16`; `100.64/10`, which VPNs such as Tailscale use; link-local `169.254/16`, where cloud machines keep their metadata service and its keys; IPv6's `fc00::/7` and `fe80::/10`; and the current addresses of its network interfaces. `privateNetwork` in `src/permissions/tags.ts` is the list. A tag that names loopback other than `127.0.0.1`, `0.0.0.0/8` or `169.254/16` is refused before the popup, and `selftest-net` checks that the proxy refuses them;
- forwards to the local network only an IPv4 address in numbers declared with its port, such as `192.168.1.5:8123`, which the popup marks red. A name that resolves there stays refused, so a server cannot point a declared name at the local network after the popup. `selftest-net` checks that a declared address is forwarded;
- refuses a `CONNECT` that names no port, rather than failing on it;
- answers 403 to everything else;
- sends the requested name as `Host` for plain http;
- appends every request, allowed or refused, to `egress.log`;
- stops taking new connections if it cannot write the log.

Declared `localhost` and `127.0.0.1` ports bypass the proxy, so they are not logged.

### papp's own files

- A page without full Node cannot write papp's approvals (`grants.json`).
- No page can write them, not even a full-Node page. On macOS, no page can write the packaged app either.
- A page's own Electron data lives apart, in `pages/`, and apart from every other page's: `localStorage`, IndexedDB and the cache are in a partition named by the page's path. To Chromium every `file:` page is one origin, so in a shared profile a page would read what another kept. `selftest-node` checks that it finds nothing `selftest` kept.
- The Permissions menu asks the trampoline to revoke approvals. Nothing a page sends can add one.

### Approvals

- The popup is papp's own static page, in a window of its own, before the page runs. Its policy allows no network, and it shows every value as text, never as HTML.
- An approval covers one file path and one exact list of permissions. For a page marked as downloaded, it also covers the page's exact content.
- If the list changes, papp asks again and marks what is new. If a downloaded page changes, papp asks again and says it changed.
- A downloaded page that changes while open does not reload into the new content: the window says it changed, and reopening it asks again.
- **Permissions → Approved Pages** revokes one page; **Revoke All Approvals** revokes them all.

### The window

- It shows only the page. A link to another file or to a declared host does not navigate, a frame does not load another file, and a new window opens only on the page itself, under another hash or query. Another file would run with the page's permissions instead of its own tags. `selftest` checks the frame and the window.
- A frame from a declared host cannot reach `window.papp`. With `papp-net`, CORS is off for the page, but Chromium still keeps a frame of another origin out of the page's window: tested 2026-10-26 with a frame that tried `parent.papp.readFile` and was blocked as cross-origin.
- A page with a favicon shows it as its icon in the Dock and the app switcher (macOS) or as its window icon (Linux). papp reads the icon only from a file the page may see, draws it in a window of its own that loads nothing but the image, and always puts its badge over the corner.
- On macOS the trampoline also sets that icon as the page file's custom icon in Finder, for a page made here and only on that file. A downloaded page keeps papp's icon in Finder: with one of its own it could pass for a document or another app's file there. It writes Finder's metadata (`com.apple.ResourceFork`, `com.apple.FinderInfo`) and a hash of the icon (`com.papp.icon`), not the page's content. iCloud Drive and AirDrop carry the icon along.
- A page gets three web permissions: clipboard writing, fullscreen and pointer lock. The web Notification API is denied, for full-Node pages too. Clipboard reading needs `papp-use clipboard`, location `papp-use location`, the camera `papp-use camera` and the microphone `papp-use microphone`, each a yellow line; with `papp-net`, the summary above the lines says the page can send what you copy, where you are, what the camera sees or what the microphone hears. A request for both camera and microphone needs both tags. On macOS the system also asks before papp first uses either. A paste the user makes reaches the page without a tag, as in any app.
- Screen capture needs `papp-use screen`, a red line. Then `getDisplayMedia` returns the whole main screen, with no picker and without sound, whatever the page asks for. Without the tag papp sets no capture handler and denies the permission; `selftest` checks the refusal. On macOS the system also asks for Screen Recording the first time.
- Notifications go through `window.papp.notify`, which needs `papp-use notifications`. It is shown under papp's name. On Linux the trampoline shows it, since the sandbox hides D-Bus.
- A page's window plays sound only with `papp-use sound`. On macOS the window is muted without it, though a program it runs can still play sound, with `afplay` for one. On Linux the tag also binds the sound server's socket (`pipewire-0`, `pulse`) and `/dev/snd` back into the sandbox, and the line is yellow: the sound server can stream to another computer.
- A `papp-shortcut` is a key combination the page answers in every app. It needs two modifiers, or one with a function key, so a page cannot take `Ctrl+C` or `Cmd+V` from the app in front. Modifiers that only type characters do not count: Option and Shift on macOS, AltGr and Shift elsewhere. The popup names the keys. It is registered by the page's process and ends with it.
- The tray icon (`window.papp.tray`) is papp's own, never the page's: in the menu bar there is no room for the badge. The trampoline shows it, since on Linux the tray talks over D-Bus, which the sandbox hides. The page sends it only a text, cut to 24 characters, and hears back only that the icon was clicked. One icon per page; it ends with the page's process. On Linux the text does not show, since Electron sets it only on macOS; the icon's tooltip names the page file.
- The popup leads with what the lines allow together, when that is more than any one line says. Wherever the page came from, it must be trusted with a checkbox if a line is red or its lines together can send files out: `git clone`, `curl` and USB sticks leave no download mark, so a page from elsewhere can look made here.
- A page marked as downloaded also leads with the site and is held to its content. With no tags it is asked about once, so the site is seen before it reads the folder it landed in; a page made here with no tags opens without asking. The mark stays, so a later change of tags is asked about the same way.
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

- papp enforces read grants, not the OS. Chromium's own sandbox cannot start inside `sandbox-exec` or `bwrap`, so the page's renderer runs without it.
- A page that exploits a Chromium bug could read any file but keys and logins. It would still have no sockets beyond its declared hosts, and the same write limits.
- Listing a folder above a wildcard (`~/git` for `~/git/*/docs`) shows every name in it, not only the names that lead to a match. The page sees the names, not the files.

**Programs**

- A program allowed by `papp-run` can read every file but keys and logins, and takes any arguments.
- A variable `papp-env` names reaches the program, and through it the page and any declared host.
- Some programs run others (`git -c core.sshCommand=…`).
- Its network and its writes are limited like the page's, more loosely on Linux. That is why the popup marks it red.

**Writable folders**

- A program the page runs can move a folder that holds pages, or make a hard link to a page. The OS checks the paths it names, not what is inside them or what they point to.
- A writable folder can hold files other tools later run without asking: `package.json` scripts, a `Makefile`. Hidden ones (`.git/hooks`, `.envrc`, `.vscode`) are excluded unless named. On Linux that holds for the page only, not for the programs it runs.
- If iCloud Drive, Dropbox, OneDrive or a git auto-push syncs a writable folder, what the page writes there leaves the machine.
- The temp folder is writable, because Electron needs it.

**Keys and logins**

- The list is fixed. A key kept elsewhere, such as `~/keys/id_rsa` or a project's `.env`, is not hidden.
- Naming part of one, such as `~/.ssh/config`, opens all of it to the programs the page runs. The OS hides whole folders; papp holds the page itself to the pattern.
- Linux: only those that exist when the page opens are hidden. macOS hides one made later too.
- macOS: the Keychain is reached through a system service, not its files. The list does not cover it; macOS asks before it hands out another app's password.

**Network**

- The popup judges wildcard hosts by how they are written: `*.github.io` shows yellow, though anyone can publish under it.
- A declared local-network address opens whatever answers there: a router, a NAS, a printer or a machine that took the address later. papp cannot tell what it is, and says so in the popup.
- The local network is told apart by address range. A machine reached at a public address, through a VPN or a tunnel that hands out public addresses, counts as the internet.
- For https, the proxy sees only `host:port`. A program the page runs can ask a declared server that hosts many sites, such as a CDN, for another site inside the encrypted connection (domain fronting). Whether that works depends on the server.
- If `egress.log` stops being writable, connections already open keep forwarding, unlogged.

**macOS**

- The profile allows Mach messages to system services, because the GUI needs them.
- It blocks the three services known to fetch for a process, not every service that might. Another such service would be a way out for a program the page runs, or for a page that exploits Chromium.

**Linux**

- The OS limits a program's writes by folder, not by pattern. A program the page runs may change any file in the page's writable folders: for `~/notes/*.md` or `~/notes/todo.md`, all of `~/notes`, hidden files (`.git/hooks`, `.envrc`) and pages too. The popup's `papp-run` line names those folders. papp's own checks still hold the page itself to the patterns.
- `--unshare-net` isolates IP networking only. A socket file outside `/run` and `/tmp` remains, and can be a way out for a program the page runs, or for a page that exploits Chromium: tmux, screen or Docker started with a socket elsewhere (`tmux -S ~/some/socket`, Docker with `-H`), or any server listening in a folder the page may see.
- `--unshare-net` does not cover `vsock`, which is not IP. In a virtual machine, a program the page runs can reach the host through it.
- On X11, the display's socket comes back, because the window needs it. Through it a program can type into another window, such as a terminal. Wayland does not allow that.
- A `papp-socket` opens whatever answers there. papp cannot tell what that is, so the line is red and says so, and nothing more.
- A declared `localhost` port must be a number. papp relays each port on its own, so it refuses `localhost:*`.

**Everywhere**

- A page chooses its own icon, so in the Dock and the app switcher it can look like another app's. papp's badge on the corner, and the app name in the menu bar, are the only marks that it is a papp page. In Finder, only a page made here gets its icon.
- Clipboard writing, printing, and files the user picks or drops into the page.
- With `papp-use clipboard`, whatever is on the clipboard, a password manager's copy included. With `papp-use location`, where you are. With `papp-use camera` and `papp-use microphone`, what they pick up while the page is open. All are yellow, and with `papp-net` the summary says they can be sent.
- papp shows no sign that the camera or the microphone is on. macOS asks once for papp, not for each page: after one page is allowed, another with the tag is not asked again by the system. A program a page runs counts as papp too, so once papp has the camera, the microphone or Screen Recording, a page with `papp-run` can likely reach them through a program (`ffmpeg`, `screencapture`) without the `papp-use` tag. Untested: a test would trigger the system's prompts. `papp-run` is red, and its summary already says the page may send anything out.
- With `papp-use screen`, every window on the main screen, passwords and messages included, for as long as the page keeps capturing. The line is red, and with `papp-net` the summary says what is on your screen can be sent. On Wayland capture fails: it needs the desktop portal over D-Bus, which the sandbox hides. Capture itself has not been tested, on either platform: a test would trigger macOS's Screen Recording prompt.
- A `papp-shortcut` is heard in every app, and two modifiers do not make a combination no app uses: `Cmd+Shift+Z` is redo, and `Ctrl+Shift+V` pastes in a Linux terminal. The popup names the keys. On Wayland the display refuses global shortcuts and the tag does nothing.
- A notification's text is the page's. It is shown under papp's name, so it cannot pass for another app's, but it can say anything.
- Where a page came from is read from a mark that not every route leaves: `git clone`, `curl`, USB sticks and Firefox on Linux leave none, and Linux needs `getfattr` installed. Such a page gets the popup for a page made here: no site named, no content hold, and no popup at all with no tags. Its red lines still need the checkbox. A page can also drop its own mark by rewriting itself, as in "Approvals of pages made here follow the path".

### For a page with full Node

The sandbox blocks sockets, writes to papp's own files and, on macOS, the three fetch services. Nothing else.

With `child_process` and your files, the page can:

- launch another app that has network (`open`, `osascript`, `launchctl`; on Linux, through X11 or a socket file outside `/run` and `/tmp`);
- write to a synced folder, or to shell startup files and launch agents that run later;
- ask another app to write papp's approvals (Apple Events to Terminal; on Linux, a shell startup file);
- read other pages' browser storage, which lives on disk in `pages/`;
- ask a local daemon or another process to act for it.

### Approvals of pages made here follow the path

For a page made here, papp remembers an approval by file path and permission list, not content: it is your page to edit. Editing it without changing its tags does not ask again. A downloaded page is held to its content too, but not to the `.js` and `.css` files it loads.

This matters because pages can change each other:

- No page without full Node can change a page unless a `papp-write` pattern names pages.
- A page with `papp-write` can still change the `.js` and `.css` files in those folders. If an approved page loads them, its new code runs with the approved permissions.
- An open page reloads when its files change, so new code runs at once.

So:

- keep approved pages where only you can write;
- keep a page that asks for servers or programs in a folder of its own.

### The update check

- Once a day, GitHub learns your IP address and that papp ran. Turning the check off stops that.
- Whoever controls the GitHub repository can tell Linux users a new version is out. They cannot ship one to macOS users without papp's Developer ID: Squirrel refuses a build signed by anyone else.
- On macOS the downloaded update waits in papp's cache folder under `~/Library/Caches`, which a full-Node page could change. A changed build fails the signature check and is not installed.

### No hard guarantee

A firm "nothing leaves" guarantee needs a VM with no network card, no shared folders and no shared clipboard. This version has none.

## Platform notes

**macOS**

- The profile starts from `(allow default)` on purpose. The GUI needs Mach IPC and the WindowServer.
- Apple Events travel through a Mach service, so for a page without full Node the profile denies the lookup of `com.apple.coreservices.appleevents`; `appleevent-send` alone does not stop `osascript`. `selftest-net` checks it.
- `sandbox-exec` is deprecated, but it is still the way to apply a profile to a process tree.
- The `app.asar` hash lives in the app's `Info.plist`, which only the code signature protects. Without a Developer ID signature, anyone can edit the app and update the hash.
- `sandbox/macos.sb` sits outside `app.asar` and is not hash-checked. Pages cannot write it, as they cannot write the app.

**Linux**

- The sandbox's network has its own loopback, so it cannot reach the trampoline's proxy or your real `localhost`. The trampoline listens on socket files in papp's data, which the page can see but not change. The sandboxed process relays a port on its own loopback to each.
- On Ubuntu 23.10 and later, an unprivileged `bwrap` may create a user namespace but not use it (`bwrap: loopback: Failed RTM_NEWADDR`). The `.deb` installs an AppArmor profile that lets papp, and the `bwrap` it starts, use one. From source there is no profile: `bwrap` fails, and papp shows "Could not start the sandbox".
- The `.deb` depends on `bubblewrap (>= 0.8.0)`, the first with `--disable-userns`, so installing it installs a `bwrap` that takes every flag papp passes. Ubuntu 22.04 ships 0.6.1 and is refused at install.
- Hiding the runtime folder also hides the sound server, and `/dev/snd` is not in the sandbox's `/dev`, so a page plays no sound unless it declares `papp-use sound`, which binds `pipewire-0`, `pulse` and `/dev/snd` back. `papp-use microphone` binds the same, so a page with it can also play sound through the sound server, though its window stays muted. `papp-use sound` binds the same, so a program the page runs, or a full-Node page, can record from the microphone without `papp-use microphone`; the line says so. PulseAudio and PipeWire can be set to stream over the network, so the line is yellow. Untested on a desktop.

## Verification

`pnpm test` runs every check in the real app and fails if one fails. `test/check.ts` lists the checks for each platform. [AGENTS.md](AGENTS.md#the-installed-deb) has the Linux run on the installed `.deb`.

| Platform      | Last verified                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS         | 2026-10-27, `pnpm test`: every check                                                                                                               |
| Linux         | 2026-10-27, the installed `.deb` built from `4a6c07d` on a headless Ubuntu 24.04 server with the AppArmor limit on: every Linux check, and the refusal with its control |
| Linux desktop | not yet: no run with a real display and a double-click                                                                                             |

## Reporting

Open an issue if a page reaches a host or file it did not declare, or if the offline check passes outside the sandbox.

- Include the page, the platform and the egress log.
- Leave out secrets and private file contents.
