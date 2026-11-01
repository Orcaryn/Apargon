import { PERMISSIONS_PLATFORM } from './platform.ts';

export const PROGRAM_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'http_proxy', 'https_proxy', 'no_proxy', ...PERMISSIONS_PLATFORM.programEnv];
export const PAGE_ENV = [...PROGRAM_ENV, ...PERMISSIONS_PLATFORM.pageEnv];
