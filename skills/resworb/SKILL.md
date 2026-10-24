---
name: resworb
description: Use when asked for a visualizer, viewer, editor, dashboard or "a page" over files on this machine, especially one that must also change them; when a .lmth or .nmth file is mentioned or to be created; or when a quick local tool would otherwise become an Electron app or a server plus a browser tab.
---

# resworb

A `.lmth` file is HTML that opens in resworb: `require` works inside `<script>`, and
the process has no network, enforced by the kernel for child processes too. A `.nmth`
file is the same with a short list of hosts it may reach, declared in its head.

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
- Saving the page, or any `.css`/`.js` next to it, reloads the window. State lives in
  the files, so a reload loses nothing.
- Synchronous Node is fine. No server, no bundler.

## .nmth

Only when the page must call a server. Declare every host in the head, one per `<meta>`,
`host:port` and nothing else: no wildcards, no schemes, no bare hosts.

```html
<meta name="resworb-net" content="localhost:11434">
<meta name="resworb-net" content="vps.example.com:443">
```

- Reach them with `fetch` or `curl`. Node's `http`/`net` get EPERM: the kernel opens
  only a proxy port, and only `fetch` and `curl` know the proxy.
- CORS is off in a `.nmth`; the host list is the boundary.
- The user approves the list in a dialog on first open; the window title repeats it.
  Keep the list to what the page actually calls.
- macOS only for now.

## Running

```sh
open page.lmth                         # installed app
electron . page.lmth                   # from the repo
RESWORB_ALLOW=1 electron . page.nmth   # answers the approval dialog yes; for scripts
```

A dialog saying the process can open sockets means the process was not offline and resworb refused.
That is correct behaviour, not a bug to work around.
