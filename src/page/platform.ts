import type { BrowserWindow, NativeImage } from 'electron';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

// What the page process needs from the OS.
export type PagePlatform = {
  isOffline(): boolean | Promise<boolean>;
  notify(text: { title: string; body: string }, toFront: () => void): void;
  // Chromium's settings for the sandbox, before the app is ready.
  beforeReady?(): void;
  appMenu: boolean;
  // The page's favicon as its icon; madeHere for a page made on this computer.
  showIcon(win: BrowserWindow, icon: NativeImage, madeHere: boolean): void;
};

// Another system gets Linux's, whose offline check fails there.
export const PAGE_PLATFORM: PagePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
