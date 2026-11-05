import type { BrowserWindow, NativeImage } from 'electron';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

export type PagePlatform = {
  isOffline(): boolean | Promise<boolean>;
  // Whether this process can show a notification itself; otherwise it asks the trampoline to.
  notifiesHere: boolean;
  beforeReady?(page: string): void;
  pin?(win: BrowserWindow, page: string): void;
  appMenu: boolean;
  showIcon(win: BrowserWindow, icon: NativeImage, madeHere: boolean): void;
  processGroups: boolean;
  // A child keeps every open fd that is not close-on-exec, the page's pipes to the trampoline included.
  programsInheritFds: boolean;
};

// Another system gets Linux's, whose offline check fails there.
export const PAGE_PLATFORM: PagePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
