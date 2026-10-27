# AGENTS.md

Apargon is an Electron app that opens an HTML file from disk.

- A browser gives a page the network and no files.
- Apargon gives a page files and no network.

The point: a single HTML file is the quickest viewer or editor for files on your machine, and in Apargon it can also save.

## How a page gets access

A page asks in `<meta>` tags for what it needs: folders to see or change, servers to reach, programs to run, or full Node.

| Page      | Gets                   | Asks first?                         |
| --------- | ---------------------- | ----------------------------------- |
| no tags   | its own folder, to see | no; a downloaded page is asked once |
| with tags | what the tags list     | yes, in a popup                     |

The OS denies sockets and DNS to the page's process and every process it starts.

A page is code the user chose to run, by double-click or from the command line. Apargon never fetches a page or runs one on its own.

## Vocabulary

**`.papp`.** A page: a personal app.

**Tags.** `papp-read`, `papp-write`, `papp-net`, `papp-run`, `papp-env`, `papp-socket`, `papp-use`, `papp-shortcut`, `papp-node`. One value per `<meta>`, read from disk before the page runs: from `<head>` up to the first `<script`, `<body` or `</head`, comments skipped.

**`window.papp`.** The only way out for a page without full Node. `src/page/preload.cjs` forwards each call; `pageApi` in `src/page/api.ts` checks it.

**Fence.** The block on sockets and DNS. A page without full Node also writes only to its granted folders: on macOS by pattern, on Linux by folder. On macOS it also:

- cannot open or script other apps;
- cannot write app settings.

On Linux it also empties the folders where socket files live (`/run`, `/tmp`, `/var/tmp`: D-Bus, the name lookup service, the sound server, tmux, screen, Docker) but for the display's socket and what the tags name, shows a page only its own relay sockets, and gives the page its own process list and session.

Both hide keys and logins (`SECRETS`) from the page and its programs unless a tag names one, and give the page's process a short environment (`PAGE_ENV`) and a program a shorter one (`PROGRAM_ENV`), plus the `papp-env` names. On Linux a tag may not open `/tmp` or `/var/tmp` whole, or anything at or under `/run`, and a page may not sit in one (`PRIVATE`).

**Own folder.** The page's folder, unless that is `/`, `~`, Desktop, Documents or Downloads, or the page has full Node.

- To see only, with its subfolders, hidden files left out. Writes need `papp-write`.
- With no tags: granted without asking for a page made here. A downloaded page is asked once, so its site is seen.
- With tags: listed in the popup.

**Pages are not writable by default.** A `papp-write` pattern reaches a `.papp` only if it ends in `.papp`, which the popup marks red. Otherwise a page could rewrite another approved for more. `PAGE_SOURCE` in `src/permissions/patterns.ts` is the rule for both Seatbelt and Apargon's checks.

**Trampoline.** The first process, with network. It:

1. reads the tags and shows the popup;
2. relaunches itself in the OS sandbox (`sandbox-exec` on macOS, `bwrap --unshare-net` on Linux);
3. for `papp-net`, runs the proxy that forwards only to declared hosts: on a loopback port on macOS, on a socket file on Linux;
4. once a day at most, asks GitHub for a new version (`src/trampoline/update.ts`). macOS installs it on the next start; Linux shows a notice;
5. shows notifications for the page on Linux, where they need D-Bus, and owns the tray icon on both platforms. The page asks on fd 3 (`MESSAGE_FD`); a tray click comes back on fd 5 (`PARENT_FD`).

Declared `localhost` and `127.0.0.1` ports skip the proxy. On macOS the sandbox profile lets them through; on Linux the trampoline relays each from a socket file. Only the trampoline writes `grants.json`.

**Offline process.** The sandboxed copy. Before it opens the window, it checks that it is offline. If it is not, or cannot tell, it refuses. `test/refuse.ts` proves this.

- macOS: it must fail to bind a loopback port with `EPERM` (`canBindLoopback`); any other failure refuses too.
- Linux: `bwrap` gives it a loopback it may bind, so it asks the kernel instead. Its network must hold only `lo` and differ from the trampoline's, which arrives on fd 4 (`inEmptyNetwork`).

On Linux it then relays its own loopback ports to the trampoline's socket files. The page reaches the proxy and the declared ports at the same addresses as on macOS.

## What the fence does not cover

- Apargon enforces read grants, not the OS.
- A declared program can read every file but keys and logins (`SECRETS` in `src/permissions/tags.ts`).
- A full-Node page can launch another app that has network, write into a synced folder, or use the clipboard.
- An approval is remembered by file path and permission list, not content, unless the page is marked as downloaded.

`SECURITY.md` has the full list.

## Working on it

### Tests

`pnpm test` runs, in order:

1. `popup.ts`: popup colours, and values the popup cannot show.
2. `refuse.ts`: the offline check.
3. `daemons.ts` (macOS only): builds `test/leak` with `swiftc` and checks that system services fetch for it outside the sandbox.
4. `selftest.papp` (only writes, for its results), `selftest-node.papp` and `selftest-net.papp`.
5. `check.ts`: fails if any result is not `true`, is missing, or is not in its list for the platform. A new check goes in that list.

On Linux, `daemons.ts` and the checks marked macOS skip.

`pnpm lint` runs `tsc` (types only), then ESLint.

In dev builds only, `APARGON_TEST_ALLOW=1` answers the popup and prints what it would have listed.

### Develop

```sh
pnpm install
pnpm start       # examples/hello.papp
pnpm start:net   # examples/net.papp, popup answered for you
pnpm dist        # signed .dmg (Developer ID in the keychain)
pnpm dist:linux  # .deb, and an untested AppImage
```

The tests need:

- Node 22.18 or later, to run `.ts` files with plain `node`;
- on macOS, `swiftc`, from the Xcode Command Line Tools;
- on Linux, `bwrap`; on Ubuntu 23.10 and later also a setuid `bwrap` (`sudo chmod u+s /usr/bin/bwrap`) and Electron's `chrome-sandbox` in `node_modules` owned by root with mode 4755. Only the `.deb` brings the AppArmor profile that spares you this.

Notarization runs when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`, are set.

Icons are SVGs in `assets/`; `assets/make-icons.sh` renders them with `rsvg-convert`. A page's badge is `src/page/badge.svg`, drawn at run time.

### The installed `.deb`

`release.sh` does not run the Linux checks. Before a release, run them on the installed `.deb`, on Ubuntu 24.04. The installed app ignores `APARGON_TEST_ALLOW`, so this tests it as a user runs it:

1. `pnpm dist:linux`, then `sudo apt install ./dist/*.deb xvfb xauth`.
2. Approve the three self-test pages once, at a display. Without one, write their approvals to `~/.config/Apargon/grants.json`: each page's real path, mapped to the sorted `id`s of `describe(declaredPermissions(page))`.
3. Delete any `test/result*.json`. Make sure `~/.ssh` exists: `program_ssh_hidden` lists it.
4. `xvfb-run -a apargon test/selftest.papp`, then `test/selftest-node.papp`, then `test/selftest-net.papp`.
5. `node test/check.ts`.
6. Refusal, with a control: run `apargon test/selftest.papp` with `APARGON` set by hand to a `ChildConfig` for it. No `test/result.json` may appear. Run it normally: now one must.

Record the date and result in `SECURITY.md` under "Verification".

### Releases

`./release.sh --major | --minor | --patch` is the only way to release. It refuses before changing anything, and runs every check before it builds. Do not add a way to skip a check. Each release needs `release-notes/<version>.md`, written for users, with security fixes first: Linux users get a link to them and nothing else, and users who turned the update check off get nothing. `release.sh` also uploads the feeds installed copies read, `update-<platform>-<arch>.json`; a release without them reaches no one.

### Platforms

| Platform | State                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | works end to end                                                                                                                                                  |
| Linux    | every Linux check passes in the installed `.deb` on a headless Ubuntu 24.04 server; not yet run on a desktop; programs' writes are limited by folder, not pattern |
| Windows  | refuses to open pages; the plan is Microsoft's MXC, which waits for a Windows 11 machine to test on                                                               |

### TypeScript without a build

`src/` and the tests are TypeScript with no build step. Electron's Node strips the types and runs the files as they are, in packaged builds too. So:

- use only syntax that erases: no `enum`, `namespace` or constructor parameter properties;
- keep `"type": "module"`;
- import with the `.ts` extension;
- never use `require` in a `.ts` file; it does not load.

### Layout

| Path               | Holds                                       |
| ------------------ | ------------------------------------------- |
| `src/main.ts`      | works out which process it is and hands off |
| `src/permissions/` | the rules: tags, patterns, popup lines      |
| `src/trampoline/`  | the first process                           |
| `src/page/`        | the offline process                         |
| `src/shared.ts`    | what both processes need                    |

Each OS sits behind one interface per process: `SANDBOX` in `src/trampoline/platform.ts` (`seatbelt.ts`, `bwrap.ts`) starts the sandbox, and `PAGE_PLATFORM` in `src/page/platform.ts` (`macos.ts`, `linux.ts`) checks that the page is offline and shows notifications. A new platform adds one file to each. Smaller differences, in what the tags allow and what the popup says, stay in `src/permissions/`.

### "This process can still open sockets"

That dialog means the offline check worked. Find out why the process is not in the sandbox. Do not skip the check.

## Rules

**The fence**

- Keep it strict. A change to any of these must keep `pnpm test` green and add no way to skip the offline check: `sandbox/macos.sb`, `seatbeltProfile`, `bwrapArgs`, `PRIVATE`, `canBindLoopback`, `inEmptyNetwork`, `startProxy`, `privateNetwork`, `relay`, `declaredPermissions`, `socketPath`, `patternSource`, `PAGE_SOURCE`, `changeableSources`, `pageAccess`, `pageApi`, `SECRETS`, `PROGRAM_ENV`, `PAGE_ENV`.
- `patternSource` and `PAGE_SOURCE` are the one pattern source for Seatbelt and for Apargon's checks. Do not write a second matcher.
- The window shows only the page. A link to another file or to a declared host does not navigate, a frame does not load another file, and a new window opens only on the page itself: another file would run with the page's permissions.
- The app's one network call of its own is the update check, from the trampoline, never from the page process. No crash reporter or telemetry.

**The popup**

- It is `src/trampoline/popup.html` in a window of its own: static, no network (its CSP), and fed only text, never HTML.
- It says in plain words what each tag allows. The tags as written sit folded below the lines, for checking them.
- Red marks broad requests; yellow marks other wildcards.
- The colour depends on how a value is written, not on guesses about where it leads.
- Above the lines, what they allow together (`worstCase`), when that is more than any one line says. A page marked as downloaded leads with its site and is held to its content.
- A red line, or a `worstCase`, needs a checkbox wherever the page came from: `git clone`, `curl` and USB sticks leave no download mark.
- A device on the local network (`privateNetwork`) is declared by its address in numbers and one port, and is red: Apargon cannot tell what answers there. The proxy refuses a name that leads there. This computer's own addresses, loopback other than `127.0.0.1`, `0/8` and link-local `169.254/16` are refused before the popup. A server named by a public address is red.

**Tag values**

| Tag                       | Rule                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all                       | one value per `<meta>`                                                                                                                                                                                                                                                 |
| `papp-net`                | `host:port`; `*` only as the whole host, a leading `*.`, or the port; `*` alone means `*:*`; no schemes, no host without a port; on Linux, no `localhost:*`; a local-network address only in numbers, IPv4, with a numeric port                                        |
| `papp-read`, `papp-write` | `*` within a name; `*` alone is refused                                                                                                                                                                                                                                |
| `papp-run`, `papp-node`   | no wildcards                                                                                                                                                                                                                                                           |
| `papp-env`                | one variable name, no wildcards; only with `papp-run`                                                                                                                                                                                                                  |
| `papp-socket`             | one socket file or folder of them that exists now; no wildcards; always red                                                                                                                                                                                            |
| `papp-use`                | `notifications`, `clipboard`, `location`, `sound`, `camera`, `microphone` or `screen`; `location` is refused on Linux; `clipboard`, `location`, `camera` and `microphone` are yellow, `screen` red; with `papp-net` they join the `worstCase`                          |
| `papp-shortcut`           | modifiers and one key in Electron's spelling (`CommandOrControl+Shift+N`); two different modifiers, or one with a function key, so a page cannot take `Ctrl+C`; not only modifiers that type characters (Option and Shift on macOS, AltGr and Shift elsewhere); yellow |

**Code**

- `src/permissions/` imports no Electron.
- `src/trampoline/` and `src/page/` never import each other; what both need lives in `src/shared.ts`.
- Each file reads top down: its exported entry first, then helpers in the order they are called.

**Pages**

- Pages follow `skills/apargon/SKILL.md`.
- Ask for as little as the page needs. Use `papp-node` only when the page truly needs Node.

**Claims**

- Every new gap goes in `SECURITY.md` under "Not enforced".
- The project claims exactly what it does, no more.
