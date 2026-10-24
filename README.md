# resworb

A browser turned inside out. A browser gives a page the network and no files; resworb
gives a page files and no network. A page asks for what it needs in `<meta>` tags, and
the OS denies the rest of the network to its process, child processes included. Not
blocked in an API; blocked by the kernel.

Why: the easiest visualizer for anything on your machine is an HTML file. In a browser it
is read-only. In resworb it can also write. One app, one install; after that every tool
is a single `.lmth` file you (or an agent) write and open.

The name is `browser` reversed; `lmth` is `html` reversed.

## What a page may do

With no tags, a page may see and change the files in its own folder, not its subfolders,
and nothing else: no other files, no programs, no network. It opens without asking.

Anything more goes in its head, one value per tag:

```html
<meta name="resworb-read"  content="~/logs">
<meta name="resworb-write" content="./reports/*.md">
<meta name="resworb-net"   content="api.example.com:443">
<meta name="resworb-run"   content="git">
<meta name="resworb-node"  content="full">
```

| Tag             | Allows                                   | Wildcards                          |
| --------------- | ---------------------------------------- | ---------------------------------- |
| `resworb-read`  | see files in a folder and its subfolders | `~/notes/*.md`, `~/git/*/docs`     |
| `resworb-write` | see, change and delete them              | the same                           |
| `resworb-net`   | send and receive data with one server    | `*.example.com:443`, `*`, `host:*` |
| `resworb-run`   | run one program                          | none                               |
| `resworb-node`  | full Node: any file, any program         | none                               |

Before a page with tags runs, a popup lists each one in plain words and asks once:

> **report.lmth asks for 4 permissions:**
>
> 🔴 Run git (/usr/bin/git), which can see all your files.
> 🟡 See, change and delete files matching /Users/you/git/report/reports/\*.md (12 now, and any added later).
> • See files in /Users/you/logs.
> • See, change and delete files in its own folder, /Users/you/git/report.
>
> [Don't open] [Allow and open]

Broad requests are red: the whole disk or home folder, Desktop, Documents, Downloads,
`~/Library`, hidden files, any server, any port, running a program, full Node. A red
popup needs a tick in "I understand" before it opens. Other wildcards are yellow.
The answer is remembered per page and list; a changed list asks again and marks what is
new. **Permissions → Approved Pages** revokes one page.

Hidden files (names starting with a dot) are never included unless a tag names them.

## Trust

A page without `resworb-node` is held to its tags, whoever wrote it. A page with
`resworb-node` runs as code with your permissions, like a script; open only pages you
trust with it. [SECURITY.md](SECURITY.md) has the full model, including what is not
enforced.

## Install

macOS: download `resworb-<version>-<arch>.dmg` from Releases, drag resworb to
Applications. `.lmth` files then open on double-click. Linux: the AppImage or `.deb`,
without `resworb-net`. Windows: not yet.

A page is code; double-clicking one runs it. On macOS a page that still carries the
download quarantine attribute gets one warning first.

## How it works

Launched normally, resworb is a trampoline: it reads the tags, shows the popup, and
relaunches itself inside an OS sandbox (Seatbelt on macOS, `bwrap --unshare-net` on
Linux); only that offline process opens the page. Before opening, the offline process
checks that it cannot bind a loopback port; if it can, it refuses. There is no flag to
skip this. On macOS the profile also refuses the two system services found to fetch for a
process (background downloads and WebKit), which run outside the sandbox;
[SECURITY.md](SECURITY.md) says what that leaves open.

A page without full Node is a sandboxed renderer with no Node. Its only door is
`window.resworb` (`src/page/preload.cjs`), and every call is checked in `src/page/api.ts` against the
granted folders. On macOS the Seatbelt profile also limits writes to those folders, for
the page and every program it runs, from the same patterns, and stops those programs
from opening other apps.

A page with `resworb-net` gets a loopback port on which the trampoline runs a proxy that
forwards to the declared hosts and answers 403 to everything else. `fetch` goes through
it (Chromium's `--proxy-server`); so does `curl` (`https_proxy`). Declared `localhost:`
ports are allowed in the profile directly; a raw socket to anywhere else is still EPERM
from the kernel. The proxy resolves the names, so DNS stays dead in the offline process.
It exists because the kernel cannot allowlist remote hosts on its own: Seatbelt only knows
`localhost`.

Every request the proxy sees, allowed or refused, goes to `egress.log`. The
**Permissions** menu shows the log and the page's permissions, and revokes approvals.

## Writing a page

Plain HTML with `window.resworb` in the page. See `examples/hello.lmth` and
`examples/net.lmth`; for agents, `skills/resworb/SKILL.md`.

- Everything on disk. No CDN, no web fonts; copy libraries next to the page.
- The files are the source of truth; the page is a view. Write back to the files.
- Saving the page, or a `.css` or `.js` next to it, reloads the window.
- Undo is git. A page reads and writes files; treat it as code.
- Ask for as little as the page needs; every tag is a line in the popup.

## Develop

```sh
pnpm install
pnpm test        # every check, in the real app; fails if one fails
pnpm start       # examples/hello.lmth
pnpm start:net   # examples/net.lmth, popup auto-answered
pnpm dist        # signed .dmg (Developer ID in the keychain)
pnpm dist:linux  # AppImage and .deb
```

`RESWORB_TEST_ALLOW=1` answers the popup with yes and prints what it would have listed.
Ignored in packaged builds; cannot add a permission.

Notarization runs when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are
set (or `APPLE_KEYCHAIN_PROFILE`). Without them the build is signed but not notarized:
first launch needs right-click → Open.

Icons are SVG in `assets/`; `assets/make-icons.sh` renders them for electron-builder
(needs `rsvg-convert`). The app icon is a lit diamond, hollow at the centre; `.lmth`
carries it whole.

## Next

Linux `resworb-net`: the offline network namespace has its own loopback, so the proxy
would sit on a unix socket with a bridge inside. Linux write limits (`bwrap --ro-bind`).
Windows offline mode (AppContainer). A VM backend for a guarantee that covers full Node.
A release action.
