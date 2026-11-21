const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const id = process.env.PROBE_ID;
app.setPath('userData', `/tmp/machprobe/ud/${id}`);
const file = `/tmp/machprobe/out/${id}.txt`;
const out = (k, v) => fs.appendFileSync(file, `${k}=${v}\n`);
app.whenReady().then(() => {
  const w = new BrowserWindow({ x: 0, y: 0, width: 400, height: 300 });
  w.webContents.on('did-finish-load', async () => {
    try {
      await clipboard.writeText('p' + id);
      out('clip', (await clipboard.readText()).startsWith('p') ? 'ok' : 'FAIL');
    } catch {
      out('clip', 'ERR');
    }
    // A check that waits for what never comes writes nothing, and round.sh moves on without it.
    await w.webContents.executeJavaScript('void (window.typed = new Promise(r => (document.querySelector("input").oninput = e => r(e.target.value))))');
    w.webContents.focus();
    w.webContents.sendInputEvent({ type: 'char', keyCode: 'x' });
    out('typed', await w.webContents.executeJavaScript('window.typed'));
    try {
      out(
        'audio',
        await w.webContents.executeJavaScript(
          `(async()=>{const c=new AudioContext();const o=c.createOscillator();o.connect(c.destination);o.start();await c.resume();return c.state+'/'+c.sampleRate})()`
        )
      );
    } catch (e) {
      out('audio', 'ERR');
    }
    out('done', 'yes');
  });
  w.loadURL('data:text/html,<body style="background:%23c33"><input autofocus></body>');
  setTimeout(() => app.exit(1), 30000);
});
