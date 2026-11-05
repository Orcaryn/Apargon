import { safeStorage } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { SECRETS_DATA } from '../../shared/data.ts';
import { readJson, writeJson } from '../../shared/json.ts';

// One file per page, each value sealed on its own with the OS's store for this user, in a folder every page's sandbox hides.
export async function readSecret(page: string, name: string) {
  const sealed = readJson<Record<string, string>>(fileOf(page))[name];

  if (sealed === undefined) {
    return null;
  }

  // Electron sealed it with an older key: sealed again with the current one.
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(sealed, 'base64'));

  if (shouldReEncrypt) {
    await writeSecret(page, name, result);
  }

  return result;
}

export async function writeSecret(page: string, name: string, value: string | null) {
  fs.mkdirSync(SECRETS_DATA, { recursive: true });
  const sealed = value === null ? null : (await safeStorage.encryptStringAsync(value)).toString('base64');
  // Read after sealing: another write may have landed meanwhile.
  const { [name]: _dropped, ...kept } = readJson<Record<string, string>>(fileOf(page));
  writeJson(fileOf(page), sealed === null ? kept : { ...kept, [name]: sealed });
}

export function forgetSecrets(page: string) {
  fs.rmSync(fileOf(page), { force: true });
}

// With the page's storage: the secrets are the page's data, not the user's approval.
export function moveSecrets(from: string, to: string) {
  if (fs.existsSync(fileOf(from))) {
    fs.renameSync(fileOf(from), fileOf(to));
  }
}

function fileOf(page: string) {
  return path.join(SECRETS_DATA, `${createHash('sha256').update(page).digest('hex')}.json`);
}
