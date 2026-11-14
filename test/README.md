# Tests

`pnpm test` runs `run.ts`, on macOS, Linux and Windows: the scripts in this order, the `.papp` files after `daemons.ts`, and `check.ts` last. A step that fails, or still runs after 5 minutes, stops the run. `fixtures.ts` makes `~/.ssh` if missing, clears the last run's results, and picks a folder and a file for `selftest.papp` in Apargon's records, as the user would in the dialog.

## `node/`

Plain Node, without the app, on `node:test`. Each runs alone too, as `node --test test/node/tags.ts`.

| File             | Checks                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tags.ts`        | how tags are read, what each one's popup line says, and every old tag and form refused                                                                |
| `access.ts`      | where a `.papp` file may write: its own folder, `papp-write`, `papp-write all` but Apargon's own                                                      |
| `records.ts`     | each `.papp` file's own folder name, and the record of its yes, picks and window                                                                      |
| `proxy.ts`       | the proxy reaches only the exact sites and ports named, never itself, and logs each try                                                               |
| `programs.ts`    | a program the trampoline starts keeps its output until the `.papp` file asks for it, even once it has exited                                          |
| `mux.ts`         | Linux's relay pipe carries each connection both ways, and closes it, and a stuck one holds back only itself                                           |
| `streams.ts`     | bytes between the trampoline and the `.papp` file's process arrive whole, only as fast as the receiver takes them, and stop when either side gives up |
| `seccomp.ts`     | Linux's socket filter makes only internet and netlink sockets and non-datagram `AF_UNIX` pairs, refuses `io_uring`, and lets every other call run     |
| `serve.ts`       | the `.papp` file is served as the bytes approved, and ranges for media                                                                                |
| `connections.ts` | `papp.connect` cancels a pending connection on reload                                                                                                 |
| `listeners.ts`   | the trampoline's listeners                                                                                                                            |
| `menus.ts`       | menu and tray items reach Electron with no role or click of their own                                                                                 |
| `protocol.ts`    | every line the `.papp` file's process sends ends in its own handler                                                                                   |
| `env.ts`         | no variable passed without a `papp-env` tag can carry a login or key                                                                                  |
| `platforms.ts`   | only a `platform/` folder asks which OS this is                                                                                                       |

## `selftest/`

The app on real `.papp` files.

| File                 | Checks                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refuse.ts`          | the `.papp` file's process refuses to open while it has network                                                                                       |
| `daemons.ts`         | macOS: the services `swift/leak.swift` asks would fetch outside the sandbox, so `selftest-mac` is a real test. Builds `results/leak`                  |
| `listen.ts`          | nothing: runs a `.papp` file while ports and socket files listen: one each it names, one each it doesn't, and a plain port that counts who reaches it |
| `trampoline-gone.ts` | the `.papp` file quits when the trampoline dies, and not before                                                                                       |
| `check.ts`           | every `.papp` file wrote every check for this platform, all true                                                                                      |

### `selftest/pages/`

Each writes `selftest-result-<name>.json` to its own folder, `~/.apargon/<name>`, and `check.ts` reads it there.

| File                         | Result         | Runs as                                                                                                      |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `selftest.papp`              | `plain`        | no tags: reads everywhere, writes its own folder and where the user picked, big files whole, no network      |
| `selftest-net.papp`          | `net`          | sites, `localhost` ports, a listener, programs, a bundled program, an unfenced one, a variable, `papp-write` |
| `selftest-socket.papp`       | `socket`       | `papp-socket`: one socket file                                                                               |
| `selftest-system.papp`       | `system`       | `papp-system`: Node, no limits                                                                               |
| `selftest-mac.papp`          | `mac`          | macOS only: programs with no services, no mounts, no devices; written files marked; window settings          |
| `selftest-win.papp`          | `win`          | Windows only: network paths, file streams, the proxy                                                         |
| `selftest-win-programs.papp` | `win-programs` | Windows only: programs, variables, `curl` through the proxy                                                  |
| `selftest-win-devices.papp`  | `win-devices`  | Windows only: the device capabilities in the sandbox's token, read by `tokencaps`                            |

- `lib.js` holds what every page shares: `result`, `refused`, `ran` and `finish`.
- `stay.papp` asks for nothing and stays open: `trampoline-gone.ts` opens it.
- `subfolder/` holds a file to read, a frame, and a video to seek.
- `bin/greet` is the program `selftest-net.papp` ships.
- `touched/` is the folder `selftest-net.papp` names in `papp-write`.
- `results/` holds what the run makes: `leak`, the sockets, and `picked/` and `picked-file.txt`, which `selftest.papp` writes through Apargon. Git ignores it.
- `windows/tokencaps.cs` is the source of `tokencaps`. Build it once, as administrator, onto PATH: `Add-Type -TypeDefinition (Get-Content -Raw test\selftest\windows\tokencaps.cs) -OutputAssembly "$env:SystemRoot\tokencaps.exe" -OutputType ConsoleApplication`.
- A refusal check passes only on Apargon's own error (`Apargon: …`), or on the one named beside it. Any other error, or none, goes to `refused_wrongly`, which `check.ts` shows.
- `listen_localhost_only` needs a network address on this computer: offline, `selftest-net` fails.
- A new check goes in its page and in `check.ts`'s list for its platform.
