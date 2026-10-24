---
name: resworb
description: Write a .lmth page — an HTML file that opens in resworb, a browser turned inside out: the page has full Node (fs, child_process, anything) and no network. Use when asked for a visualizer, viewer, editor, dashboard or "a page" for files on this machine that must also edit them, or whenever a .lmth file is mentioned.
---

# resworb

The easiest tool for anything on a machine is an HTML page. In a browser it is read-only.
In resworb it can also write. A `.lmth` file is plain HTML where `require` works in
`<script>`. The process has no network: not blocked in an API, blocked by the kernel,
child processes included. So a page can see the whole machine and cannot send anything
anywhere.

One app, installed once. After that every tool is one `.lmth` file: write it, open it.

## Write a page

```html
<!doctype html>
<meta charset="utf-8">
<title>Stories</title>
<style>/* inline, or a .css next to the page */</style>
<main id="list"></main>
<script>
  const fs = require('fs');
  const path = require('path');
  const here = path.dirname(decodeURIComponent(location.pathname));   // the page's folder

  for (const name of fs.readdirSync(here).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(here, name), 'utf8');
    // render; on edit: fs.writeFileSync(path.join(here, name), newText)
  }
</script>
```

Rules of the house:

- **The files are the truth; the page is a view.** Read from disk, write back to disk,
  in the files' own format. Never keep the only copy of anything in the page.
- **Everything on disk.** No CDN, no web fonts, no `fetch` to a URL. A library goes next
  to the page as a `.js` and is loaded with `<script src>` or `require`.
- **Start from `here`.** Paths are relative to the page's folder, as above. A page may
  read anywhere; it writes where the user would expect, and asks before deleting.
- **Node is synchronous and fine.** `readFileSync`, `execSync('git log …')`, sqlite,
  whatever. No server, no build step, no bundler.
- **Saving the `.lmth`, or any `.css`/`.js` next to it, reloads the window.** Keep
  state in the files, not in the page, so a reload loses nothing.

## Open it

```sh
open page.lmth            # macOS, after installing resworb.app
electron . page.lmth      # from the repo
```

resworb refuses to open a page if the internet is reachable (the jail is off); it says
so in a dialog. That is the product working.

## What resworb is not

Not a browser: no URLs, no tabs, no web. Not an app framework: no packaging, no IPC,
no preload. If the task needs the internet, it is not a resworb page.
