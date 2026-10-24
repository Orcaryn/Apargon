# resworb

A browser turned inside out. A page opened in resworb gets full Node: `require('fs')`,
`child_process`, anything. The process gets no network at all. Not blocked in an API;
blocked by the kernel, child processes included.

Why: the easiest visualizer for anything on your machine is an HTML file. In a browser
it is read-only. In resworb it can also write. One app, one install; after that every
tool is a single `.lmth` file you (or an agent) write and open.

## Run

```sh
npm install
npm test                       # jail checks: fs and child_process work, fetch/curl/dns fail
bin/resworb examples/hello.lmth
bin/install-mac                # ~/Applications/resworb.app: from now on .lmth opens on double-click
```

`bin/resworb` starts Electron inside the OS network jail: Seatbelt on macOS
(`sandbox/macos.sb`), `bwrap --unshare-net` on Linux. Windows (AppContainer) is not done.

At startup the app tries to reach `1.1.1.1:53`. If it can, it shows a red screen and
refuses to open the page. There is no flag to skip this.

## Writing a page

Plain HTML. Node is in the page. See `examples/hello.lmth`.

- Everything must be on disk. No CDN, no web fonts. Copy libraries next to the page.
- The files are the source of truth; the page is a view. Write back to the files.
- Saving the `.lmth`, `.css` or `.js` next to the page reloads the window.
- Undo is git. A page can delete files; it cannot send them anywhere.

## Next

Linux desktop entry for `.lmth`. Windows launcher.
