import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APP_ROOT, DATA, pappAppId } from '../../../../shared/data/index.ts';

export const APPLICATIONS = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'applications');
export const ICONS = path.join(DATA, 'icons');
export const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autostart');

// The dock names a window after the launcher entry its class matches, and shows that entry's icon: one per .papp file, under its title, that reopens it. Hidden from the app grid.
export function writeLauncherEntry(papp: string) {
  const id = pappAppId(papp);
  const icon = path.join(ICONS, `${id}.png`);
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${pappTitle(papp)}`,
    `Icon=${fs.existsSync(icon) ? icon : app.isPackaged ? 'apargon' : path.join(APP_ROOT, 'build', 'icon.png')}`,
    `Exec=${[process.execPath, ...(app.isPackaged ? [] : [APP_ROOT]), papp].map(quoteExecArgument).join(' ')}`,
    `StartupWMClass=${id}`,
    'NoDisplay=true',
    `X-Apargon-Papp=${papp}`,
  ];
  fs.mkdirSync(APPLICATIONS, { recursive: true });

  for (const entry of fs.readdirSync(APPLICATIONS).filter(name => /^apargon-papp-[0-9a-f]+\.desktop$/.test(name))) {
    const other = /^X-Apargon-Papp=(.*)$/m.exec(fs.readFileSync(path.join(APPLICATIONS, entry), 'utf8'))?.[1];

    if (other && !fs.existsSync(other)) {
      fs.rmSync(path.join(APPLICATIONS, entry));
      fs.rmSync(path.join(AUTOSTART, entry), { force: true });
      fs.rmSync(path.join(ICONS, entry.replace(/\.desktop$/, '.png')), { force: true });
    }
  }

  fs.writeFileSync(path.join(APPLICATIONS, `${id}.desktop`), lines.join('\n') + '\n');
}

function pappTitle(papp: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(fs.readFileSync(papp, 'utf8'))?.[1] ?? '';
  const text = title
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, reference: string) => {
      const code = Number(`0${reference}`);

      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ')
    .trim();

  return text || path.basename(papp, path.extname(papp));
}

// As the Desktop Entry specification quotes an Exec argument.
function quoteExecArgument(arg: string) {
  const escaped = arg.replace(/\\/g, '\\\\\\\\').replace(/["$`]/g, '\\\\$&').replace(/%/g, '%%');

  return '"' + escaped + '"';
}
