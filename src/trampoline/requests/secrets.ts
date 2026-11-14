import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { SECRETS_DATA } from '../../shared/data.ts';
import { readJson, writeJson } from '../json.ts';

// One file per app, by its papp-id, each value sealed on its own with the OS's store for this user, in Apargon's data, where no .papp file writes.
export async function readSecret(id: string, name: string) {
  const secrets = readJson<Record<string, string>>(path.join(SECRETS_DATA, `${id}.json`));

  if (!Object.hasOwn(secrets, name)) {
    return null;
  }

  const sealed = secrets[name];
  // Electron sealed it with an older key: sealed again with the current one.
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(sealed, 'base64'));

  if (shouldReEncrypt) {
    await writeSecret(id, name, result);
  }

  return result;
}

export async function writeSecret(id: string, name: string, value: string | null) {
  const file = path.join(SECRETS_DATA, `${id}.json`);
  fs.mkdirSync(SECRETS_DATA, { recursive: true });
  const sealed = value === null ? null : (await safeStorage.encryptStringAsync(value)).toString('base64');
  // Read after sealing: another write may have landed meanwhile.
  const { [name]: _dropped, ...kept } = readJson<Record<string, string>>(file);
  writeJson(file, sealed === null ? kept : { ...kept, [name]: sealed });
}

export function forgetSecrets(id: string) {
  fs.rmSync(path.join(SECRETS_DATA, `${id}.json`), { force: true });
}
