---
name: papp
description: Use when the user wants an app with a window on their own computer, a desktop app, or to turn an artifact or HTML page into an app, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .papp file. Not for websites.
---

# Apargon

## What it is

A papp is a personal app: a `.papp` file that Apargon runs. A `.papp` file is an ordinary HTML page, plus `<meta>` tags that ask for more. Apargon runs it as a desktop app on macOS, Linux or Windows. In code, `papp` is the API Apargon puts on `window`.

Apargon is a reverse browser. A browser gives a page all of the internet and none of your computer. Apargon gives a `.papp` file your files and none of the internet.

Every `.papp` file names itself with a UUID, in `<meta name="papp-id">`. Generate one (`crypto.randomUUID()`) when you create the file, and keep it across versions: it is the app's identity. Its folder and its secrets are kept by it, so an update finds its data. A file without one doesn't open.

Without permission tags, a `.papp` file:

- reads every local disk,
- writes only to its own folder, `~/.apargon/<id>` (`papp.folder`),
- has no network.

Each permission tag is a yes the user gives in a popup. The promise: a `.papp` file can't send anything off the computer unless the user allowed it.

The page is a Chrome page opened from a file. What such a page can do in Chrome, it can do here, within the limits this skill names. Electron changes one thing: `prompt()` throws.

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
  const text = document.getElementById('text');
  const save = document.getElementById('save');
  const file = `${papp.folder}/notes.txt`;
  text.value = (await papp.exists(file)) ? await papp.readFile(file) : '';
  save.onclick = () => papp.writeFile(file, text.value);
</script>
```

- Open it with `open notes.papp` (macOS), `apargon notes.papp` (Linux) or a double-click (Windows).
- No permission tags: it opens at once. The same with only tags that ask nothing: `papp-window`, `papp-use` `notifications` and `sound`, a `papp-run` program that isn't `unfenced`, and `papp-env`. With any other tag: a popup asks first. When it asks again after a change, the user can tick "Trust changes to this file", and later edits open without a popup unless the tags ask for something else. The yes belongs to the file's exact bytes and to what the popup showed: any change, even a comment, asks again, and so does a tag that now leads to another folder or program.
- Saving the `.papp`, or a `.css` or `.js` file it loaded, reloads the window. A `.papp` file with tags that changed doesn't load until it is opened again and approved.
- A `.papp` file has a URL, as a web page does: Apargon runs it in Chromium, with no address bar. The hash, query and history work as on the web, and a reload keeps them; opening the file again starts without them. Use the URL as a web app would.
- The window shows only the `.papp` file: build it as a single-page app that changes its own view, not as pages that link to each other. A frame may hold a local file, never a web page, and has no `papp`. A link opens in the browser only if its site is in `papp-net`; any other is dropped.
- `window.open` on its own file opens a second window, such as `window.open('#mini', '', 'size=320x80, frame=no')`. The third argument takes `papp-window` settings for that window; `on-top`, `all-spaces`, `click-through`, `private` and `dock` stay the tag's. A bad setting opens no window.
- `<title>` is the window's title.
- On Windows, Apargon refuses a path that starts with `\\`, has a `:` after the drive letter, or has a name ending in a dot or a space.

### Icon

The favicon is the app icon, and on macOS the `.papp` file's icon too. Without one, it gets Apargon's.

```html
<link rel="icon" href="./icon.svg">
```

- SVG, PNG, ICO, JPEG, GIF or WebP: a local file, a `data:image/` URL, or a web address whose site is in `papp-net`.
- With several favicons, an SVG wins, else the one with the most pixels.
- It is drawn on a white rounded square with an Apargon badge. Use a square image without padding.
- The Dock or taskbar shows it at once.

### `window.papp`

A relative path starts at the `.papp` file's folder.

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
  // the user picks in a dialog; no tag needed, nothing restarts; [] if cancelled
  // write: true lets writeFile and appendFile change that file, or files by plain name right inside that folder, until the app closes: Apargon writes them; to keep it, use papp-write
  pick(options?: { folder?: boolean; multiple?: boolean; write?: boolean }): Promise<string[]>;
  // kept by Apargon, sealed with the OS's store; null if none
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  // needs papp-listen; Apargon listens and passes each request to the handler; url is where to reach it; a free port unless one is given
  listen(options: { port?: number }, handler: (request: Incoming) => Answer | Promise<Answer>): Promise<Handle<null> & { url: string }>;
  // one file; file is only a suggested name; the user picks; may replace a file, after the OS asks; writable like a pick to write; null if cancelled
  save(file: string, data: string | Bytes): Promise<string | null>;
  // several files; the user picks a folder; never replaces a file: a taken name becomes "name (2)"; [] if cancelled
  saveAll(files: Record<string, string | Bytes>): Promise<string[]>;
  // the window as a PDF; no tag needed
  pdf(): Promise<Bytes>;
  // shows the system print panel; no tag needed; true once the user prints
  print(): Promise<boolean>;
  // an http(s) link in the browser, only to a site in papp-net; any other is dropped
  open(link: string): Promise<void>;
  // an environment variable papp-env names; null if it isn't set
  env(name: string): Promise<string | null>;
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
  // needs papp-use notifications; up to 3 buttons; the button's index, 'click' for the notification itself, or null when closed
  notify(title: string, body?: string, options?: { buttons?: string[] }): Promise<number | 'click' | null>;
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
  // needs papp-use cursor; where the mouse is on the screen, in the points of window.getScreenDetails()
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
- Without it: no Node, and every limit stays.
- It can't be combined with `papp-write`, `papp-run`, `papp-net`, `papp-socket`, `papp-listen` or `papp-env`: it already allows all of them.

Use it only when tags and `papp` can't do the job. For a Node script the `.papp` file calls, like a build or a converter, use `papp-run node`.

## Meta tags

Put them in `<head>`, before any `<script>`. Each tag lets the app do one more thing. Most make a popup ask the user, so add only what the app needs.

### `papp-id`

```html
<meta name="papp-id" content="<UUID>">
```

- `content`: a UUID. Required: without it, the file doesn't open.
- A new app gets a new UUID. A new version keeps it.

### `papp-write`

```html
<meta name="papp-write" content="~/notes/">
<meta name="papp-write" all>
```

- `content`: a folder the app may change files in. One per tag.
- `all`, instead of `content`: the app may change any file.
- Default: it changes only files in `papp.folder` and files the user picks.
- Prefer a path from the .papp file's folder (`../Archive/`) or a `~/` path over a full one.

### `papp-net`

```html
<meta name="papp-net" content="api.example.com">
<meta name="papp-net" content="localhost:11434">
```

- `content`: a site the app may reach. Add the port if it isn't 443. One site per tag.
- Default: no network at all.

### `papp-run`

```html
<meta name="papp-run" content="git">
<meta name="papp-run" content="./bin/ffmpeg">
<meta name="papp-run" content="docker" unfenced>
```

- `content`: a program the app may run, by name or by a path beside the `.papp` file.
- The program gets the app's limits.
- Its only way out is Apargon's proxy, which checks each site against `papp-net`. The proxy speaks HTTP, and Apargon points the program at it with `http_proxy`.
- `unfenced`: the program runs with no limits.
- Default: no programs.

### `papp-env`

```html
<meta name="papp-env" content="AWS_PROFILE">
```

- `content`: an environment variable the app reads with `papp.env` and passes to its programs.
- Default: the app reads none, and its programs get only basics such as `PATH` and `HOME`.

### `papp-listen`

```html
<meta name="papp-listen">
<meta name="papp-listen" network>
```

- No `content`. Other apps on this computer may send the app HTTP requests, through `papp.listen`.
- `network`: phones and other computers may too.
- Default: nothing can reach it.

### `papp-socket`

```html
<meta name="papp-socket" content="/var/run/docker.sock">
```

- `content`: a socket file. The app may talk to the program behind it.
- Default: none. Not on Windows yet.

### `papp-use`

```html
<meta name="papp-use" content="camera">
```

- `content`: one feature. One per tag.
- Default: all off.

| Feature                                     | What it turns on                               |
| ------------------------------------------- | ---------------------------------------------- |
| `notifications`                             | `Notification` and `papp.notify`               |
| `sound`                                     | sound; without it, sound is muted              |
| `clipboard`                                 | reading the clipboard; writing needs no tag    |
| `camera`, `microphone`, `screen`            | recording them                                 |
| `location`                                  | where the computer is; not on Linux            |
| `usb`, `serial`, `hid`, `midi`, `bluetooth` | a device the user picks; no Bluetooth on Linux |
| `background`                                | running in the tray when its windows close     |
| `login`                                     | starting when the user logs in                 |
| `cursor`                                    | where the mouse is, anywhere on screen         |
| `cloud`                                     | reading iCloud, Dropbox and OneDrive files     |
| `broadcasts`                                | hearing what other apps announce; macOS only   |
| `share`                                     | the system share menu; macOS only              |

### `papp-window`

```html
<meta name="papp-window" size="900x600" title-bar="no" on-top>
```

- No `content`. Attributes set the window's size and look. One tag.
- A bare attribute means yes. `="no"` means no.
- Default: 1200×800, resizable, with a frame and title bar.

| Attribute                           | What it does                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `size="900x600"`, `width`, `height` | size in pixels                                                   |
| `min-width`, `min-height`           | smallest size                                                    |
| `resizable="no"`                    | fixed size                                                       |
| `title-bar="no"`                    | no title bar; the window buttons sit over the page               |
| `frame="no"`                        | no frame and no buttons                                          |
| `transparent`                       | see-through where the page is                                    |
| `blur`                              | blurs what is behind the see-through parts; macOS and Windows 11 |
| `on-top`                            | stays above other windows                                        |
| `all-spaces`                        | shows on every desktop                                           |
| `click-through`                     | clicks pass to the app below; give the user a way back           |
| `private`                           | hidden from screenshots and screen sharing; macOS and Windows    |
| `dock="no"`                         | no dock icon or taskbar button; needs `papp-use background`      |
| `mark="no"`                         | the app icon without Apargon's mark                              |

### `papp-global-shortcut`

```html
<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N">
<meta name="papp-global-shortcut" content="any">
```

- `content`: a key that reaches the app from any other app. Two modifiers, or one with a function key.
- `content="any"`: `papp.shortcuts` picks the keys while the app runs.
- Default: none.

### `papp-system`

```html
<meta name="papp-system">
```

- No `content`. The app gets Node and no limits at all.
- Default: off. Use it only when nothing else works.

### No tag needed

- Read any file, and write in `papp.folder`.
- Open or save a file the user picks: `papp.pick`, `papp.save`.
- Keep a key or password: `papp.setSecret`.
- Print, or make a PDF.
- Menus, the tray, the dock badge, fullscreen, moving and resizing the window.

Linux needs GNOME on Wayland. On X11, Apargon asks first.
