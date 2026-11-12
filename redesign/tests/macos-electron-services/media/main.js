const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const id = process.env.PROBE_ID;
app.setPath('userData', `/tmp/machprobe/ud/${id}`);
const file = `/tmp/machprobe/out/${id}.txt`;
const out = (k, v) => fs.appendFileSync(file, `${k}=${v}\n`);
app.whenReady().then(() => {
  const w = new BrowserWindow({ x: 0, y: 0, width: 400, height: 300 });
  w.webContents.on('did-finish-load', async () => {
    const r = await w.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8')).catch(e => ({ page: 'ERR' }));
    for (const [k, v] of Object.entries(r)) out(k, v);
    const g = app.getGPUFeatureStatus(); out('gpu', `compositing:${g.gpu_compositing} webgl:${g.webgl} vdec:${g.video_decode} venc:${g.video_encode}`);
    out('done', 'yes');
    const t = setInterval(() => { if (fs.existsSync(file.replace('.txt', '.quit'))) { clearInterval(t); app.quit(); } }, 100);
  });
  w.loadFile(path.join(__dirname, 'index.html'));
  setTimeout(() => app.exit(1), 30000);
});
