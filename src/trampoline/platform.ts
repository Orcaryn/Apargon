import type { StdioOptions } from 'child_process';
import type { Permissions } from '../permissions/tags.ts';
import type { Bridge } from '../shared/channel.ts';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

export type TrampolinePlatform = {
  prepare(page: string, permissions: Permissions): Promise<Prepared>;
  installHint: string;
  // The address the OS marked a downloaded file with, '' if it marked none, or null for a file made on this computer.
  downloadAddress(page: string): string | null;
  pageIcon?(page: string, png: string): void;
  markDownloaded?(file: string): void;
  // Opens the page each time the user logs in, or no longer.
  startAtLogin(page: string, on: boolean): void;
  // The open flag that refuses a link, so a save never writes where one leads.
  noFollow: number;
  autoUpdates: boolean;
};

type Prepared = { command(apargon: string[], env: NodeJS.ProcessEnv): string[]; stdio: StdioOptions; requestFd: number; replies: string | null; proxyPort: number | null; bridges: Bridge[]; close(): void };

// Another system gets Linux's: bwrap is not there, so no page opens.
export const TRAMPOLINE_PLATFORM: TrampolinePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
