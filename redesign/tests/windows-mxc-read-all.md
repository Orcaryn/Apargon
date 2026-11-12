# Windows: read everything under MXC

CI, windows-11-arm (build 26200, MXC 1.0.1), 2026-11-07. [Run 42358439643](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42358439643), scripts `redesign/win.ts` and `redesign/win-probe.ts`.

## Why

MXC starts from deny. Can it grant reading everything?

## How

- Test files: one in the user's folder, one in `C:\redesign-outside`, plus `C:\Windows\win.ini`.
- Only C: on the runner.
- Each mode set `readonlyPaths` differently, with one writable folder.
- Inside: read each file, write in three places, connect out and to loopback, listen.
- Control: the same reads outside.
- `icacls` before and after.

## Result

| `readonlyPaths` | Result |
| --- | --- |
| `C:\` | **nothing readable** |
| `C:\Users` | user's folder refused |
| 37 top-level folders + user's folder | **all readable** (0.3 s) |

- Writes: only the granted folder.
- Connecting out and to loopback: refused.
- Listening on `0.0.0.0`: worked (earlier spike: unreachable from outside).
- `icacls` unchanged afterwards.
- Control: all reads worked.

## So

- Read-all works, as a list made at start.
- Folders created at the root later aren't covered.
- Not tested: a second drive, OneDrive, the DNS leak.
