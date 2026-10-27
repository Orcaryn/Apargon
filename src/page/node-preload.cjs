// A papp-node page's require searches its own folder first, then Apargon's modules, for @electron/remote.
const path = require('path');

globalThis.module.paths.push(path.join(__dirname, '..', '..', 'node_modules'));
