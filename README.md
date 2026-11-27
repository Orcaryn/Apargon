# Apargon

Create desktop apps with any AI, for macOS, Windows, and Linux.

1. Describe your app to any coding agent and ask for a papp (Personal App).
2. Double-click the `.papp` file.
3. Approve the permissions.
4. It runs.

Each app is a single HTML file on your disk, without a build step, accounts, or cloud services. 

Apargon works like a reverse browser: apps can read your local files, and stay offline unless you allow a site.

With one file, you can have:

- **Your own daily apps:** an email client locked to your mail server, a personal finance tracker over your bank exports with no internet at all, a Markdown notes app over a folder you own, or an order or inbox tracker.
- **Native desktop tools:** a focus timer in the menu bar, a floating window on a global shortcut, or a folder organizer that runs at login and sends notifications.
- **A desk for your scripts and agents:** drop a `.papp` file beside any folder of Markdown, data, or media to review drafts, play local renders, run `ffmpeg` or `git`, and write your decisions back to disk.
- **Software for one afternoon:** a photo culler, or a side-by-side reviewer for a batch of files or AI rewrites. Use it until the folder is empty, then delete the file.

Because every app is an HTML file on your disk, it's malleable software too: open it, change anything you want, save, and the window reloads.

## Install

macOS and Ubuntu 24.04:

```sh
curl -fsSL https://apargon.com/install.sh | sh
```

Homebrew (macOS):

```sh
brew trust --cask orcaryn/tap/apargon
brew install --cask orcaryn/tap/apargon
```

Installers for macOS (`.dmg`), Ubuntu 24.04 (`.deb`), and Windows (`.exe`) are on the [latest release](https://github.com/Orcaryn/Apargon/releases/latest).

Double-click a `.papp` file to open it, or run `open notes.papp` (macOS) or `apargon notes.papp` (Linux).

## Build with an agent

Apargon offers to install the agent skill ([`skills/papp/SKILL.md`](skills/papp/SKILL.md)) on first run. To install it manually:

```sh
for dir in ~/.claude/skills/papp ~/.agents/skills/papp; do
  mkdir -p "$dir"
  curl -fsSL https://apargon.com/.well-known/agent-skills/papp/SKILL.md -o "$dir/SKILL.md"
done
```

## Example

```html
<!doctype html>
<meta charset="utf-8">
<meta name="papp-id" content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77">
<title>Notes</title>
<textarea id="text"></textarea>
<button id="save">Save</button>
<script type="module">
  const text = document.getElementById('text');
  const save = document.getElementById('save');
  const file = `${papp.folder}/notes.txt`;
  text.value = (await papp.exists(file)) ? await papp.readFile(file) : '';
  save.onclick = () => papp.writeFile(file, text.value);
</script>
```

## Capabilities

Without permission tags, a `.papp` file opens immediately. It can read your local disks, write to its own folder, open file pickers, store OS-sealed secrets, set a custom icon, native menus, and tray icon, print, and live-reload on save, with no network.

`<meta>` tags in `<head>` unlock more, one capability at a time. One folder or one CLI tool doesn't give the app your other files or the internet.

- **Window and desktop:** frameless, transparent, always-on-top, click-through, and screen-share-private windows, notifications, sound, global shortcuts, running in the background, and starting at login.
- **Files, programs, and devices:** write access to specific folders, CLI tools (`git`, `ffmpeg`, scripts) running inside the same sandbox and network fence, Unix sockets, clipboard, camera, microphone, screen capture, location, cloud folders, USB, serial, HID, MIDI, and Bluetooth.
- **Network:** an exact `host:port` allowlist enforced by Apargon's proxy, plus a local or LAN HTTP server.
- **No limits:** `papp-system` runs the `.papp` file as an unrestricted Node script in a window when you need what the sandbox can't do.

```html
<meta name="papp-id"              content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77"> <!-- who it is, always -->
<meta name="papp-write"           content="~/notes/">                 <!-- change files in one folder; all instead of content for any -->
<meta name="papp-run"             content="git">                      <!-- one program, with the same limits; add unfenced for none -->
<meta name="papp-net"             content="api.example.com">          <!-- one site, port 443 unless you add :port; its links open too -->
<meta name="papp-listen">                                             <!-- answer this computer; add network for your network too -->
<meta name="papp-socket"          content="/var/run/example.sock">    <!-- one other program -->
<meta name="papp-use"             content="notifications">            <!-- one device or extra per tag -->
<meta name="papp-window"          size="900x600" title-bar="no">      <!-- the window's size and look -->
<meta name="papp-env"             content="AWS_PROFILE">              <!-- one variable for its programs -->
<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N"> <!-- a key that works in every app -->
<meta name="papp-system">                                             <!-- everything: Node and the internet -->
```

Any tag that lets data leave your computer, changes files outside the app's folder, watches you, or works with its window closed asks in a plain-English popup first. Approvals are pinned to the file's exact bytes, unless you choose to trust its changes, and can be revoked at any time.

## Docs

- [`skills/papp/SKILL.md`](skills/papp/SKILL.md): full `<meta>` tag and `window.papp` API reference.
- [`SECURITY.md`](SECURITY.md): security model, threat boundaries, and platform notes (macOS, Linux, and Windows).
