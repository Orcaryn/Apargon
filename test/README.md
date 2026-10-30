# Tests

`pnpm test` runs the scripts in this order, the pages after `daemons.ts`, and `check.ts` last. A step that fails stops the run.

## Node scripts

| File         | Checks                                                                                                                    | Needs Electron |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `popup.ts`   | how tags are read and what the popup shows for them                                                                       | no             |
| `moved.ts`   | that a page's storage follows it when it moves, and only then                                                             | no             |
| `refuse.ts`  | that the page process refuses to open while it has network                                                                | yes            |
| `daemons.ts` | macOS: that the system services `leak.swift` asks would fetch from outside the sandbox, so `selftest-node` is a real test | no             |
| `check.ts`   | that every page wrote every check for this platform, all true                                                             | no             |

## Pages

`pages/` holds the pages Apargon opens, one per kind of access. Each writes its results next to itself, and `check.ts` reads them.

| Page                 | Writes             | Runs as                                              |
| -------------------- | ------------------ | ---------------------------------------------------- |
| `selftest.papp`      | `result.json`      | a plain page: reads its own folder, writes two files |
| `selftest-node.papp` | `result-node.json` | `papp-node`: Node, no network                        |
| `selftest-net.papp`  | `result-net.json`  | network, programs, variables and clipboard           |
| `selftest-mac.papp`  | `result-mac.json`  | macOS only: programs that exist only there           |

- `subfolder/` is part of `selftest.papp`'s folder: a file to read, a frame to refuse, a folder named like an app.
- `result*.json`, `leak` and `leak.der` are made by the run and ignored by git.
- A new check goes in its page and in `check.ts`'s list for its platform.
