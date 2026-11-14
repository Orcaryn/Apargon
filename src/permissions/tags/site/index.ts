import net from 'net';

// No Electron here: the Node tests load it.

// A host and an optional port, 443 if none. No scheme, no *. An IP address and localhost are fine: the user says yes to them.
export function site(value: string) {
  const [name, port = '443', ...rest] = value.toLowerCase().split(':');
  // A trailing dot names the same host.
  const host = name.replace(/\.$/, '');

  if (rest.length || !/^[1-9]\d{0,4}$/.test(port) || +port > 65535 || !host.split('.').every(label => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error(`Bad papp-net "${value}". Write one site and an optional port, as in example.com or example.com:8080. No scheme, no path, no *.`);
  } else if (!net.isIPv4(host) && URL.parse(`http://${host}`)?.hostname !== host) {
    // The browser reads 0x7f.1 and 127.1 as 127.0.0.1: the popup would show a name for an address.
    throw new Error(`Bad papp-net "${value}". Write an address in full, as in 127.0.0.1.`);
  } else if (host !== 'localhost' && host.endsWith('.localhost')) {
    throw new Error(`Bad papp-net "${value}". For this computer, write localhost.`);
  }

  return `${host}:${port}`;
}
