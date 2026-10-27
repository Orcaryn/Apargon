# papp

|           | Network | Your files |
| --------- | ------- | ---------- |
| A browser | yes     | no         |
| papp      | no      | yes        |

papp opens an HTML file from disk. The page gets the files it asks for, and the OS denies it the network. Each `.papp` file is one personal app, such as a viewer, an editor or a dashboard. You or an agent write it; papp runs it.

## Download

From the [latest release](https://github.com/Orcaryn/resworb/releases/latest):

| Platform             | File              |
| -------------------- | ----------------- |
| macOS, Apple silicon | `…-arm64.dmg`     |
| macOS, Intel         | `…-x64.dmg`       |
| Linux, Ubuntu 24.04  | `…_amd64.deb`     |
| Windows              | not supported yet |

`SHA256SUMS` in the release checks the download.

## Install

- **macOS:** open the `.dmg` and drag papp to Applications.
- **Linux:** `sudo apt install ./<the file>.deb`. It brings `bwrap` and the AppArmor profile Ubuntu 23.10 and later need. Tested on a server, not yet on a desktop.

Double-click a `.papp` file to open it, or run `open page.papp` (macOS) or `papp page.papp` (Linux).

Once a day papp checks GitHub for a new version. macOS installs it on the next start; Linux shows a link. **Permissions → Check for Updates Automatically** turns this off. If you turn it off, watch this repository (**Watch → Custom → Releases**) to hear about security fixes.

## Meta tags

A page with no tags may see the files in its own folder, and nothing else. To do more, it asks in `<meta>` tags in its `<head>`, one value each:

```html
<meta name="papp-read"   content="~/logs">               <!-- see a folder -->
<meta name="papp-write"  content="./notes/*.md">         <!-- see, change, delete -->
<meta name="papp-net"    content="api.example.com:443">  <!-- one server, one port -->
<meta name="papp-run"    content="git">                  <!-- one program -->
<meta name="papp-env"    content="AWS_PROFILE">          <!-- one variable for its programs -->
<meta name="papp-socket" content="/var/run/docker.sock"> <!-- one socket file -->
<meta name="papp-use"    content="notifications">        <!-- or clipboard, location, sound, camera, microphone, screen -->
<meta name="papp-shortcut" content="CommandOrControl+Shift+N"> <!-- a key combination that works in every app -->
<meta name="papp-node"   content="full">                 <!-- full Node: any file, any program -->
```

Before the page runs, a popup says in plain words what the tags allow. Red marks broad requests and needs a tick; yellow marks other wildcards. papp remembers your answer until the tags change. **Permissions → Approved Pages** takes it back.

A page without `papp-node` is held to its tags. A page with `papp-node` runs as you, like a script, with only the network blocked: open one only if you trust it. [SECURITY.md](SECURITY.md) says what papp enforces and what it does not.

## Build with agents

Give your agent the papp skill, [`skills/papp/SKILL.md`](skills/papp/SKILL.md). For Claude Code:

```sh
mkdir -p ~/.claude/skills/papp
curl -fsSL https://raw.githubusercontent.com/Orcaryn/resworb/main/skills/papp/SKILL.md -o ~/.claude/skills/papp/SKILL.md
```

Other agents: give them the same file.

Then ask for what you want:

> Make me a papp that lists the Markdown notes in ~/notes and lets me edit them.

The agent writes the page, then tells you where it is and what the popup will ask.

Got a page from someone else? Ask the agent to check it before you open it. The skill tells it what to look for.
