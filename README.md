# resworb

A browser turned inside out. A page opened in resworb gets full Node: `require('fs')`,
`child_process`, anything. The OS denies the process sockets and DNS, child processes
included. Not blocked in an API; blocked by the kernel.

Why: the easiest visualizer for anything on your machine is an HTML file. In a browser it
is read-only. In resworb it can also write. One app, one install; after that every tool
is a single `.lmth` file you (or an agent) write and open.

The name is `browser` reversed; `lmth` is `html` reversed; `nmth` is `html` with `n` for
net, reversed.

## Trusted pages, not a sandbox

A page runs as code with your file permissions. It can read and write anything you can
and launch other applications; those channels are outside the fence. Open only pages you
trust, as you would run a script. [SECURITY.md](SECURITY.md) has the full model.

## Two kinds of page

- `.lmth` — Node, no network. The page cannot open a socket, resolve a name, or reach the
  network directly.
- `.nmth` — the same, plus a proxy to the hosts it names in its head, after you approve
  the list once:

  ```html
  <meta name="resworb-net" content="localhost:11434">
  <meta name="resworb-net" content="vps.example.com:443">
  ```

  One `host:port` per line, nothing else parses. On open, a dialog lists the hosts; the
  answer is remembered per file and list, and the window title repeats the list while the
  window is open. A changed list is asked about on the next open. macOS only for now.

## Install

macOS: download `resworb-<version>-<arch>.dmg` from Releases, drag resworb to
Applications. `.lmth` and `.nmth` files then open on double-click. Linux: the AppImage or
`.deb`, `.lmth` only. Windows: not yet.

A page is code; double-clicking one runs it. On macOS a page that still carries the
download quarantine attribute gets one warning first.

## How it works

Launched normally, resworb is a trampoline: it relaunches itself inside an OS network
sandbox (Seatbelt via `sandbox/macos.sb` on macOS, `bwrap --unshare-net` on Linux), and
only that offline process opens the page. Before opening, the offline process checks that
it cannot bind a loopback port; if it can, it refuses. There is no flag to skip this.

A `.nmth` page gets a loopback port on which the trampoline runs a proxy that forwards to
the declared hosts and answers 403 to everything else. `fetch` goes through it (Chromium's
`--proxy-server`); so does `curl` from `child_process` (`https_proxy`). Declared
`localhost:` ports are allowed in the profile directly, so the page reaches them without
the proxy; a raw socket to anywhere else is still EPERM from the kernel. The proxy resolves
the names, so DNS stays dead in the offline process. It exists because the kernel cannot
allowlist remote hosts on its own: Seatbelt only knows `localhost`.

Every request the proxy sees, allowed or refused, goes to `egress.log`. The **Network**
menu shows the log and revokes every `.nmth` approval.

## Writing a page

Plain HTML with Node in the page. See `examples/hello.lmth` and `examples/net.nmth`; for
agents, `skills/resworb/SKILL.md`.

- Everything on disk. No CDN, no web fonts; copy libraries next to the page.
- The files are the source of truth; the page is a view. Write back to the files.
- Saving the page, or a `.css` or `.js` next to it, reloads the window.
- Undo is git. A page reads and writes files; treat it as code.
- In a `.nmth`, use `fetch` or `curl`. Node's `http` needs a proxy agent. CORS is off;
  the host list is the boundary.

## Develop

```sh
pnpm install
pnpm test        # fence holds for .lmth and .nmth; unsandboxed process refuses
pnpm start       # examples/hello.lmth
pnpm start:net   # examples/net.nmth, dialog auto-answered
pnpm dist        # signed .dmg (Developer ID in the keychain)
pnpm dist:linux  # AppImage and .deb
```

`RESWORB_TEST_ALLOW=1` answers the `.nmth` dialog with yes. Ignored in packaged builds;
cannot add a host.

Notarization runs when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are
set (or `APPLE_KEYCHAIN_PROFILE`). Without them the build is signed but not notarized:
first launch needs right-click → Open.

Icons are SVG in `assets/`; `assets/make-icons.sh` renders them for electron-builder
(needs `rsvg-convert`). The app icon is a lit diamond, hollow at the centre. `.lmth`
carries it whole: fenced. `.nmth` carries it holed, one dot outside: a named host let
through.

## Next

Linux `.nmth`: the offline network namespace has its own loopback, so the proxy would sit
on a unix socket with a bridge inside. Windows offline mode (AppContainer). A VM backend
for pages that must be treated as untrusted. A release action.
