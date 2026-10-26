---
name: papp
description: Use when the user wants a small app with a window, for their own computer, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .papp file. Not for websites, apps other people will install, or Windows.
---

# papp

A `.papp` file is HTML that opens in papp.

| Page      | Gets                                                                      | Asks first?  |
| --------- | ------------------------------------------------------------------------- | ------------ |
| no tags   | to see its own folder and subfolders, through `window.papp`; nothing else | no           |
| with tags | what its `<meta>` tags list                                               | yes, a popup |

## When

Use it when the user wants a small app with a window, for themselves, that they will open again:

- a viewer for a folder of notes;
- a dashboard over logs;
- an editor for a config format;
- a front end for a script or a local model.

One file, next to the data, opened by double-click.

Do not use it when:

| Situation                                                                             | Why                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| the task is a one-off                                                                 | read the files and answer instead           |
| the result must be hosted or shared                                                   | that is a web app                           |
| the user is on Windows                                                                | papp refuses to open pages there            |
| the app talks to a remote server over anything but HTTP(S), such as a database or SSH | only `localhost` ports are reached directly |
| the app needs the camera, microphone, screen capture, notifications or location       | they are denied                             |
| the app needs a second window, or must run with its window closed                     | a page has one window, and closing it quits |

## A page that saves

Put the page in the folder it works on. Paths are relative to that folder. With no tags it may only look; to save, it names what it saves.

```html
<meta name="papp-write" content="./notes.txt">
<script type="module">
  const notes = (await papp.exists('notes.txt')) ? await papp.readFile('notes.txt') : '';
  await papp.writeFile('notes.txt', notes + '\nmore');
</script>
```

`window.papp` uses Node's `fs` names. Each call returns a promise, which rejects if the path is not granted. Top-level `await` needs `<script type="module">`.

| Call                                 | Returns / does                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `readFile(path, encoding = 'utf8')`  | a string; pass `null` for bytes (`Uint8Array`)                                                |
| `writeFile(path, stringOrBytes)`     | writes the file; its folder must exist                                                        |
| `mkdir(path)`, `rm(path)`            | both recursive                                                                                |
| `rename(from, to)`                   | moves or renames                                                                              |
| `readdir(path)`                      | names                                                                                         |
| `stat(path)`                         | `{ isFile, isDirectory, size, mtimeMs }`                                                      |
| `exists(path)`                       | `true` or `false`                                                                             |
| `run(program, args, { cwd, input })` | `{ status, stdout, stderr }`, for declared programs only                                      |
| `watch(path, callback)`              | a function that stops the watch; `callback(file)` gets the changed path, relative to the page |
| `dir`                                | the page's folder, as a string (not a call)                                                   |

About `watch`:

- A folder reports its own entries, not its subfolders'.
- A file stays watched when an editor saves it by renaming a new file over it.

Rules for the page:

- There is no `require`.
- Hidden files (names that start with a dot) stay invisible unless a tag names them.
- Put libraries next to the page as `.js` files and load them with `<script src>`. No CDN, no web fonts.
- The files are the truth; the page is a view. Write back in the files' own format, and never keep the only copy of anything in the page.
- Saving the page, or a `.css` or `.js` file in its folder or below, reloads the window.
- Give the page an icon next to it: `<link rel="icon" href="icon.svg">`. It becomes the page's icon in the Dock and on its file in Finder (macOS) or the window's icon (Linux), with papp's badge on its corner. Use SVG or a PNG of 512 pixels or more: a 16-pixel icon is blown up blurry. It must be a file the page may see.
- A page in the home folder, Desktop, Documents or Downloads gets no folder. Give it a folder of its own.
- The own folder is to see only, subfolders included. Ask for `papp-write` with the narrowest value: one file, one subfolder, or `./*`.
- `papp-write` skips pages (`.papp`) unless the value ends in `.papp`, which shows red. Ask for that only for a page that edits pages.

## Tags

One value per tag, quoted, in `<head>` before any `<script>`: papp reads no further, and skips comments. Ask for as little as the page needs: every tag adds a line to the popup, and broad ones show red.

```html
<meta name="papp-read"  content="~/logs">              <!-- see a folder -->
<meta name="papp-write" content="./reports/*.md">      <!-- see, change, delete -->
<meta name="papp-net"   content="api.example.com:443"> <!-- one server, one port -->
<meta name="papp-run"   content="git">                 <!-- one program -->
<meta name="papp-env"   content="AWS_PROFILE">         <!-- one variable for programs -->
<meta name="papp-socket" content="/var/run/docker.sock"> <!-- one socket file, red -->
<meta name="papp-node"  content="full">                <!-- full Node, red -->
```

**Folders** (`papp-read`, `papp-write`)

- Relative to the page, `~/…`, or absolute.
- The part before the first `*` must exist. A value without `*` may name a file yet to be made, if its folder exists.
- A folder includes its subfolders.
- `*` matches within one name: `~/notes/*.md`, `~/git/*/docs`.

**Servers** (`papp-net`)

- Always `host:port`.
- `*.example.com:443` is any subdomain, not `example.com` itself.
- `localhost:11434` is a program on this computer.
- Reach servers with `fetch` (CORS is off) or a declared `curl`.

**Programs** (`papp-run`)

- A program name or full path.
- The program shares the page's network and write limits, but it can read every file but keys and logins (`~/.ssh`, `~/.aws`, browser profiles). On Linux it may also write hidden files in the page's folders.
- It gets `PATH`, `HOME`, `USER`, `LANG` and a few others. For one more, add `papp-env` with its name. A name like `*_TOKEN` or `*_KEY` shows red.

**Keys and logins**

- Hidden from the page and its programs unless a `papp-read` or `papp-write` names one, such as `~/.ssh`. That line shows red.
- Name one only if the page truly needs it.
- Prefer a page that does the work itself.

**Sockets** (`papp-socket`)

- The sandbox hides every socket file (Docker, D-Bus, the SSH and GPG agents, tmux): each leads to a program with network. This tag lets one back in, for the page and its programs.
- A socket file or a folder of them, which must exist when the page opens. No wildcards. Always red.
- A program may need the address too: pass `SSH_AUTH_SOCK` or `DOCKER_HOST` with `papp-env`.

**Full Node** (`papp-node`)

- The only value is `full`. `require` works.
- Every other tag except `papp-net` and `papp-socket` is refused as redundant.
- Use it only when the page truly needs Node.

**Red in the popup**

- folders: `/`, `~`, folders right under `/`, Desktop, Documents, Downloads, `~/Library`, hidden paths, wildcards right under `/` or `~`;
- servers: `*` hosts, `*.com`, any-port hosts;
- folders of keys and logins;
- variables named like a secret;
- every `papp-run`, `papp-socket` and `papp-node`.

Other wildcards show yellow.

## Do not

- Ask for `papp-node` to avoid writing tags. Ask for the folders and servers instead.
- Ask for `papp-socket` on a path such as `/run` or `/tmp` to get everything back. Name the one socket the page needs.
- Launch a browser or another app from a program to reach the network. That is a gap in the fence, not a route.
- Work around a dialog saying the process can open sockets. It means papp was not in the sandbox and refused to open the page: the check working.

## Delivering

1. Write the file and say where it is.
2. Tell the user to double-click it, or run `open page.papp` (macOS) or `papp page.papp` (Linux).
3. If it has tags, say what the popup will list.

To see the shape first, point them at `examples/hello.papp` in the papp repository. `SECURITY.md` there has the full boundary.
