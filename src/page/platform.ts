import type { BrowserWindow, NativeImage } from 'electron';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

export type PagePlatform = {
  isOffline(): boolean | Promise<boolean>;
  notify(text: { title: string; body: string }, toFront: () => void): void;
  beforeReady?(page: string): void;
  pin?(win: BrowserWindow, page: string): void;
  appMenu: boolean;
  showIcon(win: BrowserWindow, icon: NativeImage, madeHere: boolean): void;
  processGroups: boolean;
};

// Another system gets Linux's, whose offline check fails there.
export const PAGE_PLATFORM: PagePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
