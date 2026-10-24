# Security model

A page asks for what it needs in `<meta>` tags. With no tags it may see and change its own
folder and nothing else: no other files, no programs, no network. With tags, a popup lists
each one in plain words before the page runs, and the user allows the list or does not
open the page. The guarantees below hold for a page that does not ask for full Node
(`resworb-node`), whoever wrote it. A full-Node page runs as code with your permissions,
like a script: open only pages you trust with it.

## Enforced

- The page's process and every child it spawns run inside an OS network sandbox:
  Seatbelt (`sandbox-exec`, `sandbox/macos.sb` plus rules per page) on macOS,
  `bwrap --unshare-net` on Linux. Connecting, binding and DNS fail in the kernel.
- macOS: the two system services found to fetch for a process, background downloads
  (`nsurlsessiond`) and WebKit's network process, are refused to the page's process and
  its children. launchd starts them outside the sandbox, so without this they reach any
  server. `test/daemons.ts` checks that both answer without the sandbox, `selftest-node`
  that both fail inside it.
- The sandboxed process refuses to open a page if it can bind a loopback port. There is
  no flag to skip this; `test/refuse.ts` checks it.
- resworb reads the tags from the file on disk before the page runs. A page cannot add
  tags while it runs. An unknown `resworb-*` tag or a bad value stops the page from
  opening.
- A page without full Node has no Node. Its only door is `window.resworb`, and every call
  is checked against the granted folders on real paths, symlinks resolved. Every `file:`
  request, the page's own scripts and images included, is checked the same way.
- Hidden files and folders (names starting with a dot) are outside every grant unless a
  tag names them. A `*` never matches one.
- macOS: the OS also limits writes for a page without full Node, and for the programs it
  runs, to its own folder, its `resworb-write` folders, and the temp folder. The same
  patterns are compiled for the OS and for resworb's checks. Those programs cannot open
  other apps (`open` and LaunchServices).
- A page with `resworb-net` gets a loopback port to a proxy in the trampoline. The proxy
  forwards only to the declared `host:port` patterns, resolves the names itself, refuses
  any name that resolves to this computer (loopback, `0.0.0.0/8`, `::`, and the addresses
  its network interfaces have at the time of the request), and answers 403 to everything
  else. For plain http it sends the declared name as `Host`. Every
  request it sees, allowed or refused, is appended to `egress.log`; if the log cannot be
  written, the proxy stops forwarding. Declared `localhost:` ports are opened in the
  sandbox profile directly and do not appear in the log.
- No page can write resworb's approvals (`grants.json`) or, on macOS, the app itself. The
  page's own Electron data lives apart, in `pages/`. The Permissions menu asks the
  trampoline to revoke; nothing a page sends can add an approval.
- Approvals are per file path and exact permission list. A changed list asks again and
  marks what is new. **Permissions → Approved Pages** revokes one page,
  **Revoke All Approvals** every page.
- The window loads only `file:` URLs: a link to a declared host does not navigate, and no
  new windows open.
- Every permission a page can request is denied except writing to the clipboard,
  fullscreen and pointer lock: no camera, microphone, screen capture, clipboard reading,
  notifications or location. This holds for a full-Node page's window too.
- The packaged app cannot be run as plain Node (`ELECTRON_RUN_AS_NODE`), ignores
  `NODE_OPTIONS` and the inspector flags, loads its code only from `app.asar`, and refuses
  to start if `app.asar` does not match the hash recorded when it was built (Electron
  fuses).
- macOS: a page still carrying the download quarantine attribute gets one warning.
- The app makes no network calls of its own: no telemetry, crash reporting, auto-update,
  background service or autostart.

## Not enforced

For a page without full Node:

- Read grants are enforced by resworb, not the OS. Chromium's own process sandbox cannot
  start inside `sandbox-exec` or `bwrap`, so the page's renderer runs without it: a page
  that exploits a bug in Chromium could read any file. It would still have no sockets
  beyond its declared hosts and, on macOS, the same write limits.
- macOS: the profile allows Mach messages to system services, as the GUI needs them. It
  refuses the two found to fetch for a process (above), not the kind: another service that
  connects on a caller's behalf would be a way out for a program the page runs, or for a
  page that exploits Chromium.
- A program allowed by `resworb-run` can read every file and takes any arguments; some
  programs run others (`git -c core.sshCommand=…`). Its network and, on macOS, its writes
  are limited like the page's. This is why the popup marks it red.
- A writable folder can hold files other tools run later without asking you:
  `package.json` scripts, a `Makefile`. Hidden ones (`.git/hooks`, `.envrc`, `.vscode`)
  are excluded unless named. A writable folder that iCloud Drive, Dropbox, OneDrive or a
  git auto-push syncs sends what the page writes off the machine.
- The temp folder is writable, as Electron needs it.
- Listing a folder above a wildcard (`~/git` for `~/git/*/docs`) shows every name in it,
  not only the ones that lead to a match. Names only; the files stay out of reach.
- Wildcard hosts are judged by how they are written: `*.github.io` shows yellow, though
  anyone can publish under it. `*` reaches machines on your local network too; only this
  computer is refused.
- For https the proxy sees only `host:port`. A program the page runs can ask a declared
  server that hosts many sites, such as a CDN, for another site inside the encrypted
  connection (domain fronting); whether that works is up to the server.
- Linux: no OS write limits; resworb's checks are the only ones. `--unshare-net` isolates
  IP networking only: Unix sockets and D-Bus stay, so a program the page runs can hand a
  URL to the session's browser with `xdg-open`.
- Writing to the clipboard, printing, and files the user picks or drops into the page.

For a page with full Node, the fence is at the socket layer only. A page with
`child_process` and your files has channels the sandbox does not see:

- launching another application that has network (`open`, `osascript`, `launchctl`;
  `xdg-open`, D-Bus);
- writing to a folder that is synced, or to shell startup files and launch agents, for
  later execution;
- asking another app to write resworb's approvals for it (Apple Events to Terminal);
- asking a local daemon or another process to act on its behalf.

Approval is remembered by file path and permission list, not content: editing an approved
page without changing its tags does not ask again. Keep approved pages where only you can
write. Pages in one folder share it: a page with no tags, which opens without asking, can
rewrite an approved page beside it or the scripts it loads, and an open page reloads when
its files change, so the new code runs at once with the approved permissions. Keep a page
that asks for servers or programs in a folder of its own. A page with no tags reaches the
files in its folder only, not its subfolders; a page with any tag gets its subfolders too,
so an approved page can rewrite pages below it.

A hard "nothing leaves" guarantee needs a VM with no NIC, no shared folders and no shared
clipboard. That is not this version.

## Platform notes

macOS: `(allow default)` is deliberate; the GUI needs Mach IPC and the WindowServer, which
is also why Apple Events stay reachable (`appleevent-send` does not stop `osascript` here).
`sandbox-exec` is deprecated but remains the mechanism that applies a profile to a process
tree. The `app.asar` hash is kept in the app's `Info.plist`, which only the code
signature protects: a build without a Developer ID signature can be edited and re-hashed.
`sandbox/macos.sb` sits outside `app.asar` and is not hash-checked; pages cannot write it,
as they cannot write the app. `com.apple.security.cs.disable-library-validation` stays in the entitlements pending
a signed-build test without it; there are no native modules.

Linux: `resworb-net` does not work yet: the network namespace has its own loopback, so the
proxy port is unreachable. A page with `resworb-net` refuses to open.

## Verification

`pnpm test` runs in the real app and fails if any check fails. [docs/verification.md](docs/verification.md)
has the list, the egress matrix and the manual canaries for channels the suite cannot
cover.

## Reporting

If a page reaches a host or a file it did not declare, or the offline check passes outside
the sandbox, open an issue with the page, the platform and the egress log. No secrets or
private file contents.
