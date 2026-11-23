import type { BrowserWindow, NativeImage } from 'electron';
import { linux } from './linux/index.ts';
import { macos } from './macos/index.ts';
import { windows } from './windows/index.ts';

export type PappPlatform = {
  isOffline(): boolean | Promise<boolean>;
  // Whether this process can show a notification itself; otherwise it asks the trampoline to.
  notifiesHere: boolean;
  beforeReady?(papp: string): void;
  pin?(win: BrowserWindow, papp: string): void;
  appMenu: boolean;
  showIcon(win: BrowserWindow, icon: NativeImage, madeHere: boolean): void;
  processGroups: boolean;
  // A child keeps every open fd that is not close-on-exec, the papp process's pipes to the trampoline included.
  programsInheritFds: boolean;
  // Hears what other apps announce under a name, macOS's distributed notifications, until the function it returns is called. Where there are none, papp.hear refuses.
  hear?(name: string, heard: (info: Record<string, unknown>, sender: string) => void): () => void;
  // Marks a new file the .papp file wrote, so the OS asks before running it.
  markWritten?(file: string): void;
  // The system's share menu, over the window. Where there is none, papp.share refuses.
  share?(win: BrowserWindow, item: Electron.SharingItem): void;
};

// Another system gets Linux's, whose offline check fails there.
export const PAPP_PLATFORM: PappPlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
