# resworb

A browser turned inside out. A page opened in resworb gets full Node: `require('fs')`,
`child_process`, anything. The process gets no network at all. Not blocked in an API;
blocked by the kernel, child processes included.

Why: the easiest visualizer for anything on your machine is an HTML file. In a browser
it is read-only. In resworb it can also write. One app, one install; after that every
tool is a single `.lmth` file you (or an agent) write and open.

## Install

macOS: download `resworb-<version>-<arch>.dmg` from Releases, drag resworb to Applications.
From then on `.lmth` files open on double-click. Linux: the AppImage or `.deb`.
Windows: not yet (no network jail written for it; the app refuses to open pages there).

## How it holds

Launched normally, resworb is a trampoline: it relaunches itself inside the OS network
jail (Seatbelt on macOS via `sandbox/macos.sb`, `bwrap --unshare-net` on Linux) and only
that jailed process opens the page. Before opening, it tries to reach `1.1.1.1:53`; if it
can, the jail did not hold and it refuses with a dialog. There is no flag to skip this.

## Develop

```sh
npm install
npm test                   # fs and child_process work; fetch, curl and dns fail
npm start                  # examples/hello.lmth
npm run dist               # signed .dmg in dist/ (Developer ID in the keychain)
```

Notarization runs when these are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` (or `APPLE_KEYCHAIN_PROFILE` from `xcrun notarytool store-credentials`).
Without them the build is signed but not notarized: first launch needs right-click → Open.

## Writing a page

Plain HTML. Node is in the page. See `examples/hello.lmth`.

- Everything must be on disk. No CDN, no web fonts. Copy libraries next to the page.
- The files are the source of truth; the page is a view. Write back to the files.
- Saving the `.lmth`, `.css` or `.js` next to the page reloads the window.
- Undo is git. A page can delete files; it cannot send them anywhere.

## Next

App icon. Linux build and release action. Windows jail (AppContainer).
