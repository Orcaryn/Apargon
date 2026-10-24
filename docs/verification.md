# Verification

## Automated

```sh
pnpm test
```

`test/check.ts` prints
every result and fails the run if one is not `true`.

| Page                                  | Check                                             | Expected        |
| ------------------------------------- | ------------------------------------------------- | --------------- |
| any                                   | process handed `RESWORB` by hand, no sandbox      | refuses to open |
| popup (`popup.ts`, macOS)             | `~/LIBRARY`, `~/DOCUMENTS` typed in another case  | red             |
| no tags (`selftest.lmth`)             | no `require`, no `process`                        | absent          |
| no tags                               | read, write, list, delete in its own folder       | works           |
| no tags                               | read or write outside it, list `~`                | refused         |
| no tags                               | write a hidden file in its own folder             | refused         |
| no tags                               | write in a subfolder of its own folder            | refused         |
| no tags                               | `watch` a folder, a file renamed over             | reports change  |
| no tags                               | `watch` outside its folder, a hidden file         | refused         |
| no tags                               | `readFile` with options `{ flag: 'w' }`           | refused         |
| no tags                               | `<script src>` outside its folder                 | refused         |
| no tags                               | `run`, `fetch`                                    | refused         |
| no tags                               | notifications, clipboard read, camera, microphone | denied          |
| `resworb-node` (`selftest-node.lmth`) | `fs` anywhere, `child_process`                    | works           |
| `resworb-node`                        | write resworb's `grants.json`                     | blocked         |
| `resworb-node`                        | `curl`, `fetch`, DNS                              | blocked         |
| `resworb-node`                        | background download, `WKWebView` (`test/leak`)    | blocked         |
| net and run (`selftest-net.lmth`)     | declared host by `curl`, by `fetch` (https, http) | works           |
| net and run                           | `*.example.org` reaches `www.example.org`         | works           |
| net and run                           | `*.example.org` reaches `example.org`             | blocked         |
| net and run                           | undeclared host by `curl`, by `fetch`             | blocked         |
| net and run                           | `curl --noproxy '*'` to a declared host           | blocked         |
| net and run                           | `*:9` to `0.0.0.1` or this computer's LAN address | refused (403)   |
| net and run                           | `resworb-read` folder: read / write               | works / refused |
| net and run                           | program writes its own folder                     | works           |
| net and run                           | program reads `input` on stdin                    | works           |
| net and run                           | program writes outside it, or a hidden file       | blocked         |
| net and run                           | program opens another app (`open -a Finder`)      | blocked         |
| net and run                           | program writes preferences (`defaults write`)     | blocked         |
| net and run                           | undeclared program                                | refused         |
| net and run                           | `run` with options in place of its arguments      | refused         |

"Refused" is resworb's check; "blocked" is the kernel. `test/result.json`,
`test/result-node.json` and `test/result-net.json` hold the raw results.

## Egress matrix

"Blocked" means the kernel returns an error to the page and its children. "Out of scope"
means the sandbox does not see the channel.

| Channel                                              | Without full Node | With full Node   |
| ---------------------------------------------------- | ----------------- | ---------------- |
| TCP/UDP sockets, raw sockets, DNS                    | blocked           | blocked          |
| `fetch` / `curl` outside the declared hosts          | blocked           | blocked          |
| Launch another app (`open`)                          | blocked on macOS  | **out of scope** |
| Apple Events (`osascript`) from a declared program   | **out of scope**  | **out of scope** |
| Linux `xdg-open` / D-Bus from a declared program     | **out of scope**  | **out of scope** |
| Write to a synced folder (iCloud, Dropbox, OneDrive) | only if granted   | **out of scope** |
| Write to a git repo that auto-pushes                 | only if granted   | **out of scope** |
| Clipboard, print, screen capture                     | **out of scope**  | **out of scope** |

## Manual canary: app launch

Shows that `open` bypasses the socket fence for a full-Node page. It launches a browser;
run it on a machine you control.

1. Start a listener: `python3 -m http.server 8000`
2. In a page with `resworb-node`:
   `require('child_process').execSync('open http://127.0.0.1:8000/canary')`
3. If the listener logs `/canary`, another application made the request on the page's
   behalf.

The same page without `resworb-node`, with `<meta name="resworb-run" content="open">` and
`resworb.run('open', ['http://127.0.0.1:8000/canary'])`, must fail on macOS. With
`osascript -e 'tell application "Safari" to open location "..."'` as the declared program,
it gets through: Apple Events are out of scope.

## Manual canary: file sync

1. From a page, write a file into a granted folder synced by iCloud Drive, Dropbox or
   OneDrive.
2. If the sync client uploads it, the bytes left the machine without a socket.

This is why the README does not say "cannot send anything anywhere".
