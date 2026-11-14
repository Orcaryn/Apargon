import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APP_ROOT, DATA, pageAppId } from '../../../../shared/data/index.ts';

export const APPLICATIONS = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'applications');
export const ICONS = path.join(DATA, 'icons');
export const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autostart');

// The dock names a window after the launcher entry its class matches, and shows that entry's icon: one per .papp file, under its title, that reopens it. Hidden from the app grid.
export function writeLauncherEntry(page: string) {
  const id = pageAppId(page);
  const icon = path.join(ICONS, `${id}.png`);
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${pageTitle(page)}`,
    `Icon=${fs.existsSync(icon) ? icon : app.isPackaged ? 'apargon' : path.join(APP_ROOT, 'build', 'icon.png')}`,
    `Exec=${[process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), page].map(quoteExecArgument).join(' ')}`,
    `StartupWMClass=${id}`,
    'NoDisplay=true',
    `X-Apargon-Page=${page}`,
  ];
  fs.mkdirSync(APPLICATIONS, { recursive: true });

  for (const entry of fs.readdirSync(APPLICATIONS).filter(name => /^apargon-page-[0-9a-f]+\.desktop$/.test(name))) {
    const other = /^X-Apargon-Page=(.*)$/m.exec(fs.readFileSync(path.join(APPLICATIONS, entry), 'utf8'))?.[1];

    if (other && !fs.existsSync(other)) {
      fs.rmSync(path.join(APPLICATIONS, entry));
      fs.rmSync(path.join(AUTOSTART, entry), { force: true });
      fs.rmSync(path.join(ICONS, entry.replace(/\.desktop$/, '.png')), { force: true });
    }
  }

  fs.writeFileSync(path.join(APPLICATIONS, `${id}.desktop`), lines.join('\n') + '\n');
}

function pageTitle(page: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(fs.readFileSync(page, 'utf8'))?.[1] ?? '';
  const text = title
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, reference: string) => {
      const code = Number(`0${reference}`);

      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ')
    .trim();

  return text || path.basename(page, path.extname(page));
}

// As the Desktop Entry specification quotes an Exec argument.
function quoteExecArgument(arg: string) {
  const escaped = arg.replace(/\\/g, '\\\\\\\\').replace(/["$`]/g, '\\\\$&').replace(/%/g, '%%');

  return '"' + escaped + '"';
}
