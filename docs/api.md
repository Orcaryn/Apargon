# The page API

A page without `resworb-node` has no Node. It reaches files and programs only through `window.resworb`, which exists as the global `resworb` before the page's first script runs.

## Rules for every call

- Every call except `dir` returns a promise.
- Paths are relative to the page's folder. `~` and `~/…` mean your home folder. Absolute paths work too.
- resworb checks every path against the page's grants, on its real path. A path out of reach rejects with a message such as:

  ```
  resworb: this page may not see /Users/you/secret.txt. Ask for it with <meta name="resworb-read" content="...">.
  ```

  A write out of reach says `change` and `resworb-write` instead.

- File system errors keep Node's `code`: `err.code === 'ENOENT'` for a missing file. Permission errors have no `code`.
- Top-level `await` needs `<script type="module">`. In a classic `<script>`, use `.then`.

| Call                                | Needs         | Returns                                  |
| ----------------------------------- | ------------- | ---------------------------------------- |
| `readFile(path, encoding = 'utf8')` | see           | a string, or a `Uint8Array` for `null`   |
| `writeFile(path, data)`             | change        | nothing                                  |
| `readdir(path)`                     | list          | the names the page may list              |
| `stat(path)`                        | list          | `{ isFile, isDirectory, size, mtimeMs }` |
| `exists(path)`                      | list          | `true` or `false`                        |
| `mkdir(path)`                       | change        | nothing                                  |
| `rm(path)`                          | change        | nothing                                  |
| `rename(from, to)`                  | change, both  | nothing                                  |
| `run(program, args, options)`       | `resworb-run` | `{ status, stdout, stderr }`             |
| `watch(path, callback)`             | list          | a function that stops the watch          |
| `dir`                               | nothing       | the page's folder, as a string           |

"See" means the page may read the file. "List" adds the folders on the way to a wildcard match. "Change" means the own folder or a `resworb-write` folder.

## Files

### `readFile(path, encoding = 'utf8')`

Reads a file. Pass any encoding Node knows (`'utf8'`, `'latin1'`, `'base64'`), or `null` for the bytes as a `Uint8Array`. Anything else, such as an options object, is refused.

```js
const text = await resworb.readFile('notes.txt');
const png = await resworb.readFile('logo.png', null);
```

### `writeFile(path, data)`

Writes a string or a `Uint8Array`, replacing the file. The folder must exist.

```js
await resworb.writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
```

### `readdir(path)`

Lists a folder. Returns only the names the page may list, so never a hidden name.

### `stat(path)`

Returns plain values, not methods: `isFile` and `isDirectory` are booleans.

```js
const { isDirectory, size, mtimeMs } = await resworb.stat('data');
```

### `exists(path)`

Returns `false` for a missing file the page could reach. For a path out of reach, it rejects.

### `mkdir(path)`

Creates a folder and any missing parents. Each folder it creates must be changeable.

### `rm(path)`

Deletes a file, or a folder and everything in it. Each file inside must be changeable, hidden ones too, so a folder holding a `.DS_Store` cannot be deleted unless a tag names it.

### `rename(from, to)`

Moves or renames. Both paths must be changeable.

## Programs

### `run(program, args = [], { cwd, input } = {})`

Runs a program declared with `resworb-run`, called by its file name.

```js
const { status, stdout, stderr } = await resworb.run('git', ['log', '--oneline', '-20']);
```

- `args` must be an array.
- `cwd` is the working folder. It defaults to the page's folder and must be one the page may list.
- `input` is a string sent to the program's standard input.
- `status` is the exit code, or `null` if a signal stopped the program.
- `stdout` and `stderr` are UTF-8 strings, returned when the program exits.
- There is no timeout and no way to set environment variables. If the program never exits, the promise never settles.

For a page with `resworb-net`, the program gets `http_proxy`, `https_proxy` and `no_proxy`.

## Watching

### `watch(path, callback)`

Calls `callback(file)` when something changes; `file` is relative to the page's folder. Returns a promise of a function that stops the watch.

```js
const stop = await resworb.watch('notes.txt', () => load());
await stop(); // later
```

- A watched folder reports changes to its own entries, not to its subfolders'.
- A watched file stays watched when an editor saves by renaming a new file over it.
- The file need not exist yet; its folder must.
- One save may call `callback` more than once. Make it safe to repeat.
- A reload stops every watch.

## `dir`

The page's folder as an absolute path, available at once:

```js
document.title = resworb.dir;
```

## Files loaded by HTML

`<script src>`, `<link href>` and `<img src>` get the same check as `readFile`. A file out of reach returns a 403: `resworb: this page may not see …`.

- Read data with `readFile`, not `fetch`.
- Load libraries with a classic `<script src="lib.js">`.
- Inline `<script type="module">` works.

## Browser storage

All pages share one browser data folder, resworb's `pages/`. Treat `localStorage` and IndexedDB as shared between pages and easy to lose. Keep data in files.

## Full-Node pages

A page with `<meta name="resworb-node" content="full">` has Node instead of `window.resworb`. Use a classic `<script>`:

```html
<script>
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');

  const here = path.dirname(decodeURIComponent(location.pathname)); // the page's folder
  const log = execFileSync('git', ['log', '--oneline', '-5'], { cwd: here, encoding: 'utf8' });
  fs.writeFileSync(path.join(here, 'log.txt'), log);
</script>
```

Sockets and DNS still fail, except for declared `resworb-net` hosts. Writes to resworb's own data fail.
