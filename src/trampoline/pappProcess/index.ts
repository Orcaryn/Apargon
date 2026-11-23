import { app } from 'electron';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { PAPP_ENV } from '../../permissions/env/index.ts';
import { APP_ROOT, OWN_FOLDERS, SECRETS_DATA } from '../../shared/data/index.ts';
import { startMux } from '../../shared/wire/mux/index.ts';
import type { PappConfig } from '../../shared/wire/protocol/index.ts';
import type { Approved } from '../dialogs/approval/index.ts';
import { PROTECTED, TRAMPOLINE_PLATFORM, type PappProcess, type Prepared } from '../platform/index.ts';
import { startProxy } from './proxy/index.ts';
import { menuState, records } from '../records/index.ts';

// The .papp file's process, running in its sandbox. close: once the process is gone, takes its proxy and its sandbox down.
export type StartedPapp = { child: PappProcess; prepared: Prepared; own: string; close(): void };

export async function startPappProcess({ papp, permissions, pappHash }: Approved): Promise<StartedPapp> {
  // Its own folder, by its id: an update, under any name or path, finds its data. The id is kept with the file's record, so a revoke can find its secrets.
  const own = path.join(OWN_FOLDERS, permissions.id);
  const storage = path.join(own, '.electron');
  fs.mkdirSync(storage, { recursive: true });
  // There before the sandbox starts: Linux hides it by mounting an empty folder over it.
  fs.mkdirSync(SECRETS_DATA, { recursive: true });
  records.change(papp, { id: permissions.id });
  // All of its network goes through the proxy. papp-system has no limits, so no proxy either.
  const proxy = permissions.net.length && !permissions.system ? await startProxy(permissions.net) : null;
  const proxyPort = proxy && (proxy.address() as AddressInfo).port;
  const prepared = await TRAMPOLINE_PLATFORM.prepare({ papp, permissions, own, storage, protectedFolders: PROTECTED, proxyPort }).catch((err: Error) => {
    proxy?.close();

    throw err;
  });
  TRAMPOLINE_PLATFORM.startAtLogin(papp, permissions.use.includes('login'));
  // By name, as Windows finds Path for PATH. papp-system gets all of it. Its papp-env names too, for papp.env and its programs.
  const passed = permissions.system ? Object.keys(process.env) : [...PAPP_ENV, ...permissions.env];
  const inherited = passed.filter(name => name in process.env).map(name => [name, process.env[name]]);
  const config: PappConfig = {
    papp,
    permissions,
    pappHash,
    own,
    proxy: prepared.proxy,
    relays: prepared.relays,
    requestFd: prepared.requestFd,
    replyFd: prepared.replyFd,
    muxFd: prepared.muxFd,
    bounds: records.get(papp).window ?? null,
    menu: menuState(),
    programsHere: prepared.programsHere,
  };
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), APARGON: JSON.stringify(config) };

  app.dock?.hide();
  const child = await prepared.start([process.execPath, '--no-sandbox', ...(app.isPackaged ? [] : [APP_ROOT]), papp], env).catch((err: Error) => {
    prepared.close();
    proxy?.close();

    throw new Error(`Could not start the sandbox: ${err.message}`);
  });

  // Only the relays this .papp file was given: a name it asks for is no yes. papp-net alone must not reach the sound server.
  if (child.mux) {
    startMux(child.mux, target => (prepared.relays.some(relay => relay.target === target) ? prepared.relayTargets[target]() : null));
  }

  return {
    child,
    prepared,
    own,
    close() {
      proxy?.close();
      prepared.close();
    },
  };
}
