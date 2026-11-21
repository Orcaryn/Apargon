import { safeStorage } from 'electron';
import path from 'path';
import { SECRETS_DATA } from '../../../../shared/data/index.ts';
import { readJson, writeJson } from '../../../json/index.ts';

// One file per app, by its papp-id, each value sealed on its own with the OS's store for this user, in Apargon's data, in a folder no .papp file reads or writes.
export function secretHandlers(id: string) {
  const file = path.join(SECRETS_DATA, `${id}.json`);

  return {
    async getSecret({ name }: { name: string }) {
      const secrets = readJson<Record<string, string>>(file);

      return Object.hasOwn(secrets, name) ? (await safeStorage.decryptStringAsync(Buffer.from(secrets[name], 'base64'))).result : null;
    },
    // A null value deletes the secret.
    async setSecret({ name, value }: { name: string; value: string | null }) {
      const sealed = value === null ? null : (await safeStorage.encryptStringAsync(value)).toString('base64');
      // Read after sealing: another write may have landed meanwhile.
      const { [name]: _dropped, ...kept } = readJson<Record<string, string>>(file);
      writeJson(file, sealed === null ? kept : { ...kept, [name]: sealed });

      return null;
    },
  };
}
