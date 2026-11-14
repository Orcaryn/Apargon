import { app } from 'electron';
import fs from 'fs';
import { pageAppId } from '../../../shared/data/index.ts';
import { TRAMPOLINE_NETWORK_FD } from '../../../shared/wire/protocol/index.ts';
import { tellTrampoline } from '../../channel/index.ts';
import type { PagePlatform } from '../index.ts';

export const linux: PagePlatform = {
  isOffline: inEmptyNetwork,
  // Notifications need D-Bus, which the fence hides.
  notifiesHere: false,
  // The window's class on X11 and app id on Wayland, which the desktop matches to the launcher entry the trampoline wrote for this page.
  beforeReady(page) {
    app.setName(pageAppId(page));
    app.setDesktopName(`${pageAppId(page)}.desktop`);
  },
  processGroups: true,
  programsInheritFds: true,
  appMenu: false,
  // In the launcher entry too, where the dock takes it from: the trampoline writes it, as this process may not.
  showIcon(win, icon) {
    if (!win.isDestroyed()) {
      win.setIcon(icon);
    }

    tellTrampoline('pageIcon', icon.toPNG().toString('base64'));
  },
};

// bwrap leaves a loopback the page may bind, so ask the kernel: only lo, in a network that is not the trampoline's.
function inEmptyNetwork() {
  const loopbackAndTunnelStubs = ['lo', 'sit0', 'tunl0', 'gre0', 'gretap0', 'erspan0', 'ip_vti0', 'ip6_vti0', 'ip6tnl0', 'ip6gre0'];
  const interfaces = fs.readFileSync('/proc/self/net/dev', 'utf8').split('\n').slice(2).filter(Boolean).map(line => line.split(':')[0].trim());
  const trampolineNetwork = `/proc/self/fd/${TRAMPOLINE_NETWORK_FD}`;

  return interfaces.every(name => loopbackAndTunnelStubs.includes(name)) && fs.existsSync(trampolineNetwork) && fs.statSync(trampolineNetwork).ino !== fs.statSync('/proc/self/ns/net').ino;
}
