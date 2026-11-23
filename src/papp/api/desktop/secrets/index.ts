import { callTrampoline } from '../../../channel/index.ts';

// The trampoline keeps them where no papp process can read. Null when there is none.
export function getSecret(name: string) {
  checkSecretName(name);

  return callTrampoline('getSecret', { name });
}

export function setSecret(name: string, value: string) {
  checkSecretName(name);

  if (typeof value !== 'string') {
    throw new Error('Apargon: a secret is a string. To remove one, use deleteSecret.');
  }

  return callTrampoline('setSecret', { name, value });
}

export function deleteSecret(name: string) {
  checkSecretName(name);

  return callTrampoline('setSecret', { name, value: null });
}

function checkSecretName(name: string) {
  if (!name || name.length > 256) {
    throw new Error('Apargon: a secret takes a name of 1 to 256 characters.');
  }
}
