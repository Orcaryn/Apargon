# Apargon

Apargon is a desktop app for macOS, Linux and Windows that runs papps.

A papp is a single `.papp` file: an HTML file with extra `<meta>` tags. It works like a desktop app, without the setup a desktop app needs: no installer, no server, no build step. You double-click it, and Apargon opens it in a sandboxed window.

The sandbox blocks everything the tags don't allow, and a popup shows what they ask for before the page runs.

A coding agent can write a papp from one prompt.

## Install

On macOS or Ubuntu 24.04, with the papp skill for agents (`sh -s -- --no-skill` without it):

```sh
curl -fsSL https://apargon.com/install.sh | sh
```

[`install.sh`](install.sh) checks the app's notarization on macOS, and the `.deb` against the release's `SHA256SUMS` on Linux, before it installs it. Or download from the [latest release](https://github.com/Orcaryn/Apargon/releases/latest): the `.dmg` for macOS (`arm64` or `x64`), the `.deb` for Ubuntu 24.04, the `.exe` for Windows (`x64` or `arm64`).

The Windows installer is not signed, so Windows warns before it runs. Check it against the release's `SHA256SUMS` first.

Or with Homebrew on macOS:

```sh
brew trust --cask orcaryn/tap/apargon
brew install --cask orcaryn/tap/apargon
```

Then double-click a `.papp`, or run `open page.papp` (macOS) or `apargon page.papp` (Linux).

The first time it opens, Apargon offers to install the papp skill, so coding agents can build apps for it (see [Build with an agent](#build-with-an-agent)).

Once a day Apargon asks GitHub for a new version. **Permissions → Check for Updates Automatically** turns it off; then watch the repository's releases for security fixes.

## Meta tags

With no tags, a page sees its own folder and nothing else. It asks for more in its `<head>`, one value per tag:

```html
<meta name="papp-read"     content="~/logs">                   <!-- see a folder -->
<meta name="papp-write"    content="./notes/*.md">             <!-- change files -->
<meta name="papp-net"      content="api.example.com:443">      <!-- one server -->
<meta name="papp-open"     content="x.com">                    <!-- its links open without asking -->
<meta name="papp-run"      content="git">                      <!-- one program -->
<meta name="papp-env"      content="AWS_PROFILE">              <!-- one variable for it -->
<meta name="papp-socket"   content="/var/run/docker.sock">     <!-- one socket -->
<meta name="papp-use"      content="notifications">            <!-- or clipboard, location, sound, camera, microphone, screen -->
<meta name="papp-shortcut" content="CommandOrControl+Shift+N"> <!-- a key that works in every app -->
<meta name="papp-node"     content="full">                     <!-- full Node -->
```

Write each tag as the browser reads it: `name` and `content` quoted, with no spaces around the `=`.

A popup lists what the tags allow before the page runs. A red line is a way to send data somewhere the tags do not name. When a page could send your data out (a red line, a program, a socket, or a server plus files it sees), the popup says how and asks you to tick "I trust this page". **Permissions → Approved Pages** takes an approval back.

A page keeps its storage (`localStorage`, IndexedDB) when you move or rename the file, as long as its content is the same as when it was last open. A copy starts empty.

With no tag, a page can still open a link in your browser, and a file (image, video, audio, PDF, text) or a folder in its app. A link asks first, with the address shown, unless the page names the site with `papp-open`.

A `papp-node` page runs as you, with only the network blocked: open one only if you trust it. [SECURITY.md](SECURITY.md) lists what Apargon enforces and what it does not.

## Windows

On Windows, a few things work differently:

- **Programs can leak.** A page's programs, and a `papp-node` page, can send any file they see to the internet. Windows lets them. So you must tick "I trust this page" before such a page opens.
- **No sockets.** A page with `papp-socket` does not open. `localhost` works through Apargon's proxy, so a program must honour `http_proxy`, as `curl` does.
- **Only `.exe` and `.com` programs.** `papp-run` does not take `.bat` or `.cmd` files.
- **Programs see less.** Only the page's folders, their own folder, and folders every app can read, like `C:\Windows` and Program Files.
- **`papp-node` writes less.** Only in the folders inside your home folder, and in the page's own folder. Never in Apargon's data or on other drives.

## Build with an agent

Give it [`skills/papp/SKILL.md`](skills/papp/SKILL.md). Apargon installs it to `~/.claude/skills/papp/` and `~/.agents/skills/papp/` if you say yes: on its first run, each time you open it without a page until the skill is there, and from **Help → Install the papp Skill for Agents…**. Without Apargon:

```sh
for dir in ~/.claude/skills/papp ~/.agents/skills/papp; do
  mkdir -p "$dir"
  curl -fsSL https://apargon.com/.well-known/agent-skills/papp/SKILL.md -o "$dir/SKILL.md"
done
```

Then ask for an app: "Make me a papp that lists the Markdown notes in ~/notes and lets me edit them."
