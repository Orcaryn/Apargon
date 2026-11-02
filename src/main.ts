import { app } from 'electron';
import path from 'path';
import { preparePage, startPage } from './page/start.ts';
import { PAGE_FILE } from './permissions/patterns.ts';
import { PAGE_CONFIG, tellTrampoline } from './shared/channel.ts';
import { openPage, startTrampoline } from './trampoline/start.ts';

if (PAGE_CONFIG) {
  preparePage(PAGE_CONFIG);
}

const pages = process.argv.filter(arg => PAGE_FILE.test(arg)).map(arg => path.resolve(arg));
app.on('open-file', (event, file) => {
  const page = path.resolve(file);
  event.preventDefault();

  if (PAGE_CONFIG) {
    tellTrampoline({ open: page });
  } else if (app.isReady()) {
    openPage(page);
  } else {
    pages.push(page);
  }
});

app.whenReady().then(() => (PAGE_CONFIG ? startPage(PAGE_CONFIG) : startTrampoline(pages)));
