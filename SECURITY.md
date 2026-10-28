# Security model

## In short

| Page             | Network                        | Files                              | Keys and logins      |
| ---------------- | ------------------------------ | ---------------------------------- | -------------------- |
| no tags          | none                           | its own folder, to see             | hidden               |
| with tags        | the declared hosts and sockets | the folders the tags list          | hidden, unless named |
| with `papp-node` | the declared hosts and sockets | all yours, but Apargon's approvals | all yours            |

- The OS blocks every connection. Only Apargon's proxy, declared `localhost` ports and declared socket files get through.
- The proxy forwards only to the declared hosts.
- This holds for every page without `papp-node`, whoever wrote it.
- A page with `papp-node` runs as you. Trust it as you would a script.

"Not enforced" lists what this does not cover.

## Enforced

### The sandbox

The page's process and every process it starts run in an OS sandbox.

| OS    | Sandbox                                                                           |
| ----- | --------------------------------------------------------------------------------- |
| macOS | Seatbelt: `sandbox-exec`, `sandbox/macos.sb`, plus rules for each page            |
| Linux | `bwrap --unshare-net --unshare-pid --unshare-user --disable-userns --new-session` |

- Connections and DNS lookups fail in the kernel. On macOS binds fail too; on Linux they succeed, but only on the sandbox's own loopback, which leads nowhere.
- Linux: the sandbox has its own network (only a loopback) and its own process list. It cannot make more namespaces, and it is cut off from the terminal Apargon started from.
- Linux: `/dev` holds the GPU, not the disks. The camera needs `papp-use camera`. Sound devices need `papp-use sound` or `microphone`.

### The offline check

Before it opens a page, the sandboxed process checks that it is offline. If it is not, or cannot tell, it refuses. No flag skips this. `test/refuse.ts` tests it.

| OS    | Check                                                                             |
| ----- | --------------------------------------------------------------------------------- |
| macOS | binding a loopback port must fail with `EPERM`; any other result refuses          |
| Linux | its network holds only `lo` (and kernel tunnel stubs) and is not the trampoline's |

### System services that fetch (macOS)

Three services fetch for a process from outside its sandbox: `nsurlsessiond`, WebKit's network process and `trustd`. The sandbox blocks all three.

- `test/daemons.ts` checks that they work outside the sandbox.
- `selftest-node` checks that they fail inside.
- Without `trustd`, a program that checks a certificate through macOS gets an error, not a pass.

### Socket files (Linux)

`--unshare-net` stops IP, not socket files. So Apargon replaces `/run`, `/tmp` and `/var/tmp` with empty folders. That removes:

- D-Bus, which can start commands and open links;
- `systemd-resolved` and nscd, which can carry data out in a name lookup;
- the sound server, which can stream to another computer;
- tmux and screen, which can type into a shell that has network;
- Docker, which acts as root.

What comes back: the display's socket and X authority file, the page's folders, its `papp-socket` files, the folder with its own relay sockets, and the sound server's sockets with `papp-use sound` or `microphone`.

- A `papp-read`, `papp-write` or `papp-socket` folder that would open `/tmp`, `/var/tmp`, anything under `/run`, or a folder above them (`/`, `/var`) is refused before the popup. So is a page directly in `/tmp` or `/var/tmp`, or anywhere under `/run`. A `papp-socket` file under `/run`, such as Docker's, is allowed: that is what the tag is for.
- `selftest-node` checks that `/run`, `/tmp` and `/var/tmp` hold no socket but the display's, and that the page sees only its own processes.

### The proxy (`papp-net`)

The proxy runs in the trampoline, outside the sandbox. It:

- forwards only to the declared `host:port` patterns, and answers 403 to the rest;
- looks up names itself;
- refuses any name that leads to this computer or the local network (`privateNetwork` in `src/permissions/tags.ts`);
- forwards to the local network only an IPv4 address declared in numbers with its port;
- refuses a `CONNECT` with no port;
- logs every request, allowed or refused, to `egress.log`;
- stops taking connections if it cannot write the log.

Refused as local: loopback, `0/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10` (VPNs such as Tailscale), `169.254/16` (cloud metadata), `fc00::/7`, `fe80::/10`, NAT64 (`64:ff9b::/96`), and this machine's own addresses.

- Refused before the popup: loopback other than `127.0.0.1`, `0/8`, `169.254/16`, this machine's own addresses, and `.local` names.
- `selftest-net` checks the refusals and that a declared local address is forwarded.

Declared `localhost` and `127.0.0.1` ports skip the proxy and are not logged.

- Linux: they need a port number; `localhost:*` is refused.
- Linux: they reach the sandbox through socket files in a folder only that page sees. Two open pages cannot use each other's servers. `selftest-net` checks this.

### Tags

- Read from the file on disk before the page runs. A running page cannot add any.
- Only the text before the first `<script`, `<body` or `</head` counts, comments skipped.
- An unknown tag or a bad value stops the page from opening.
- So does an invisible character (such as a line break) in a value or a path. It could make one line look like two in the popup.

### Files

- A page without full Node has no Node. Its only way out is `window.papp`.
- `window.papp` checks every call against the grants, on real paths with symlinks resolved.
- Every `file:` request gets the same check, the page's own scripts and images included.
- Hidden files are outside every grant unless a tag names them. A `*` never matches one.
- The own folder is to see only. Changes need `papp-write`.
- A page (`.papp`) is writable only through a `papp-write` pattern that ends in `.papp`, shown red. So a page cannot rewrite another page approved for more.
- Deleting or moving a folder needs every file in it to be writable.

The OS also limits where the page and its programs write:

| Writable                           | Why                 |
| ---------------------------------- | ------------------- |
| `papp-write` folders               | granted             |
| the temp folder                    | Electron needs it   |
| `/dev`                             | the system needs it |
| `pages/`, the pages' Electron data | Electron needs it   |

- macOS: by pattern, the same patterns Apargon checks. Pages stay out of every pattern that does not name them.
- macOS: programs cannot open other apps (`open`), script them (Apple Events) or write app settings (`defaults write`).
- Linux: by folder, which is looser (see "Not enforced").

### Keys and logins

The OS hides a fixed list from the page and every program it runs: `~/.ssh`, `~/.gnupg`, `~/.aws`, cloud and GitHub CLI logins, saved passwords, browser profiles. `SECRETS` in `src/permissions/tags.ts` is the list.

| OS    | How                                                              |
| ----- | ---------------------------------------------------------------- |
| macOS | Seatbelt denies them at their real paths, made later too         |
| Linux | `bwrap` covers folders with an empty one, files with `/dev/null` |

- Apargon's own checks refuse them too. `~/Library` does not reach a browser profile.
- Only a tag that starts inside one opens it. That line is red.
- `selftest-net` checks that a program cannot list `~/.ssh`.

### Environment

| Process          | Gets                                                        |
| ---------------- | ----------------------------------------------------------- |
| a program        | `PROGRAM_ENV`, the proxy settings, and the `papp-env` names |
| the page         | the same, plus what the window needs (`PAGE_ENV`)           |
| a full-Node page | the whole environment, and so do its programs               |

- A `papp-env` name that reads like a secret (`KEY`, `TOKEN`) is red.
- `selftest-net` checks that a named variable arrives and an unnamed one does not.

### Approvals

- The popup is Apargon's own static page, in its own window. It allows no network and shows values as text, never HTML.
- It says what each tag allows in plain words, and above that what they allow together.
- A red line, or lines that together can send something out (files, the clipboard, the screen), need a checkbox.
- An approval covers one path and one exact list. A new list asks again and marks what is new.
- A page marked as downloaded leads with its site and is held to its content. If it changes, Apargon asks again. If it changes while open, the window reloads into a refusal and says so.
- A downloaded page with no tags is asked about once.
- No page can write the approvals (`grants.json`), not even a full-Node page. Nothing a page sends adds one.
- **Permissions** revokes one approval or all.

### The window

- It shows only the page. A link does not navigate, a frame does not load another file, and a new window opens only on the page itself. `selftest` checks the frame and the window.
- A frame from a declared host cannot reach `window.papp`. Tested by hand on 2026-10-26: Chromium blocks it as cross-origin.
- Each page keeps its own `localStorage`, IndexedDB and cache. `selftest-node` checks that one page cannot read another's `localStorage`.
- The favicon is read only from a file the page may see, and always gets Apargon's badge on the corner.
- On macOS, only a page made here gets its icon in Finder.

### Devices and the desktop

| Needs                                       | Tag                      | Colour                 |
| ------------------------------------------- | ------------------------ | ---------------------- |
| clipboard writing, fullscreen, pointer lock | none                     | —                      |
| a paste the user makes                      | none                     | —                      |
| clipboard reading                           | `papp-use clipboard`     | yellow                 |
| location (macOS only)                       | `papp-use location`      | yellow                 |
| camera                                      | `papp-use camera`        | yellow                 |
| microphone                                  | `papp-use microphone`    | yellow                 |
| sound                                       | `papp-use sound`         | plain; yellow on Linux |
| notifications                               | `papp-use notifications` | plain                  |
| screen capture                              | `papp-use screen`        | red                    |
| a global key combination                    | `papp-shortcut`          | yellow                 |

- With `papp-net`, the popup says that what these pick up can be sent.
- Camera and microphone together need both tags. macOS also asks the first time.
- Screen capture gives the whole main screen, with no picker and no sound. Without the tag it is denied; `selftest` checks that.
- The web Notification API is denied to every page.
- A shortcut needs two modifiers, or one with a function key, so a page cannot take `Ctrl+C`. Modifiers that only type characters do not count.
- The tray icon is always Apargon's. The page sends it up to 24 characters of text and hears back only a click. It ends with the page.

### The packaged app

- It cannot run as plain Node, and ignores `NODE_OPTIONS` and inspector flags.
- It loads code only from `app.asar` (Electron fuse). On macOS it also refuses to start if `app.asar` does not match its build hash; Electron has no such check on Linux.
- Its one network call is the update check: from the trampoline, at most once a day. **Permissions → Check for Updates Automatically** turns it off.
- macOS installs only a build signed with the same Developer ID. Linux only shows a notice.
- No telemetry, no crash reports, no background service, nothing at login.

## Not enforced

### Reading

- Apargon enforces read grants, not the OS. Chromium's own sandbox cannot start inside `sandbox-exec` or `bwrap`.
- So a page that exploits a Chromium bug could read any file but keys and logins. It would still have no network beyond its hosts, and the same write limits.
- Listing a folder above a wildcard (`~/git` for `~/git/*/docs`) shows every name in it. Names only, not files.
- `papp.pick` lets the page see what the user picks in the dialog, until it reloads; a folder with its subfolders, hidden files left out. Keys and logins stay refused, and so do a link and a folder that holds the whole home folder (`/`, `~`). Apargon draws the dialog in the page's process, outside the renderer, but nothing asks for a click first: a page can open the dialog again after a cancel.

### Saving (`papp.saveAs`)

- Apargon's first process, outside the sandbox, writes the files: the page's own process cannot write where the user picks.
- It writes only into the folder the user picks in that process's own dialog, so a page that breaks out of its sandbox can write nowhere else. It remembers nothing between saves.
- The page names the files, not the folder. Names with a folder or a leading dot, and pages, are refused. So is a folder that is reached through a link, holds keys and logins, or is Apargon's own.
- It only adds new files: a taken name gets a number, and nothing is written through a link.
- Any page may open the dialog, with no tag, and open it again after a cancel.
- A saved file carries no download mark. A file that runs when opened, such as a `.terminal` file on macOS, opens without the system's warning for downloaded files.
- A program the page runs (`papp-run`, red) could swap the picked folder for a link between Apargon's check and its write, and so add files elsewhere. It cannot replace one.
- Refusing a folder reached through a link relies on the dialog returning the link's path. Linux's does; macOS's is asked to and is untested.

### The papp skill

- Apargon offers the skill on its first run, and each time it opens without a page until the skill is there. **Help → Install the papp Skill for Agents…** offers it too. Yes writes `SKILL.md` into `~/.claude/skills/papp/` and `~/.agents/skills/papp/`, creating the folders. Apargon's first process writes it, after the user confirms in that process's own dialog. The file is the one inside `app.asar`; the page cannot change what is written.
- It replaces whatever `SKILL.md` is there, edits included. The rename replaces a link at `SKILL.md` rather than the file it leads to, but links in the folders above it are followed.
- The menu belongs to the page's process, so any page, or a page that breaks out of its renderer, can open the dialog, with no tag. Only one is open at a time.

### Programs (`papp-run`, always red)

- A program can read every file but keys and logins.
- It takes any arguments, and may run others (`git -c core.sshCommand=…`).
- A `papp-env` variable reaches it, and through it the page and the declared hosts.
- It can read and change every page's Electron data in `pages/`: another page's `localStorage` or IndexedDB too.
- It can move a folder that holds pages, or hard-link to a page.
- Linux: its writes are limited by folder, not pattern. For `~/notes/*.md` it may change anything in `~/notes`, hidden files and pages included. The popup names those folders.
- macOS: once Apargon has camera, microphone or Screen Recording access, a program (`ffmpeg`, `screencapture`) can likely use it without the tag. A program can also play sound (`afplay`) without `papp-use sound`. Untested: a test would trigger the system prompts.

### Writable folders

- They can hold files other tools run later: `package.json` scripts, a `Makefile`.
- Hidden ones (`.git/hooks`, `.envrc`) are excluded unless named. On Linux, for the page only, not its programs.
- A synced folder (iCloud Drive, Dropbox, git auto-push) carries what the page writes off the machine.
- The temp folder is writable.

### Keys and logins

- The list is fixed. A key elsewhere (`~/keys/id_rsa`, a project's `.env`) is not hidden.
- Naming part of one (`~/.ssh/config`) opens all of it to programs.
- Linux: only those that exist when the page opens are hidden.
- macOS: the Keychain is a service, not a file. macOS asks before it hands out another app's password.

### Network

- Wildcard hosts are coloured by how they are written: `*.github.io` is yellow, though anyone can publish there.
- A declared local-network address reaches whatever answers there. The popup says so.
- The local network is told apart by address range. A VPN that hands out public addresses counts as the internet.
- For https the proxy sees only `host:port`. A program may reach another site on the same CDN (domain fronting).
- If `egress.log` stops being writable, open connections keep forwarding, unlogged.
- A `papp-socket` reaches whatever answers there. A folder opens every socket in it. The line is red.

**Ways out for a program, or for a page that exploits Chromium:**

| OS    | Way out                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| macOS | Mach messages to system services are allowed (the GUI needs them). Only the three known fetch services and Apple Events are blocked. |
| Linux | a socket file outside `/run` and `/tmp`: `tmux -S ~/sock`, Docker with `-H`, any server in a folder the page sees                    |
| Linux | `vsock`, in a virtual machine                                                                                                        |
| Linux | the X11 display socket, to type into another window. Wayland does not allow this.                                                    |

### Devices and the desktop

- With `papp-use`, the page gets what the device picks up: the clipboard (a password manager's copy too), location, camera, microphone, the whole screen.
- Apargon shows no sign that the camera or microphone is on.
- macOS asks once for Apargon, not for each page.
- Screen capture is untested on both platforms. It fails on Wayland.
- Linux: `papp-use sound` or `microphone` binds the sound server. A program can then play and record, and the server can stream over the network. Untested on a desktop.
- A shortcut is heard in every app and can still clash (`Cmd+Shift+Z`). It does nothing on Wayland.
- A notification's text is the page's. It shows under Apargon's name.
- A page's icon can look like another app's. Only the badge and the menu-bar name show it is an Apargon page.
- Clipboard writing, printing, and files you pick or drop into the page need no tag.

### Where a page came from

- Apargon reads the download mark browsers set. `git clone`, `curl`, USB sticks and Firefox on Linux leave none. Linux also needs `getfattr`.
- Without a mark, a page is treated as made here: no site, no content hold, and no popup if it has no tags. Red lines still need the checkbox.
- Rewriting the page in place keeps its mark. Replacing the file, as a program or a `papp-write` on pages could, drops it.
- An approval of a page made here follows its path, not its content: it is yours to edit.
- A downloaded page is held to its own content, not to the `.js` and `.css` it loads.
- A page with `papp-write` can change `.js` and `.css` in those folders. An approved page that loads them runs the new code with its permissions, at once.

So keep approved pages where only you write, and a page that asks for servers or programs in a folder of its own.

### Full-Node pages

The sandbox blocks their sockets and their writes to Apargon's data and app. On macOS it also blocks the three fetch services; on Linux it also empties `/run`, `/tmp` and `/var/tmp` and hides other processes. Nothing else. Such a page can:

- launch an app that has network (`open`, `osascript`, `launchctl`; on Linux through X11 or a socket file);
- write startup files and launch agents that run later, or to a synced folder;
- ask another app to write `grants.json` (Apple Events to Terminal; a shell startup file);
- read other pages' storage in `pages/`;
- ask any local daemon to act for it;
- send the trampoline any message the page process can: turn off the update check, revoke approvals, open another page, show notifications or a tray icon without the tag, set a file icon;
- macOS: rewrite or erase `egress.log`, which sits in `~/Library/Logs`, outside the protected folder;
- macOS: change the downloaded update in `~/Library/Caches`. A changed build fails the signature check and is not installed.

Untested: whether a full-Node page can rename a folder above Apargon's data and plant its own `grants.json`.

### The update check

- Once a day, GitHub learns your IP address and that Apargon ran. Turning the check off stops it.
- Whoever controls the GitHub repository can tell Linux users a new version is out. Without the Developer ID, they cannot ship one to macOS.

### The packaged app

- macOS: the `app.asar` hash sits in `Info.plist`, which only the code signature protects. Without a Developer ID signature, anyone can edit the app and update the hash.
- macOS: `sandbox/macos.sb` is not hash-checked. Pages cannot write it.
- macOS: the profile starts from `(allow default)`, because the GUI needs Mach IPC and the WindowServer.
- macOS: `sandbox-exec` is deprecated, but it is still the way to sandbox a process tree.
- Linux from source: on Ubuntu 23.10 and later `bwrap` fails without the AppArmor profile the `.deb` installs, and Apargon refuses to open pages.
- Linux: the `.deb` needs `bubblewrap` 0.8.0 or later, so Ubuntu 22.04 is refused at install.

### Scope

Apargon is not a VM. A hard "nothing leaves" guarantee needs a VM with no network card, no shared folders and no shared clipboard.

## Verification

`pnpm test` runs every check in the real app and fails if one fails. `test/check.ts` lists the checks for each platform. [AGENTS.md](AGENTS.md#the-installed-deb) has the Linux run on the installed `.deb`.

| Platform      | Last verified                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS         | 2026-10-27, `pnpm test`: every check                                                                                                                                                                |
| Linux         | 2026-10-28, the installed `.deb` built from the tree committed as `fc245fd`, on a headless Ubuntu 24.04 server with the AppArmor limit on: every Linux check (83), and the refusal with its control |
| Linux desktop | not yet: no run with a real display and a double-click                                                                                                                                              |

Not covered by the Linux run: the `papp-socket` folder refusal and the NAT64 range. No check on the installed `.deb` tests them; `pnpm test` on Linux does.

## Reporting

Open an issue if a page reaches a host or file it did not declare, or if the offline check passes outside the sandbox.

- Include the page, the platform and the egress log.
- Leave out secrets and private file contents.
