---
name: resworb
description: Use when asked for a visualizer, viewer, editor, dashboard or "a page" over files on this machine, especially one that must also change them; when a .lmth or .nmth file is mentioned or to be created; or when a quick local tool would otherwise become an Electron app or a server plus a browser tab. Not for anything hosted, shared, or opened by people who did not write it.
---

# resworb

A `.lmth` file is HTML that opens in resworb: `require` works inside `<script>`, and the
OS denies sockets and DNS for the process and its children. A `.nmth` file is the same
with a short list of hosts it may reach, declared in its head. A page runs as code with
the user's file permissions; it is for pages the user trusts, not a sandbox.

## When

Use it when the user wants to _see or edit local files through a UI_ and the result is a
tool they will open again: a viewer over a folder of notes, a dashboard over logs, an
editor for a config format, a form that writes JSON. One file, next to the data, opened by
double-click.

Do not use it when:

- the answer is a one-off — read the files and answer instead;
- the result must be hosted, shared, or opened by someone else — that is a web app;
- the page would process input the user does not trust — the fence does not cover that;
- the user is on Windows — resworb refuses to open pages there.

## .lmth

```html
<script>
  const fs = require('fs');
  const path = require('path');
  const here = path.dirname(decodeURIComponent(location.pathname));   // the page's folder
</script>
```

- The files are the truth; the page is a view. Read from disk, write back in the files'
  own format. Never keep the only copy of anything in the page.
- Everything on disk. Libraries go next to the page as `.js`; no CDN, no web fonts.
- Saving the page, or any `.css`/`.js` next to it, reloads the window. State lives in the
  files, so a reload loses nothing.
- Synchronous Node is fine. No server, no bundler.
- Put the page next to the files it works on. Touch only those files; ask before writing
  outside that folder.

## .nmth

Only when the page must call a server. Declare every host in the head, one per `<meta>`,
`host:port` and nothing else: no wildcards, no schemes, no bare hosts.

```html
<meta name="resworb-net" content="localhost:11434">
<meta name="resworb-net" content="vps.example.com:443">
```

- Reach remote hosts with `fetch` or `curl`; both know the proxy, Node's `http`/`net` do
  not and get EPERM. Declared `localhost:` ports are open directly, so anything reaches
  those.
- CORS is off; the host list is the boundary.
- The user approves the list in a dialog on first open, and the window title repeats it.
  Tell the user to expect the dialog. List only the hosts the page calls.
- Links to a declared host do not navigate; the window loads only `file:` URLs.
- macOS only for now.

## Do not

- Launch a browser or another app from `child_process` to reach the network. The fence
  does not see app launches or synced folders; that is a gap in it, not a route.
- Work around a dialog saying the process can open sockets. It means resworb was not in
  the sandbox and refused, which is the check working.

## Delivering

Write the file, say where it is, and tell the user to double-click it (or `open
page.lmth`). Point them at `examples/hello.lmth` in the resworb repository if they want to
see the shape before trusting yours. `SECURITY.md` there has the full boundary.
