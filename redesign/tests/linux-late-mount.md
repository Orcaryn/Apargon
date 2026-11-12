# Linux: a drive mounted after start

CI, ubuntu-24.04, 2026-11-08. [Run 42488972400](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42488972400), step "Late mount" of `.github/workflows/redesign-ci.yml` on branch `apargon-redesign`.

## Why

Apargon hides network drives that are mounted when a `.papp` file starts. Does one mounted later show inside?

## How

- Start bwrap as Apargon does: `--ro-bind / /`, its own network, `/dev`, `/proc`, `/tmp`.
- One second later, on the host, mount a tmpfs at `/mnt/late` and write a file `marker` in it.
- Inside, after 4 seconds, list `/mnt/late` and look for it in `/proc/self/mountinfo`.

## Result

| Where              | `/mnt/late`                             |
| ------------------ | --------------------------------------- |
| Outside            | `marker`                                |
| Inside             | **`marker`**                            |
| Inside mount table | `/mnt/late ... master:316 - tmpfs late` |

## So

- **Hole:** a mount made on the host after start reaches the sandbox: bwrap's `/` is a slave mount, so new mounts propagate in.
- A network drive mounted while a `.papp` file runs is readable, and each read is a request to its server. Data can leave through it.
- Per the release rules: critical. Linux doesn't ship until it is solved by removing a capability.

## Fix: only the disks mounted at start

2026-11-08, the user's choice. [Run 42492546965](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42492546965).

- Inside bwrap, Apargon starts the `.papp` file's process through `unshare --user --map-user=<uid> --map-group=<gid> --mount --propagation private`: a private copy of the mounts as they are at start.
- The capability removed: a drive attached while a `.papp` file runs isn't readable until it opens again.
- Same test, both ways:

| Start                            | Inside `/mnt/late` |
| -------------------------------- | ------------------ |
| Apargon's, with the private copy | **nothing**        |
| Control: bwrap alone             | `marker`           |

- `--map-user` needs util-linux 2.38 or newer: Ubuntu 24.04 has it, 22.04 doesn't. Apargon refuses to start without it.
