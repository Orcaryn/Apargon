# AGENTS.md

resworb is an Electron app that opens an HTML file from disk with `require()` enabled
and no network. The OS denies the page's process sockets and DNS, child processes
included. A browser gives a page the network and no files; resworb gives a page the files
and no network. The point is that a single HTML file is the quickest viewer or editor over
files on your own machine, and in resworb it can also save.

A page gets less than a script already has: anything it can do, a Node script on the same
machine can do plus reach the internet. A page is code the user chose to run, by
double-click or on the command line. resworb never fetches a page or runs one on its own.

## Vocabulary

- **`.lmth`** — a page with Node and no network. (`html` reversed.)
- **`.nmth`** — the same, plus the `host:port` list declared in its `<meta name="resworb-net">`
  tags, after the user approves that list once.
- **trampoline** — the first process. It has network. It relaunches itself inside the OS
  sandbox (`sandbox-exec` on macOS, `bwrap --unshare-net` on Linux) and, for `.nmth`,
  runs the loopback proxy that forwards to the declared hosts only. Declared `localhost:`
  ports are allowed in the profile directly, without the proxy.
- **offline process** — the sandboxed copy. It opens the window. Before that it checks it
  cannot bind a loopback port; if it can, it refuses. `test/refuse.ts` proves this.
- **fence** — the socket/DNS denial. It is the only thing the sandbox blocks.

## What the fence does not cover

A page has full file access and `child_process`, so it can launch another app that has
network, write into a synced folder, or use the clipboard. Approval is remembered by file
path and host list, not content. `SECURITY.md` is the full list. resworb is for pages the
user trusts.

## Working on it

`pnpm test` runs refuse.ts, then `selftest.lmth`, then `selftest.nmth`. macOS works end to
end; Linux has `.lmth` only; Windows refuses to open pages. `RESWORB_TEST_ALLOW=1`
auto-answers the `.nmth` dialog in dev builds only.

`main.ts` and the tests are TypeScript with no build step: Electron's Node strips the types
and runs the file as is, packaged too. Use only syntax that erases (no `enum`, `namespace` or
constructor parameter properties) and keep `"type": "module"`; a `.ts` file with `require`
does not load. `pnpm lint` runs `tsc`, which only checks, then ESLint.

A dialog saying the process can open sockets is the offline check working. Find out why
the process is not in the sandbox; do not skip the check.

## Rules

- Keep the fence strict. Changes to `sandbox/macos.sb`, `canBindLoopback`, `startProxy`
  or `declaredHosts` keep `pnpm test` green and add no way to skip the offline check.
- The window loads only `file:` URLs. A link to a declared host does not navigate; no new
  windows.
- Host list entries are `host:port`, one per `<meta>`. No wildcards, schemes or bare hosts.
- No network calls from the app itself: no update check, crash reporter or telemetry.
- `main.ts` stays one readable file.
- Pages follow `skills/resworb/SKILL.md`. Prefer `.lmth`; use `.nmth` only for a named
  server, listing only the hosts the page calls.
- Any new gap goes in `SECURITY.md` under "What is not enforced". The project claims
  exactly what it does and no more.
