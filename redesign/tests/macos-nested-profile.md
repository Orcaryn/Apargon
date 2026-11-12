# macOS: a stricter profile inside a sandbox

Mac, 2026-11-07.

## Why

Programs should get a stricter fence than Electron. Can the sandboxed process apply it?

## How

```sh
sandbox-exec -f outer.sb sandbox-exec -f inner.sb /usr/bin/true
```

- `outer.sb`: `allow default`, `deny network*`
- `inner.sb`: the same, plus `deny mach-lookup`

Also tried with `ls`, `git`, `python3`, `shortcuts`, `open`, `whoami` and `sw_vers`.

## Result

All failed: `sandbox_apply: Operation not permitted`.

## So

The trampoline must start programs itself. See [macos-program-profile.md](macos-program-profile.md).
