import { pathToFileURL } from 'url';
import { tellTrampoline } from '../../channel/index.ts';

// isPage: whether a link leads to the .papp file itself. stayOnPage: refuses a navigation that leaves it.
export function navigation(page: string) {
  const pagePath = decodeURIComponent(pathToFileURL(page).pathname);

  const isPage = (href: string) => {
    const url = new URL(href);

    try {
      return url.protocol === 'file:' && !url.host && decodeURIComponent(url.pathname) === pagePath;
    } catch {
      // A bad escape such as %zz names no file. Throwing instead would skip stayOnPage's preventDefault.
      return false;
    }
  };

  // The window shows only the .papp file: no other page. A frame may hold a local file, or what the .papp file made itself. A link the user follows opens in the browser, if its site is in papp-net.
  const stayOnPage = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    const protocol = URL.parse(event.url)?.protocol;

    if (event.isMainFrame ? !isPage(event.url) : !['file:', 'about:', 'data:', 'blob:'].includes(protocol ?? '')) {
      event.preventDefault();

      if (event.isMainFrame) {
        tellTrampoline('openLink', event.url);
      }
    }
  };

  return { isPage, stayOnPage };
}
