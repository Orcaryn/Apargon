---
name: papp
description: Use when the user wants an app with a window on their own computer, instead of a CLI, a local server plus a browser tab, or a new Electron app. Also for any .papp file. Not for websites.
---

# Apargon

## What it is

A `.papp` file is an ordinary HTML page, plus `<meta>` tags that ask for files, servers, programs or devices. Apargon runs it as a desktop app on macOS, Linux or Windows. Scripts, modules, styles and images load as in any page, from the page's folder. The page gets only what its tags ask for. The OS blocks all network access except to the hosts in `papp-net` (see Meta tags).

Further reading and code: [https://github.com/Orcaryn/Apargon](https://github.com/Orcaryn/Apargon)

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

- Open it with `open page.papp` (macOS), `apargon page.papp` (Linux) or a double-click (Windows). A popup asks the user first, and again when the tags change. A page made on this computer with no tags opens without a popup.
- Saving the `.papp`, or a `.css` or `.js` file it loaded, reloads the window. Other files do not, nor files the page may change itself. The reload keeps the old tags: reopen the page for new ones. A downloaded page that changed does not load until it is reopened and approved again.
- A web link opens in the browser, after the user agrees. `window.open` on the page's own file opens a second window, such as `window.open('#mini', '', 'size=320x80, frame=no')`. The third argument takes `papp-window` settings for that window; `on-top`, `all-spaces`, `click-through`, `private` and `dock` stay the tag's. A bad setting opens no window.
- The window opens at 1200×800 with a frame, later where the user left it. `<title>` names it.
- `localStorage` and IndexedDB persist. They follow a moved or renamed page if it was not edited since it was last closed. A copy starts empty.
- On Linux, a page cannot sit in `/tmp`, `/var/tmp`, under `/run`, or in a folder that holds them, such as `/`. Use a folder of its own, such as `/tmp/apargon`.
- On Windows, Apargon refuses a path that starts with `\\`, has a `:` after the drive letter, or has a name ending in a dot or a space.

### Icon

The favicon is the app icon, and on macOS the `.papp` file's icon too. Without one, the page gets Apargon's.

```html
<link rel="icon" href="./icon.svg">
```

- SVG, PNG, ICO, JPEG, GIF or WebP: a file the page may see, a `data:image/` URL, or a web address whose host is in `papp-net`.
- With several favicons, an SVG wins, else the one with the most pixels.
- It is drawn on a white rounded square with an Apargon badge. Use a square image without padding.

### `window.papp`

The page reaches files and programs only through `papp`.
A relative path starts at the page's folder.

```ts
type Bytes = Uint8Array;
// size and mtimeMs only for files the page may see
type Stat = { isFile: boolean; isDirectory: boolean; size?: number; mtimeMs?: number };
type Exit = { status: number | null; signal: string | null };
// keys as in papp-global-shortcut, such as 'CommandOrControl+S'
type MenuItem = { separator: true } | { label: string; id?: string; keys?: string; submenu?: MenuItem[] };
// checked makes a checkbox, with radio a radio button; up to 50 items a menu, nested 3 deep
type TrayItem = { separator: true } | { label: string; id: string; checked?: boolean; radio?: boolean } | { label: string; submenu: TrayItem[] };
type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
// state 'normal' brings a minimized window back; for fullscreen, use requestFullscreen()
// minSize and maxSize: 0 on a side is no limit; aspectRatio is width over height, 0 for none
// file names a file the page may see in the title bar, with its icon, and edited shows the unsaved dot (macOS)
// shape: the rectangles of the window, in its own pixels, that are drawn and take clicks; [] is the whole window; needs papp-window frame=no (Windows and Linux)
type WindowState = { onTop: boolean; allSpaces: boolean; clickThrough: boolean; private: boolean; opacity: number; bounds: Rect; visible: boolean; state: 'normal' | 'minimized' | 'maximized'; resizable: boolean; minSize: Size; maxSize: Size; aspectRatio: number; file: string | null; edited: boolean; shape: Rect[] };
// headers by lowercase name; an answer without status is 200, without body is empty
type Incoming = { method: string; url: string; headers: Record<string, string>; body: Bytes };
type Answer = { status?: number; headers?: Record<string, string>; body?: string | Bytes };
// what watch, listen, connect and spawn give: close() stops it; closed resolves once it has stopped, by close() or on its own
type Handle<Closed> = { close(): Promise<void>; closed: Promise<Closed> };

declare const papp: {
  // the page's folder
  dir: string;
  // offset and length are in bytes, for part of the file
  readFile(path: string, options?: { encoding?: 'utf8'; offset?: number; length?: number }): Promise<string>;
  readFile(path: string, options: { encoding: null; offset?: number; length?: number }): Promise<Bytes>;
  // the folder must exist
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
  // the user picks, in a dialog that says what the page gets; kept until the user takes the page's approval back; [] if cancelled
  // with write, the page restarts once the user picks: read the pick from given() then
  pick(options?: { folder?: boolean; multiple?: boolean; write?: boolean }): Promise<string[]>;
  // every pick so far
  given(): Promise<{ path: string; write: boolean }[]>;
  // kept by Apargon, sealed with the OS's store, where no page can read it; null if none
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  // needs papp-listen; Apargon listens and passes each request to the handler; url is where to reach it; a free port unless one is given
  listen(options: { port?: number }, handler: (request: Incoming) => Answer | Promise<Answer>): Promise<Handle<null> & { url: string }>;
  // one file; file is only a suggestion; the user picks; may replace a file, after the OS asks; null if cancelled
  save(file: string, data: string | Bytes): Promise<string | null>;
  // several files; the user picks a folder; never replaces a file: a taken name becomes "name (2)"; [] if cancelled
  saveAll(files: Record<string, string | Bytes>): Promise<string[]>;
  // the page as a PDF; no tag needed
  pdf(): Promise<Bytes>;
  // needs papp-use print; true once sent
  print(): Promise<boolean>;
  // an http(s) link in the browser, a folder in the file manager, or a file in its viewer (images, video, audio, PDF, text)
  open(pathOrLink: string): Promise<void>;
  // timeout in ms stops it; encoding null gives bytes
  run(program: string, args?: string[], options?: { cwd?: string; input?: string | Bytes; encoding?: 'utf8' | null; timeout?: number }):
    Promise<Exit & { stdout: string | Bytes; stderr: string | Bytes }>;
  // close() stops the program; end() ends its input; closed gives how it exited
  spawn(program: string, args?: string[], options?: { cwd?: string; onOutput?: (stream: 'stdout' | 'stderr', text: string) => void }):
    Promise<Handle<Exit> & { write(data: string | Bytes): Promise<void>; end(): Promise<void> }>;
  // a TCP connection to a host:port papp-net names, as a database or mail client needs; tls: true wraps it in TLS; closed gives the error, or null
  connect(host: string, port: number, options?: { tls?: boolean; onData?: (bytes: Bytes) => void }):
    Promise<Handle<string | null> & { write(data: string | Bytes): Promise<void> }>;
  // file is relative to the page's folder; a new file counts as changed; closed gives null, or the error if the watch stopped on its own
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
  // ends the page, every window; with papp-use background too
  quit(): Promise<void>;
  // a bar on the dock or taskbar icon, 0 to 1; null removes it; Linux shows it only in some docks
  progress(value: number | null): Promise<void>;
  // a count on the dock or taskbar icon (macOS, and Linux docks that show one); 0 or null removes it
  badge(count: number | null): Promise<void>;
  // bounces the dock icon or flashes the taskbar until the user comes to the window; it never takes focus
  attention(): Promise<void>;
  // changes what it is given, and answers how the window is; papp.window() only reads
  // onTop needs papp-window on-top=yes, allSpaces all-spaces=yes, clickThrough click-through=yes, private private=yes, visible: false papp-use background
  // bounds must fit on one screen's work area, and keep the size with resizable=no, as must resizable, maxSize and a maximize; opacity is 0.3 to 1 (not on Linux); a shown window does not take focus
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
  // needs papp-use share (macOS); the system's share menu over the window, with text, an http(s) link or files the page may see; the user picks the app
  share(item: { text?: string; url?: string; files?: string[] }): Promise<void>;
  // same as window.close(); with papp-use background, it hides
  closeWindow(): Promise<void>;
  // needs papp-global-shortcut any; sets the page's whole list, [] removes it; up to 10, each as in papp-global-shortcut
  // rejects keys the tag rules refuse, or another app holds; they stay until the page sets another list or quits
  shortcuts(keys: string[]): Promise<void>;
  // runs on a papp-global-shortcut or one from papp.shortcuts, after bringing the window forward; returns a stop function right away
  onShortcut(callback: (keys: string) => void): () => void;
};
// A call the tags do not allow rejects with an Error naming the tag to add. File errors carry Node's code, such as 'ENOENT'.
// An on… call gives a function that stops it, right away.
```

### `papp-system`

The page becomes a Node script with a window. Its files stay limited like any page's.

**What changes**

- The page gets Node (`require`, `process`), as well as `window.papp`. Use `fs` and `child_process` directly. Through `papp`, the page gets only what its tags name, as any page. `window.print()` needs `papp-use print`.
- Programs: any, with all your environment variables.
- Writes: only what `papp-write` names. A program it runs, like `npm` or `git`, too: name the caches and settings it writes.
- Reads: every file (Windows: only its folder and `papp-read`).
- All other tags work as usual.

**What it unlocks**

- Node and npm in the page: `fs`, `child_process`, native modules. `require` looks in the page's folder first, so `npm install` there works.
- Programs not known in advance.

**When to use it.** Only when tags and `papp` cannot do the job.
Its popup line is red and needs "I trust this page".

**`papp-system` vs `papp-run node`**

|              | `papp-run node`                                                 | `papp-system`      |
| ------------ | --------------------------------------------------------------- | ------------------ |
| Node runs    | as a program the page calls (`papp.run`, `papp.spawn`)          | in the page itself |
| The page has | `papp`                                                          | Node and `papp`    |
| Programs     | only those in `papp-run`                                        | any                |
| Variables    | only `papp-env`                                                 | all yours          |
| Popup        | yellow; red on Windows, and on Linux with a `papp-write` folder | red                |

For a Node script the page calls, like a build or a converter, use `papp-run node`.

## Meta tags

One value per tag, in `<head>` before any `<script>`. Each tag is a line in the popup the user approves, so ask for as little as the page needs.

| The page needs to                                 | Tag                                                             |
| ------------------------------------------------- | --------------------------------------------------------------- |
| See files next to it, or below                    | Nothing, unless it sits in `~`, Desktop, Documents or Downloads |
| Save next to it                                   | `papp-write` `./notes.txt`, `./data/`                           |
| See a folder elsewhere                            | `papp-read` `~/logs/`                                           |
| Change files elsewhere                            | `papp-write` `~/notes/*.md`, or `~/notes/**/*.md` at any depth  |
| Call a web API                                    | `papp-net` `api.example.com`                                    |
| Be reached by programs on this computer           | `papp-listen` `localhost`                                       |
| Be reached by devices on the network, a phone     | `papp-listen` `network`                                         |
| Talk to a server on this computer                 | `papp-net` `localhost:11434`                                    |
| Talk to a device on the network                   | `papp-net` `192.168.1.5:8123`                                   |
| Open its links without asking                     | `papp-open` `x.com`, `*.example.com`                            |
| Use a command-line tool                           | `papp-run` `git`                                                |
| Run a program it ships                            | `papp-run` `./bin/ffmpeg`                                       |
| Pass that tool a variable                         | `papp-env` `AWS_PROFILE`                                        |
| Talk to Docker or an SSH agent                    | `papp-socket` `/var/run/docker.sock`                            |
| Show a notification                               | `papp-use` `notifications`                                      |
| Play sound                                        | `papp-use` `sound`                                              |
| Read the clipboard from code                      | `papp-use` `clipboard`                                          |
| Use the camera and microphone                     | `papp-use` `camera, microphone`                                 |
| Know where it is (not on Linux)                   | `papp-use` `location`                                           |
| Capture the screen                                | `papp-use` `screen`                                             |
| Print                                             | `papp-use` `print`                                              |
| Use a USB device, serial port or input device     | `papp-use` `usb`, `serial` or `hid`                             |
| Use MIDI instruments                              | `papp-use` `midi`                                               |
| Keep running after its window closes              | `papp-use` `background`                                         |
| Open when the user logs in                        | `papp-use` `login`                                              |
| Set the window's size and look                    | `papp-window` `size=900x600, title-bar=no`                      |
| See where the mouse is                            | `papp-use` `cursor`                                             |
| Hear what other apps announce (macOS)             | `papp-use` `broadcasts`                                         |
| Open the share menu (macOS)                       | `papp-use` `share`                                              |
| Answer a key anywhere                             | `papp-global-shortcut` `CommandOrControl+Shift+N`               |
| Use Node, many programs, or what `papp` cannot do | `papp-system` `full`                                            |

- **Paths:** relative to the page, `~/…` or absolute. A folder ends in `/` (`./data/`, `~/logs/`), and its subfolders are included; any other path is a file. Apargon refuses one that does not match the disk. `*` matches within one name, `**` any number of folders (`~/notes/**/*.md` is every `.md` file under `~/notes`). One `*` per name, one `**` per path, and the part before the first `*` must exist. A written path that is not there yet is made when the page opens: a folder as a folder, a file as an empty file.
- **Hosts:** `papp-net` takes a host, no scheme, and `:port` when it is not 443: `api.example.com`, `example.com:8080`. A host on this computer or the local network always needs its port. Any server is `*:443` or `*:*`. `papp-open` takes the host alone. Scripts, fonts and images from another site need its host in `papp-net`. With any `papp-net` tag, `fetch` to a declared host skips CORS.
- **Sound:** without `papp-use sound`, the page plays muted, with no error.
- **No tag needed** to write to the clipboard, go fullscreen or lock the pointer.
- **Programs** the page runs keep its network and write limits, but can read every file. On Windows they see less: the page's folders, their own folder, and folders every app can read, like Program Files. A program from the page's folder (`./bin/ffmpeg`) runs by its name, `ffmpeg`, and is refused if a `papp-write` tag covers it. On Linux and Windows, a page that runs programs may not write a folder that holds the page: write `./out/*`, not `./out*` or `./`. On macOS, a downloaded program runs only if it is notarized: macOS refuses the rest with its own message.
- **Picks:** `papp.pick` needs no tag. The dialog is Apargon's and says what the page gets. A pick is kept, so the page sees it on every open; with `write: true`, the page restarts once the user picks, and finds the pick in `papp.given()`. Refused: a link, Apargon's own data, and with write a hidden file, a page or a launch folder. Also what a tag may not name: with write a path with a `"` or a folder holding a `papp-run` program, a name with a line break, and on Linux `/tmp` or `/var/tmp` itself, a folder that holds one, or anything in `/run`. The picks show in the popup under "You gave it".
- **Secrets:** `papp.secret` needs no tag. For keys the page should not keep in `localStorage`, which sits on disk in clear. Apargon keeps them sealed with the OS's store, per page, where no page's process can read, and deletes them with the approval. They follow a moved page as its storage does.
- **Listening:** `papp-listen localhost` or `network`. Apargon listens, not the page, and passes each request to the handler as plain data: `new TextDecoder().decode(request.body)` reads a text body, `new URL(request.url)` its path and query. The handler returns a plain answer, or throws for a 500. The listener runs until `close()`, a reload or quit, and with `papp-use background` after the window closes. `url` is `http://127.0.0.1:<port>`, or with `network` this computer's first address. Both tags are red. A body over 16 MB gets 413. For a sign-in that sends the browser back to the page, listen, open the sign-in link with the listener's `url` as the return address, and close once it comes back.
- **Connections:** `papp.connect` goes through Apargon's proxy, so it reaches only what `papp-net` names, with the port: `db.example.com:5432`. A host on this computer or the local network needs its port, and a local network address its number: `192.168.1.5:1883`. `close()` sends what is left and ends the connection; a server that does not end it too is cut off after 5 seconds. `closed` resolves with the error, or null.
- **Global shortcuts:** two different modifiers, or one modifier with a function key. Media keys (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`, `MediaStop`) work alone. `papp-global-shortcut any` lets `papp.shortcuts` pick them while the page runs, by the same rules; it is yellow.
- **Window:** one `papp-window` tag, comma-separated `key=value`. `size=900x600` sets width and height. Pixels: `width`, `height`, `min-width`, `min-height`. `yes` or `no`: `resizable`, `title-bar`, `frame`, `transparent`, `on-top`, `all-spaces` (on every desktop; macOS and some Linux desktops). `title-bar=no` keeps the OS window buttons, drawn over the page. `frame=no`, `transparent=yes`, `on-top=yes` and `all-spaces=yes` are yellow. With `on-top=yes` or `all-spaces=yes`, `papp.window` can turn that off and on again; without, it refuses.
  - `click-through=yes` lets `papp.window({ clickThrough: true })` pass clicks to the app below. The window starts clickable. Give the user a way back, such as a tray item or a shortcut: a click-through window cannot be clicked.
  - `private=yes` hides the window from screenshots and screen sharing, from the start; `papp.window` can turn it off and on. macOS and Windows only.
  - `dock=no` shows no dock icon (macOS) or taskbar button (Windows). It needs `papp-use background`, which keeps the tray icon.
  - `blur=yes` blurs what is behind the window through the page's transparent parts: set `background: transparent` on the body. macOS and Windows 11 only.
  - `mark=no` draws the page's favicon as its icon without Apargon's mark, so the dock and notifications show the page's own icon.
  - All five are yellow.
  - `papp.window` can also set `resizable` (off only), `minSize`, `maxSize`, `aspectRatio`, and on macOS `file` and `edited`, with no tag. With `frame=no`, `shape` too, on Windows and Linux. A reload puts them back.
- **Printing:** without `papp-use print`, `papp.print()` and `window.print()` reject. To skip the tag, save `papp.pdf()` with `papp.save()`.
- **Devices:** `usb`, `serial` and `hid` turn on WebUSB, Web Serial and WebHID; the user picks the device. `midi` turns on Web MIDI, sysex included.
- **Background:** closing the last window hides it. The tray icon shows or quits it.
- **Login:** stops when the approval is taken back, the tag is removed, or the file is gone.
- **No tag needed** for menus, the tray, its icon and its clicks, `papp.quit`, `papp.progress`, `papp.badge`, `papp.attention`, `papp.power`, `papp.onSystem`, `papp.displays`, `papp.keepAwake`, or for `papp.window` to move, resize, minimize, maximize, fade or show the window.
- **Tray popover:** `papp.tray(title, items, { click: true })`, then in `papp.onTrayClick` move the window under the icon and show it. Keep `papp-use background` so the window can hide. On Linux the icon opens the menu instead: give it a Show item.
- **`papp-system`** already allows every program and variable; do not add `papp-run` or `papp-env`.
- **Windows:**
  - A page with `papp-socket` does not open. `localhost` goes through Apargon's proxy: `fetch` works; a program must honour `http_proxy`.
  - `papp-run` takes only `.exe` and `.com` files, not `.bat` or `.cmd`.
  - Stopping a program (`kill`, a timeout, a reload) does not stop the programs it started.
  - `papp.save` follows a link at the name the user picks.

These show red in the popup:

- `papp-system`
- `papp-socket`
- `papp-listen`
- `papp-write` on a hidden file or folder, on `~/Library` or a folder that holds it (such as `~`), or on a `.papp` page
- `papp-net` to this computer, the local network, an IPv4 address, any host (`*`), any port (`*`) or a whole top-level domain (`*.com`)
- `papp-open` for `*`, `*.com`, `localhost` or an IPv4 address
- `papp-run` on Windows, or on Linux if the page also writes a folder

A red line, `papp-run`, or any `papp-net` or `papp-open` host makes the popup demand an extra "I trust this page" tick.

If a dialog says the process can still open sockets, do not work around it: that is the safety check working.
