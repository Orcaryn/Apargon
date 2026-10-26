# papp documentation

papp opens an HTML file from disk. The page may read and write your files, but it cannot reach the network. A page is a `.papp` file. It lists what it needs in `<meta>` tags, and you approve the list once.

| Read                                  | To learn                                               |
| ------------------------------------- | ------------------------------------------------------ |
| [Using papp](using.md)                | install, open a page, the popup, approvals, the menu   |
| [Permissions](permissions.md)         | each tag, how to write it, and its popup colour        |
| [The page API](api.md)                | `window.papp`, call by call; full-Node pages           |
| [Writing a page](writing-pages.md)    | how to build a page, with recipes                      |
| [Troubleshooting](troubleshooting.md) | every message papp shows, and the fix                  |
| [Verification](verification.md)       | what `pnpm test` proves; checks you run by hand        |
| [Windows](windows.md)                 | the plan (Microsoft's MXC) and why it is not built yet |
| [Security model](../SECURITY.md)      | what is enforced and what is not                       |

## In one minute

A page with no tags may see the files in its own folder and its subfolders, and nothing else. It opens without asking. To save, it asks for `papp-write`.

```html
<!doctype html>
<meta charset="utf-8">
<textarea id="text"></textarea>
<button id="save">Save</button>
<script>
  papp.exists('notes.txt').then(async (found) => {
    text.value = found ? await papp.readFile('notes.txt') : '';
  });
  save.onclick = () => papp.writeFile('notes.txt', text.value);
</script>
```

Save it as `notes.papp` in a folder of its own, and double-click it.

To reach further, a page adds tags:

```html
<meta name="papp-read"  content="~/logs">              <!-- see a folder -->
<meta name="papp-write" content="./reports/*.md">      <!-- see, change, delete -->
<meta name="papp-net"   content="api.example.com:443"> <!-- one server -->
<meta name="papp-run"   content="git">                 <!-- one program -->
<meta name="papp-node"  content="full">                <!-- full Node -->
```

`papp-node` goes alone or with `papp-net`, never with the others.

## Where papp keeps its files

| What                | macOS                                            | Linux                            |
| ------------------- | ------------------------------------------------ | -------------------------------- |
| Approvals           | `~/Library/Application Support/papp/grants.json` | `~/.config/papp/grants.json`     |
| Proxy log           | `~/Library/Logs/papp/egress.log`                 | `~/.config/papp/logs/egress.log` |
| Pages' browser data | `~/Library/Application Support/papp/pages/`      | `~/.config/papp/pages/`          |
