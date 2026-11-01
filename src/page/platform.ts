import type { BrowserWindow, NativeImage } from 'electron';
import { linux } from './platform/linux.ts';
import { macos } from './platform/macos.ts';
import { windows } from './platform/windows.ts';

// What the page process needs from the OS.
export type PagePlatform = {
  isOffline(): boolean | Promise<boolean>;
  notify(text: { title: string; body: string }, toFront: () => void): void;
  // Chromium's settings for the sandbox, and the page's own name on the taskbar, before the app is ready.
  beforeReady?(page: string): void;
  // A pin of the window on the taskbar reopens this page, under its title.
  pin?(win: BrowserWindow, page: string): void;
  appMenu: boolean;
  // The page's favicon as its icon; madeHere for a page made on this computer.
  showIcon(win: BrowserWindow, icon: NativeImage, madeHere: boolean): void;
  // A program gets a process group of its own, which a kill ends whole. Windows has none, and taskkill finds children through WMI, which the sandbox cannot reach: there a kill ends the program, not what it started.
  processGroups: boolean;
};

// Another system gets Linux's, whose offline check fails there.
export const PAGE_PLATFORM: PagePlatform = process.platform === 'darwin' ? macos : process.platform === 'win32' ? windows : linux;
