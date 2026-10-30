import { linux } from './linux.ts';
import { macos } from './macos.ts';
import { windows } from './windows.ts';

// What the offline process needs from the OS.
export type PagePlatform = { isOffline(): boolean | Promise<boolean>; notify(text: { title: string; body: string }, toFront: () => void): void };

export const PAGE_PLATFORM: PagePlatform | null = process.platform === 'darwin' ? macos : process.platform === 'linux' ? linux : process.platform === 'win32' ? windows : null;
