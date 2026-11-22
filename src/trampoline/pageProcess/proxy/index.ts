import dns from 'dns';
import { once } from 'events';
import http from 'http';
import net from 'net';

// Where a cloud computer's metadata server answers: link-local, AWS's IPv6 one and Alibaba's. The user approved a name, not that server: a name may not lead there. Approved by its address, it may.
const METADATA = new net.BlockList();
METADATA.addSubnet('169.254.0.0', 16);
METADATA.addSubnet('fe80::', 10, 'ipv6');
METADATA.addAddress('fd00:ec2::254', 'ipv6');
METADATA.addAddress('100.100.100.200');

// All of a .papp file's network goes through here: its window, its programs, papp.connect. The sandbox has no network and no DNS, so this is its only way out.
// The name is checked first, and only an allowed name is looked up: even a lookup can leak.
export async function startProxy(sites: string[]) {
  // The address to connect to, or null. Not the proxy's own port: it would call itself without end.
  const addressIfAllowed = async (host: string, port: string) => {
    const name = host.toLowerCase().replace(/\.$/, '');
    const ownPort = (server.address() as net.AddressInfo).port;

    if (!sites.includes(`${name}:${port}`) || (ownPort === +port && ['localhost', '127.0.0.1'].includes(name))) {
      return null;
    } else if (name === 'localhost') {
      // localhost is this computer, by the address programs listen on.
      return '127.0.0.1';
    } else if (net.isIP(name)) {
      return name;
    }

    const { address, family } = await dns.promises.lookup(name);

    return METADATA.check(address, family === 6 ? 'ipv6' : 'ipv4') ? null : address;
  };

  const server = http.createServer(async (request, response) => {
    const url = URL.parse(request.url!);
    const port = url?.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url?.port;
    const address = url && port && url.protocol === 'http:' ? await addressIfAllowed(url.hostname, port).catch(() => null) : null;

    if (!url || !address) {
      response.writeHead(403);

      return response.end('Apargon: this site is not in papp-net\n');
    }

    const upstream = http.request({ host: address, port, method: request.method, path: url.pathname + url.search, headers: { ...request.headers, host: url.host } }, reply => {
      response.writeHead(reply.statusCode!, reply.headers);
      reply.pipe(response);
    });
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });

  server.on('connect', async (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    const target = request.url!;
    const colon = target.lastIndexOf(':');
    const [host, port] = [target.slice(0, colon), target.slice(colon + 1)];
    const address = colon > 0 && /^\d+$/.test(port) ? await addressIfAllowed(host, port).catch(() => null) : null;

    if (!address) {
      return socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }

    const upstream = net.connect(+port, address, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'));
    socket.on('close', () => upstream.destroy());
  });

  server.listen({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');

  return server;
}
