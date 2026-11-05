import fs from 'fs';

// Without Electron: the Node tests load what uses these. A missing file reads as {}; a write replaces the file whole, never half-written.
export function readJson<T extends object>(file: string): T {
  return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}');
}

export function writeJson(file: string, value: object) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
}
