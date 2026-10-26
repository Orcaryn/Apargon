# Writing a page

A page is one HTML file with a `.papp` extension. It is a view over files: the files hold the data, and the page shows and edits it.

## Principles

- **Give the page a folder of its own.** Put the data next to it, or ask for the folders it needs. A page in `~`, Desktop, Documents or Downloads gets no folder at all.
- **The files are the truth.** Write back in each file's own format: Markdown stays Markdown, JSON stays JSON. Never keep the only copy of anything in the page.
- **Keep everything on disk.** No CDN, no web fonts. Copy libraries next to the page and load them with `<script src>`.
- **Ask for as little as you can.** Every tag is a line in the popup, and broad ones are red. A page with no tags opens without asking.
- **Prefer JavaScript to a program.** Parsing a file in the page is safer than `papp-run`, whose program can read every file but keys and logins.
- **Use git for undo.** A page changes real files.

## Choose the tags

| The page needs to                 | Ask for                            |
| --------------------------------- | ---------------------------------- |
| see files next to it, or below it | nothing                            |
| save files next to it             | `papp-write`: `./*`, or one name   |
| read a folder elsewhere           | `papp-read`                        |
| change files elsewhere            | `papp-write`                       |
| reach only some files in a folder | a wildcard: `~/notes/*.md`         |
| call one web API                  | `papp-net` with `host:443`         |
| talk to a server on this computer | `papp-net` with `localhost:<port>` |
| use a command-line tool           | `papp-run`                         |
| use Node modules or many programs | `papp-node`, as a last resort      |

A page with no tags sees its folder and every subfolder, and changes nothing. To save, name what it saves: `./notes.txt` for one file, `./data` for a subfolder, `./*` for the whole folder. Pages (`.papp`) stay out unless the pattern ends in `.papp`.

## Structure

```html
<!doctype html>
<meta charset="utf-8">
<meta name="papp-read" content="~/logs">
<title>Logs</title>
<style>
  body { font: 14px/1.5 system-ui; margin: 24px; }
</style>

<ul id="list"></ul>

<script type="module">
  const render = async () => {
    const names = (await papp.readdir('~/logs')).filter((name) => name.endsWith('.log'));
    list.replaceChildren(...names.map((name) => Object.assign(document.createElement('li'), { textContent: name })));
  };

  await render();
  await papp.watch('~/logs', render);
</script>
```

- Tags go in the head, one value each.
- Inline `<script type="module">` allows top-level `await`.
- Saving the page reloads it, so you can edit it in any editor and see the result.

## Recipes

### Edit a JSON file

```html
<script type="module">
  const file = 'settings.json';
  const settings = JSON.parse(await papp.readFile(file));
  // ... change settings from a form ...
  await papp.writeFile(file, JSON.stringify(settings, null, 2) + '\n');
</script>
```

### Notes in Markdown, elsewhere on disk

```html
<meta name="papp-write" content="~/notes/*.md">
<script src="marked.min.js"></script>
<script type="module">
  const names = (await papp.readdir('~/notes')).filter((name) => name.endsWith('.md'));
  const html = marked.parse(await papp.readFile(`~/notes/${names[0]}`));
</script>
```

`marked.min.js` sits next to the page. The popup shows one yellow line with the number of notes.

### Show git history

```html
<meta name="papp-run" content="git">
<script type="module">
  const { stdout } = await papp.run('git', ['log', '--oneline', '-50']);
  document.body.textContent = stdout;
</script>
```

The program runs in the page's folder unless you pass `{ cwd }`.

### Ask a local model

```html
<meta name="papp-net" content="localhost:11434">
<script type="module">
  const reply = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model: 'llama3', prompt: 'Summarise: ...', stream: false }),
  }).then((r) => r.json());
</script>
```

`localhost` ports skip the proxy. With any `papp-net` tag, CORS is off.

### Fetch from a web API and save the result

```html
<meta name="papp-net" content="api.github.com:443">
<script type="module">
  const release = await fetch('https://api.github.com/repos/electron/electron/releases/latest').then((r) => r.json());
  await papp.writeFile('latest.json', JSON.stringify(release, null, 2) + '\n');
</script>
```

This is a shorter `examples/net.papp`. Downloaded, its popup warns that it can send the files it sees to the server.

### Convert files with a program

```html
<meta name="papp-run" content="pandoc">
<script type="module">
  await papp.run('pandoc', ['report.md', '-o', 'report.html']);
</script>
```

The program may write only where the page may: the `papp-write` folders and the temp folder. On Linux it may also write hidden files and pages there, and the whole folder behind a wildcard.

## What does not work

| You try                                   | Do instead                                       |
| ----------------------------------------- | ------------------------------------------------ |
| a CDN script or web font                  | copy it next to the page                         |
| `require('fs')` without full Node         | `papp.readFile`, `papp.writeFile`                |
| a link to a website                       | show the URL; the window shows only the page     |
| a link or frame to another page or file   | one page; read files with `papp.readFile`        |
| `window.open`                             | show the content in the page                     |
| `fetch` to an undeclared host             | add `papp-net`                                   |
| `fetch('data.json')` for a local file     | `papp.readFile('data.json')`                     |
| launching a browser or app from a program | nothing: that is a gap in the fence, not a route |
| keeping data in `localStorage`            | keep it in a file                                |
| new tags while the page is open           | reopen the page                                  |

## Deliver a page

Save the file, say where it is, and open it with a double-click, `open page.papp` on macOS or `papp page.papp` on Linux. If it has tags, say what the popup will list. Agents follow [`skills/papp/SKILL.md`](../skills/papp/SKILL.md).
