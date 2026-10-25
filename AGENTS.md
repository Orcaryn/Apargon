# AGENTS.md

resworb is an Electron app that opens an HTML file from disk.

- A browser gives a page the network and no files.
- resworb gives a page files and no network.

The point: a single HTML file is the quickest viewer or editor for files on your machine, and in resworb it can also save.

## How a page gets access

A page asks in `<meta>` tags for what it needs: folders to see or change, servers to reach, programs to run, or full Node.

| Page      | Gets                         | Asks first?     |
| --------- | ---------------------------- | --------------- |
| no tags   | its own folder, nothing else | no              |
| with tags | what the tags list           | yes, in a popup |

The OS denies sockets and DNS to the page's process and every process it starts.

A page is code the user chose to run, by double-click or from the command line. resworb never fetches a page or runs one on its own.

## Vocabulary

**`.lmth`.** A page (`html` backwards).

**Tags.** `resworb-read`, `resworb-write`, `resworb-net`, `resworb-run`, `resworb-node`. One value per `<meta>`, read from disk before the page runs.

**`window.resworb`.** The only way out for a page without full Node. `src/page/preload.cjs` forwards each call; `pageApi` in `src/page/api.ts` checks it.

**Fence.** The block on sockets and DNS. A page without full Node also writes only to its granted folders: on macOS by pattern, on Linux by folder. On macOS it also:

- cannot open other apps;
- cannot write app settings.

On Linux it also hides the session's runtime folder (D-Bus, the sound server) but for the Wayland socket, and gives the page its own process list and session.

**Own folder.** The page's folder, unless that is `/`, `~`, Desktop, Documents or Downloads, or the page has full Node.

- With no tags: the files directly in it, granted without asking.
- With tags: its subfolders too, listed in the popup.

**Trampoline.** The first process, with network. It:

1. reads the tags and shows the popup;
2. relaunches itself in the OS sandbox (`sandbox-exec` on macOS, `bwrap --unshare-net` on Linux);
3. for `resworb-net`, runs the proxy that forwards only to declared hosts: on a loopback port on macOS, on a socket file on Linux.

Declared `localhost` and `127.0.0.1` ports skip the proxy. On macOS the sandbox profile lets them through; on Linux the trampoline relays each from a socket file. Only the trampoline writes `grants.json`.

**Offline process.** The sandboxed copy. Before it opens the window, it checks that it is offline. If it is not, or cannot tell, it refuses. `test/refuse.ts` proves this.

- macOS: it must fail to bind a loopback port (`canBindLoopback`).
- Linux: `bwrap` gives it a loopback it may bind, so it asks the kernel instead. Its network must hold only `lo` and differ from the trampoline's, which arrives on fd 4 (`inEmptyNetwork`).

On Linux it then relays its own loopback ports to the trampoline's socket files. The page reaches the proxy and the declared ports at the same addresses as on macOS.

## What the fence does not cover

- resworb enforces read grants, not the OS.
- A declared program can read every file.
- A full-Node page can launch another app that has network, write into a synced folder, or use the clipboard.
- An approval is remembered by file path and permission list, not content.

`SECURITY.md` has the full list.

## Working on it

### Tests

`pnpm test` runs, in order:

1. `popup.ts`: popup colours, and values the popup cannot show.
2. `refuse.ts`: the offline check.
3. `daemons.ts` (macOS only): builds `test/leak` with `swiftc` and checks that system services fetch for it outside the sandbox.
4. `selftest.lmth` (no tags), `selftest-node.lmth`, `selftest-net.lmth`.
5. `check.ts`: fails if any result is not `true`.

On Linux, `daemons.ts` and the checks marked macOS skip. From source on Ubuntu 23.10 and later, the sandbox needs the setup in the README's Develop section. `docs/verification.md` tests the installed `.deb` instead.

`pnpm lint` runs `tsc` (types only), then ESLint.

In dev builds only, `RESWORB_TEST_ALLOW=1` answers the popup and prints what it would have listed.

### Platforms

| Platform | State                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | works end to end                                                                                                                                                  |
| Linux    | every Linux check passes in the installed `.deb` on a headless Ubuntu 24.04 server; not yet run on a desktop; programs' writes are limited by folder, not pattern |
| Windows  | refuses to open pages                                                                                                                                             |

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

### "This process can still open sockets"

That dialog means the offline check worked. Find out why the process is not in the sandbox. Do not skip the check.

## Rules

**The fence**

- Keep it strict. A change to any of these must keep `pnpm test` green and add no way to skip the offline check: `sandbox/macos.sb`, `seatbeltProfile`, `bwrapArgs`, `canBindLoopback`, `inEmptyNetwork`, `startProxy`, `relay`, `declaredPermissions`, `patternSource`, `changeableSources`, `pageAccess`, `pageApi`.
- `patternSource` is the one pattern source for Seatbelt and for resworb's checks. Do not write a second matcher.
- The window loads only `file:` URLs. A link to a declared host does not navigate, and no new windows open.
- The app makes no network calls of its own: no update check, crash reporter or telemetry.

**The popup**

- It says in plain words what each tag allows.
- Red marks broad requests; yellow marks other wildcards.
- The colour depends on how a value is written, not on guesses about where it leads.
- A page marked as downloaded leads with its site and with what its lines allow together (`worstCase`), and must be trusted with a checkbox. A page made here is the user's code: no checkbox.

**Tag values**

| Tag                             | Rule                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all                             | one value per `<meta>`                                                                                                                                      |
| `resworb-net`                   | `host:port`; `*` only as the whole host, a leading `*.`, or the port; `*` alone means `*:*`; no schemes, no host without a port; on Linux, no `localhost:*` |
| `resworb-read`, `resworb-write` | `*` within a name; `*` alone is refused                                                                                                                     |
| `resworb-run`, `resworb-node`   | no wildcards                                                                                                                                                |

**Code**

- `src/permissions/` imports no Electron.
- `src/trampoline/` and `src/page/` never import each other; what both need lives in `src/shared.ts`.
- Each file reads top down: its exported entry first, then helpers in the order they are called.

**Pages**

- Pages follow `skills/resworb/SKILL.md`.
- Ask for as little as the page needs. Use `resworb-node` only when the page truly needs Node.

**Claims**

- Every new gap goes in `SECURITY.md` under "Not enforced".
- The project claims exactly what it does, no more.
