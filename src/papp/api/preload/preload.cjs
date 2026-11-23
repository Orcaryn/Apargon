const { contextBridge, ipcRenderer, webFrame } = require('electron');

const { dir, folder, token } = ipcRenderer.sendSync('apargon-dir');

const replyValue = reply => {
  if ('error' in reply) {
    throw Object.assign(new Error(reply.error), { code: reply.code });
  }

  return reply.value;
};

const call = async (op, ...args) => replyValue(await ipcRenderer.invoke('apargon', op, ...args));

const PIECE = 1024 * 1024;

// A string, or bytes of any kind, as bytes.
const bytesOf = data => {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  } else if (!ArrayBuffer.isView(data)) {
    throw new TypeError('Apargon: data is a string or bytes, such as a Uint8Array.');
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

// A call with bytes goes as a request to Apargon's own scheme, not as a message: Chromium streams it, and no process but this one holds the bytes whole. The token is the preload's alone: a frame in the window has none.
// parts: lists of bytes, sent one after another as the body, a piece at a time as Apargon takes them.
const callWithBytes = async (op, parts, ...args) => {
  let part = 0;
  let at = 0;
  const body = new ReadableStream({
    pull(controller) {
      while (part < parts.length && at >= parts[part].length) {
        part++;
        at = 0;
      }

      if (part === parts.length) {
        controller.close();
      } else {
        controller.enqueue(parts[part].subarray(at, (at += PIECE)));
      }
    },
  });

  const response = await fetch(`papp-bytes://${token}/${op}?args=${encodeURIComponent(JSON.stringify(args))}`, { method: 'PUT', body, duplex: 'half' });

  return replyValue(await response.json());
};

call('reset');
// A .papp file's own window.close() skips the window's close event; through the API it closes as the user's does, so a .papp file in the background hides instead. And window.print() goes through papp.print(), which prints in the trampoline, outside the sandbox.
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
// Apargon is told how much of each this window took: with too much untaken, the program or the other end waits.
ipcRenderer.on('apargon-output', (_event, id, stream, text, size) => {
  call('outputRead', id, size);
  jobs.get(id)?.onOutput?.(stream, text);
});
ipcRenderer.on('apargon-exit', (_event, id, exit) => {
  jobs.get(id)?.resolve(exit);
  jobs.delete(id);
});
ipcRenderer.on('apargon-data', (_event, id, bytes) => {
  call('dataRead', id, bytes.length);
  connections.get(id)?.onData?.(bytes);
});
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

  // The .papp file's handler failed, or gave an answer Apargon cannot send: whoever asked gets an error, and the .papp file's console the reason.
  await Promise.resolve()
    .then(() => handler(request))
    .then(answer => {
      const { status = 200, headers = {}, body = '' } = answer ?? {};

      return callWithBytes('respond', [bytesOf(body)], request.id, status, headers);
    })
    .catch(err => {
      console.error(err);

      return callWithBytes('respond', [], request.id, 500, {});
    });
});
ipcRenderer.on('apargon-menu', (_event, id) => menuCallbacks.forEach(callback => callback(id)));
ipcRenderer.on('apargon-system', (_event, event) => systemCallbacks.forEach(callback => callback(event)));
ipcRenderer.on('apargon-tray', (_event, id) => trayCallbacks.forEach(callback => callback(id)));
ipcRenderer.on('apargon-tray-click', (_event, bounds) => trayClickCallbacks.forEach(callback => callback(bounds)));
ipcRenderer.on('apargon-broadcast', (_event, id, broadcast) => hearing.get(id)?.(broadcast));

const papp = {
  // The .papp file's folder, which relative paths start from, and its own folder, where it writes without a tag.
  dir,
  folder,
  // Bytes come as the answer to a request, streamed; text as a message.
  readFile: async (file, options) => {
    if (options?.encoding !== null) {
      return call('readFile', file, options);
    }

    const response = await fetch(`papp-bytes://${token}/readBytes?args=${encodeURIComponent(JSON.stringify([file, options]))}`);

    return response.ok ? new Uint8Array(await response.arrayBuffer()) : replyValue(await response.json());
  },
  writeFile: async (file, data) => callWithBytes('writeFile', [bytesOf(data)], file),
  appendFile: async (file, data) => callWithBytes('appendFile', [bytesOf(data)], file),
  copyFile: (from, to) => call('copyFile', from, to),
  readdir: (file, options) => call('readdir', file, options),
  stat: file => call('stat', file),
  exists: file => call('exists', file),
  mkdir: file => call('mkdir', file),
  rm: (file, options) => call('rm', file, options),
  rename: (from, to) => call('rename', from, to),
  trash: file => call('trash', file),
  env: name => call('env', name),
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
  saveAll: async files => {
    const entries = Object.entries(files).map(([name, data]) => ({ name, bytes: bytesOf(data) }));

    return callWithBytes(
      'saveAll',
      entries.map(({ bytes }) => bytes),
      entries.map(({ name, bytes }) => ({ name, size: bytes.length }))
    );
  },
  save: async (file, data) => callWithBytes('save', [bytesOf(data)], file),
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

// A papp-system .papp file has no context isolation, and contextBridge works only isolated.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('papp', papp);
} else {
  window.papp = papp;
}
