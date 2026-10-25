# resworb

|           | Network | Your files |
| --------- | ------- | ---------- |
| A browser | yes     | no         |
| resworb   | no      | yes        |

A page asks for what it needs in `<meta>` tags. The kernel denies the network to the page's process and to every process it starts.

**Why:** an HTML file is the quickest way to view anything on your machine. In a browser it can only read. In resworb it can also write. You install one app, and after that every tool is a single `.lmth` file that you or an agent write.

The name is `browser` backwards; `lmth` is `html` backwards.

📖 The full guide is in [docs/](docs/README.md): using the app, every permission, the page API, writing pages, troubleshooting.

## What a page may do

**With no tags**, a page may see and change the files in its own folder, but not in its subfolders. Nothing else: no other files, no programs, no network. It opens without asking.

**With tags**, it asks for more, one value per tag:

```html
<meta name="resworb-read"  content="~/logs">
<meta name="resworb-write" content="./reports/*.md">
<meta name="resworb-net"   content="api.example.com:443">
<meta name="resworb-run"   content="git">
```

| Tag             | Allows                                   | Wildcards                          |
| --------------- | ---------------------------------------- | ---------------------------------- |
| `resworb-read`  | see files in a folder and its subfolders | `~/notes/*.md`, `~/git/*/docs`     |
| `resworb-write` | see, change and delete them              | the same                           |
| `resworb-net`   | send and receive data with one server    | `*.example.com:443`, `*`, `host:*` |
| `resworb-run`   | run one program                          | none                               |
| `resworb-node`  | full Node: any file, any program         | none                               |

- `resworb-node` already covers every folder and program, so it goes only with `resworb-net`.
- Hidden files (names that start with a dot) stay out unless a tag names them.

## The popup

Before a page with tags runs, a popup lists each one in plain words:

```text
report.lmth will:

🔴 Run git (/usr/bin/git), which can see all your files.
🟡 See, change and delete files matching /Users/you/git/report/reports/*.md (12 now, and any added later).
•  See files in /Users/you/logs.
•  Send and receive data with api.example.com, on port 443.
•  See, change and delete files in its own folder, /Users/you/git/report.

Hidden files (names starting with a dot) are left out unless named.

/Users/you/git/report/report.lmth

                                             [ Don't open ]  [ Allow and open ]
```

The same page, downloaded, leads with where it came from and what its lines allow together:

```text
report.lmth came from example.com.

It can run programs that see all your files. Through other apps, they may send them anywhere.

🔴 Run git (/usr/bin/git), which can see all your files.
🟡 See, change and delete files matching /Users/you/git/report/reports/*.md (12 now, and any added later).
•  See files in /Users/you/logs.
•  Send and receive data with api.example.com, on port 443.
•  See, change and delete files in its own folder, /Users/you/git/report.

Hidden files (names starting with a dot) are left out unless named.

/Users/you/Downloads/report/report.lmth

[ ] I trust where this page came from.      [ Don't open ]  [ Allow and open ]
```

| Mark      | Means               | Example                   |
| --------- | ------------------- | ------------------------- |
| 🔴 red    | a broad request     | `~`, `*:443`, any program |
| 🟡 yellow | a narrower wildcard | `~/notes/*.md`            |
| • plain   | everything else     | `~/logs`                  |

Red requests:

- **folders:** the whole disk, a folder right under `/`, `~`, Desktop, Documents, Downloads, `~/Library`, hidden files, a wildcard right under `/` or `~`;
- **servers:** any server (`*`, `*.com`), any port;
- **always:** every program, and full Node.

How the answer works:

- A popup for a downloaded page opens it only after you tick "I trust where this page came from", if a line is red or the page can send files out. A page you made has no box: it is your code.
- resworb remembers your answer for that page and that list. If the list changes, it asks again and marks what is new.
- **Permissions → Approved Pages** revokes a page.

## Trust

| Page                   | resworb holds it to                                           |
| ---------------------- | ------------------------------------------------------------- |
| without `resworb-node` | its tags, whoever wrote it                                    |
| with `resworb-node`    | the network block, little else; it runs as you, like a script |

Open a `resworb-node` page only if you trust it. [SECURITY.md](SECURITY.md) has the full model, including what resworb does not enforce.

## Install

There are no releases yet, so build resworb yourself (see [Develop](#develop)).

| Platform | How                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `pnpm dist`, then drag resworb from the `.dmg` to Applications. `.lmth` files open on double-click.                                                                           |
| Linux    | `pnpm dist:linux`, then `sudo apt install ./dist/resworb_0.1.0_amd64.deb`. Tested on a headless Ubuntu 24.04 server, not yet on a desktop. Skip the AppImage: it is untested. |
| Windows  | not supported yet                                                                                                                                                             |

A page is code, and double-clicking it runs it. A downloaded page always shows the popup, even with no tags, if it can change files in its folder.

## How it works

resworb runs as two processes:

```text
 double-click page.lmth
          │
          ▼
 ┌──────────────────────────┐
 │ trampoline (has network) │  reads the tags, shows the popup,
 │                          │  runs the proxy for resworb-net
 └────────────┬─────────────┘
              │ relaunches itself in the OS sandbox
              ▼
 ┌──────────────────────────┐
 │ offline process          │  checks it cannot open a socket,
 │ (no network)             │  then opens the page's window
 └──────────────────────────┘
```

**The sandbox.** Seatbelt on macOS, `bwrap --unshare-net` on Linux, which also hides the session's D-Bus. Before the offline process opens the page, it proves it is offline. If it cannot, it refuses. On macOS it tries to open a loopback port, which the sandbox forbids. On Linux the sandbox has a loopback of its own, so the process checks instead that its network holds only `lo` and is not the trampoline's. No flag skips this check.

**System services.** On macOS, two services fetch for a process from outside its sandbox: background downloads and WebKit. The sandbox blocks both. [SECURITY.md](SECURITY.md) says what that leaves open.

**Files.** A page without `resworb-node` has no Node. It reaches files only through `window.resworb`:

- `src/page/preload.cjs` forwards each call;
- `src/page/api.ts` checks it against the granted folders;
- the sandbox also limits writes to those folders, for the page and every program it runs: on macOS by the same patterns, on Linux by whole folder;
- on macOS, those programs cannot open other apps or change app settings.

**Network.** For a page with `resworb-net`, the trampoline runs a proxy. On macOS it listens on a loopback port. On Linux it listens on a socket file, and the offline process relays a port on its own loopback to it.

- It forwards to the declared hosts and answers 403 to everything else.
- `fetch` reaches it through Chromium's `--proxy-server`; `curl` through `https_proxy`.
- It looks up names itself, so the offline process never needs DNS.
- It logs every request, allowed or refused, to `egress.log`.
- Declared `localhost` and `127.0.0.1` ports skip it. On macOS the sandbox lets them through; on Linux each gets a socket file and a relay of its own.
- Any other socket fails in the kernel.

The proxy exists because Seatbelt can allow `localhost` but not a remote host.

The **Permissions** menu shows the log and the page's permissions, and revokes approvals.

## Writing a page

A page is plain HTML that calls `window.resworb`. See `examples/hello.lmth` and `examples/net.lmth`. Agents should read `skills/resworb/SKILL.md`.

- Keep everything on disk. No CDN, no web fonts; copy libraries next to the page.
- The files are the source of truth; the page is a view. Write changes back to the files.
- Saving the page, or a `.css` or `.js` file in its folder or below, reloads the window.
- Use git for undo. A page changes real files; treat it as code.
- Ask for as little as the page needs. Every tag adds a line to the popup.

## Develop

```sh
pnpm install
pnpm test        # every check, in the real app; fails if one fails
pnpm lint        # tsc (checks only), then ESLint
pnpm start       # examples/hello.lmth
pnpm start:net   # examples/net.lmth, popup answered for you
pnpm dist        # signed .dmg (Developer ID in the keychain)
pnpm dist:linux  # AppImage and .deb
```

**Tests** need:

- Node 22.18 or later, because they run `.ts` files with plain `node`;
- on macOS, `swiftc`, from the Xcode Command Line Tools;
- on Linux, `bwrap`;
- on Ubuntu 23.10 and later, a setuid `bwrap` (`sudo chmod u+s /usr/bin/bwrap`), and Electron's `chrome-sandbox` in `node_modules` owned by root with mode 4755. Only the `.deb` brings the AppArmor profile that spares you this. To test the installed `.deb`, see [docs/verification.md](docs/verification.md#linux).

**`RESWORB_TEST_ALLOW=1`** answers yes to the popup and prints what it would have listed. Packaged builds ignore it, and it cannot add a permission.

**Notarization** runs when these are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`. Without them, macOS blocks the first launch until you allow it in System Settings → Privacy & Security.

**Icons** are SVGs in `assets/`. `assets/make-icons.sh` renders them and needs `rsvg-convert`.

## Next

- Run resworb on a Linux desktop.
- Make `test/refuse.ts` fail when Electron cannot start: today a missing library reads as a refusal.
- Close the Unix sockets the sandbox still shows on Linux: X11, the system D-Bus, Docker.
- An offline mode for Windows (AppContainer).
- A VM backend, for a guarantee that covers full Node.
- A release workflow.
