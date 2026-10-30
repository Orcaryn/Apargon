---
name: papp
description: Use when the user wants an app with a window on their own computer, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .papp file. Not for websites or Windows.
---

# Apargon

## What it is

Apargon runs a `.papp` file, one HTML file, as a desktop app on macOS or Linux. The page gets exactly what its tags ask for: files, servers, programs, devices. Everything else is blocked; the network by the OS itself.

Further reading and code: https://github.com/Orcaryn/Apargon

## How to use

```html
<!doctype html>
<meta charset="utf-8">
<meta name="papp-write" content="./notes.txt">
<title>Notes</title>
<textarea id="text"></textarea>
<button id="save">Save</button>
<script type="module">
  text.value = (await papp.exists('notes.txt')) ? await papp.readFile('notes.txt') : '';
  save.onclick = () => papp.writeFile('notes.txt', text.value);
</script>
```

- The user opens it by double-click, or `open page.papp` (macOS), `apargon page.papp` (Linux). With tags, a popup asks first.
- Saving a `.papp`, `.css` or `.js` in its folder reloads the window. New tags need the page reopened.
- A link (`<a target="_blank">`, `window.open`, `papp.open`) opens in the browser. Apargon asks first, address shown, unless the page names the site with `papp-open`.

### `window.papp`

The page reaches files and programs only through `papp`. A relative path starts at the page's folder.

```ts
type Bytes = Uint8Array;
// size and mtimeMs only for files the page may see
type Stat = { isFile: boolean; isDirectory: boolean; size?: number; mtimeMs?: number };
type Exit = { status: number | null; signal: string | null };

declare const papp: {
  // the page's folder
  dir: string;
  // range is in bytes
  readFile(path: string, encoding?: 'utf8', range?: { offset?: number; length?: number }): Promise<string>;
  readFile(path: string, encoding: null, range?: { offset?: number; length?: number }): Promise<Bytes>;
  // the folder must exist
  writeFile(path: string, data: string | Bytes): Promise<void>;
  appendFile(path: string, data: string | Bytes): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  // recursive
  mkdir(path: string): Promise<void>;
  // recursive
  rm(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  // a link is described as itself, not what it points to
  readdir(path: string, options: { stats: true }): Promise<({ name: string } & Stat)[]>;
  stat(path: string): Promise<Stat>;
  exists(path: string): Promise<boolean>;
  // the user picks; the page may see the picks until it reloads; [] if cancelled
  pick(options?: { folder?: boolean; multiple?: boolean }): Promise<string[]>;
  // the user picks a folder; never replaces a file: a taken name becomes "name (2)"; [] if cancelled
  saveAs(files: Record<string, string | Bytes>): Promise<string[]>;
  // an http(s) link in the browser, a folder in the file manager, or a file in its viewer (images, video, audio, PDF, text)
  open(pathOrLink: string): Promise<void>;
  // timeout in ms stops it; encoding null gives bytes
  run(program: string, args?: string[], options?: { cwd?: string; input?: string | Bytes; encoding?: 'utf8' | null; timeout?: number }):
    Promise<Exit & { stdout: string | Bytes; stderr: string | Bytes }>;
  spawn(program: string, args?: string[], options?: { cwd?: string; onOutput?: (stream: 'stdout' | 'stderr', text: string) => void }):
    Promise<{ write(data: string | Bytes): Promise<void>; end(): Promise<void>; kill(): Promise<void>; done: Promise<Exit> }>;
  // file is relative to the page's folder; a new file counts as changed; resolves to a stop function
  watch(path: string, callback: (file: string, kind: 'changed' | 'removed') => void, options?: { recursive?: boolean }): Promise<() => Promise<void>>;
  // needs papp-use notifications; text only, a click brings the window forward
  notify(title: string, body?: string): Promise<void>;
  // a menu-bar icon with a title of up to 24 characters, no menu; a click brings the window forward; null removes it
  tray(title: string | null): Promise<void>;
  // runs on a papp-shortcut; returns a stop function right away
  onShortcut(callback: (keys: string) => void): () => void;
};
// A call the tags do not allow rejects with an Error naming the tag to add. File errors carry Node's code, such as 'ENOENT'.
```

With `papp-node`, the page has Node (`require`, `process`) instead of `papp`. It runs as you, with no file limits; the network stays blocked. `require('@electron/remote')` is Electron's main process, for what `papp` cannot do: windows that float above others, show on every Space or have no frame (`BrowserWindow`), a menu-bar menu (`Tray`, `Menu`), other displays (`screen`), notifications (`Notification`).

```js
require('@electron/remote').getCurrentWindow().setAlwaysOnTop(true, 'floating');
```

## Meta tags

One value per tag, in `<head>` before any `<script>`. Each tag is a line in the popup the user approves, so ask for as little as the page needs.

| The page needs to                                 | Tag                                                             |
| ------------------------------------------------- | --------------------------------------------------------------- |
| see files next to it, or below                    | nothing, unless it sits in `~`, Desktop, Documents or Downloads |
| save next to it                                   | `papp-write` `./notes.txt`, `./data`                            |
| see a folder elsewhere                            | `papp-read` `~/logs`                                            |
| change files elsewhere                            | `papp-write` `~/notes/*.md`                                     |
| call a web API                                    | `papp-net` `api.example.com:443`                                |
| talk to a server on this computer                 | `papp-net` `localhost:11434`                                    |
| talk to a device on the network                   | `papp-net` `192.168.1.5:8123`                                   |
| open its links without asking                     | `papp-open` `x.com`, `*.example.com`                            |
| use a command-line tool                           | `papp-run` `git`                                                |
| pass that tool a variable                         | `papp-env` `AWS_PROFILE`                                        |
| talk to Docker or an SSH agent                    | `papp-socket` `/var/run/docker.sock`                            |
| show a notification                               | `papp-use` `notifications`                                      |
| play sound                                        | `papp-use` `sound`                                              |
| read the clipboard from code                      | `papp-use` `clipboard`                                          |
| use the camera or microphone                      | `papp-use` `camera`, `papp-use` `microphone`                    |
| know where it is (macOS only)                     | `papp-use` `location`                                           |
| capture the screen                                | `papp-use` `screen`                                             |
| answer a key anywhere                             | `papp-shortcut` `CommandOrControl+Shift+N`                      |
| use Node, many programs, or what `papp` cannot do | `papp-node` `full`                                              |

- **Folders:** relative to the page, `~/…` or absolute; subfolders are included. `*` matches within one name, and the part before it must exist.
- **Hosts:** `papp-net` takes `host:port`, no scheme. `papp-open` takes the host alone.
- **Programs** the page runs keep its network and write limits, but can read every file except keys and logins.
- **Shortcuts:** two different modifiers, or one modifier with a function key.
- **`papp-node`** already allows every folder, program and variable; do not add `papp-read`, `papp-write`, `papp-run` or `papp-env`.

These show red in the popup:

- `papp-node`
- `papp-socket`
- `papp-write` on a hidden file or folder, on `~/Library` or a folder that holds it (such as `~`), or on a `.papp` page
- `papp-net` to this computer, the local network, an IPv4 address, any host (`*`), any port (`*`) or a whole top-level domain (`*.com`)
- `papp-open` for `*`, `*.com`, `localhost` or an IPv4 address
- `papp-run` on Linux, if the page also has `papp-write`

The user must tick "I trust this page" when any line is red, when the page has `papp-run`, or when it names a host and can see files, the clipboard, location, camera, microphone or screen. Almost every page sees its own folder, so in practice any `papp-net` or `papp-open` asks for the tick.

Use `papp-node` when the tags and `papp` cannot do what the app needs, never just to avoid writing tags. If a dialog says the process can still open sockets, do not work around it: that is the safety check working.
