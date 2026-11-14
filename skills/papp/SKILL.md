---
name: papp
description: Use when the user wants an app with a window on their own computer, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .papp file. Not for websites.
---

# Apargon

## What it is

A `.papp` file is an ordinary HTML page, plus `<meta>` tags that ask for more. Apargon runs it as a desktop app on macOS, Linux or Windows.

Every `.papp` file names itself with a UUID, in `<meta name="papp-id">`. Generate one (`crypto.randomUUID()`) when you create the file, and keep it across versions: it is the app's identity. Its folder and its secrets are kept by it, so an update finds its data. A file without one doesn't open.

Without permission tags, a `.papp` file:

- reads every local disk,
- writes only to its own folder, `~/.apargon/<id>` (`papp.folder`),
- has no network.

Each permission tag is a yes the user gives in a popup. The promise: a `.papp` file can't send anything off the computer unless the user allowed it.

Further reading and code: [https://github.com/Orcaryn/Apargon](https://github.com/Orcaryn/Apargon)

## How to use

```html
<!doctype html>
<meta charset="utf-8">
<meta name="papp-id" content="4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77">
<title>Notes</title>
<textarea id="text"></textarea>
<button id="save">Save</button>
<script type="module">
  const file = `${papp.folder}/notes.txt`;
  text.value = (await papp.exists(file)) ? await papp.readFile(file) : '';
  save.onclick = () => papp.writeFile(file, text.value);
</script>
```

- Open it with `open notes.papp` (macOS), `apargon notes.papp` (Linux) or a double-click (Windows).
- No permission tags: it opens at once. With tags: a popup asks first, with one line per tag. The yes belongs to the file's exact bytes and to what the popup showed: any change, even a comment, asks again, and so does a tag that now leads to another folder or program.
- Saving the `.papp`, or a `.css` or `.js` file it loaded, reloads the window. A `.papp` file with tags that changed doesn't load until it is opened again and approved.
- The window shows only the `.papp` file. A frame may hold a local file, never a web page. A link opens in the browser only if its site is in `papp-net`; any other is dropped.
- `window.open` on its own file opens a second window, such as `window.open('#mini', '', 'size=320x80, frame=no')`. The third argument takes `papp-window` settings for that window; `on-top`, `all-spaces`, `click-through`, `private` and `dock` stay the tag's. A bad setting opens no window.
- The window opens at 1200×800 with a frame, later where the user left it. `<title>` names it.
- `localStorage` and IndexedDB persist, in its own folder.
- On Windows, Apargon refuses a path that starts with `\\`, has a `:` after the drive letter, or has a name ending in a dot or a space.

### Icon

The favicon is the app icon, and on macOS the `.papp` file's icon too. Without one, it gets Apargon's.

```html
<link rel="icon" href="./icon.svg">
```

- SVG, PNG, ICO, JPEG, GIF or WebP: a local file, a `data:image/` URL, or a web address whose site is in `papp-net`.
- With several favicons, an SVG wins, else the one with the most pixels.
- It is drawn on a white rounded square with an Apargon badge. Use a square image without padding.

### `window.papp`

The `.papp` file reaches files and programs only through `papp`. A relative path starts at the `.papp` file's folder.

```ts
type Bytes = Uint8Array;
type Stat = { isFile: boolean; isDirectory: boolean; size: number; mtimeMs: number };
type Exit = { status: number | null; signal: string | null };
// keys as in papp-global-shortcut, such as 'CommandOrControl+S'
type MenuItem = { separator: true } | { label: string; id?: string; keys?: string; submenu?: MenuItem[] };
// checked makes a checkbox, with radio a radio button; up to 50 items a menu, nested 3 deep, 200 in all
type TrayItem = { separator: true } | { label: string; id: string; checked?: boolean; radio?: boolean } | { label: string; submenu: TrayItem[] };
type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
// state 'normal' brings a minimized window back; for fullscreen, use requestFullscreen()
// minSize and maxSize: 0 on a side is no limit; aspectRatio is width over height, 0 for none
// file names a file in the title bar, with its icon, and edited shows the unsaved dot (macOS)
// shape: the rectangles of the window, in its own pixels, that are drawn and take clicks; [] is the whole window; needs papp-window frame="no" (Windows and Linux)
type WindowState = { onTop: boolean; allSpaces: boolean; clickThrough: boolean; private: boolean; opacity: number; bounds: Rect; visible: boolean; state: 'normal' | 'minimized' | 'maximized'; resizable: boolean; minSize: Size; maxSize: Size; aspectRatio: number; file: string | null; edited: boolean; shape: Rect[] };
// headers by lowercase name; an answer without status is 200, without body is empty
type Incoming = { method: string; url: string; headers: Record<string, string>; body: Bytes };
type Answer = { status?: number; headers?: Record<string, string>; body?: string | Bytes };
// what watch, listen, connect and spawn give: close() stops it; closed resolves once it has stopped, by close() or on its own
type Handle<Closed> = { close(): Promise<void>; closed: Promise<Closed> };

declare const papp: {
  // the .papp file's folder, where relative paths start
  dir: string;
  // its own folder, ~/.apargon/<name>: the one place it writes without a tag
  folder: string;
  // offset and length are in bytes, for part of the file
  readFile(path: string, options?: { encoding?: 'utf8'; offset?: number; length?: number }): Promise<string>;
  readFile(path: string, options: { encoding: null; offset?: number; length?: number }): Promise<Bytes>;
  // in its own folder, a papp-write folder, or where the user picked to write; the folder must exist
  writeFile(path: string, data: string | Bytes): Promise<void>;
  appendFile(path: string, data: string | Bytes): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  // recursive
  mkdir(path: string): Promise<void>;
  // a folder only with recursive, which removes everything in it
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  // to the user's Trash, where they can bring it back; a folder with everything in it
  trash(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  // a link is described as itself, not what it points to
  readdir(path: string, options: { stats: true }): Promise<({ name: string } & Stat)[]>;
  stat(path: string): Promise<Stat>;
  exists(path: string): Promise<boolean>;
  // the user picks in a dialog; no tag needed, nothing restarts; kept, even after a restart; [] if cancelled
  // write: true lets writeFile and appendFile change that file, or files by plain name right inside that folder: Apargon writes them
  pick(options?: { folder?: boolean; multiple?: boolean; write?: boolean }): Promise<string[]>;
  // every pick so far
  picks(): Promise<{ path: string; write: boolean; folder: boolean }[]>;
  // kept by Apargon, sealed with the OS's store; null if none
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  // needs papp-listen; Apargon listens and passes each request to the handler; url is where to reach it; a free port unless one is given
  listen(options: { port?: number }, handler: (request: Incoming) => Answer | Promise<Answer>): Promise<Handle<null> & { url: string }>;
  // one file; file is only a suggested name; the user picks; may replace a file, after the OS asks; kept as a pick to write; null if cancelled
  save(file: string, data: string | Bytes): Promise<string | null>;
  // several files; the user picks a folder; never replaces a file: a taken name becomes "name (2)"; [] if cancelled
  saveAll(files: Record<string, string | Bytes>): Promise<string[]>;
  // the window as a PDF; no tag needed
  pdf(): Promise<Bytes>;
  // shows the system print panel; no tag needed; true once the user prints
  print(): Promise<boolean>;
  // an http(s) link in the browser, only to a site in papp-net; any other is dropped
  open(link: string): Promise<void>;
  // timeout in ms stops it; encoding null gives bytes; over 64 MB of output it is stopped and run rejects: use spawn
  run(program: string, args?: string[], options?: { cwd?: string; input?: string | Bytes; encoding?: 'utf8' | null; timeout?: number }):
    Promise<Exit & { stdout: string | Bytes; stderr: string | Bytes }>;
  // close() stops the program; end() ends its input; closed gives how it exited; write() resolves once the program took the data
  spawn(program: string, args?: string[], options?: { cwd?: string; onOutput?: (stream: 'stdout' | 'stderr', text: string) => void }):
    Promise<Handle<Exit> & { write(data: string | Bytes): Promise<void>; end(): Promise<void> }>;
  // a TCP connection to a host:port papp-net names, through Apargon's proxy, as a database or mail client needs; tls: true wraps it in TLS; closed gives the error, or null
  connect(host: string, port: number, options?: { tls?: boolean; onData?: (bytes: Bytes) => void }):
    Promise<Handle<string | null> & { write(data: string | Bytes): Promise<void> }>;
  // file is relative to the .papp file's folder; a new file counts as changed; closed gives null, or the error if the watch stopped on its own
  watch(path: string, callback: (file: string, kind: 'changed' | 'removed') => void, options?: { recursive?: boolean }): Promise<Handle<string | null>>;
  // needs papp-use notifications; up to 3 buttons; the button's index, or null
  notify(title: string, body?: string, options?: { buttons?: string[] }): Promise<number | null>;
  // a menu-bar icon with a title of up to 24 characters, and items of your own above Show and Quit
  // null removes the icon; with papp-use background, or with items, the icon stays and only the title goes
  // icon: PNG or JPEG bytes, or a data: URL of one, shown 16 high; null is Apargon's
  // click: true sends a click on the icon to onTrayClick instead of opening the menu, which a right-click still opens (macOS and Windows; Linux opens the menu)
  tray(title: string | null, items?: TrayItem[], options?: { icon?: string | Bytes | null; click?: boolean }): Promise<void>;
  // the clicked tray item's id; returns a stop function
  onTray(callback: (id: string) => void): () => void;
  // a click on the icon, with where the icon is, for a window under it: papp.window({ bounds: { x: icon.x, y: icon.y + icon.height }, visible: true })
  onTrayClick(callback: (icon: Rect) => void): () => void;
  // ends the .papp file, every window; with papp-use background too
  quit(): Promise<void>;
  // a bar on the dock or taskbar icon, 0 to 1; null removes it; Linux shows it only in some docks
  progress(value: number | null): Promise<void>;
  // a count on the dock or taskbar icon (macOS, and Linux docks that show one); 0 or null removes it
  badge(count: number | null): Promise<void>;
  // bounces the dock icon or flashes the taskbar until the user comes to the window; it never takes focus
  attention(): Promise<void>;
  // changes what it is given, and answers how the window is; papp.window() only reads
  // onTop needs papp-window on-top, allSpaces all-spaces, clickThrough click-through, private private, visible: false papp-use background
  // bounds must fit on one screen's work area, and keep the size with resizable="no", as must resizable, maxSize and a maximize; opacity is 0.3 to 1 (not on Linux); a shown window does not take focus
  window(change?: Partial<Omit<WindowState, 'bounds'>> & { bounds?: Partial<Rect> }): Promise<WindowState>;
  // each screen; workArea leaves out the menu bar, dock and taskbar
  displays(): Promise<{ bounds: Rect; workArea: Rect; scaleFactor: number; primary: boolean }[]>;
  // keeps the computer awake, with display: true its screen on too, until the function it returns is called, or the window closes or reloads
  keepAwake(options?: { display?: boolean }): Promise<() => Promise<void>>;
  // top-level menus after Apargon's; [] removes them
  menu(menus: MenuItem[]): Promise<void>;
  // a menu at the pointer
  contextMenu(items: MenuItem[]): Promise<void>;
  // the picked item's id; returns a stop function
  onMenu(callback: (id: string | undefined) => void): () => void;
  power(): Promise<{ idleSeconds: number; onBattery: boolean }>;
  // returns a stop function; shutdown comes as the computer shuts down or the user logs out, with no time to wait for
  onSystem(callback: (event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen' | 'on-ac' | 'on-battery' | 'shutdown') => void): () => void;
  // needs papp-use cursor; where the mouse is on the screen, in the points of papp.displays
  cursor(): Promise<{ x: number; y: number }>;
  // needs papp-use broadcasts (macOS); what an app announces under that name, such as 'com.apple.screenIsLocked' or 'com.spotify.client.PlaybackStateChanged'; returns a stop function
  hear(name: string, callback: (broadcast: { name: string; sender: string; info: Record<string, unknown> }) => void): Promise<() => Promise<void>>;
  // needs papp-use share (macOS); the system's share menu over the window, with text, an http(s) link or files; the user picks the app
  share(item: { text?: string; url?: string; files?: string[] }): Promise<void>;
  // same as window.close(); with papp-use background, it hides
  closeWindow(): Promise<void>;
  // needs papp-global-shortcut any; sets the whole list, [] removes it; up to 10, each as in papp-global-shortcut
  // rejects keys the tag rules refuse, or another app holds; they stay until it sets another list or quits
  shortcuts(keys: string[]): Promise<void>;
  // runs on a papp-global-shortcut or one from papp.shortcuts, after bringing the window forward; returns a stop function right away
  onShortcut(callback: (keys: string) => void): () => void;
};
// A call the tags do not allow rejects with an Error naming the tag to add. File errors carry Node's code, such as 'ENOENT'.
// An on… call gives a function that stops it, right away.
```

### `papp-system`

The `.papp` file becomes a Node script with a window, with no limits and the internet.

- It gets Node (`require`, `process`), as well as `window.papp`. Use `fs`, `net` and `child_process` directly.
- Any file, any program, all your environment variables, the internet.
- It can't be combined with `papp-write`, `papp-run`, `papp-net`, `papp-socket`, `papp-listen` or `papp-env`: it already allows all of them.

Use it only when tags and `papp` can't do the job. For a Node script the `.papp` file calls, like a build or a converter, use `papp-run node`.

## Meta tags

In `<head>` before any `<script>`. `content` holds the one thing. Attributes hold the options. An unknown attribute, an old tag, or an old form refuses the file. Each tag is a line in the popup, so ask for as little as needed.

| It needs to                          | Tag                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Exist                                | `<meta name=\"papp-id\" content=\"<uuid>\">`, always                    |
| Read any local file                  | nothing                                                                 |
| Save its own data                    | nothing: write in `papp.folder`                                         |
| Change files in one folder           | `<meta name="papp-write" content="~/notes/">`                           |
| Change any file                      | `<meta name="papp-write" all>`                                          |
| Change a file the user chooses       | nothing: `papp.pick({ write: true })` or `papp.save()`                  |
| Use a command-line tool              | `<meta name="papp-run" content="git">`                                  |
| Run a program it ships               | `<meta name="papp-run" content="./bin/ffmpeg">`                         |
| Run a program with no limits         | `<meta name="papp-run" content="git" unfenced>`                         |
| Pass that tool a variable            | `<meta name="papp-env" content="AWS_PROFILE">`                          |
| Call a web API, open its links       | `<meta name="papp-net" content="api.example.com">`                      |
| Talk to a server on this computer    | `<meta name="papp-net" content="localhost:11434">`                      |
| Be reached from this computer        | `<meta name="papp-listen">`                                             |
| Be reached from the network, a phone | `<meta name="papp-listen" network>`                                     |
| Talk to Docker                       | `<meta name="papp-socket" content="/var/run/docker.sock">`              |
| A device or extra                    | `<meta name="papp-use" content="notifications">`                        |
| Set the window's size and look       | `<meta name="papp-window" size="900x600" title-bar="no">`               |
| Answer a key anywhere                | `<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N">` |
| Use Node, or what `papp` can't do    | `<meta name="papp-system">`                                             |

- **`papp-id`:** one UUID, lowercase or not. New file, new UUID; new version, same UUID. Never copy another app's.
- **`papp-write`:** one folder, no `*`. Not your home folder or one that holds it, and not Apargon's own. The `.papp` file and its programs may change everything in it. Code written there can run later, outside Apargon.
- **`papp-net`:** a host and an optional port, 443 if none: `api.example.com`, `example.com:8080`, `192.168.1.5:8123`, `localhost:11434`. No scheme, no `*`: one tag per site. All network goes through Apargon's proxy, this computer's too. Scripts, fonts and images from another site need its host in `papp-net`. With any `papp-net` tag, `fetch` to a named site skips CORS.
- **`papp-use`:** one feature per tag: `notifications`, `clipboard`, `location` (not on Linux), `sound`, `camera`, `microphone`, `screen`, `background`, `login`, `usb`, `serial`, `hid`, `midi`, `cursor`, `broadcasts` (macOS), `share` (macOS), `cloud` (read iCloud, Dropbox or OneDrive files), `bluetooth` (macOS).
- **Sound:** without `papp-use sound`, it plays muted, with no error.
- **No tag needed** to write to the clipboard, go fullscreen or lock the pointer.
- **Programs** (`papp-run`):
  - Same limits as the `.papp` file: read everything, write its own folder and `papp-write` folders, reach `papp-net` sites through the proxy (`http_proxy` is set), and get only `papp-env` variables.
  - They get no other program's help: no system services (macOS), no socket files, no mounting.
  - Traffic that isn't HTTP, like `git` over SSH, works only if the program can tunnel through an HTTP proxy to a site in `papp-net`.
  - A program shipped with the `.papp` file (`./bin/ffmpeg`) runs as `ffmpeg`.
  - `unfenced`: no limits at all. Refused if the `.papp` file could change the program.
  - They stop when the `.papp` file closes.
  - Windows: only `.exe` and `.com` files, not `.bat` or `.cmd`. Stopping a program doesn't stop what it started.
  - macOS: a downloaded program must be notarized.
- **Picks:** `papp.pick` and `papp.save` need no tag. The dialog is Apargon's. A pick to read: the `.papp` file reads it itself. A pick to write: `papp.writeFile` and `papp.appendFile` reach it, and Apargon does the writing. A folder picked to write takes plain file names right inside it: `${picked}/report.txt`, not `${picked}/sub/report.txt` or `.hidden`. Picks are kept, even after a restart, and go when the user takes the approval back.
- **Secrets:** `papp.getSecret`, `papp.setSecret` and `papp.deleteSecret` need no tag. For keys it shouldn't keep in `localStorage`, which sits on disk in clear. Apargon keeps them sealed with the OS's store, and deletes them with the approval.
- **Listening:** Apargon listens, not the `.papp` file, and passes each request to the handler as plain data: `new TextDecoder().decode(request.body)` reads a text body, `new URL(request.url)` its path and query. The handler returns a plain answer, or throws for a 500. `url` is `http://127.0.0.1:<port>`, or with `network` this computer's first address. A body over 16 MB gets 413. With 32 requests waiting for an answer, the next gets 503.
- **Connections:** `papp.connect` goes through Apargon's proxy, so it reaches only what `papp-net` names, with the port: `db.example.com:5432`. `close()` sends what is left and ends the connection. Opening, including the TLS handshake, times out after 30 seconds and is cancelled on reload or close.
- **Global shortcuts:** two different modifiers, or one modifier with a function key. Media keys work alone. `content="any"` lets `papp.shortcuts` pick them while it runs, by the same rules.
- **Window:** one `papp-window` tag, settings as attributes. A bare attribute is yes (`on-top`), `="no"` is no (`frame="no"`). Sizes in pixels: `size="900x600"`, `width`, `height`, `min-width`, `min-height`. Yes or no: `resizable`, `title-bar`, `frame`, `transparent`, `on-top`, `all-spaces`, `click-through`, `private`, `dock`, `blur`, `mark`.
  - `title-bar="no"` keeps the OS window buttons, drawn over the page.
  - With `on-top` or `all-spaces`, `papp.window` can turn that off and on again. Without, it refuses.
  - `click-through` lets `papp.window({ clickThrough: true })` pass clicks to the app below. Give the user a way back, such as a tray item or a shortcut.
  - `private` hides the window from screenshots and screen sharing. macOS and Windows only.
  - `dock="no"` shows no dock icon or taskbar button. It needs `papp-use background`, which keeps the tray icon.
  - `blur` blurs what is behind the window through its transparent parts: set `background: transparent` on the body. macOS and Windows 11 only.
  - `mark="no"` draws the favicon without Apargon's mark.
  - `papp.window` can also set `resizable` (off only), `minSize`, `maxSize`, `aspectRatio`, and on macOS `file` and `edited`, with no tag. With `frame="no"`, `shape` too, on Windows and Linux. A reload puts them back.
- **Printing:** `papp.print()` and `window.print()` make a PDF and open the system print panel, where the user picks the printer: that is the yes, so no tag is needed. The sandbox never reaches the print server. Or save `papp.pdf()` with `papp.save()`.
- **Devices:** `usb`, `serial`, `hid` and `bluetooth` turn on WebUSB, Web Serial, WebHID and Web Bluetooth; the user picks the device. `midi` turns on Web MIDI, sysex included.
- **Background:** closing the last window hides it. The tray icon shows or quits it.
- **Login:** stops when the approval is taken back, the tag is removed, or the file is gone.
- **No tag needed** for menus, the tray, its icon and its clicks, `papp.quit`, `papp.progress`, `papp.badge`, `papp.attention`, `papp.power`, `papp.onSystem`, `papp.displays`, `papp.keepAwake`, or for `papp.window` to move, resize, minimize, maximize, fade or show the window.
- **Tray popover:** `papp.tray(title, items, { click: true })`, then in `papp.onTrayClick` move the window under the icon and show it. Keep `papp-use background` so the window can hide. On Linux the icon opens the menu instead: give it a Show item.
- **Linux:** GNOME on Wayland. On X11, Apargon asks first, once per version of the file: there it can't keep data in. `papp-socket` turns off the socket block for the `.papp` file and its programs: any socket file is then reachable.
- **Windows:** `papp-socket` and `papp-use bluetooth` refuse the file, for now. `localhost` goes through Apargon's proxy: `fetch` works; a program must honour `http_proxy`.

If a dialog says the process can still reach the network, don't work around it: that is the safety check working.
