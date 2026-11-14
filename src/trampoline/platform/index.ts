import type { ChildProcess } from 'child_process';
import type { EventEmitter } from 'events';
import type { Duplex, Readable, Writable } from 'stream';
import type { Permissions } from '../../permissions/tags/index.ts';
import { DATA, OWN_FOLDERS } from '../../shared/data/index.ts';
import type { Relay } from '../../shared/wire/protocol/index.ts';
import { linux } from './linux/index.ts';
import { macos } from './macos/index.ts';
import { windows } from './windows/index.ts';

// Where a .papp file writes without a tag, the folders it never writes, and the proxy its network goes through, if it has any.
export type Sandbox = { page: string; permissions: Permissions; own: string; storage: string; protectedFolders: string[]; proxyPort: number | null };

export type TrampolinePlatform = {
  // Why this computer can't open a .papp file safely, or null. Asked once, at start: old and unsafe systems are refused.
  unsupported(): Promise<string | null>;
  // Whether Apargon can't keep its promise on this desktop, as on X11: then the user is asked first, once per hash of the .papp file's bytes.
  unsafeDesktop: boolean;
  // The installed app, which no tag or pick may change. Null when run from the source.
  installed: string | null;
  // Builds the sandbox. The limits are set once, here.
  prepare(sandbox: Sandbox): Promise<Prepared>;
  // The address the OS marked a downloaded file with, '' if it marked none, or null for a file made on this computer.
  downloadAddress(page: string): string | null;
  pageIcon?(page: string, png: string): void;
  // Marks a file Apargon wrote for a .papp file, so the OS asks before running it.
  markWritten?(file: string): void;
  // Opens the .papp file each time the user logs in, or no longer.
  startAtLogin(page: string, on: boolean): void;
  // The open flag that refuses a link, so a write never goes where one leads.
  noFollow: number;
  autoUpdates: boolean;
  // Whether the tray icon reports clicks: Linux's shows only its menu.
  trayClicks: boolean;
};

// The .papp file's process, once started. requests and output may be one stream: a line that is no request is output. It emits close once the process is gone.
export type PageProcess = EventEmitter & { requests: Readable; output: Readable; errors: Readable; replies: Writable; mux: Duplex | null };

export type Prepared = {
  start(apargon: string[], env: NodeJS.ProcessEnv): Promise<PageProcess>;
  requestFd: number;
  replyFd: number;
  muxFd: number | null;
  // Where the .papp file's process finds the proxy, and on Linux the relays that lead to it.
  proxy: string | null;
  relays: Relay[];
  // The trampoline's ends of the relays, by target.
  relayTargets: Record<string, () => Duplex>;
  // Whether the .papp file's process starts its fenced programs itself, inside its own sandbox. Otherwise the trampoline does, with startProgram.
  programsHere: boolean;
  startProgram?(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess;
  close(): void;
};

// Any other OS gets Linux's, which refuses it.
export const TRAMPOLINE_PLATFORM: TrampolinePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;

// Folders no tag may hand over: Apargon's data, the .papp files' own folders, and the installed app.
export const PROTECTED = [DATA, OWN_FOLDERS, TRAMPOLINE_PLATFORM.installed].filter(folder => folder !== null);
