# resworb

A browser turned inside out. A page opened in resworb gets full Node: `require('fs')`,
`child_process`, anything. The process gets no network at all. Not blocked in an API;
blocked by the kernel, child processes included.

Why: the easiest visualizer for anything on your machine is an HTML file. In a browser
it is read-only. In resworb it can also write. One app, one install; after that every
tool is a single `.lmth` file you (or an agent) write and open.

## Two kinds of page

- `.lmth` — no network. Ever. The page can read and delete anything; it cannot send
  anything anywhere.
- `.nmth` — network to the hosts it names in its head, after you approve the list once:

  ```html
  <meta name="resworb-net" content="localhost:11434">
  <meta name="resworb-net" content="vps.example.com:443">
  ```

  One `host:port` per line, nothing else parses. On open, a dialog lists the hosts;
  the answer is remembered per file and list, and the window title repeats the list
  for as long as it is open. The host list is fixed when the window opens: a changed list
  takes effect, and is asked about, when the page is reopened. macOS only for now.

## Install

macOS: download `resworb-<version>-<arch>.dmg` from Releases, drag resworb to Applications.
From then on `.lmth` and `.nmth` files open on double-click. Linux: the AppImage or `.deb`.
Windows: not yet (no offline mode written for it; the app refuses to open pages there).

## How it works

Launched normally, resworb is a trampoline: it relaunches itself offline, with the OS
holding the network shut (Seatbelt on macOS via `sandbox/macos.sb`, `bwrap --unshare-net`
on Linux), and only that offline process opens the page. Before opening, the offline
process tries to bind a loopback port; if it can, it is not offline and refuses with a
dialog. The check works with or without an internet connection, and there is no flag to
skip it.

A `.nmth` page gets the same offline process plus one opening: a single loopback port. On
that port the trampoline, which has network, runs a proxy that forwards to the declared hosts and
answers 403 to everything else. `fetch` goes through it (Chromium's `--proxy-server`);
so does `curl` from `child_process` (`https_proxy`). A raw socket from Node to anywhere
but a declared `localhost:` port is still EPERM from the kernel. Hosts are resolved by
the proxy, so DNS stays dead in the offline process. The kernel cannot allowlist remote hosts
on its own (Seatbelt only knows `localhost`), which is why the proxy exists.

## Develop

```sh
npm install
npm test                   # .lmth: fs and child_process work; fetch, curl, dns fail
                           # .nmth: declared host works by fetch and curl; all else fails
npm start                  # examples/hello.lmth
npm run start:net          # examples/net.nmth
npm run dist               # signed .dmg in dist/ (Developer ID in the keychain)
```

`RESWORB_ALLOW=1` answers the `.nmth` dialog with yes, for scripts and tests. It cannot
add a host; only the page can.

Notarization runs when these are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` (or `APPLE_KEYCHAIN_PROFILE` from `xcrun notarytool store-credentials`).
Without them the build is signed but not notarized: first launch needs right-click → Open.

## Writing a page

Plain HTML. Node is in the page. See `examples/hello.lmth` and `examples/net.nmth`.

- Everything must be on disk. No CDN, no web fonts. Copy libraries next to the page.
- The files are the source of truth; the page is a view. Write back to the files.
- Saving the `.lmth`, `.css` or `.js` next to the page reloads the window.
- Undo is git. A page can delete files; it cannot send them anywhere a `.nmth` did not name.
- In a `.nmth`, use `fetch` or `curl`. Node's `http` needs a proxy agent; CORS is off,
  the host list is the boundary.

## Next

Linux build and release action. Linux `.nmth`: the offline process's network namespace
has its own loopback, so the proxy would sit on a unix socket with a bridge on the offline
side. Windows offline mode (AppContainer).
