---
name: resworb
description: Use when the user wants a small app with a window, for their own computer, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .lmth file. Not for websites, apps other people will install, or Windows.
---

# resworb

A `.lmth` file is HTML that opens in resworb.

| Page      | Gets                                                                         | Asks first?  |
| --------- | ---------------------------------------------------------------------------- | ------------ |
| no tags   | the files directly in its own folder, through `window.resworb`; nothing else | no           |
| with tags | what its `<meta>` tags list                                                  | yes, a popup |

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
| the user is on Windows                                                                | resworb refuses to open pages there         |
| the app talks to a remote server over anything but HTTP(S), such as a database or SSH | only `localhost` ports are reached directly |
| the app needs the camera, microphone, screen capture, notifications or location       | they are denied                             |
| the app needs a second window, or must run with its window closed                     | a page has one window, and closing it quits |

## A page with no tags

Put the page in the folder it works on. Paths are relative to that folder.

```html
<script type="module">
  const notes = (await resworb.exists('notes.txt')) ? await resworb.readFile('notes.txt') : '';
  await resworb.writeFile('notes.txt', notes + '\nmore');
</script>
```

`window.resworb` uses Node's `fs` names. Each call returns a promise, which rejects if the path is not granted. Top-level `await` needs `<script type="module">`.

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
- A page in the home folder, Desktop, Documents or Downloads gets no folder. Give it a folder of its own.
- With no tags, data and libraries must sit in the page's folder itself, not in a subfolder. With any tag, the page also gets its subfolders.

## Tags

One value per tag. Ask for as little as the page needs: every tag adds a line to the popup, and broad ones show red.

```html
<meta name="resworb-read"  content="~/logs">              <!-- see a folder -->
<meta name="resworb-write" content="./reports/*.md">      <!-- see, change, delete -->
<meta name="resworb-net"   content="api.example.com:443"> <!-- one server, one port -->
<meta name="resworb-run"   content="git">                 <!-- one program -->
<meta name="resworb-node"  content="full">                <!-- full Node, red -->
```

**Folders** (`resworb-read`, `resworb-write`)

- Relative to the page, `~/…`, or absolute.
- The part before the first `*` must exist.
- A folder includes its subfolders.
- `*` matches within one name: `~/notes/*.md`, `~/git/*/docs`.

**Servers** (`resworb-net`)

- Always `host:port`.
- `*.example.com:443` is any subdomain, not `example.com` itself.
- `localhost:11434` is a program on this computer.
- Reach servers with `fetch` (CORS is off) or a declared `curl`.

**Programs** (`resworb-run`)

- A program name or full path.
- The program shares the page's network and write limits, but it can read every file. On Linux it may also write hidden files in the page's folders.
- Prefer a page that does the work itself.

**Full Node** (`resworb-node`)

- The only value is `full`. `require` works.
- Every other tag except `resworb-net` is refused as redundant.
- Use it only when the page truly needs Node.

**Red in the popup**

- folders: `/`, `~`, folders right under `/`, Desktop, Documents, Downloads, `~/Library`, hidden paths, wildcards right under `/` or `~`;
- servers: `*` hosts, `*.com`, any-port hosts;
- every `resworb-run`, and `resworb-node`.

Other wildcards show yellow.

## Do not

- Ask for `resworb-node` to avoid writing tags. Ask for the folders and servers instead.
- Launch a browser or another app from a program to reach the network. That is a gap in the fence, not a route.
- Work around a dialog saying the process can open sockets. It means resworb was not in the sandbox and refused to open the page: the check working.

## Delivering

1. Write the file and say where it is.
2. Tell the user to double-click it, or run `open page.lmth` (macOS) or `resworb page.lmth` (Linux).
3. If it has tags, say what the popup will list.

To see the shape first, point them at `examples/hello.lmth` in the resworb repository. `SECURITY.md` there has the full boundary.
