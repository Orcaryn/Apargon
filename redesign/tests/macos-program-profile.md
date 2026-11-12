# macOS: programs with no services

Mac, 2026-11-07.

## Why

With no network, a program could still ask a macOS service to go online for it: open a URL, script an app, run a Shortcut.

## How

Profile:

```scheme
(version 1)
(allow default)
(deny network*)
(deny lsopen)
(deny appleevent-send)
(deny mach-lookup)
```

Controls:

- `shortcuts list` with `allow default` + `deny network*` only.
- The Finder AppleScript, outside the sandbox.

## Result

| Program                      | Result      |
| ---------------------------- | ----------- |
| `ls`, `whoami`, `sw_vers`    | works       |
| `git` (version, log)         | works       |
| `python3`, `node`, `sqlite3` | works       |
| `say -o file`                | works       |
| `shortcuts list`             | **refused** |
| `open https://…`             | **refused** |
| AppleScript to Finder        | **refused** |
| `pbcopy`                     | **refused** |

Controls:

- `shortcuts list` **worked**, so this route is open today.
- Finder answered outside the sandbox.

## So

- One rule, `deny mach-lookup`, closes the service routes.
- Common tools still work. Tools that need a service fail with an error and don't leak.
- Mounts aren't covered: see [macos-network-mounts.md](macos-network-mounts.md).
