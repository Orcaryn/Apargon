import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE_ENV } from '../../src/permissions/env/index.ts';

// What every .papp file's process and programs get without a papp-env tag: no login, key or way into another program.
test('no variable passed without a tag can carry a secret', () => {
  const leaked = PAGE_ENV.filter(name =>
    /TOKEN|SECRET|KEY|PASS|AUTH|CRED|COOKIE|SSH|GPG|AGENT|SOCK|AWS|AZURE|GOOGLE|GCLOUD|GITHUB|NPM|DOCKER|KUBE|VAULT|API|DBUS|NODE_OPTIONS|LD_|DYLD_|ELECTRON_RUN_AS_NODE/i.test(
      name
    )
  );
  assert.deepEqual(leaked, []);
});
