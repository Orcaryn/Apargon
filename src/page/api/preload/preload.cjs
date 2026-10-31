const { contextBridge, ipcRenderer } = require('electron');

const call = async (op, ...args) => {
  const reply = await ipcRenderer.invoke('apargon', op, ...args);

  if ('error' in reply) {
    throw Object.assign(new Error(reply.error), { code: reply.code });
  }

  return reply.value;
};

call('reset');

const watchCallbacks = new Map();
const shortcutCallbacks = new Set();
const jobs = new Map();
ipcRenderer.on('apargon-change', (_event, id, file, kind) => watchCallbacks.get(id)?.(file, kind));
ipcRenderer.on('apargon-output', (_event, id, stream, text) => jobs.get(id)?.onOutput?.(stream, text));
ipcRenderer.on('apargon-exit', (_event, id, exit) => {
  jobs.get(id)?.resolve(exit);
  jobs.delete(id);
});
ipcRenderer.on('apargon-shortcut', (_event, keys) => shortcutCallbacks.forEach(callback => callback(keys)));

contextBridge.exposeInMainWorld('papp', {
  dir: ipcRenderer.sendSync('apargon-dir'),
  readFile: (file, encoding = 'utf8', range) => call('readFile', file, encoding, range),
  writeFile: (file, data) => call('writeFile', file, data),
  appendFile: (file, data) => call('appendFile', file, data),
  copyFile: (from, to) => call('copyFile', from, to),
  readdir: (file, options) => call('readdir', file, options),
  stat: file => call('stat', file),
  exists: file => call('exists', file),
  mkdir: file => call('mkdir', file),
  rm: file => call('rm', file),
  rename: (from, to) => call('rename', from, to),
  run: (program, args, options) => call('run', program, args, options),
  spawn: async (program, args, { cwd, onOutput } = {}) => {
    const id = crypto.randomUUID();
    const done = new Promise(resolve => jobs.set(id, { onOutput, resolve }));
    await call('spawn', id, program, args, { cwd }).catch(err => {
      jobs.delete(id);
      throw err;
    });

    return { done, write: data => call('write', id, data), end: () => call('endInput', id), kill: () => call('kill', id) };
  },
  watch: async (file, callback, options) => {
    const id = crypto.randomUUID();
    await call('watch', id, file, options);
    watchCallbacks.set(id, callback);

    return () => {
      watchCallbacks.delete(id);

      return call('unwatch', id);
    };
  },
  pick: options => call('pick', options),
  open: target => call('open', target),
  saveAs: files => call('saveAs', files),
  notify: (title, body) => call('notify', title, body),
  tray: title => call('tray', title),
  onShortcut: callback => {
    shortcutCallbacks.add(callback);

    return () => shortcutCallbacks.delete(callback);
  },
});
