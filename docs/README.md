# resworb documentation

resworb opens an HTML file from disk. The page may read and write your files, but it cannot reach the network. A page is a `.lmth` file. It lists what it needs in `<meta>` tags, and you approve the list once.

| Read                                  | To learn                                             |
| ------------------------------------- | ---------------------------------------------------- |
| [Using resworb](using.md)             | install, open a page, the popup, approvals, the menu |
| [Permissions](permissions.md)         | each tag, how to write it, and its popup colour      |
| [The page API](api.md)                | `window.resworb`, call by call; full-Node pages      |
| [Writing a page](writing-pages.md)    | how to build a page, with recipes                    |
| [Troubleshooting](troubleshooting.md) | every message resworb shows, and the fix             |
| [Verification](verification.md)       | what `pnpm test` proves; checks you run by hand      |
| [Security model](../SECURITY.md)      | what is enforced and what is not                     |

## In one minute

A page with no tags may see and change the files in its own folder, and nothing else. It opens without asking.

```html
<!doctype html>
<meta charset="utf-8">
<textarea id="text"></textarea>
<button id="save">Save</button>
<script>
  resworb.exists('notes.txt').then(async (found) => {
    text.value = found ? await resworb.readFile('notes.txt') : '';
  });
  save.onclick = () => resworb.writeFile('notes.txt', text.value);
</script>
```

Save it as `notes.lmth` in a folder of its own, and double-click it.

To reach further, a page adds tags:

```html
<meta name="resworb-read"  content="~/logs">              <!-- see a folder -->
<meta name="resworb-write" content="./reports/*.md">      <!-- see, change, delete -->
<meta name="resworb-net"   content="api.example.com:443"> <!-- one server -->
<meta name="resworb-run"   content="git">                 <!-- one program -->
<meta name="resworb-node"  content="full">                <!-- full Node -->
```

`resworb-node` goes alone or with `resworb-net`, never with the others.

## Where resworb keeps its files

| What                | macOS                                               | Linux                               |
| ------------------- | --------------------------------------------------- | ----------------------------------- |
| Approvals           | `~/Library/Application Support/resworb/grants.json` | `~/.config/resworb/grants.json`     |
| Proxy log           | `~/Library/Logs/resworb/egress.log`                 | `~/.config/resworb/logs/egress.log` |
| Pages' browser data | `~/Library/Application Support/resworb/pages/`      | `~/.config/resworb/pages/`          |
