# Apargon

Apargon runs a `.papp` file, one HTML file, as a desktop app on macOS or Linux. The page gets exactly what its tags ask for: files, servers, programs, devices. Everything else is blocked; the network by the OS itself.

## Install

From the [latest release](https://github.com/Orcaryn/Apargon/releases/latest): the `.dmg` for macOS (`arm64` or `x64`), the `.deb` for Ubuntu 24.04. Windows is not supported yet.

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
mkdir -p ~/.claude/skills/papp
curl -fsSL https://raw.githubusercontent.com/Orcaryn/Apargon/main/skills/papp/SKILL.md -o ~/.claude/skills/papp/SKILL.md
```

Then ask for an app: "Make me a papp that lists the Markdown notes in ~/notes and lets me edit them."
