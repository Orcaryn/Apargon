// A papp-node page's require searches its own folder first, then Apargon's modules, for @electron/remote: the folders this file's own require searches, so it works from any depth.
globalThis.module.paths.push(...module.paths);
