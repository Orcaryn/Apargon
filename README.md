# Apargon

Apargon is a desktop app for macOS and Linux that runs papps.

A papp is a single `.papp` file: an HTML file with extra `<meta>` tags. It works like a desktop app, without the setup a desktop app needs: no installer, no server, no build step. You double-click it, and Apargon opens it in a sandboxed window.

The sandbox blocks everything the tags don't allow, and a popup shows what they ask for before the page runs.

A coding agent can write a papp from one prompt.

## Install

On macOS or Ubuntu 24.04, with the papp skill for agents (`sh -s -- --no-skill` without it):

```sh
curl -fsSL https://apargon.com/install.sh | sh
```

[`install.sh`](install.sh) checks the app's notarization on macOS, and the `.deb` against the release's `SHA256SUMS` on Linux, before it installs it. Or download from the [latest release](https://github.com/Orcaryn/Apargon/releases/latest): the `.dmg` for macOS (`arm64` or `x64`), the `.deb` for Ubuntu 24.04. Windows is not supported yet.

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
<meta name="papp-run"      content="git">                      <!-- one program -->
<meta name="papp-env"      content="AWS_PROFILE">              <!-- one variable for it -->
<meta name="papp-socket"   content="/var/run/docker.sock">     <!-- one socket -->
<meta name="papp-use"      content="notifications">            <!-- or clipboard, location, sound, camera, microphone, screen -->
<meta name="papp-shortcut" content="CommandOrControl+Shift+N"> <!-- a key that works in every app -->
<meta name="papp-node"     content="full">                     <!-- full Node -->
```

A popup lists what the tags allow before the page runs. Red lines need a tick. **Permissions → Approved Pages** takes an approval back.

A `papp-node` page runs as you, with only the network blocked: open one only if you trust it. [SECURITY.md](SECURITY.md) lists what Apargon enforces and what it does not.

## Build with an agent

Give it [`skills/papp/SKILL.md`](skills/papp/SKILL.md). Apargon installs it to `~/.claude/skills/papp/` and `~/.agents/skills/papp/` if you say yes: on its first run, each time you open it without a page until the skill is there, and from **Help → Install the papp Skill for Agents…**. Without Apargon:

```sh
for dir in ~/.claude/skills/papp ~/.agents/skills/papp; do
  mkdir -p "$dir"
  curl -fsSL https://apargon.com/.well-known/agent-skills/papp/SKILL.md -o "$dir/SKILL.md"
done
```

Then ask for an app: "Make me a papp that lists the Markdown notes in ~/notes and lets me edit them."
