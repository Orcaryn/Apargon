import type { EventEmitter } from 'events';
import type { Readable, Writable } from 'stream';
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
  // Whether the tray icon reports clicks: Linux's shows only its menu.
  trayClicks: boolean;
};

// The page's process, once started. requests and output may be one stream: a line that is no request is output. It emits close once the process is gone.
export type PageProcess = EventEmitter & { requests: Readable; output: Readable; errors: Readable; replies: Writable };

// requestFd and replyFd: where the page writes its requests and reads the trampoline's replies.
type Prepared = { start(apargon: string[], env: NodeJS.ProcessEnv): Promise<PageProcess>; requestFd: number; replyFd: number; proxyPort: number | null; bridges: Bridge[]; close(): void };

// Another system gets Linux's: bwrap is not there, so no page opens.
export const TRAMPOLINE_PLATFORM: TrampolinePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
