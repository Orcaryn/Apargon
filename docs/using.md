# Using resworb

## Platforms

| Platform | Support                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Full.                                                                                                                                                                                                      |
| Linux    | Tested on a headless Ubuntu 24.04 server, not yet on a desktop. Install the `.deb`. A program the page runs may change any file in the page's writable folders, hidden ones too. `localhost:*` is refused. |
| Windows  | None. resworb refuses to open pages.                                                                                                                                                                       |

## Install

There are no releases yet. Build resworb from the repository:

```sh
pnpm install
pnpm dist        # macOS: a .dmg
pnpm dist:linux  # Linux: an AppImage and a .deb
```

On macOS, drag resworb from the `.dmg` to Applications. If the build is not notarized, macOS blocks the first launch; allow it once in System Settings → Privacy & Security.

On Linux, install the `.deb`. It brings `bwrap`, and the AppArmor profile that Ubuntu 23.10 and later need:

```sh
sudo apt install ./dist/resworb_0.1.0_amd64.deb
```

Skip the AppImage. It is untested and brings neither `bwrap` nor the profile; on Ubuntu 23.10 and later, expect "Could not start the sandbox".

To run a page without building:

```sh
pnpm exec electron . path/to/page.lmth
```

## Open a page

Double-click a `.lmth` file, run `open page.lmth` on macOS or `resworb page.lmth` on Linux, or start the app with the page's path.

Each page gets its own popup, sandboxed process and window. You can open several at once. The app quits when the last window closes.

A page is code, and opening it runs it. resworb words the popup by where the page came from: a page marked as downloaded leads with the site and with what its lines allow together. A page with no tags opens without a popup wherever it came from: it can only look. On macOS, browsers, Mail, Messages and AirDrop mark what they save; on Linux, Chrome does, and resworb reads the mark with `getfattr`. `git clone`, `curl` and USB sticks leave no mark, so such a page counts as made here.

## The popup

A page with no tags opens without a popup. A page with tags shows one first:

```text
Made on this computer
report.lmth
~/git/report/report.lmth

If you allow it, this page can:
▌ Run git (/usr/bin/git), which can see all your files.
┊ See, change and delete files matching ~/git/report/reports/*.md (12 now, and any added later).
│ See files in ~/logs.
│ Send and receive data with api.example.com, on port 443.
│ See files in its own folder and its subfolders, ~/git/report.

Hidden files (names starting with a dot) are left out unless named. Pages (.lmth) can be changed only if named.

                                             [ Don't open ]  [ Allow and open ]
```

The same page, downloaded, leads with where it came from and what its lines allow together:

```text
Downloaded from example.com
report.lmth
~/Downloads/report/report.lmth

It can run programs that see all your files. Through other apps, they may send them anywhere.

If you allow it, this page can:
▌ Run git (/usr/bin/git), which can see all your files.
┊ See, change and delete files matching ~/git/report/reports/*.md (12 now, and any added later).
│ See files in ~/logs.
│ Send and receive data with api.example.com, on port 443.
│ See files in its own folder and its subfolders, ~/git/report.

Hidden files (names starting with a dot) are left out unless named. Pages (.lmth) can be changed only if named.

[ ] I trust where this page came from.

                                             [ Don't open ]  [ Allow and open ]
```

| Bar      | Means               | Note                                                         |
| -------- | ------------------- | ------------------------------------------------------------ |
| ▌ red    | a broad request     | on a downloaded page, tick "I trust" before "Allow and open" |
| ┊ yellow | a narrower wildcard | the line counts the files it matches now                     |
| │ plain  | everything else     |                                                              |

[Permissions](permissions.md#colours) lists what makes a line red or yellow.

"Don't open" is the default. Return and Escape both choose it.

## Approvals

When you allow a page, resworb records its real path (symlinks resolved) and its exact list of lines. The same page with the same list then opens without asking.

resworb asks again when:

- the page moves or is renamed;
- a tag is added, removed or changed;
- a `resworb-run` program now resolves to a different file.

The new popup marks the changed lines "New".

resworb does **not** ask again when the page's content changes but its tags do not. Other pages cannot rewrite it unless they ask for `resworb-write` on pages, which shows red, but they can rewrite `.js` and `.css` files in their writable folders. Keep approved pages where only you can write.

## The Permissions menu

Each page window has a **Permissions** menu:

| Item                      | Does                                                    |
| ------------------------- | ------------------------------------------------------- |
| This Page's Permissions…  | lists what this page may do                             |
| Approved Pages → Revoke … | forgets one page's approval                             |
| Revoke All Approvals      | forgets every approval                                  |
| Show Egress Log           | opens `egress.log`, the proxy's record of every request |

A revoke takes effect the next time the page opens. A page already open keeps running.

## The window

- It loads only files. A link to a website does nothing, and `window.open` opens nothing.
- For a page with `resworb-net`, the title ends with the declared hosts.
- Saving the page, or a `.css` or `.js` file in its folder or below, reloads it. Hidden folders and `node_modules` do not count. A page in `/` or `~` watches only its own folder.
- A reload does not re-read the tags. Reopen the page to apply new ones.
- The page can write to the clipboard, go fullscreen and lock the pointer. It cannot use the camera, microphone, screen capture, notifications or location, or read the clipboard.

## Testing without the popup

In a development build, `RESWORB_TEST_ALLOW=1` answers "Allow and open" and prints the lines it would have shown:

```sh
RESWORB_TEST_ALLOW=1 pnpm exec electron . page.lmth
```

Packaged builds ignore it. It never grants more than the tags ask for.
