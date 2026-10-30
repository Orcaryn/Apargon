import { app, dialog, nativeImage, Notification, shell, Tray } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { Readable, Writable } from 'stream';
import { PAGE_FILE } from '../permissions/patterns.ts';
import { declaredLink, linkHost, PAGE_ENV, viewable, type Permissions } from '../permissions/tags.ts';
import { APP_BUNDLE, APP_ROOT, DATA, EGRESS_LOG, GRANTS_FILE, LINKS_FILE, MESSAGE_FD, PAGE_DATA, PARENT_FD, readJson, realPath, SEEN_FILE, UPDATE_FILE, writeJson, type ChildConfig, type ChildMessage, type Grants, type Links, type ParentMessage, type SavedFile, type UpdateState } from '../shared.ts';
import { followMove, noteContent } from '../storage.ts';
import { approve } from './approve.ts';
import { SANDBOX } from './platform.ts';
import { offerSkill } from './skill.ts';

let openPages = 0;
// The path of each page with a window, once per window.
const running: string[] = [];
const trays = new Map<ChildProcess, Tray>();

export async function openPage(file: string) {
  openPages++;
  const child = await approve(file)
    .then(approved => approved && startChild(approved))
    .catch((err: Error) => dialog.showErrorBox('Apargon', err.message));

  if (child) {
    await new Promise(resolve => child.on('close', resolve));
  }

  openPages--;

  if (!openPages) {
    app.quit();
  }
}

async function startChild({ page, permissions, pageHash }: Pick<ChildConfig, 'page' | 'permissions' | 'pageHash'>) {
  followMove(page, PAGE_DATA, SEEN_FILE, running);
  noteContent(page, SEEN_FILE);
  const sandbox = await SANDBOX!.prepare(page, permissions);
  const proxy = sandbox.proxyPort === null ? null : `127.0.0.1:${sandbox.proxyPort}`;
  const inherited = Object.entries(process.env).filter(([name]) => permissions.node || PAGE_ENV.includes(name) || permissions.env.includes(name));
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), APARGON: JSON.stringify({ page, permissions, pageHash, proxy, bridges: sandbox.bridges } satisfies ChildConfig) };

  if (proxy) {
    env.http_proxy = env.https_proxy = `http://${proxy}`;
    env.no_proxy = 'localhost,127.0.0.1';
  }

  app.dock?.hide();
  const [command, ...args] = [...sandbox.command, process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), page];
  const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'inherit', 'pipe', sandbox.networkFd ?? 'ignore', 'pipe'], env });
  readline.createInterface({ input: child.stdio[MESSAGE_FD] as Readable }).on('line', line => handleChildMessage(child, page, permissions, JSON.parse(line)));
  child.on('error', err => dialog.showErrorBox('Apargon', `Could not start the sandbox: ${err.message}${SANDBOX!.installHint}`));
  running.push(page);
  child.on('close', () => {
    running.splice(running.indexOf(page), 1);
    noteContent(page, SEEN_FILE);
    setTray(child, page, null);
    sandbox.close();
  });

  return child;
}

function handleChildMessage(child: ChildProcess, page: string, permissions: Permissions, message: ChildMessage) {
  if ('open' in message) {
    openPage(message.open);
  } else if ('revoke' in message) {
    for (const file of [GRANTS_FILE, LINKS_FILE]) {
      const kept = Object.entries(readJson<Grants>(file)).filter(([approved]) => !message.revoke.includes(approved));
      writeJson(file, Object.fromEntries(kept));
    }
  } else if ('automaticUpdates' in message) {
    const state = readJson<UpdateState>(UPDATE_FILE);
    writeJson(UPDATE_FILE, { ...state, automatic: message.automaticUpdates });
  } else if ('fileIcon' in message) {
    setFileIcon(page, message.fileIcon);
  } else if ('showEgressLog' in message) {
    shell.openPath(EGRESS_LOG);
  } else if ('notify' in message) {
    new Notification(message.notify).show();
  } else if ('tray' in message) {
    setTray(child, page, message.tray);
  } else if ('openLink' in message) {
    openLink(page, permissions, message.openLink);
  } else if ('openFile' in message) {
    // The real path: a symlink without an extension could lead to an app.
    const file = realPath(message.openFile);

    if (viewable(file) && !permissions.hidden.some(secret => file === secret || file.startsWith(secret + '/'))) {
      shell.openPath(file);
    }
  } else if ('installSkill' in message) {
    offerSkill('The papp skill for coding agents', null);
  } else if ('saveAs' in message) {
    const { id, files } = message.saveAs;
    saveFiles(files, permissions.hidden).then(
      paths => (child.stdio.at(PARENT_FD) as Writable).write(JSON.stringify({ saved: id, paths } satisfies ParentMessage) + '\n'),
      (err: Error) => (child.stdio.at(PARENT_FD) as Writable).write(JSON.stringify({ saved: id, error: err.message } satisfies ParentMessage) + '\n')
    );
  }
}

function setFileIcon(page: string, png: string) {
  const hash = createHash('sha256').update(png).digest('hex');

  if (spawnSync('/usr/bin/xattr', ['-p', 'com.apargon.icon', page], { encoding: 'utf8' }).stdout.trim() === hash) {
    return;
  }

  const script = `function run([page, png]) {
    ObjC.import('AppKit');
    const image = $.NSImage.alloc.initWithData($.NSData.alloc.initWithBase64EncodedStringOptions(png, 0));
    $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, page, 0);
  }`;
  spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, page, png]);
  spawnSync('/usr/bin/xattr', ['-w', 'com.apargon.icon', hash, page]);
}

function setTray(child: ChildProcess, page: string, title: string | null) {
  const tray = trays.get(child);

  if (title === null) {
    tray?.destroy();
    trays.delete(child);
  } else if (tray) {
    tray.setTitle(title);
  } else {
    const icon = nativeImage.createFromPath(path.join(import.meta.dirname, 'tray.png'));
    icon.setTemplateImage(true);
    const created = new Tray(icon);
    created.setToolTip(path.basename(page));
    created.setTitle(title);
    created.on('click', () => (child.stdio.at(PARENT_FD) as Writable).write(JSON.stringify({ trayClick: true } satisfies ParentMessage) + '\n'));
    trays.set(child, created);
  }
}

// The browser is outside the sandbox, logged in. A declared or remembered host opens at once; any other asks here, address shown, so the page cannot fake the question or the answer.
async function openLink(page: string, { open }: Permissions, url: string) {
  const host = linkHost(url);

  if (!host) {
    return;
  } else if (!declaredLink(host, [...open, ...(readJson<Links>(LINKS_FILE)[page] ?? [])])) {
    app.focus({ steal: true });
    const { response, checkboxChecked } = await dialog.showMessageBox({
      type: 'question',
      message: 'Open this link in your browser?',
      detail: url.length > 400 ? `${url.slice(0, 400)}… (${url.length} characters)` : url,
      buttons: ['Open', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      checkboxLabel: `Always, for links to ${host} from this page`,
    });

    if (response !== 0) {
      return;
    } else if (checkboxChecked) {
      // Read again: another dialog may have saved a host while this one waited.
      const links = readJson<Links>(LINKS_FILE);
      writeJson(LINKS_FILE, { ...links, [page]: [...(links[page] ?? []), host] });
    }
  }

  shell.openExternal(url);
}

// The page names the files and the user picks the folder, in this process's dialog: a page that breaks out of its sandbox can write nowhere else.
async function saveFiles(files: SavedFile[], hidden: string[]) {
  const badName = files.find(({ name }) => !name || path.basename(name) !== name || name.startsWith('.') || PAGE_FILE.test(name) || /[\p{Cc}\p{Cf}]/u.test(name));

  if (!files.length || badName) {
    throw new Error(`Apargon: saveAs takes one or more plain file names, without a folder, a leading dot or .papp${badName ? `: ${JSON.stringify(badName.name)}` : ''}.`);
  }

  // This process has no window of its own: without this, its dialog opens behind the page.
  app.focus({ steal: true });
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: app.getPath('downloads'),
    buttonLabel: 'Save Here',
    message: files.length === 1 ? `Save ${files[0].name}` : `Save ${files.length} files`,
    properties: ['openDirectory', 'createDirectory', 'noResolveAliases'],
  });

  if (canceled) {
    return [];
  }

  // A link the page planted could lead the user into a folder they did not mean. Keys and logins are hidden names or whole folders, so with plain names the folder is what to check.
  const folder = filePaths[0];

  if (realPath(folder) !== folder || PAGE_FILE.test(folder) || [DATA, APP_BUNDLE ?? [], hidden].flat().some(protectedFolder => folder === protectedFolder || folder.startsWith(protectedFolder + '/'))) {
    throw new Error(`Apargon: a page may not save to ${folder}. Pick a folder itself, not a link to it.`);
  }

  // Like a browser's downloads, a taken name gets a number: 'wx' never replaces a file or follows a link.
  return files.map(({ name, data }) => {
    const { name: stem, ext } = path.parse(name);

    for (let n = 1; ; n++) {
      const file = path.join(folder, n === 1 ? name : `${stem} (${n})${ext}`);

      try {
        fs.writeFileSync(file, Buffer.from(data, 'base64'), { flag: 'wx' });

        return file;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }
    }
  });
}
