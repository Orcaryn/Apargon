import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { isInside, realPath } from '../../permissions/paths.ts';
import { PERMISSIONS_PLATFORM } from '../../permissions/platform.ts';
import type { Pick, PickOptions, SavedFile } from '../../shared/protocol.ts';
import { PROTECTED, TRAMPOLINE_PLATFORM } from '../platform.ts';
import { records } from '../store.ts';

// The user picks in a system dialog: that's a yes, so no tag is needed, and nothing restarts. The place always comes from the dialog, never from the .papp file, and picks are kept beside the approvals, where no .papp file writes.
// receive: the bytes of a stream the .papp file named. Nothing of a file moves before Apargon asks: a dialog the user cancels costs none.
export function pickHandlers(page: string, receive: (id: string) => Readable, onPicks: (picks: Pick[]) => void) {
  const remember = (added: Pick[]) => {
    // A new pick of the same place replaces the old one: it is the user's latest yes.
    const picks = [...(records.get(page).picks ?? []).filter(old => !added.some(pick => pick.path === old.path)), ...added];
    records.change(page, { picks });
    onPicks(picks);
  };

  return {
    // Pick to read: the .papp file reads it itself. Pick to write: Apargon writes it. A folder to write: Apargon writes inside it, by plain names.
    async pick({ folder, multiple, write }: PickOptions) {
      // This process has no window of its own: without this, its dialog opens behind the .papp file's.
      app.focus({ steal: true });
      const { canceled, filePaths } = await dialog.showOpenDialog({
        message: `${path.basename(page)} will ${write ? 'change' : 'read'} ${folder ? `${write ? 'files in ' : ''}the folder` : 'the file'}${multiple ? 's' : ''} you pick.`,
        buttonLabel: write ? 'Allow Changes' : 'Choose',
        properties: [folder ? 'openDirectory' : 'openFile', 'createDirectory', 'noResolveAliases', ...(multiple ? ['multiSelections' as const] : [])],
      });

      if (canceled) {
        return [];
      }

      const picked = filePaths.map(file => realPick(file, write));
      remember(picked.map(file => ({ path: file, write: write === true, folder: folder === true })));

      return picked;
    },
    // The .papp file suggests a name, the user picks the name and folder, and the dialog asks before it replaces one. Kept as a pick to write.
    async save(suggested: string, data: string) {
      app.focus({ steal: true });
      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('downloads'), path.basename(suggested)), properties: ['createDirectory', 'showOverwriteConfirmation'] });

      if (canceled || !filePath) {
        return null;
      }

      const file = path.join(realPick(path.dirname(filePath), true), path.basename(filePath));
      await writeChecked(file, receive(data), false, path.dirname(file));
      remember([{ path: file, write: true, folder: false }]);

      return file;
    },
    // Several files into a folder the user picks, as a browser's downloads: a taken name gets a number.
    async saveAll(files: SavedFile[]) {
      if (!files.length) {
        throw new Error('Apargon: saveAll takes one or more files.');
      }

      files.forEach(({ name }) => checkPlainName(name));
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

      const folder = realPick(filePaths[0], true);
      const saved: string[] = [];

      for (const { name, data } of files) {
        const { name: stem, ext } = path.parse(name);
        let file = path.join(folder, name);

        for (let n = 2; fs.existsSync(file); n++) {
          file = path.join(folder, `${stem} (${n})${ext}`);
        }

        await writeChecked(file, receive(data), false, folder, true);
        saved.push(file);
      }

      return saved;
    },
    // Writes for the .papp file where the user picked: a picked file, or a plain name in a picked folder.
    async writePicked({ file, data, append }: { file: string; data: string; append: boolean }) {
      const target = path.resolve(file);
      const picks = records.get(page).picks ?? [];
      const asFile = picks.some(pick => pick.write && !pick.folder && pick.path === target);
      const inFolder = picks.find(pick => pick.write && pick.folder && path.dirname(target) === pick.path);

      if (!asFile && !inFolder) {
        throw new Error(`Apargon: this .papp file may not change ${target}. Ask the user to pick it with papp.pick({ write: true }), or name its folder in papp-write.`);
      } else if (inFolder) {
        checkPlainName(path.basename(target));
      }

      await writeChecked(target, receive(data), append, path.dirname(target));

      return null;
    },
  };
}

// What the dialog gave, as on disk. Not Apargon's own folders: the approvals are there.
function realPick(file: string, write: boolean) {
  const real = realPath(file);
  const own = PROTECTED.find(folder => isInside(real, folder) || (write && isInside(folder, real)));

  if (own) {
    throw new Error(`Apargon: ${real} holds or is in Apargon's own folder ${own}. Pick another.`);
  }

  return real;
}

// A plain file name: no folder, no leading dot, nothing that doesn't show.
function checkPlainName(name: string) {
  if (!name || path.basename(name) !== name || name.startsWith('.') || /[\p{Cc}\p{Cf}]/u.test(name) || PERMISSIONS_PLATFORM.refusePath(name) !== null) {
    throw new Error(`Apargon: in a picked folder, Apargon writes only plain file names, without a folder or a leading dot: ${JSON.stringify(name)}.`);
  }
}

// Apargon checks the file it opened, not just the name: a link is refused, the opened file must be a file, and its folder must still be the one picked.
async function writeChecked(file: string, bytes: Readable, append: boolean, folder: string, fresh = false) {
  // Emptied only once checked. Not blocking: a pipe with nothing reading it would hold the write forever.
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | (fresh ? fs.constants.O_EXCL : 0) | (append ? fs.constants.O_APPEND : 0) | (fs.constants.O_NONBLOCK ?? 0) | TRAMPOLINE_PLATFORM.noFollow;
  const fd = fs.openSync(file, flags);

  try {
    const opened = fs.fstatSync(fd);
    const named = fs.lstatSync(file);

    if (!opened.isFile() || opened.ino !== named.ino || opened.dev !== named.dev || realPath(path.dirname(file)) !== folder) {
      throw new Error(`Apargon: ${file} changed while Apargon opened it. Nothing was written.`);
    } else if (!append) {
      fs.ftruncateSync(fd);
    }
  } catch (err) {
    fs.closeSync(fd);

    throw err;
  }

  // Into the file as opened and checked, never by its name again. The stream closes it. Bytes that stop coming leave what came, as any write cut short does.
  await pipeline(bytes, fs.createWriteStream(file, { fd }));
  TRAMPOLINE_PLATFORM.markWritten?.(file);
}
