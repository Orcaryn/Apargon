const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const id = process.env.PROBE_ID;
app.setPath('userData', `/tmp/machprobe/ud/${id}`);
const file = `/tmp/machprobe/out/${id}.txt`;
const out = (k, v) => fs.appendFileSync(file, `${k}=${v}\n`);
app.whenReady().then(() => {
  const w = new BrowserWindow({ x: 0, y: 0, width: 400, height: 300 });
  w.webContents.on('did-finish-load', async () => {
    try { out('audio', await w.webContents.executeJavaScript(`(async()=>{const c=new AudioContext();const o=c.createOscillator();o.connect(c.destination);o.start();await new Promise(r=>setTimeout(r,200));return c.state+'/'+c.sampleRate})()`)); } catch (e) { out('audio', 'ERR'); }
    w.webContents.focus(); w.webContents.sendInputEvent({ type: 'char', keyCode: 'x' });
    await new Promise(r => setTimeout(r, 200));
    out('typed', await w.webContents.executeJavaScript('document.querySelector("input").value'));
    try { await clipboard.writeText('p' + id); out('clip', (await clipboard.readText()).startsWith('p') ? 'ok' : 'FAIL'); } catch { out('clip', 'ERR'); }
    out('done', 'yes');
    const t = setInterval(() => { if (fs.existsSync(file.replace('.txt', '.quit'))) { clearInterval(t); app.quit(); } }, 100);
  });
  w.loadURL('data:text/html,<body style="background:%23c33"><input autofocus></body>');
  setTimeout(() => app.exit(1), 30000);
});
