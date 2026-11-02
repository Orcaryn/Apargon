import fs from 'fs';
import path from 'path';

// Only http and https: another scheme could start an app.
export function linkHost(href: string) {
  const url = URL.parse(href);

  return url && ['http:', 'https:'].includes(url.protocol) ? url.hostname : null;
}

// Never a page, HTML, SVG or a script: those run or load scripts when opened.
export const OPENABLE = /\.(png|jpe?g|gif|webp|heic|avif|bmp|tiff?|mp4|m4v|mov|webm|mkv|mp3|m4a|wav|flac|ogg|opus|aiff?|pdf|txt|md|csv|tsv|json|log|ya?ml)$/i;

// A folder with an extension is refused: on macOS, .app, .pkg and .workflow are folders, and opening one runs it.
export function viewable(file: string) {
  const stats = fs.statSync(file, { throwIfNoEntry: false });

  return stats !== undefined && (stats.isDirectory() ? path.extname(file) === '' : stats.isFile() && OPENABLE.test(file));
}
