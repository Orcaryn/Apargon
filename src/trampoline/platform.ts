import type { StdioOptions } from 'child_process';
import type { Permissions } from '../permissions/tags.ts';
import type { Bridge } from '../shared/channel.ts';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

// What the trampoline needs from the OS: a sandbox to start a page offline, and a way to talk to it.
export type TrampolinePlatform = {
  prepare(page: string, permissions: Permissions): Promise<Prepared>;
  installHint: string;
  // The address the OS marked a downloaded file with, '' if it marked none, or null for a file made on this computer.
  downloadAddress(page: string): string | null;
  // Shows the page's favicon on its file, where the OS can.
  setFileIcon?(page: string, png: string): void;
  // Installs updates itself; elsewhere Apargon says a new version is out.
  autoUpdates: boolean;
};

// command wraps Apargon's own and its environment. The page's requests arrive on requestFd of stdio; replies go on REPLY_FD, or through a file where the sandbox passes no more than standard input, output and error.
type Prepared = { command(apargon: string[], env: NodeJS.ProcessEnv): string[]; stdio: StdioOptions; requestFd: number; repliesInFile: boolean; proxyPort: number | null; bridges: Bridge[]; close(): void };

export const TRAMPOLINE_PLATFORM: TrampolinePlatform | null = process.platform === 'darwin' ? macos : process.platform === 'linux' ? linux : process.platform === 'win32' ? windows : null;
