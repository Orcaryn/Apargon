---
name: resworb
description: Use when asked for a visualizer, viewer, editor, dashboard or "a page" over files on this machine, especially one that must also change them; when a .lmth file is mentioned or to be created; or when a quick local tool would otherwise become an Electron app or a server plus a browser tab. Not for anything hosted or shared with people who did not write it.
---

# resworb

A `.lmth` file is HTML that opens in resworb. With no tags it may see and change the
files in its own folder through `window.resworb`, not its subfolders, and nothing else: no other files, no
programs, no network. It opens without asking. Anything more is asked for in `<meta>`
tags, and the user approves the list in a popup before the page runs.

## When

Use it when the user wants to _see or edit local files through a UI_ and the result is a
tool they will open again: a viewer over a folder of notes, a dashboard over logs, an
editor for a config format, a form that writes JSON. One file, next to the data, opened by
double-click.

Do not use it when:

- the answer is a one-off — read the files and answer instead;
- the result must be hosted or shared with someone else — that is a web app;
- the user is on Windows — resworb refuses to open pages there.

## A page with no tags

Put the page in the folder it works on. Paths are relative to that folder.

```html
<script type="module">
  const notes = (await resworb.exists('notes.txt')) ? await resworb.readFile('notes.txt') : '';
  await resworb.writeFile('notes.txt', notes + '\nmore');
</script>
```

`window.resworb` has Node's `fs` names. Each call returns a promise, which rejects when a
path is not granted; top-level `await` needs `<script type="module">`:

- `readFile(path, encoding = 'utf8')` — `null` for bytes (`Uint8Array`)
- `writeFile(path, stringOrBytes)`, `mkdir(path)` (recursive), `rm(path)` (recursive),
  `rename(from, to)`
- `readdir(path)` → names, `stat(path)` → `{ isFile, isDirectory, size, mtimeMs }`,
  `exists(path)`
- `run(program, args, { cwd, input })` → `{ status, stdout, stderr }`, for declared
  programs only
- `watch(path, callback)` → a function that stops it. `callback(file)` gets the changed
  path, relative to the page. A folder reports its own entries, not its subfolders'; a
  file keeps being watched when an editor saves it by renaming a new file over it
- `dir` — the page's folder (a string, not a call)

There is no `require`. Hidden files (names starting with a dot) are never visible unless a
tag names them. Libraries go next to the page as `.js` and load with `<script src>`; no
CDN, no web fonts.

- The files are the truth; the page is a view. Write back in the files' own format. Never
  keep the only copy of anything in the page.
- Saving the page, or any `.css`/`.js` next to it, reloads the window.
- A page in the home folder, Desktop, Documents or Downloads gets no folder by default.
  Give it its own folder.
- With no tags, data and libraries must sit in the page's folder itself, not a subfolder.
  With any tag, the own folder includes its subfolders.

## Tags

One value per tag. Ask for as little as the page needs: every tag is a line in the popup,
and broad ones show in red.

```html
<meta name="resworb-read"  content="~/logs">              <!-- see a folder -->
<meta name="resworb-write" content="./reports/*.md">      <!-- see, change, delete -->
<meta name="resworb-net"   content="api.example.com:443"> <!-- one server, one port -->
<meta name="resworb-run"   content="git">                 <!-- one program -->
<meta name="resworb-node"  content="full">                <!-- full Node, red -->
```

- Folders: relative to the page, `~/…`, or absolute. They must exist. A folder includes
  its subfolders. `*` matches within one name (`~/notes/*.md`, `~/git/*/docs`).
- Net: `host:port`. `*.example.com:443` is any subdomain, not `example.com` itself.
  `localhost:11434` is a program on this computer. Reach servers with `fetch` (CORS is
  off) or with a declared `curl`. macOS only for now.
- Run: a program name or full path. It runs with the page's network and, on macOS, its
  write limits, but it can read every file: prefer a page that does the work itself.
- Node: `require` works and every other tag but `resworb-net` is refused as redundant.
  Use it only when the page truly needs Node; it turns the page red.

Red in the popup: `/`, `~`, folders right under `/`, Desktop, Documents, Downloads,
`~/Library`, hidden paths, wildcards right under `/` or `~`, `*` hosts, `*.com`, any-port
hosts, every `resworb-run`, and `resworb-node`. Wildcards elsewhere show yellow.

## Do not

- Ask for `resworb-node` to avoid writing tags. Ask for the folders and servers instead.
- Launch a browser or another app from a program to reach the network. That is a gap in
  the fence, not a route.
- Work around a dialog saying the process can open sockets. It means resworb was not in
  the sandbox and refused, which is the check working.

## Delivering

Write the file, say where it is, and tell the user to double-click it (or `open
page.lmth`). If it has tags, say what the popup will list. Point them at
`examples/hello.lmth` in the resworb repository if they want to see the shape first.
`SECURITY.md` there has the full boundary.
