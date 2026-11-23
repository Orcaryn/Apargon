import { PERMISSIONS_PLATFORM } from '../platform/index.ts';
import type { Permissions } from '../tags/index.ts';

// No Electron here: the Node tests load it.

// What every program gets. Nothing in it carries a login or a key: papp-env names any other.
const PROGRAM_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', ...PERMISSIONS_PLATFORM.programEnv];
// The .papp file's own process gets these, and passes them on to its programs.
export const PAPP_ENV = [...PROGRAM_ENV, ...PERMISSIONS_PLATFORM.pappEnv];

// A fenced program's: the shared list, its papp-env names, and the proxy, which is its only way out. By name, as Windows finds Path for PATH.
export function programEnv(from: NodeJS.ProcessEnv, { env }: Permissions, proxy: string | null) {
  const passed = Object.fromEntries([...PROGRAM_ENV, ...env].filter(name => from[name] !== undefined).map(name => [name, from[name]]));

  return { ...passed, ...(proxy && { http_proxy: `http://${proxy}`, https_proxy: `http://${proxy}`, HTTP_PROXY: `http://${proxy}`, HTTPS_PROXY: `http://${proxy}` }) };
}
