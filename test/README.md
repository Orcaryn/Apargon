# Tests

`pnpm test` runs `run.ts`, on macOS, Linux and Windows: the scripts in this order, the pages after `daemons.ts`, and `check.ts` last. A step that fails, or still runs after 5 minutes, stops the run. It makes `~/.ssh`, and on Windows `~/Documents`, if missing: the checks that the sandbox hides them need them.

## `node/`

Plain Node, without the app.

| File           | Checks                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `platforms.ts` | that no file outside a `platform.ts` asks which OS this is                                                                        |
| `preload.ts`   | that a `papp-system` page outside Apargon's folder finds `@electron/remote`                                                       |
| `popup.ts`     | how tags are read and what the popup shows for them                                                                               |
| `storage.ts`   | one file per page, and that a page's storage follows it when it moves, only then                                                  |
| `menus.ts`     | that a page's menu and tray items reach Electron with no role or click of their own                                               |
| `env.ts`       | that no variable passed without a `papp-env` tag can carry a login or key                                                         |
| `protocol.ts`  | that every line a page sends ends in its own handler: each call answered once, by value or error, and no name of Object's reached |

## `selftest/`

The app on real pages.

| File         | Checks                                                                                                                                                                                                            | Needs Electron |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `refuse.ts`  | that the page process refuses to open while it has network                                                                                                                                                        | yes            |
| `daemons.ts` | macOS: that the system services `swift/leak.swift` asks would fetch from outside the sandbox, so `selftest-system` is a real test                                                                                 | no             |
| `listen.ts`  | nothing: runs a page while a port and a socket file it declares, and one of each it does not, listen; `/reach` tells the page whether its own listener answers on loopback and on this computer's network address | no             |
| `check.ts`   | that every page wrote every check for this platform, all true                                                                                                                                                     | no             |

### `selftest/pages/`

The pages Apargon opens, one per kind of access. Each writes its results to `results/`, and `check.ts` reads them.

| Page                         | Writes                     | Runs as                                                                                             |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `selftest.papp`              | `result.json`              | a plain page: reads its own folder, writes two files                                                |
| `selftest-system.papp`       | `result-system.json`       | `papp-system`: Node, no network                                                                     |
| `selftest-net.papp`          | `result-net.json`          | network, local ports and sockets, programs, variables, clipboard, a listener, a program from `bin/` |
| `selftest-mac.papp`          | `result-mac.json`          | macOS only: programs that exist only there                                                          |
| `selftest-win.papp`          | `result-win.json`          | Windows only: network paths, file streams, the proxy                                                |
| `selftest-win-programs.papp` | `result-win-programs.json` | Windows only: programs, variables, `curl` through the proxy                                         |
| `selftest-win-system.papp`   | `result-win-system.json`   | Windows only: `papp-system`, no network, Apargon's data kept                                        |
| `selftest-win-devices.papp`  | `result-win-devices.json`  | Windows only: the device capabilities in the sandbox's token, read by `tokencaps`                   |

- `subfolder/` is part of `selftest.papp`'s folder: a file to read, a frame to refuse, a folder named like an app.
- `bin/greet` is the program `selftest-net.papp` ships, as `papp-run ./bin/greet`.
- `results/` holds what the run makes, `result*.json`, `leak`, `leak.der` and the sockets, and git ignores all of it.
- `windows/tokencaps.cs` is the source of `tokencaps`. Build it once, as administrator, onto PATH: `Add-Type -TypeDefinition (Get-Content -Raw test\selftest\windows\tokencaps.cs) -OutputAssembly "$env:SystemRoot\tokencaps.exe" -OutputType ConsoleApplication`.
- A refusal check passes only on Apargon's own error (`Apargon: …`), or on the one named beside it. Any other error, or none, is written to `refused_wrongly`, which `check.ts` shows.
- `listen_localhost_only` needs a network address on this computer: offline, `selftest-net` fails.
- A new check goes in its page and in `check.ts`'s list for its platform.
