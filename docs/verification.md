# Verification

## Automated

```sh
pnpm test
```

`.github/workflows/test.yml` runs the same suite on a macOS runner. Expected results:

| Page    | Check                                        | Expected        |
| ------- | -------------------------------------------- | --------------- |
| any     | process handed `RESWORB` by hand, no sandbox | refuses to open |
| `.lmth` | `fs` read/write                              | works           |
| `.lmth` | `child_process`                              | works           |
| `.lmth` | `curl`                                       | blocked         |
| `.lmth` | `fetch`                                      | blocked         |
| `.lmth` | DNS                                          | blocked         |
| `.nmth` | declared host by `curl`                      | works           |
| `.nmth` | declared host by `fetch` (https and http)    | works           |
| `.nmth` | undeclared host by `curl`                    | blocked         |
| `.nmth` | undeclared host by `fetch`                   | blocked         |
| `.nmth` | raw socket to an undeclared address          | blocked         |
| `.nmth` | DNS                                          | blocked         |

`test/result.json` and `test/result-net.json` hold the raw results.

## Egress matrix

"Blocked" means the kernel returns an error to the page and its children. "Out of scope"
means the sandbox does not see the channel.

| Channel                                               | Status           |
| ----------------------------------------------------- | ---------------- |
| TCP/UDP sockets                                       | blocked          |
| Raw sockets                                           | blocked          |
| DNS                                                   | blocked          |
| `fetch` / `curl` outside the `.nmth` list             | blocked          |
| Launch another app (`open`, `osascript`, `launchctl`) | **out of scope** |
| Linux `xdg-open` / D-Bus                              | **out of scope** |
| Write to a synced folder (iCloud, Dropbox, OneDrive)  | **out of scope** |
| Write to a git repo that auto-pushes                  | **out of scope** |
| Clipboard, print, screen capture                      | **out of scope** |

## Manual canary: app launch

Shows that `open` bypasses the socket fence. It launches a browser; run it on a machine
you control.

1. Start a listener: `python3 -m http.server 8000`
2. In a `.lmth` page: `require('child_process').execSync('open http://127.0.0.1:8000/canary')`
3. If the listener logs `/canary`, another application made the request on the page's
   behalf.

The same test applies on Linux with `xdg-open`, and on macOS with
`osascript -e 'tell application "Safari" to open location "..."'`.

## Manual canary: file sync

1. From a `.lmth` page, write a file into a folder synced by iCloud Drive, Dropbox or OneDrive.
2. If the sync client uploads it, the bytes left the machine without a socket.

This is why the README does not say "cannot send anything anywhere".
