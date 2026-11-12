# Linux: hard links under bwrap

CI, ubuntu-24.04, 2026-11-07. [Run 42357856703](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42357856703), script `redesign/linux-fence.sh`.

## Why

Same as [macos-hard-links.md](macos-hard-links.md).

## How

- The VPS couldn't run bare bwrap (uid map error), so this ran on CI.
- User namespaces turned on: `sysctl kernel.apparmor_restrict_unprivileged_userns=0`.
- Sandbox: `bwrap --ro-bind / / --dev /dev --proc /proc --bind own own`.
- `own/prelink` was made before the sandbox started.

## Result

| Try | Result |
| --- | --- |
| Control: write and link outside | works |
| Write outside directly | denied |
| New hard link into `own/` | **refused** (cross-device) |
| Write through `own/prelink` | **allowed: the outside file changed** |

## So

Same as macOS. The own folder is safe, and `write X` is trust tier.
