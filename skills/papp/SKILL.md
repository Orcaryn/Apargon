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

### `window.papp`

The page's only way to files and programs. A relative path starts at the page's folder. Calls return promises; a path the page may not reach rejects, naming the tag to add.

| Call                                                    | Does                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `readFile(path, encoding = 'utf8', { offset, length })` | a string; encoding `null` gives a `Uint8Array`; the range, in bytes, is optional                                                 |
| `writeFile(path, stringOrBytes)`, `appendFile`          | writes in place; its folder must exist                                                                                           |
| `copyFile(from, to)`                                    | needs to see `from` and change `to`                                                                                              |
| `mkdir`, `rm`, `rename`                                 | as in Node; `mkdir` and `rm` are recursive                                                                                       |
| `readdir(path, { stats: true })`                        | names; with `stats`, `{ name, ...stat }`, a link as itself                                                                       |
| `stat(path)`, `exists(path)`                            | `{ isFile, isDirectory, size, mtimeMs }`; `true` / `false`                                                                       |
| `pick({ folder, multiple })`                            | the user picks files or a folder, not a link or a folder holding home; the page may see them until it reloads; `[]` if cancelled |
| `saveAs({ name: stringOrBytes, ... })`                  | the user picks a folder; new files only, a taken name becomes `name (2)`; the saved paths, `[]` if cancelled                     |
| `run(program, args, { cwd, input, encoding, timeout })` | `{ status, signal, stdout, stderr }`; encoding `null` gives bytes; `timeout` in ms stops it                                      |
| `spawn(program, args, { cwd, onOutput })`               | a job: `write`, `end`, `kill`, `done`                                                                                            |
| `watch(path, callback, { recursive })`                  | `callback(file, 'changed' or 'removed')`; a new file counts as changed; returns a stop function                                  |
| `notify(title, body)`                                   | a system notification                                                                                                            |
| `tray(title)`                                           | a menu-bar icon; `null` removes it                                                                                               |
| `onShortcut(callback)`                                  | on a `papp-shortcut`; returns a stop function                                                                                    |
| `dir`                                                   | the page's folder                                                                                                                |

A `papp-node` page has `require` and `process` instead; `require('@electron/remote')` is the main process.

## Meta tags

One value per tag, in `<head>` before any `<script>`. Ask for as little as the page needs: each tag is a line in the popup, and red lines need a tick.

| The page needs to                 | Tag                                                             | Popup                         |
| --------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| see files next to it, or below    | nothing, unless it sits in `~`, Desktop, Documents or Downloads |                               |
| save next to it                   | `papp-write` `./notes.txt`, `./data`                            | plain                         |
| see a folder elsewhere            | `papp-read` `~/logs`                                            | plain                         |
| change files elsewhere            | `papp-write` `~/notes/*.md`                                     | yellow                        |
| call a web API                    | `papp-net` `api.example.com:443`                                | plain                         |
| talk to a server on this computer | `papp-net` `localhost:11434`                                    | plain                         |
| talk to a device on the network   | `papp-net` `192.168.1.5:8123`                                   | red                           |
| use a command-line tool           | `papp-run` `git`                                                | red                           |
| pass that tool a variable         | `papp-env` `AWS_PROFILE`                                        | red if it looks like a secret |
| talk to Docker or an SSH agent    | `papp-socket` `/var/run/docker.sock`                            | red                           |
| show a notification               | `papp-use` `notifications`                                      | plain                         |
| play sound                        | `papp-use` `sound`                                              | yellow on Linux               |
| read the clipboard from code      | `papp-use` `clipboard`                                          | yellow                        |
| use the camera or microphone      | `papp-use` `camera`, `papp-use` `microphone`                    | yellow                        |
| know where it is (macOS only)     | `papp-use` `location`                                           | yellow                        |
| capture the screen                | `papp-use` `screen`                                             | red                           |
| answer a key anywhere             | `papp-shortcut` `CommandOrControl+Shift+N`                      | yellow                        |
| Node modules, many programs       | `papp-node` `full`, as a last resort                            | red                           |

- **Folders:** relative to the page, `~/…` or absolute, subfolders included. `*` matches within one name; the part before it must exist. `~`, Desktop, Documents, Downloads and folders holding keys are red.
- **Hosts:** always `host:port`, no scheme. `*.example.com:443` is yellow; `*` is red.
- **Programs** keep the page's network and write limits, but can read every file but keys and logins.
- **Shortcuts:** two different modifiers, or one with a function key.
- **`papp-node`** already includes read, write, run and env; do not combine them.

Never ask for `papp-node` to avoid writing tags. Never work around a dialog saying the process can still open sockets: that is the safety check working.
