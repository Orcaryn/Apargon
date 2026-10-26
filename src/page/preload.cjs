// window.papp: the only door from a page without full Node to the files and programs it
// was granted. Every call is checked in api.ts; this file only forwards.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (op, ...args) => {
  const reply = await ipcRenderer.invoke('papp', op, ...args);

  if ('error' in reply) {
    throw Object.assign(new Error(reply.error), { code: reply.code });
  }

  return reply.value;
};

// Each watch has an id; api.ts sends back the id and the file that changed. Random, not
// counted: a reload starts this file over, and its ids must not meet the last page's.
const callbacks = new Map();
ipcRenderer.on('papp-change', (_event, id, file) => callbacks.get(id)?.(file));
call('unwatch'); // a reload leaves the last page's watches behind

contextBridge.exposeInMainWorld('papp', {
  dir: ipcRenderer.sendSync('papp-dir'),
  readFile: (file, encoding = 'utf8') => call('readFile', file, encoding),
  writeFile: (file, data) => call('writeFile', file, data),
  readdir: file => call('readdir', file),
  stat: file => call('stat', file),
  exists: file => call('exists', file),
  mkdir: file => call('mkdir', file),
  rm: file => call('rm', file),
  rename: (from, to) => call('rename', from, to),
  run: (program, args, options) => call('run', program, args, options),
  watch: async (file, callback) => {
    const id = crypto.randomUUID();
    await call('watch', id, file);
    callbacks.set(id, callback); // before any change: the reply comes first

    return () => {
      callbacks.delete(id);

      return call('unwatch', id);
    };
  },
});
