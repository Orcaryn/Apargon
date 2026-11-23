import { pathToFileURL } from 'url';
import { tellTrampoline } from '../../channel/index.ts';

// isPapp: whether a link leads to the .papp file itself. stayOnPapp: refuses a navigation that leaves it.
export function navigation(papp: string) {
  const pappPath = decodeURIComponent(pathToFileURL(papp).pathname);

  const isPapp = (href: string) => {
    const url = new URL(href);

    try {
      return url.protocol === 'file:' && !url.host && decodeURIComponent(url.pathname) === pappPath;
    } catch {
      // A bad escape such as %zz names no file. Throwing instead would skip stayOnPapp's preventDefault.
      return false;
    }
  };

  // The window shows only the .papp file: no other page. A frame may hold a local file, or what the .papp file made itself. A link the user follows opens in the browser, if its site is in papp-net.
  const stayOnPapp = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    const protocol = URL.parse(event.url)?.protocol;

    if (event.isMainFrame ? !isPapp(event.url) : !['file:', 'about:', 'data:', 'blob:'].includes(protocol ?? '')) {
      event.preventDefault();

      if (event.isMainFrame) {
        tellTrampoline('openLink', event.url);
      }
    }
  };

  return { isPapp, stayOnPapp };
}
