import type { Permissions } from '../permissions/tags.ts';
import type { Bridge } from '../shared.ts';
import { bwrap } from './bwrap.ts';
import { seatbelt } from './seatbelt.ts';

// What the trampoline needs from an OS sandbox to start a page offline.
export type Sandbox = { prepare(page: string, permissions: Permissions): Promise<Prepared>; installHint: string };

// command comes before Apargon's own; networkFd reaches the page process as TRAMPOLINE_NETWORK_FD.
export type Prepared = { command: string[]; proxyPort: number | null; bridges: Bridge[]; networkFd: number | null; close(): void };

export const SANDBOX: Sandbox | null = process.platform === 'darwin' ? seatbelt : process.platform === 'linux' ? bwrap : null;
