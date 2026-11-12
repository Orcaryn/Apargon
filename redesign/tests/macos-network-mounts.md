# macOS: reaching a server by mounting a share

Mac, 2026-11-07. Only `127.0.0.1` was used.

## Why

SMB and NFS are ways to use a folder on another computer. When something mounts one, the **kernel** connects, not the app. Does `deny network*` see that?

## How

- Listener: `nc -l 127.0.0.1 <port>`. Bytes received mean it got through.
- Commands, each killed after 4 seconds:
  - `mount_smbfs -N //guest@127.0.0.1:<port>/share <dir>`
  - `mount_nfs -o port=<port>,mountport=<port>,tcp,soft 127.0.0.1:/x <dir>`
  - `hdiutil attach http://127.0.0.1:<port>/x.dmg`
  - `mount_webdav http://127.0.0.1:<port>/ <dir>`
- Profiles:
  - page: `allow default`, `deny network*`
  - program: page + `deny lsopen`, `deny appleevent-send`, `deny mach-lookup`

## Result

| Route | No sandbox | Page | Program |
| --- | --- | --- | --- |
| SMB | through | **through** | **through** |
| NFS | through | **through** | **through** |
| Disk image over HTTP | through | blocked | blocked |
| WebDAV | not run | blocked | blocked |

Fixes added to the program profile:

| Rule | SMB | NFS |
| --- | --- | --- |
| `deny file-mount` | **through** | blocked |
| + deny `/dev/nsmb*` | blocked | blocked |

- Control: SMB still got through outside the sandbox.
- SMB connects through the device `/dev/nsmb` before it mounts.

## So

- **Hole:** SMB and NFS get past "no network."
- **Fix:** `deny file-mount`, plus deny `/dev/nsmb*`.
- At risk: `papp-run` and Full Node. Plain `.papp` JavaScript can't run `mount`.
- Better: deny all of `/dev` except a short list. Not tested yet.
