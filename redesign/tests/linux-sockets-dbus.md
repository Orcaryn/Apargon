# Linux: sockets and D-Bus under read-all

CI, ubuntu-24.04, 2026-11-07. [Run 42357856703](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42357856703), script `redesign/linux-fence.sh`.

## Why

Read-all is `bwrap --ro-bind / /`. Other programs listen on socket files: D-Bus, systemd, Docker. Can the app reach them?

## How

Inside `--ro-bind / /`, try:

- TCP out with `--unshare-net`
- D-Bus: `gdbus … ListNames`
- systemd: `systemd-run --user true`
- a socket file in `/tmp`
- `docker.sock`

Then the same with empty `/tmp` and `/run`. Control: each one outside the sandbox.

## Result

| Check | read-all + `--unshare-net` | + empty `/tmp`, `/run` |
| --- | --- | --- |
| TCP out | refused | n/a |
| D-Bus | **reached** | refused |
| systemd | **reached** | refused |
| Socket file in `/tmp` | **connected** | not run |
| `docker.sock` | **connected, API answered** | not run |

Controls: all worked outside.

## So

- **Hole:** read-all exposes every socket file. Connecting needs no write access.
- **Fix:** empty `/tmp`, `/run`, `/var/run`, and a minimal `/dev`.
