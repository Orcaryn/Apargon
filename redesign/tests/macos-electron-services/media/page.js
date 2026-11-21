(async () => {
  const r = {};
  // WebGL: clear to green, read back, and name the renderer.
  try {
    const gl = document.getElementById('c').getContext('webgl2');
    gl.clearColor(0, 1, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    r.webgl = (px[1] === 255 ? 'ok' : 'BADPIX') + '|' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?');
  } catch (e) {
    r.webgl = 'ERR';
  }
  try {
    const a = await navigator.gpu?.requestAdapter();
    r.webgpu = a ? 'ok|' + (a.info?.vendor || '') + ' ' + (a.info?.architecture || '') : 'none';
  } catch (e) {
    r.webgpu = 'ERR';
  }
  // Video: the first frame decoded from an H.264 file, or the player's error. Loaded again, so that neither has passed already.
  const v = document.getElementById('v');
  v.load();
  await new Promise(res => {
    v.requestVideoFrameCallback(res);
    v.onerror = res;
  });
  const q = v.getVideoPlaybackQuality();
  r.video = `t=${v.currentTime.toFixed(1)} frames=${q.totalVideoFrames} err=${v.error ? v.error.code : 0}`;
  // WebCodecs: hardware decoder and encoder for H.264.
  try {
    r.hwdec = (await VideoDecoder.isConfigSupported({ codec: 'avc1.42E01E', hardwareAcceleration: 'prefer-hardware' })).supported;
  } catch {
    r.hwdec = 'ERR';
  }
  try {
    let n = 0;
    const enc = new VideoEncoder({
      output: () => n++,
      error: e => {
        r.hwencErr = e.message;
      },
    });
    enc.configure({ codec: 'avc1.42E01E', width: 640, height: 360, hardwareAcceleration: 'prefer-hardware' });
    const cv = new OffscreenCanvas(640, 360);
    cv.getContext('2d').fillRect(0, 0, 10, 10);
    for (let i = 0; i < 5; i++) {
      const f = new VideoFrame(cv, { timestamp: i * 33333 });
      enc.encode(f, { keyFrame: i === 0 });
      f.close();
    }
    await enc.flush();
    r.hwenc = 'chunks=' + n;
  } catch (e) {
    r.hwenc = 'ERR ' + (r.hwencErr || e.message).slice(0, 40);
  }
  // User-installed font: width differs from the fallback only if the font is found.
  const ctx = new OffscreenCanvas(10, 10).getContext('2d');
  const s = 'iiiiWWWW@@ilil';
  const w = f => {
    ctx.font = f;
    return ctx.measureText(s).width;
  };
  r.userfont = w('20px "MesloLGLDZ Nerd Font", serif') !== w('20px serif') || w('20px "MesloLGLDZ Nerd Font Mono", serif') !== w('20px serif') ? 'found' : 'MISSING';
  r.sysfont = w('20px Menlo, serif') !== w('20px serif') ? 'found' : 'MISSING';
  return r;
})();
