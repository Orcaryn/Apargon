import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { SECRETS_DATA } from '../../../../shared/data/index.ts';
import { readJson, writeJson } from '../../../json/index.ts';

// One file per app, by its papp-id, each value sealed on its own with the OS's store for this user, in Apargon's data, where no .papp file writes.
export function secretHandlers(id: string) {
  const file = path.join(SECRETS_DATA, `${id}.json`);

  // A null value deletes the secret.
  const setSecret = async ({ name, value }: { name: string; value: string | null }) => {
    fs.mkdirSync(SECRETS_DATA, { recursive: true });
    const sealed = value === null ? null : (await safeStorage.encryptStringAsync(value)).toString('base64');
    // Read after sealing: another write may have landed meanwhile.
    const { [name]: _dropped, ...kept } = readJson<Record<string, string>>(file);
    writeJson(file, sealed === null ? kept : { ...kept, [name]: sealed });

    return null;
  };

  return {
    async getSecret({ name }: { name: string }) {
      const secrets = readJson<Record<string, string>>(file);

      if (!Object.hasOwn(secrets, name)) {
        return null;
      }

      // Electron sealed it with an older key: sealed again with the current one.
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(secrets[name], 'base64'));

      if (shouldReEncrypt) {
        await setSecret({ name, value: result });
      }

      return result;
    },
    setSecret,
  };
}
