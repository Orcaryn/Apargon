# Tests

`pnpm test` runs the scripts in this order, the pages after `daemons.ts`, and `check.ts` last. A step that fails stops the run.

## `node/`

Plain Node, without the app.

| File           | Checks                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `platforms.ts` | that no file outside a `platform.ts` asks which OS this is                |
| `preload.ts`   | that a `papp-node` page outside Apargon's folder finds `@electron/remote` |
| `popup.ts`     | how tags are read and what the popup shows for them                       |
| `storage.ts`   | that a page's storage follows it when it moves, and only then             |

## `selftest/`

The app on real pages.

| File         | Checks                                                                                                                          | Needs Electron |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `refuse.ts`  | that the page process refuses to open while it has network                                                                      | yes            |
| `daemons.ts` | macOS: that the system services `swift/leak.swift` asks would fetch from outside the sandbox, so `selftest-node` is a real test | no             |
| `check.ts`   | that every page wrote every check for this platform, all true                                                                   | no             |

### `selftest/pages/`

The pages Apargon opens, one per kind of access. Each writes its results to `results/`, and `check.ts` reads them.

| Page                         | Writes                     | Runs as                                                     |
| ---------------------------- | -------------------------- | ----------------------------------------------------------- |
| `selftest.papp`              | `result.json`              | a plain page: reads its own folder, writes two files        |
| `selftest-node.papp`         | `result-node.json`         | `papp-node`: Node, no network                               |
| `selftest-net.papp`          | `result-net.json`          | network, programs, variables and clipboard                  |
| `selftest-mac.papp`          | `result-mac.json`          | macOS only: programs that exist only there                  |
| `selftest-win.papp`          | `result-win.json`          | Windows only: network paths, file streams, the proxy        |
| `selftest-win-programs.papp` | `result-win-programs.json` | Windows only: programs, variables, `curl` through the proxy |
| `selftest-win-node.papp`     | `result-win-node.json`     | Windows only: `papp-node`, no network, Apargon's data kept  |

- `subfolder/` is part of `selftest.papp`'s folder: a file to read, a frame to refuse, a folder named like an app.
- `results/` holds what the run makes, `result*.json`, `leak` and `leak.der`, and git ignores all of it.
- A new check goes in its page and in `check.ts`'s list for its platform.
