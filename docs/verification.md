# Verification

## Automated

```sh
pnpm test
```

- `test/daemons.ts` runs first, on macOS only. It checks that the two macOS services that fetch for a process answer outside the sandbox. Otherwise the `test/leak` row below would prove nothing.
- `test/check.ts` runs last. It prints every result and fails the run if one is not `true`.

| Word    | Means                                   |
| ------- | --------------------------------------- |
| refused | resworb or its proxy stopped the action |
| blocked | the kernel stopped it                   |

| Page                                  | Check                                             | Expected        |
| ------------------------------------- | ------------------------------------------------- | --------------- |
| any                                   | process handed `RESWORB` by hand, no sandbox      | refuses to open |
| popup (`popup.ts`, macOS)             | `~/LIBRARY`, `~/DOCUMENTS` typed in another case  | red             |
| popup                                 | a line break or right-to-left mark in a value     | refused         |
| writes only (`selftest.lmth`)         | no `require`, no `process`                        | absent          |
| writes only                           | read, list in its own folder and a subfolder      | works           |
| writes only                           | write in its own folder or a subfolder, unnamed   | refused         |
| writes only                           | write, delete a file `scratch*` names             | works           |
| writes only                           | write a page `scratch*` matches, a page beside it | refused         |
| writes only                           | rename onto a page, rename a page away            | refused         |
| writes only                           | read or write outside it, list `~`                | refused         |
| writes only                           | write a hidden file, also below a match           | refused         |
| writes only                           | `watch` a folder, a file renamed over             | reports change  |
| writes only                           | `watch` outside its folder, a hidden file         | refused         |
| writes only                           | `readFile` with options `{ flag: 'w' }`           | refused         |
| writes only                           | `<script src>` outside its folder                 | refused         |
| writes only                           | `run`                                             | refused         |
| writes only                           | `fetch`                                           | blocked         |
| writes only                           | notifications, clipboard read, camera, microphone | denied          |
| `resworb-node` (`selftest-node.lmth`) | `fs` anywhere, `child_process`                    | works           |
| `resworb-node`                        | write resworb's `grants.json`                     | blocked         |
| `resworb-node`                        | `curl`, `fetch`, DNS                              | blocked         |
| `resworb-node`, macOS                 | background download, `WKWebView` (`test/leak`)    | blocked         |
| `resworb-node`, Linux                 | see processes outside the sandbox                 | blocked         |
| `resworb-node`, Linux                 | share the session of the terminal it started from | blocked         |
| `resworb-node`, Linux                 | see the runtime folder (D-Bus, sound server)      | blocked         |
| net and run (`selftest-net.lmth`)     | declared host by `curl`, by `fetch` (https, http) | works           |
| net and run                           | `*.example.org` reaches `www.example.org`         | works           |
| net and run                           | `*.example.org` reaches `example.org`             | refused (403)   |
| net and run                           | undeclared host by `curl`, by `fetch`             | refused (403)   |
| net and run                           | `curl --noproxy '*'` to a declared host           | blocked         |
| net and run                           | `*:9` to `0.0.0.1`                                | refused (403)   |
| net and run, macOS                    | `*:9` to this computer's LAN address              | refused (403)   |
| net and run                           | `resworb-read` folder: read / write               | works / refused |
| net and run                           | program writes a `resworb-write` match            | works           |
| net and run                           | program reads `input` on stdin                    | works           |
| net and run                           | program writes outside it                         | blocked         |
| net and run, macOS                    | program writes a hidden file                      | blocked         |
| net and run, macOS                    | program writes its own folder, unnamed            | blocked         |
| net and run, macOS                    | program creates a page                            | blocked         |
| net and run, macOS                    | program opens another app (`open -a Finder`)      | blocked         |
| net and run, macOS                    | program writes preferences (`defaults write`)     | blocked         |
| net and run                           | undeclared program                                | refused         |
| net and run                           | `run` with options in place of its arguments      | refused         |

Rows marked macOS run only there. On Linux the sandbox does not stop hidden writes or opening apps (see SECURITY.md), `defaults` and `test/leak` do not exist, and a program inside the sandbox cannot see the LAN address.

`test/refuse.ts` cannot tell a refusal from an app that never started: neither leaves a result. Check its output, or run the control in [Linux](#linux).

The raw results are in `test/result.json`, `test/result-node.json` and `test/result-net.json`.

## Linux

Last run 2026-10-25 on a headless Ubuntu 24.04 server (x86_64, kernel 6.8, `apparmor_restrict_unprivileged_userns = 1`), as an ordinary user. Every check not marked macOS passed: 16 without tags, 6 with full Node, 16 with servers and programs.

The installed app ignores `RESWORB_TEST_ALLOW`, so the run tests it as a user runs it:

1. Build: `pnpm dist:linux`. Install: `sudo apt install ./dist/resworb_0.1.0_amd64.deb xvfb xauth`.
2. Run the page without tags: `xvfb-run -a resworb test/selftest.lmth`.
3. Approve the two pages with tags once, at a real display. Without one, write their approvals to `~/.config/resworb/grants.json`: each page's real path, mapped to the sorted `id`s of `describe(declaredPermissions(page))`.
4. Run them: `xvfb-run -a resworb test/selftest-node.lmth`, then `test/selftest-net.lmth`.
5. Check: `node test/check.ts`.
6. Refusal, with a control: run `resworb test/selftest.lmth` with `RESWORB` set by hand to a `ChildConfig` for it. No `test/result.json` may appear. Then run it normally: now one must.

On 2026-10-25 the hidden runtime folder, own process list and own session were also checked with `pnpm test` from source, in Docker on Ubuntu 24.04 with a setuid `bwrap`, a session D-Bus at `/run/user/1000/bus` and a terminal. Without them a full-Node page reached the bus, saw every process and could open the terminal; with them it could do none of these, and every Linux check passed. The container needed `SYS_ADMIN`, `NET_ADMIN` and `SYS_PTRACE` and no seccomp, AppArmor or `/proc` masking for `bwrap`, and `ELECTRON_DISABLE_SANDBOX=1` for the trampoline's Chromium.

The run found three packaging bugs, now fixed in `package.json`: the `.deb` lacked `bubblewrap` and `libasound2t64`, and it could not be built without a maintainer and a homepage.

## Egress matrix

"Stopped" means the page and its children cannot use the channel. "Out of scope" means the sandbox does not see it.

| Channel                                              | Without full Node | With full Node   |
| ---------------------------------------------------- | ----------------- | ---------------- |
| TCP/UDP sockets, raw sockets, DNS                    | stopped           | stopped          |
| `fetch` / `curl` outside the declared hosts          | stopped           | stopped          |
| Launch another app (`open`)                          | stopped on macOS  | **out of scope** |
| Apple Events (`osascript`) from a declared program   | **out of scope**  | **out of scope** |
| Linux session D-Bus (`systemd-run --user`, portal)   | stopped           | stopped          |
| Linux X11, other Unix sockets (system D-Bus, Docker) | **out of scope**  | **out of scope** |
| Write to a synced folder (iCloud, Dropbox, OneDrive) | only if granted   | **out of scope** |
| Write to a git repo that auto-pushes                 | only if granted   | **out of scope** |
| Clipboard write, print                               | **out of scope**  | **out of scope** |

## Manual canary: app launch

This shows that `open` gets around the socket block for a full-Node page. It launches a browser, so run it on a machine you control.

1. Start a listener: `python3 -m http.server 8000`
2. In a page with `resworb-node`, run `require('child_process').execSync('open http://127.0.0.1:8000/canary')`
3. If the listener logs `/canary`, another app made the request for the page.

Then repeat it in a page without `resworb-node`:

| Declared program and call                                                                    | Expected on macOS                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `resworb-run` `open`; `resworb.run('open', ['http://127.0.0.1:8000/canary'])`                | fails                                       |
| `resworb-run` `osascript`; `osascript -e 'tell application "Safari" to open location "..."'` | gets through: Apple Events are out of scope |

## Manual canary: file sync

1. From a page, write a file into a granted folder that iCloud Drive, Dropbox or OneDrive syncs.
2. If the sync client uploads it, the bytes left the machine without a socket.

That is why the README never says a page "cannot send anything anywhere".
