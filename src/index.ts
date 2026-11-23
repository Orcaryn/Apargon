import { app } from 'electron';
import path from 'path';
import { PAPP_CONFIG, tellTrampoline } from './papp/channel/index.ts';
import { preparePapp, startPapp } from './papp/index.ts';
import { openPapp, startTrampoline } from './trampoline/index.ts';

if (PAPP_CONFIG) {
  preparePapp(PAPP_CONFIG);
}

const PAPP_FILE = /\.papp$/i;
const papps = process.argv.filter(arg => PAPP_FILE.test(arg)).map(arg => path.resolve(arg));
app.on('open-file', (event, file) => {
  const papp = path.resolve(file);
  event.preventDefault();

  if (PAPP_CONFIG) {
    tellTrampoline('open', papp);
  } else if (app.isReady()) {
    void openPapp(papp);
  } else {
    papps.push(papp);
  }
});

void app.whenReady().then(() => (PAPP_CONFIG ? startPapp(PAPP_CONFIG) : startTrampoline(papps)));
