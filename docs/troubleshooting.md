# Troubleshooting

Each message resworb shows, its cause, and the fix.

## The page does not open

These appear in a dialog titled "resworb".

| Message                                                                                       | Cause and fix                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a .lmth page.                                                                            | resworb started without a page. Open a `.lmth` file.                                                                                                                                                                            |
| No offline mode for win32 yet.                                                                | Windows is not supported.                                                                                                                                                                                                       |
| Unknown tag resworb-x. The tags are …                                                         | The tag name is misspelt. Use one of the five.                                                                                                                                                                                  |
| Bad resworb-node value "x". The only value is "full".                                         | Write `content="full"`.                                                                                                                                                                                                         |
| resworb-node already allows every folder and program. Keep resworb-node and resworb-net only. | Remove the `resworb-read`, `resworb-write` and `resworb-run` tags, or remove `resworb-node`.                                                                                                                                    |
| A folder of "\*" is unclear. Use / for the whole disk or ~ for your home folder.              | Name a folder.                                                                                                                                                                                                                  |
| Bad folder "x". Use a path such as ./data, ~/notes or ~/notes/\*.md.                          | The value is empty or contains `"` or `\`.                                                                                                                                                                                      |
| Folder /path does not exist (from "x").                                                       | The part before the first `*` must exist. Create it or fix the path.                                                                                                                                                            |
| Folder /path has a " in its path, which the sandbox cannot take. Rename it.                   | Rename the folder. This applies to writable folders.                                                                                                                                                                            |
| Bad resworb-net value "x". One host:port per <meta>, …                                        | Write `host:port`, without a scheme or path. See [Permissions](permissions.md#servers-resworb-net).                                                                                                                             |
| On Linux, a port on this computer must be a number, such as localhost:11434: …                | Replace `localhost:*` with each port the page needs.                                                                                                                                                                            |
| "x" has a line break or another invisible character, which the popup cannot show. …           | Write the value on one line. If the value is fine, a folder or the page's own path has such a name: rename it.                                                                                                                  |
| resworb-run takes one program, no wildcards. …                                                | Name one program per tag.                                                                                                                                                                                                       |
| Bad resworb-run value "x". Name one program, such as git, or give its full path.              | The name has a space, a `/` or another character not allowed. Give a bare name or an absolute path.                                                                                                                             |
| Program x was not found. Give its full path in resworb-run.                                   | The program is not in `PATH`, `/opt/homebrew/bin` or `/usr/local/bin`. Give its full path.                                                                                                                                      |
| Could not start the sandbox: …                                                                | `sandbox-exec` (macOS) or `bwrap` (Linux) did not start. On Linux, install resworb from the `.deb`: it brings `bwrap`, and the AppArmor profile Ubuntu 23.10 and later need. `Failed RTM_NEWADDR` means the profile is missing. |
| This process can still open sockets. Refusing to open the page.                               | The page's process is not in the sandbox. See below.                                                                                                                                                                            |

### "This process can still open sockets"

Before it opens a page, the sandboxed process proves it is offline. On macOS it tries to open a loopback port; if that works, it is not in the sandbox. On Linux it checks that its network holds only `lo` and is not the one resworb started in. If a check fails or cannot run, it refuses. This is the safety check working, not a bug to work around.

Likely causes:

- `RESWORB` is set in your environment. resworb sets it only for its own sandboxed process; unset it.
- The sandbox did not apply. Check that `sandbox-exec` (macOS) or `bwrap --unshare-net` (Linux) works on this machine.

No flag skips this check.

## Dialogs that ask

| You see                           | Meaning                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| "If you allow it, this page can:" | The permission popup. See [Using resworb](using.md#the-popup).         |
| "Allow and open" does nothing     | A downloaded page needs the "I trust" box ticked.                      |
| The popup comes back              | The page moved, its tags changed, or a program now resolves elsewhere. |

## While the page runs

| You see                                                                    | Cause and fix                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| resworb: this page may not see /path. Ask for it with … resworb-read …     | Add `resworb-read` for the folder. Check for a hidden name, or a symlink that leads out.                 |
| resworb: this page may not change /path. Ask for it with … resworb-write … | Add `resworb-write`. The own folder is to see only. For a page (`.lmth`), the value must end in `.lmth`. |
| resworb: this page may not run x. Ask for it with … resworb-run …          | Declare the program, and call it by its file name, not its path.                                         |
| resworb: run takes its arguments as an array.                              | Write `run('git', ['status'])`, not `run('git', 'status')`.                                              |
| resworb: readFile takes an encoding name, or null for bytes.               | Pass `'utf8'`, another encoding, or `null`, not an options object.                                       |
| A script, style or image gets a 403: `resworb: this page may not see …`    | The file is out of the page's reach.                                                                     |
| `fetch` over http gets a 403: `resworb: host not declared`                 | Declare the host with `resworb-net`.                                                                     |
| `fetch` over https fails with a network error                              | The host is not declared; for https, the proxy's refusal looks like this.                                |
| `fetch` fails in a page without `resworb-net`                              | The page has no network. Add `resworb-net`.                                                              |
| `fetch` to a server on this computer fails                                 | The proxy refuses this computer. Declare `localhost:<port>`.                                             |
| `curl` reports a 403 from the proxy                                        | The host is not declared. `*.example.com` does not cover `example.com`.                                  |
| A program cannot connect                                                   | It ignores `https_proxy`, or needs DNS. Only proxy-aware programs reach servers.                         |
| A program cannot write (macOS)                                             | It writes outside the page's folders. Use `$TMPDIR`, not `/tmp`.                                         |
| `rm` refuses a folder                                                      | The folder holds a hidden file, such as `.DS_Store`.                                                     |

## Other problems

**A file next to the page does not load.** The page sits in `~`, Desktop, Documents or Downloads, where it has no own folder. Move it into a folder of its own.

**A page cannot save next to itself.** The own folder is to see only. Ask for `resworb-write`, such as `./notes.txt` or `./*`.

**A save to a `.lmth` file is refused.** `resworb-write` skips pages unless its value ends in `.lmth`.

**New tags have no effect.** resworb reads tags when the page opens. Reopen it.

**The page does not reload when a file changes.** Only `.lmth`, `.css` and `.js` files trigger a reload, and not in hidden folders or `node_modules`. Use `resworb.watch` for data files.

**A link does nothing.** The window loads only files. Show the URL instead.

**Show Egress Log says "No egress recorded yet."** No page has sent a request through the proxy yet.

## Reporting a security problem

If a page reaches a host or file it did not declare, or the socket check passes outside the sandbox, open an issue. Include the page, the platform and the egress log. Leave out secrets and private file contents.
