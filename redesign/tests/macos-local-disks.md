# macOS: local disks only, cloud blocked

Mac, 2026-11-07.

## Why

Reading a network drive or an online-only cloud file sends a request.

## How

- Two small disk images:
  - `aptest-before`: attached before the sandbox started.
  - `aptest-after`: attached while it ran. It stands in for a network drive mounted later.
- Profile:

```scheme
(version 1)
(allow default)
(deny network*)
(deny file-read* (subpath "/Volumes") (subpath "/Network")
                 (subpath "~/Library/CloudStorage") (subpath "~/Library/Mobile Documents"))
(allow file-read* (subpath "/Volumes/aptest-before"))
```

- Each target was also tried through its two alias routes:
  - the firmlink: `/System/Volumes/Data/...`
  - the inode path: `/.vol/<dev>/<inode>`
- Cloud folders were only listed, never read.
- Control: the same reads outside the sandbox.

## Result

| Read | Result |
| --- | --- |
| `aptest-before` | allowed |
| `aptest-after`, by path, firmlink and `/.vol` | **refused** |
| CloudStorage, by path, firmlink and `/.vol` | **refused** |
| Mobile Documents | **refused** |
| `~/.zshrc` | allowed |

Control: everything read fine outside the sandbox.

## So

- Works, and fails closed: a new volume is refused.
- Gap: a network drive mounted later outside `/Volumes`. The app can't mount one itself: see [macos-network-mounts.md](macos-network-mounts.md).
