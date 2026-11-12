# Apargon

Apargon is a desktop app for macOS, Linux and Windows that runs papps.

A papp is a single `.papp` file: an HTML file with extra `<meta>` tags. It works like a desktop app, without the setup a desktop app needs: no installer, no server, no build step. You double-click it, and Apargon opens it in a sandboxed window.

Apargon is a reverse browser. A browser gets all of the internet and none of your computer. A `.papp` file gets your files and none of the internet: it reads your local disks, writes only its own folder, and sends nothing off your computer unless you said yes.

A coding agent can write a papp from one prompt.

## Install

On macOS or Ubuntu 24.04, with the papp skill for agents (`sh -s -- --no-skill` without it):

```sh
curl -fsSL https://apargon.com/install.sh | sh
```

[`install.sh`](install.sh) checks the app's notarization on macOS, and the `.deb` against the release's `SHA256SUMS` on Linux, before it installs it. Or download from the [latest release](https://github.com/Orcaryn/Apargon/releases/latest): the `.dmg` for macOS (`arm64` or `x64`), the `.deb` for Ubuntu 24.04, the `.exe` for Windows (`x64` or `arm64`).

The Windows installer is not signed, so Windows warns before it runs. Check it against the release's `SHA256SUMS` first: that shows the download arrived whole. It comes from the same release, so it cannot show who published it.

Or with Homebrew on macOS:

```sh
brew trust --cask orcaryn/tap/apargon
brew install --cask orcaryn/tap/apargon
```

Then double-click a `.papp`, or run `open notes.papp` (macOS) or `apargon notes.papp` (Linux). On Linux, Apargon runs on GNOME with Wayland. On X11 it asks first: there, any app can type into other windows.

The first time it opens, Apargon offers to install the papp skill, so coding agents can build apps for it (see [Build with an agent](#build-with-an-agent)).

Once a day Apargon asks GitHub for a new version. **Permissions → Check for Updates Automatically** turns it off; then watch the repository's releases for security fixes.

## Meta tags

Every `.papp` file names itself with a UUID: `<meta name="papp-id" content="…">`. That's its identity: its data folder (`~/.apargon/<id>`) and its secrets follow it through renames, moves and new versions. A file without one doesn't open.

With no other tags, it reads every local disk, writes only its own folder, and has no network. It opens at once.

It asks for more in its `<head>`. `content` holds the one thing; attributes hold the options:

```html
<meta name="papp-id"              content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77"> <!-- who it is, always -->
<meta name="papp-write"           content="~/notes/">                 <!-- change files in one folder; all instead of content for any -->
<meta name="papp-run"             content="git">                      <!-- one program, with the same limits; add unfenced for none -->
<meta name="papp-net"             content="api.example.com">          <!-- one site, port 443 unless you add :port; its links open too -->
<meta name="papp-listen">                                             <!-- answer this computer; add network for your network too -->
<meta name="papp-socket"          content="/var/run/docker.sock">     <!-- one other program -->
<meta name="papp-use"             content="notifications">            <!-- one device or extra per tag -->
<meta name="papp-window"          size="900x600" title-bar="no">      <!-- the window's size and look -->
<meta name="papp-env"             content="AWS_PROFILE">              <!-- one variable for its programs -->
<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N"> <!-- a key that works in every app -->
<meta name="papp-system">                                             <!-- everything: Node and the internet -->
```

A popup lists one line per tag, in plain words: "Change files in notes", "Send your files to api.example.com". Your yes belongs to the file's exact bytes and to what the popup showed: any change, even a comment, asks again, and so does a tag that now leads to another folder or program. **Permissions → Files You Said Yes To** takes a yes back.

With no tag, a `.papp` file can ask you to pick a file or folder in Apargon's dialog. Pick to read, and it reads it. Pick to write, and Apargon writes it for it. Picks are kept, even after a restart. It can also keep secrets, like an API key: Apargon seals them with your computer's own store.

All its network goes through Apargon's proxy, to the sites its tags name, and nowhere else. **Permissions → Show Egress Log** lists every try.

`papp-use background` keeps it running after you close it; quit it from its tray icon. `papp-use login` opens it at login, until you take back your yes.

[SECURITY.md](SECURITY.md) lists what Apargon enforces, and what it tells you but doesn't block.

## Windows

On Windows, a few things work differently:

- **Windows can leak a name.** A program can make Windows look up a name, as in `\\<data>.example.com\x`. That's Microsoft's to fix, and it has been reported.
- **No sockets yet.** A `.papp` file with `papp-socket` doesn't open. `localhost` works through Apargon's proxy, so a program must honour `http_proxy`, as `curl` does.
- **Only `.exe` and `.com` programs.** `papp-run` doesn't take `.bat` or `.cmd` files.
- **Reads:** the folders at the root of each local drive, and your user folder. OneDrive only with `papp-use cloud`. A folder made at a drive's root after the `.papp` file opens isn't readable until it opens again.

## Build with an agent

Give it [`skills/papp/SKILL.md`](skills/papp/SKILL.md). Apargon installs it to `~/.claude/skills/papp/` and `~/.agents/skills/papp/` if you say yes: on its first run, each time you open it without a `.papp` file until the skill is there, and from **Help → Install the papp Skill for Agents…**. Without Apargon:

```sh
for dir in ~/.claude/skills/papp ~/.agents/skills/papp; do
  mkdir -p "$dir"
  curl -fsSL https://apargon.com/.well-known/agent-skills/papp/SKILL.md -o "$dir/SKILL.md"
done
```

Then ask for an app: "Make me a papp that lists the Markdown notes in ~/notes and lets me edit them."
