# papp

|           | Network | Your files |
| --------- | ------- | ---------- |
| A browser | yes     | no         |
| papp      | no      | yes        |

A page asks for what it needs in `<meta>` tags. The kernel denies the network to the page's process and to every process it starts.

**Why:** an HTML file is the quickest way to view anything on your machine. In a browser it can only read. In papp it can also write. You install one app, and after that every tool is a single `.papp` file that you or an agent write.

The name stands for personal apps: each `.papp` file is one.

📖 The full guide is in [docs/](docs/README.md): using the app, every permission, the page API, writing pages, troubleshooting.

## What a page may do

**With no tags**, a page may see the files in its own folder and its subfolders. Nothing else: no changes, no other files, no programs, no network. It opens without asking.

To save, a page asks for `papp-write`, such as `./*` for its own folder.

**With tags**, it asks for more, one value per tag:

```html
<meta name="papp-read"  content="~/logs">
<meta name="papp-write" content="./reports/*.md">
<meta name="papp-net"   content="api.example.com:443">
<meta name="papp-run"   content="git">
```

| Tag           | Allows                                   | Wildcards                          |
| ------------- | ---------------------------------------- | ---------------------------------- |
| `papp-read`   | see files in a folder and its subfolders | `~/notes/*.md`, `~/git/*/docs`     |
| `papp-write`  | see, change and delete them              | the same                           |
| `papp-net`    | send and receive data with one server    | `*.example.com:443`, `*`, `host:*` |
| `papp-run`    | run one program                          | none                               |
| `papp-env`    | give its programs one variable           | none                               |
| `papp-socket` | talk to the program behind one socket    | none                               |
| `papp-node`   | full Node: any file, any program         | none                               |

- `papp-node` already covers every folder and program, so it goes only with `papp-net` and `papp-socket`.
- Hidden files (names that start with a dot) stay out unless a tag names them.
- Keys and logins (`~/.ssh`, `~/.aws`, browser profiles) stay out unless a tag names them, for programs too.
- A program gets `PATH`, `HOME` and a few other variables, not your tokens. `papp-env` passes one more.
- Pages (`.papp`) stay out of `papp-write` unless the pattern ends in `.papp`, which shows red: a page that may rewrite another could give itself what that page was approved for.

## The popup

Before a page with tags runs, a popup lists each one in plain words:

```text
report.papp
~/git/report/

[red]    Run git (/usr/bin/git), which can see all your files.
[yellow] See, change and delete files matching ~/git/report/reports/*.md (12 now, and any added later).
[grey]   See files in ~/logs.
[grey]   Send and receive data with api.example.com, on port 443.
[grey]   See files in its own folder and its subfolders, ~/git/report.

Hidden files (names starting with a dot) are left out unless named. Pages (.papp) can be changed only if named.
> The tags as written
─────────────────────────────────────────────────────────────────────────────────
Made on this computer                        [ Don't open ]  [ Allow and open ]
```

Each line starts with an icon for its kind: a folder, a pencil, a globe, a terminal. The same page, downloaded, adds in red what its lines allow together, names the site in red, and must be trusted with a checkbox:

```text
report.papp
~/Downloads/report/

It can run programs that see all your files. Through other apps, they may send them anywhere.

[red]    Run git (/usr/bin/git), which can see all your files.
...

[ ] I trust where this page came from.
    Not sure? Ask an AI to check the file before you allow it.
─────────────────────────────────────────────────────────────────────────────────
Downloaded from example.com                  [ Don't open ]  [ Allow and open ]
```

| Icon   | Means               | Example                   |
| ------ | ------------------- | ------------------------- |
| red    | a broad request     | `~`, `*:443`, any program |
| yellow | a narrower wildcard | `~/notes/*.md`            |
| grey   | everything else     | `~/logs`                  |

Red requests:

- **folders:** the whole disk, a folder right under `/`, `~`, Desktop, Documents, Downloads, `~/Library`, hidden files, a wildcard right under `/` or `~`;
- **servers:** any server (`*`, `*.com`), any port;
- **pages:** changing `.papp` files;
- **always:** every program, and full Node.

How the answer works:

- A popup for a downloaded page opens it only after you tick "I trust where this page came from", if a line is red or the page can send files out. A page you made has no box: it is your code.
- papp remembers your answer for that page and that list. If the list changes, it asks again and marks what is new. If a downloaded page changes in any way, it asks again.
- **Permissions → Approved Pages** revokes a page.

## Trust

| Page                | papp holds it to                                              |
| ------------------- | ------------------------------------------------------------- |
| without `papp-node` | its tags, whoever wrote it                                    |
| with `papp-node`    | the network block, little else; it runs as you, like a script |

Open a `papp-node` page only if you trust it. [SECURITY.md](SECURITY.md) has the full model, including what papp does not enforce.

## Install

There are no releases yet, so build papp yourself (see [Develop](#develop)).

| Platform | How                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `pnpm dist`, then drag papp from the `.dmg` to Applications. `.papp` files open on double-click.                                                                           |
| Linux    | `pnpm dist:linux`, then `sudo apt install ./dist/papp_0.1.0_amd64.deb`. Tested on a headless Ubuntu 24.04 server, not yet on a desktop. Skip the AppImage: it is untested. |
| Windows  | not supported yet; the plan is in [docs/windows.md](docs/windows.md)                                                                                                       |

Once a day, when you open a page, papp checks GitHub for a new version. On macOS it downloads it and installs it the next time it starts; on Linux it tells you and links to the release. Permissions → Check for Updates Automatically turns this off. Then release notes are the only way you will hear about security fixes, so watch this repository: **Watch → Custom → Releases**.

A page is code, and double-clicking it runs it. A page with no tags can only look, so it opens without a popup, even if downloaded.

## How it works

papp runs as two processes:

```text
 double-click page.papp
          │
          ▼
 ┌──────────────────────────┐
 │ trampoline (has network) │  reads the tags, shows the popup,
 │                          │  runs the proxy for papp-net
 └────────────┬─────────────┘
              │ relaunches itself in the OS sandbox
              ▼
 ┌──────────────────────────┐
 │ offline process          │  checks it cannot open a socket,
 │ (no network)             │  then opens the page's window
 └──────────────────────────┘
```

**The sandbox.** Seatbelt on macOS, `bwrap --unshare-net` on Linux, which also empties the folders where socket files live (D-Bus, Docker, the name lookup service) but for the display's. Before the offline process opens the page, it proves it is offline. If it cannot, it refuses. On macOS it tries to open a loopback port, which the sandbox forbids. On Linux the sandbox has a loopback of its own, so the process checks instead that its network holds only `lo` and is not the trampoline's. No flag skips this check.

**System services.** On macOS, two services fetch for a process from outside its sandbox: background downloads and WebKit. The sandbox blocks both. [SECURITY.md](SECURITY.md) says what that leaves open.

**Files.** A page without `papp-node` has no Node. It reaches files only through `window.papp`:

- `src/page/preload.cjs` forwards each call;
- `src/page/api.ts` checks it against the granted folders;
- the sandbox also limits writes to those folders, for the page and every program it runs: on macOS by the same patterns, on Linux by whole folder;
- on macOS, those programs cannot open other apps or change app settings.

**Network.** For a page with `papp-net`, the trampoline runs a proxy. On macOS it listens on a loopback port. On Linux it listens on a socket file, and the offline process relays a port on its own loopback to it.

- It forwards to the declared hosts and answers 403 to everything else.
- `fetch` reaches it through Chromium's `--proxy-server`; `curl` through `https_proxy`.
- It looks up names itself, so the offline process never needs DNS.
- It logs every request, allowed or refused, to `egress.log`.
- Declared `localhost` and `127.0.0.1` ports skip it. On macOS the sandbox lets them through; on Linux each gets a socket file and a relay of its own.
- Any other socket fails in the kernel.

The proxy exists because Seatbelt can allow `localhost` but not a remote host.

The **Permissions** menu shows the log and the page's permissions, and revokes approvals.

## Writing a page

A page is plain HTML that calls `window.papp`. See `examples/hello.papp` and `examples/net.papp`. Agents should read `skills/papp/SKILL.md`.

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
pnpm start       # examples/hello.papp
pnpm start:net   # examples/net.papp, popup answered for you
pnpm dist        # signed .dmg (Developer ID in the keychain)
pnpm dist:linux  # AppImage and .deb
```

**Tests** need:

- Node 22.18 or later, because they run `.ts` files with plain `node`;
- on macOS, `swiftc`, from the Xcode Command Line Tools;
- on Linux, `bwrap`;
- on Ubuntu 23.10 and later, a setuid `bwrap` (`sudo chmod u+s /usr/bin/bwrap`), and Electron's `chrome-sandbox` in `node_modules` owned by root with mode 4755. Only the `.deb` brings the AppArmor profile that spares you this. To test the installed `.deb`, see [docs/verification.md](docs/verification.md#linux).

**`PAPP_TEST_ALLOW=1`** answers yes to the popup and prints what it would have listed. Packaged builds ignore it, and it cannot add a permission.

**Notarization** runs when these are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`. Without them, macOS blocks the first launch until you allow it in System Settings → Privacy & Security.

**Releases** come from `./release.sh --major`, `--minor` or `--patch`, on macOS. It refuses unless `main` is clean and up to date and `release-notes/<version>.md` is committed. Then it runs `format:check`, `lint` and `test`, bumps the version, builds a notarized `.dmg` and `.zip` for each Mac architecture and a `.deb`, commits and tags the version, pushes, and publishes a GitHub release with a `SHA256SUMS` file and the update feeds installed copies read. It needs the Developer ID in the keychain, the `notarize` keychain profile for `notarytool`, and a `gh` account that can push to the repository. It does not run the Linux checks: do that first with [docs/verification.md](docs/verification.md#linux). Write the notes for users, security fixes first: Linux users get a link to them, and users who turned the update check off get nothing else.

**Icons** are SVGs in `assets/`. `assets/make-icons.sh` renders them and needs `rsvg-convert`. The badge on a page's own icon is `src/page/badge.svg`, drawn at run time.

## Next

- Run papp on a Linux desktop.
- Make `test/refuse.ts` fail when Electron cannot start: today a missing library reads as a refusal.
- Close X11 on Linux: the sandbox shows its socket, and through it a program can type into another window.
- An offline mode for Windows, on Microsoft's MXC; the plan and why it waits are in [docs/windows.md](docs/windows.md).
- A VM backend, for a guarantee that covers full Node.
