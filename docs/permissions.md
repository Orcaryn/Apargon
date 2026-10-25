# Permissions

A page asks for permissions with five `<meta>` tags:

| Tag             | Allows                                             | Popup colour       |
| --------------- | -------------------------------------------------- | ------------------ |
| `resworb-read`  | see files in a folder and everything below it      | plain, yellow, red |
| `resworb-write` | see, change and delete them                        | plain, yellow, red |
| `resworb-net`   | send and receive data with one server, on one port | plain, yellow, red |
| `resworb-run`   | run one program                                    | red                |
| `resworb-node`  | full Node: any file, any program                   | red                |

Ask for as little as the page needs. Every tag adds a line to the popup.

## How resworb reads tags

resworb reads the tags from the file on disk before the page runs. A running page cannot change them.

- One value per `<meta>`. Repeat the tag for more values.
- Attributes may come in any order, in single or double quotes. The tag name ignores case.
- Spaces around a value are ignored.
- resworb finds every `<meta>` in the file, even inside an HTML comment or a `<script>` string. Do not leave example tags in comments.
- A value may not contain `>`.
- A value, the page's path and every folder or program it names may not contain a line break or another invisible character, such as a right-to-left mark. The popup could not show it honestly.
- An unknown `resworb-*` name or a bad value stops the page from opening. The message names the problem; see [Troubleshooting](troubleshooting.md).

New tags take effect when you reopen the page, and the popup asks again.

## The own folder

A page's own folder is the folder it sits in:

| Page                                         | Own folder                                  |
| -------------------------------------------- | ------------------------------------------- |
| no tags                                      | the files directly in it, not in subfolders |
| at least one tag                             | the folder and everything below it          |
| in `/`, `~`, Desktop, Documents or Downloads | none                                        |
| with `resworb-node`                          | none; full Node reaches everything          |

The page may see, change and delete files in its own folder.

- With no tags, it opens without a popup. It may create and delete empty subfolders, but not touch files in them.
- With tags, the popup lists the own folder as a plain line.

A page with no own folder can load itself, and only the files its tags grant. Even its own `.css` sitting next to it is refused. Give every page a folder of its own.

## Hidden files

A hidden name starts with a dot: `.git`, `.env`, `.DS_Store`. No grant covers one unless the tag names it.

- `~/project` covers `~/project/src/app.js`, not `~/project/.git/config`.
- `~/project/.git` covers `~/project/.git/config`, and shows red.
- A `*` never matches the start of a hidden name: `~/notes/*` does not cover `~/notes/.x`.

## Folders: `resworb-read` and `resworb-write`

```html
<meta name="resworb-read"  content="~/logs">
<meta name="resworb-write" content="./data">
<meta name="resworb-write" content="~/notes/*.md">
<meta name="resworb-read"  content="~/git/*/docs">
```

`resworb-read` lets the page read, list, check and watch files. `resworb-write` adds create, change, rename and delete.

### Writing the value

| Value            | Means                                    |
| ---------------- | ---------------------------------------- |
| `./data`, `data` | a folder in the page's folder            |
| `../shared`      | a path from the page's folder            |
| `~`              | your home folder                         |
| `~/notes`        | a folder in your home folder             |
| `/var/log`       | an absolute path                         |
| `~/notes/*.md`   | each match, and everything below a match |

- The part before the first `*` must exist when the page opens. resworb resolves it to its real path.
- `*` stands for part of one name. It never crosses a `/`.
- `*` alone is refused. Write `/` for the whole disk or `~` for your home folder.
- A value may not be empty or contain `"` or `\`.
- The path of a writable folder, or of the own folder, may not contain `"`.
- After the first `*`, the value is matched as written, with case: `*.MD` does not match `notes.md`.

### What the page reaches

- A folder covers itself and everything below it, except hidden names.
- A wildcard covers each match, and everything below a match that is a folder.
- resworb checks the real path of every file. A symlink in a granted folder that points outside it is refused.
- On macOS, case does not matter in the folder part: `~/LIBRARY` is `~/Library`, and shows red.

With a wildcard, the page may also list the folders on the way to a match. With `~/git/*/docs`, it may list `~/git` and each `~/git/<name>`: the names, not the files.

### Writes and the OS

The OS also limits writes, for the page and every program it runs, to:

- the own folder and the `resworb-write` folders;
- the temp folder, `$TMPDIR` (not `/tmp`, which is a different folder);
- `/dev`;
- the page's browser data.

On macOS the OS uses resworb's patterns. On Linux it works by whole folder: a program the page runs may change any file in those folders, hidden ones too, so `~/notes/*.md` gives it all of `~/notes`. The popup's `resworb-run` line names the folders. resworb still holds the page itself to the patterns.

## Servers: `resworb-net`

```html
<meta name="resworb-net" content="api.github.com:443">
<meta name="resworb-net" content="*.example.com:443">
<meta name="resworb-net" content="localhost:11434">
```

On Linux, a port on this computer must be a number: `localhost:*` is refused.

### Writing the value

The value is always `host:port`.

| Value                | Means                                                 |
| -------------------- | ----------------------------------------------------- |
| `api.github.com:443` | that host, that port                                  |
| `*.example.com:443`  | any subdomain, at any depth; not `example.com` itself |
| `api.example.com:*`  | that host, any port                                   |
| `localhost:11434`    | a program on this computer, on that port              |
| `127.0.0.1:8080`     | the same as `localhost:8080`                          |
| `*`                  | any host, any port; the same as `*:*`                 |

- The port is `1` to `65535`, or `*`.
- A host uses letters, digits, dots and hyphens, and starts with a letter or digit. Capitals become lower case.
- No scheme (`https://`), no path, no host without a port, no IPv6 address.
- `*` may be the whole host, a leading `*.`, or the port. Nowhere else.

### How a request leaves

The page's process has no network. For a page with `resworb-net`, resworb runs a proxy outside the sandbox.

- Everything the page loads from the web goes through the proxy: `fetch`, images, scripts.
- A program the page runs gets `http_proxy` and `https_proxy`. `curl` uses them; a program that ignores them cannot connect.
- The proxy looks up names. A program that needs DNS itself (`ping`, `ssh`, `dig`) fails.
- The proxy forwards to declared hosts only, and refuses the rest with a 403.
- It refuses any address on this computer, even one a wildcard matches. To reach a local server, declare `localhost:<port>`.
- It logs every request, allowed or refused, to `egress.log`. For https it sees `host:port`, not the URL.

`localhost` and `127.0.0.1` ports skip the proxy. The sandbox allows them directly, and the log does not show them.

With any `resworb-net` tag, the browser's cross-origin rule (CORS) is off; the host list is the boundary. The window title lists the hosts.

If a downloaded page may also see files, its popup says so first: "It can send the files it sees to api.example.com."

## Programs: `resworb-run`

```html
<meta name="resworb-run" content="git">
<meta name="resworb-run" content="/opt/tools/bin/convert">
```

The value is a program name or an absolute path.

- A name uses letters, digits, `_`, `.`, `+` and `-`. resworb looks it up when the page opens: in `PATH`, then `/opt/homebrew/bin` and `/usr/local/bin`.
- Opened from Finder, the app has a short `PATH`. Give the full path to programs in other places, such as `~/.cargo/bin` or `~/.local/bin`.
- resworb uses an absolute path as written, without checking that it exists.
- No wildcards, arguments or relative paths (`./tool`).
- The page calls the program by its file name: `resworb.run('convert', [...])` for `/opt/tools/bin/convert`.
- The popup shows the file that will run. If a later lookup finds another file, it asks again.

The program runs inside the page's sandbox:

| The program                              | Can?                      |
| ---------------------------------------- | ------------------------- |
| reach the page's declared hosts          | yes                       |
| reach any other host                     | no                        |
| write outside the page's folders         | no                        |
| write hidden files in the page's folders | no on macOS; yes on Linux |
| open other apps or change app settings   | no on macOS; yes on Linux |
| **read every file you can**              | **yes**                   |
| take any arguments                       | yes                       |

Some programs run others (`git -c core.sshCommand=…`). That is why `resworb-run` is always red. Prefer a page that does the work itself.

## Full Node: `resworb-node`

```html
<meta name="resworb-node" content="full">
```

The only value is `full`. It combines with `resworb-net` only, because it already covers every folder and program.

A full-Node page:

- has `require` and `process`, and can read, write and run anything you can;
- has no `window.resworb` and no own folder;
- has no network beyond its `resworb-net` hosts;
- cannot write resworb's approvals, and on macOS cannot write the app;
- **can** launch other apps, and they have network. See [SECURITY.md](../SECURITY.md).

Use it only when the page truly needs Node, and open such a page only if you trust it. See [The page API](api.md#full-node-pages).

## Colours

The colour depends on how a value is written, not on where it leads.

### Red

| Kind    | Red when                                                    |
| ------- | ----------------------------------------------------------- |
| folder  | `/` or `~`                                                  |
| folder  | a folder right under `/`: `/etc`, `/Users`, `/Applications` |
| folder  | exactly `~/Desktop`, `~/Documents` or `~/Downloads`         |
| folder  | `~/Library` or anything in it                               |
| folder  | any hidden part: `~/.ssh`, `./.git`                         |
| folder  | a wildcard right under `/` or `~`: `~/*.txt`, `/*/logs`     |
| server  | `*` as the host                                             |
| server  | a top-level wildcard: `*.com:443`, `*.io:443`               |
| server  | any port: `api.example.com:*`, `localhost:*`                |
| program | always                                                      |
| node    | always                                                      |

### Yellow

- A folder wildcard that is not red: `~/notes/*.md`, `~/git/*/docs`. The line counts the matches now, "and any added later".
- A subdomain wildcard with a fixed port: `*.example.com:443`.

### Plain

Everything else: a folder such as `~/logs` or `~/Documents/taxes`, a host with a fixed port, `localhost:11434`, and the own folder.
