# AGENTS.md

Apargon runs a `.papp` file, one HTML file, as a desktop app. The `.papp` file gets what its `<meta>` tags ask for; the OS denies it the network. `src/trampoline/` is the first process, with network; `src/page/` is the sandboxed copy, which refuses to open the window unless it proves it is offline.

Call the `.papp` file the `.papp` file, not the page.

## Rules

- Keep the fence strict. A change to any of these keeps `pnpm test` green and adds no way to skip the offline check: `src/trampoline/platform/profiles/macos.sb`, `seatbeltProfile`, `bwrapArgs`, `PRIVATE`, `canBindLoopback`, `inEmptyNetwork`, `startProxy`, `privateNetwork`, `relay`, `startPage`, `createPageSession`, `declaredPermissions`, `socketPath`, `patternSource`, `PAGE_SOURCE`, `changeableSources`, `pageAccess`, `pageApi`, `saveFiles`, `SECRETS`, `PROGRAM_ENV`, `PAGE_ENV`, `connectError`, `UNROUTED`, the MXC request in `windows.prepare`, `refuse`, `refusePath`, `refusedTags`, `hostPattern`, `openLink`, `markDownloaded`, `pickFiles`, `checkPick`, `withGiven`, `pageListeners`, `readSecret`, `writeSecret`, `SECRETS_DATA`, `PERMISSIONS_PLATFORM` and its `src/permissions/platform/`.
- What differs by OS goes in the folder's `platform/macos.ts`, `linux.ts` or `windows.ts`, picked in the `platform.ts` beside it: `PERMISSIONS_PLATFORM` in `src/permissions/` for what a `.papp` file may ask (no Electron, so the Node tests run it), `TRAMPOLINE_PLATFORM` and `PAGE_PLATFORM` for each process. No other file in `src/` asks `process.platform`; `test/node/platforms.ts` checks. Tests may ask.
- `patternSource` and `PAGE_SOURCE` are the one pattern matcher, for Seatbelt and for Apargon's own checks. Do not write a second.
- The window shows only the `.papp` file: no navigation, no frame of another file, a new window only on the `.papp` file itself.
- The app's one network call of its own is the update check, from the trampoline. No telemetry, no crash reporter.
- The popup is fed text, never HTML. Its colour depends on how a value is written, not on where it leads.
- The dialog "This process can still open sockets" means the offline check worked. Find out why the process is not sandboxed. Never skip the check.
- Every new gap goes in `SECURITY.md` under "Not enforced". Claim exactly what the code does.

## Tests

`pnpm test` needs Node 22.18+; on Linux also a setuid `bwrap` and Electron's `chrome-sandbox` in `node_modules` root-owned, mode 4755. A new self-test check goes in `test/selftest/check.ts`'s list for its platform. `APARGON_TEST_ALLOW=1` answers the popup in dev builds only.

`release.sh` does not run the Linux checks. Before a release, on Ubuntu 24.04:

1. `pnpm dist:linux`, then `sudo apt install ./dist/*.deb xvfb xauth`.
2. Approve `test/selftest/pages/selftest.papp`, `selftest-system.papp` and `selftest-net.papp` once (`selftest-mac.papp` is macOS only) at a display, or write one file per `.papp` file in `~/.config/apargon/pages-saved/` (lowercase: Electron names it after `package.json`'s `name`), named the sha256 of the `.papp` file's real path plus `.json`, holding `{"page": <real path>, "grant": <sorted ids of describe(declaredPermissions(page))>}`. Make `selftest-net.papp`'s under `node test/selftest/listen.ts <command>`: its `papp-socket` file must exist. Also write `~/.config/apargon/welcome.json` as `{"welcomed": true}`, or the first run waits on the skill offer.
3. Delete `test/selftest/pages/results/result*.json`; make sure `~/.ssh` exists.
4. `xvfb-run -a apargon test/selftest/pages/selftest.papp`, then `selftest-system.papp`, then `APARGON_TEST_ENV=passed node test/selftest/listen.ts xvfb-run -a apargon test/selftest/pages/selftest-net.papp`, as `test/run.ts` sets it; then `node test/selftest/check.ts`.
5. Refusal, with a control: run `apargon test/selftest/pages/selftest.papp` with `APARGON` set by hand to a `PageConfig`; no `test/selftest/pages/results/result.json` may appear. Run it normally; now one must.
6. Record date and result in `SECURITY.md` under "Verification".

## Releases

`./release.sh --major | --minor | --patch` is the only way. Do not add a way to skip a check. `release-notes/<version>.md` is for users, security fixes first.
