# Security model

resworb runs **trusted pages**. A page is code with full Node and the permissions of the
user who opens it, the same as a local script. The fence removes the network from that
code; it does not make untrusted code safe to run.

## Enforced

- The page's process and every child it spawns run inside an OS network sandbox:
  Seatbelt (`sandbox-exec`, `sandbox/macos.sb`) on macOS, `bwrap --unshare-net` on
  Linux. Connecting, binding and DNS fail in the kernel.
- The offline process refuses to open a page if it can bind a loopback port. There is no
  flag to skip this; `test/refuse.ts` checks it.
- A `.nmth` page gets a loopback port to a proxy in the trampoline. The proxy forwards
  only to the declared `host:port` list, resolves the names itself, and answers 403 to
  everything else. Every request it sees, allowed or refused, is appended to `egress.log`;
  if the log cannot be written, the proxy stops forwarding. Declared `localhost:` ports are
  opened in the sandbox profile directly: the page reaches them without the proxy, and
  they do not appear in the log.
- Approvals are per file path and host list, in `grants.json`. **Network → Revoke All
  Approvals** deletes them.
- The window loads only `file:` URLs: a link to a declared host does not navigate, and no
  new windows open.
- macOS: a page still carrying the download quarantine attribute gets one warning.
- The app makes no network calls of its own: no telemetry, crash reporting, auto-update,
  background service or autostart.

## Not enforced

The fence is at the socket layer. A page with `child_process` and the user's files has
channels the sandbox does not see:

- launching another application that has network (`open`, `osascript`, `launchctl`;
  `xdg-open`, D-Bus);
- writing to a folder that iCloud Drive, Dropbox, OneDrive or a git auto-push syncs;
- clipboard, printing, screen capture;
- shell startup files and launch agents, for later execution;
- asking a local daemon or another process to act on its behalf.

Approval is remembered by file path and host list, not content: editing an approved page
does not ask again. Keep approved pages where only you can write.

A hard "nothing leaves" guarantee needs a VM with no NIC, no shared folders and no shared
clipboard. That is not this version.

## Platform notes

macOS: `(allow default)` is deliberate; the GUI needs Mach IPC and the WindowServer, which
is also why LaunchServices and Apple Events stay reachable. `sandbox-exec` is deprecated
but remains the mechanism that applies a profile to a process tree.
`com.apple.security.cs.disable-library-validation` stays in the entitlements pending a
signed-build test without it; there are no native modules.

Linux: `--unshare-net` isolates IP networking only; Unix sockets and D-Bus stay, so
`xdg-open` can still hand a URL to the session's browser. `.nmth` does not work on Linux
yet: the network namespace has its own loopback, so the proxy port is unreachable.

## Verification

`pnpm test` runs in the real app: `fs` and `child_process` work; `fetch`, `curl`, raw
sockets and DNS fail; a `.nmth` reaches its declared host and nothing else; a process
handed `RESWORB` by hand, no sandbox, refuses. [docs/verification.md](docs/verification.md)
has the egress matrix and the manual canaries for channels the suite cannot cover.

## Reporting

If a page reaches a host it did not declare, or the offline check passes outside the
sandbox, open an issue with the page, the platform and the egress log. No secrets or
private file contents.
