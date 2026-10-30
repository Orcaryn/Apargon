# AGENTS.md

Apargon runs a `.papp` file, one HTML file, as a desktop app. The page gets what its `<meta>` tags ask for; the OS denies it the network. `src/trampoline/` is the first process, with network; `src/page/` is the sandboxed copy, which refuses to open the window unless it proves it is offline.

## Rules

- Keep the fence strict. A change to any of these keeps `pnpm test` green and adds no way to skip the offline check: `sandbox/macos.sb`, `seatbeltProfile`, `bwrapArgs`, `PRIVATE`, `canBindLoopback`, `inEmptyNetwork`, `startProxy`, `privateNetwork`, `relay`, `declaredPermissions`, `socketPath`, `patternSource`, `PAGE_SOURCE`, `changeableSources`, `pageAccess`, `pageApi`, `saveFiles`, `SECRETS`, `PROGRAM_ENV`, `PAGE_ENV`.
- `patternSource` and `PAGE_SOURCE` are the one pattern matcher, for Seatbelt and for Apargon's own checks. Do not write a second.
- The window shows only the page: no navigation, no frame of another file, a new window only on the page itself.
- The app's one network call of its own is the update check, from the trampoline. No telemetry, no crash reporter.
- The popup is fed text, never HTML. Its colour depends on how a value is written, not on where it leads.
- The dialog "This process can still open sockets" means the offline check worked. Find out why the process is not sandboxed. Never skip the check.
- Every new gap goes in `SECURITY.md` under "Not enforced". Claim exactly what the code does.

## Tests

`pnpm test` needs Node 22.18+; on Linux also a setuid `bwrap` and Electron's `chrome-sandbox` in `node_modules` root-owned, mode 4755. A new self-test check goes in `test/check.ts`'s list for its platform. `APARGON_TEST_ALLOW=1` answers the popup in dev builds only.

`release.sh` does not run the Linux checks. Before a release, on Ubuntu 24.04:

1. `pnpm dist:linux`, then `sudo apt install ./dist/*.deb xvfb xauth`.
2. Approve `test/pages/selftest.papp`, `selftest-node.papp` and `selftest-net.papp` once (`selftest-mac.papp` is macOS only) at a display, or write `~/.config/apargon/grants.json` (lowercase: Electron names it after `package.json`'s `name`): each page's real path mapped to the sorted `id`s of `describe(declaredPermissions(page))`. Also write `~/.config/apargon/welcome.json` as `{"welcomed": true}`, or the first run waits on the skill offer.
3. Delete `test/pages/result*.json`; make sure `~/.ssh` exists.
4. `xvfb-run -a apargon test/pages/selftest.papp`, then `selftest-node.papp`, then `APARGON_TEST_ENV=passed xvfb-run -a apargon test/pages/selftest-net.papp`, as `package.json`'s test line sets it; then `node test/check.ts`.
5. Refusal, with a control: run `apargon test/pages/selftest.papp` with `APARGON` set by hand to a `ChildConfig`; no `test/pages/result.json` may appear. Run it normally; now one must.
6. Record date and result in `SECURITY.md` under "Verification".

## Releases

`./release.sh --major | --minor | --patch` is the only way. Do not add a way to skip a check. `release-notes/<version>.md` is for users, security fixes first.
