# macOS: hard links

Mac, 2026-11-07.

## Why

A hard link is a second name for a file. Could the app link `~/.zshrc` into its folder and write through the link?

## How

- Folders: `own/` (writable) and `outside/target.txt`.
- Profile:

```scheme
(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath "<T>/own"))
```

- From inside, try every route into `outside/`.
- `own/prelink` was made **before** the sandbox started.

## Result

| Try | Result |
| --- | --- |
| Write outside directly | denied |
| New hard link into `own/` | **refused** |
| Same, with `(allow file-link)` | refused |
| Symlink, then write | denied |
| Move the file in | denied |
| Clone (`cp -c`) | allowed (a copy) |
| Write through `own/prelink` | **allowed: the outside file changed** |

## So

- The app can't make the link, so its own folder is safe.
- A link already inside X reaches outside, so `write X` is trust tier.
