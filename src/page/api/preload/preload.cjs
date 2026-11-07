const { contextBridge, ipcRenderer, webFrame } = require('electron');

const call = async (op, ...args) => {
  const reply = await ipcRenderer.invoke('apargon', op, ...args);

  if ('error' in reply) {
    throw Object.assign(new Error(reply.error), { code: reply.code });
  }

  return reply.value;
};

call('reset');
// A page's own window.close() skips the window's close event; through the API it closes as the user's does, so a page in the background hides instead. And window.print() checks papp-use print, which the Windows sandbox does not.
webFrame.executeJavaScript('window.close = () => papp.closeWindow(); window.print = () => papp.print();');

const watchCallbacks = new Map();
const shortcutCallbacks = new Set();
const menuCallbacks = new Set();
const systemCallbacks = new Set();
const trayCallbacks = new Set();
const trayClickCallbacks = new Set();
const hearing = new Map();
const jobs = new Map();
const connections = new Map();
const requestHandlers = new Map();
// Subscribes a callback; the function returned takes it off again.
const listener = callbacks => callback => {
  callbacks.add(callback);

  return () => callbacks.delete(callback);
};
ipcRenderer.on('apargon-change', (_event, id, file, kind) => watchCallbacks.get(id)?.callback(file, kind));
ipcRenderer.on('apargon-unwatched', (_event, id, error) => {
  watchCallbacks.get(id)?.resolve(error);
  watchCallbacks.delete(id);
});
ipcRenderer.on('apargon-output', (_event, id, stream, text) => jobs.get(id)?.onOutput?.(stream, text));
ipcRenderer.on('apargon-exit', (_event, id, exit) => {
  jobs.get(id)?.resolve(exit);
  jobs.delete(id);
});
ipcRenderer.on('apargon-data', (_event, id, bytes) => connections.get(id)?.onData?.(bytes));
ipcRenderer.on('apargon-closed', (_event, id, error) => {
  connections.get(id)?.resolve(error);
  connections.delete(id);
});
ipcRenderer.on('apargon-shortcut', (_event, keys) => shortcutCallbacks.forEach(callback => callback(keys)));
ipcRenderer.on('apargon-request', async (_event, server, request) => {
  const handler = requestHandlers.get(server);

  // Closed since: the trampoline has dropped the request.
  if (!handler) {
    return;
  }

  // The page's handler failed, or gave an answer Apargon cannot send: whoever asked gets an error, and the page's console the reason.
  await Promise.resolve()
    .then(() => handler(request))
    .then(answer => {
      const { status = 200, headers = {}, body = '' } = answer ?? {};

      return call('respond', request.id, status, headers, body);
    })
    .catch(err => {
      console.error(err);

      return call('respond', request.id, 500, {}, '');
    });
});
ipcRenderer.on('apargon-menu', (_event, id) => menuCallbacks.forEach(callback => callback(id)));
ipcRenderer.on('apargon-system', (_event, event) => systemCallbacks.forEach(callback => callback(event)));
ipcRenderer.on('apargon-tray', (_event, id) => trayCallbacks.forEach(callback => callback(id)));
ipcRenderer.on('apargon-tray-click', (_event, bounds) => trayClickCallbacks.forEach(callback => callback(bounds)));
ipcRenderer.on('apargon-broadcast', (_event, id, broadcast) => hearing.get(id)?.(broadcast));

const papp = {
  dir: ipcRenderer.sendSync('apargon-dir'),
  readFile: (file, options) => call('readFile', file, options),
  writeFile: (file, data) => call('writeFile', file, data),
  appendFile: (file, data) => call('appendFile', file, data),
  copyFile: (from, to) => call('copyFile', from, to),
  readdir: (file, options) => call('readdir', file, options),
  stat: file => call('stat', file),
  exists: file => call('exists', file),
  mkdir: file => call('mkdir', file),
  rm: (file, options) => call('rm', file, options),
  rename: (from, to) => call('rename', from, to),
  trash: file => call('trash', file),
  run: (program, args, options) => call('run', program, args, options),
  spawn: async (program, args, { cwd, onOutput } = {}) => {
    const id = crypto.randomUUID();
    const closed = new Promise(resolve => jobs.set(id, { onOutput, resolve }));
    await call('spawn', id, program, args, { cwd }).catch(err => {
      jobs.delete(id);
      throw err;
    });

    return { closed, write: data => call('write', id, data), end: () => call('endInput', id), close: () => call('kill', id) };
  },
  connect: async (host, port, { tls, onData } = {}) => {
    const id = crypto.randomUUID();
    const closed = new Promise(resolve => connections.set(id, { onData, resolve }));
    await call('connect', id, host, port, { tls }).catch(err => {
      connections.delete(id);
      throw err;
    });

    return { closed, write: data => call('writeConnection', id, data), close: () => call('closeConnection', id) };
  },
  watch: async (file, callback, options) => {
    const id = crypto.randomUUID();
    const { promise: closed, resolve } = Promise.withResolvers();
    watchCallbacks.set(id, { callback, resolve });
    await call('watch', id, file, options).catch(err => {
      watchCallbacks.delete(id);
      throw err;
    });

    return {
      closed,
      close: async () => {
        watchCallbacks.delete(id);
        await call('unwatch', id);
        resolve(null);
      },
    };
  },
  pick: options => call('pick', options),
  given: () => call('given'),
  getSecret: name => call('getSecret', name),
  setSecret: (name, value) => call('setSecret', name, value),
  deleteSecret: name => call('deleteSecret', name),
  listen: async (options, handler) => {
    if (typeof handler !== 'function') {
      throw new TypeError('papp.listen takes options and a handler: papp.listen({}, request => ({ body: "ok" })).');
    }

    const server = crypto.randomUUID();
    requestHandlers.set(server, handler);
    const url = await call('listen', server, options.port ?? null).catch(err => {
      requestHandlers.delete(server);
      throw err;
    });

    const { promise: closed, resolve } = Promise.withResolvers();

    return {
      url,
      closed,
      close: async () => {
        requestHandlers.delete(server);
        await call('unlisten', server);
        resolve(null);
      },
    };
  },
  open: target => call('open', target),
  saveAll: files => call('saveAll', files),
  save: (file, data) => call('save', file, data),
  pdf: () => call('pdf'),
  print: () => call('print'),
  menu: menus => call('menu', menus),
  contextMenu: items => call('contextMenu', items),
  onMenu: listener(menuCallbacks),
  power: () => call('power'),
  onSystem: listener(systemCallbacks),
  notify: (title, body, options) => call('notify', title, body, options),
  tray: (title, items, options) => call('tray', title, items, options),
  onTray: listener(trayCallbacks),
  onTrayClick: listener(trayClickCallbacks),
  quit: () => call('quit'),
  cursor: () => call('cursor'),
  share: item => call('share', item),
  // Refused without the tag, so it waits for the answer; the stop function it gives stops hearing that name.
  hear: async (name, callback) => {
    const id = crypto.randomUUID();
    hearing.set(id, callback);
    await call('hear', id, name).catch(err => {
      hearing.delete(id);
      throw err;
    });

    return () => {
      hearing.delete(id);

      return call('unhear', id);
    };
  },
  progress: value => call('progress', value),
  window: change => call('window', change),
  displays: () => call('displays'),
  // The stop function lets this keep-awake go; a close or reload lets every one go.
  keepAwake: async options => {
    const id = await call('keepAwake', options);

    return () => call('letSleep', id);
  },
  badge: count => call('badge', count),
  attention: () => call('attention'),
  shortcuts: keys => call('shortcuts', keys),
  closeWindow: () => call('closeWindow'),
  onShortcut: listener(shortcutCallbacks),
};

// A papp-system page has no context isolation, and contextBridge works only isolated.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('papp', papp);
} else {
  window.papp = papp;
}
