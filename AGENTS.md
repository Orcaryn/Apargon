# AGENTS.md

resworb is an Electron app that opens an HTML file from disk. A page asks in `<meta>`
tags for what it needs: folders to see or change, servers to reach, programs to run, or
full Node. With no tags it may use its own folder and nothing else, and opens without
asking; with tags the user approves the list in a popup first. The OS denies the page's
process sockets and DNS, child processes included. A browser gives a page the network and
no files; resworb gives a page files and no network. The point is that a single HTML file
is the quickest viewer or editor over files on your own machine, and in resworb it can
also save.

A page is code the user chose to run, by double-click or on the command line. resworb
never fetches a page or runs one on its own.

## Vocabulary

- **`.lmth`** — a page. (`html` reversed.)
- **tags** — `resworb-read`, `resworb-write`, `resworb-net`, `resworb-run`,
  `resworb-node`, one value per `<meta>`. Read from disk before the page runs.
- **own folder** — the page's folder, unless it is `/`, `~`, Desktop, Documents or
  Downloads. With no tags, the files in it only, granted without asking; with tags, its
  subfolders too, listed in the popup.
- **trampoline** — the first process. It has network. It reads the tags, shows the
  popup, and relaunches itself inside the OS sandbox (`sandbox-exec` on macOS,
  `bwrap --unshare-net` on Linux). For `resworb-net` it runs the loopback proxy that
  forwards to the declared hosts only. Declared `localhost:` ports are allowed in the
  profile directly, without the proxy. It alone writes `grants.json`.
- **offline process** — the sandboxed copy. It opens the window. Before that it checks it
  cannot bind a loopback port; if it can, it refuses. `test/refuse.ts` proves this.
- **`window.resworb`** — the only door for a page without full Node
  (`src/page/preload.cjs` forwards, `pageApi` in `src/page/api.ts` checks).
- **fence** — the socket/DNS denial, plus, on macOS for a page without full Node, writes
  limited to the granted folders and no opening other apps.

## What the fence does not cover

Read grants are enforced by resworb, not the OS. A declared program can read every file. A
full-Node page can launch another app that has network, write into a synced folder, or use
the clipboard. Approval is remembered by file path and permission list, not content.
`SECURITY.md` is the full list.

## Working on it

`pnpm test` runs popup.ts (popup colours), refuse.ts and daemons.ts (builds `test/leak`
with `swiftc` and checks system services fetch for it outside the sandbox), then `selftest.lmth` (no tags), `selftest-node.lmth` and
`selftest-net.lmth`, then `check.ts`, which fails if any result is not `true`. macOS works
end to end; Linux has no `resworb-net` and no OS write limits; Windows refuses to open
pages. `RESWORB_TEST_ALLOW=1` auto-answers the popup in dev builds only and prints what it
would have listed.

`src/` and the tests are TypeScript with no build step: Electron's Node strips the types
and runs the files as they are, packaged too. Use only syntax that erases (no `enum`,
`namespace` or constructor parameter properties), keep `"type": "module"`, and import with
the `.ts` extension; a `.ts` file with `require` does not load.

`src/main.ts` decides which process it is and hands off. `src/permissions/` holds the rules
(tags, patterns, popup lines); `src/trampoline/` and `src/page/` are the two processes. `pnpm lint` runs `tsc`, which only checks, then ESLint.

A dialog saying the process can open sockets is the offline check working. Find out why
the process is not in the sandbox; do not skip the check.

## Rules

- Keep the fence strict. Changes to `sandbox/macos.sb`, `seatbeltProfile`,
  `canBindLoopback`, `startProxy`, `declaredPermissions`, `patternSource`, `pageAccess` or
  `pageApi` keep `pnpm test` green and add no way to skip the offline check.
- One pattern source (`patternSource`) serves Seatbelt and resworb's checks. Do not write
  a second matcher.
- The popup says what a tag allows in plain words. Red marks broad requests, yellow other
  wildcards; the rules are about how a value is written, not guesses at what it leads to.
- The window loads only `file:` URLs. A link to a declared host does not navigate; no new
  windows.
- Tag values: one per `<meta>`. Hosts are `host:port`, with `*` only as the whole host,
  a leading `*.`, or the port; no schemes or bare hosts. Folders take `*` within a name;
  `*` alone is refused. Programs and `resworb-node` take no wildcards.
- No network calls from the app itself: no update check, crash reporter or telemetry.
- `src/permissions/` imports no Electron. `src/trampoline/` and `src/page/` never import
  each other; what both need is in `src/shared.ts`. Each file reads top down: its exported
  entry first, helpers below in the order they are called.
- Pages follow `skills/resworb/SKILL.md`. Ask for as little as the page needs; use
  `resworb-node` only when the page truly needs Node.
- Any new gap goes in `SECURITY.md` under "What is not enforced". The project claims
  exactly what it does and no more.
