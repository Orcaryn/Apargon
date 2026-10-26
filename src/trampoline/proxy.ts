// The egress proxy: forwards a page's requests to its declared hosts and nowhere else,
// and logs every request it sees. On macOS it listens on a loopback port; on Linux, whose
// sandbox has a loopback of its own, on a socket file the child relays to.

import dns from 'dns';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { EGRESS_LOG } from '../shared.ts';

export async function startProxy(patterns: string[], socket: string | null) {
  fs.mkdirSync(path.dirname(EGRESS_LOG), { recursive: true });
  const log = fs.createWriteStream(EGRESS_LOG, { flags: 'a' });

  // The address a request may go to, or null. Never this computer: the page reaches its
  // declared localhost ports directly, and a wildcard must not name another one.
  const destination = async (host: string, port: string) => {
    const declared = patterns.some(pattern => {
      const [allowedHost, allowedPort] = pattern.split(':');
      const hostMatches = allowedHost === '*' || allowedHost === host || (allowedHost.startsWith('*.') && host.endsWith(allowedHost.slice(1)));

      return hostMatches && (allowedPort === '*' || allowedPort === port);
    });

    if (!declared) {
      return null;
    }

    const { address, family } = await dns.promises.lookup(host);

    return thisComputer().check(address, family === 6 ? 'ipv6' : 'ipv4') ? null : address;
  };

  // http arrives as a full URL. A relative one was sent at the port, not through it;
  // URL.parse returns null for it and it is refused with the rest.
  const server = http.createServer(async (request, response) => {
    const url = URL.parse(request.url!); // always set on a server's request
    const port = url?.port === '' ? '80' : url?.port; // URL.port is '' when the scheme's default
    const address = url && port ? await destination(url.hostname, port).catch(() => null) : null;
    response.on('finish', () => log.write(`${new Date().toISOString()} ${request.method} ${url ? `${url.hostname}:${port}` : request.url} ${response.statusCode}\n`));

    if (!url || !address) {
      response.writeHead(403);

      return response.end('papp: host not declared\n');
    }

    // Host is the declared name: a server that hosts many sites must not be asked for another.
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

  // https arrives as CONNECT: relay the bytes, see only host:port, never the TLS.
  server.on('connect', async (request, socket) => {
    socket.on('error', () => socket.destroy());
    const target = request.url!.toLowerCase();
    const [host, port] = target.split(':');
    const address = await destination(host, port).catch(() => null);

    if (!address) {
      log.write(`${new Date().toISOString()} CONNECT ${target} 403\n`);

      return socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }

    const upstream = net.connect(+port, address, () => {
      log.write(`${new Date().toISOString()} CONNECT ${target} 200\n`);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => {
      log.write(`${new Date().toISOString()} CONNECT ${target} 502\n`);
      socket.end();
    });
    socket.on('close', () => upstream.destroy());
  });

  log.on('error', () => server.close()); // cannot log: stop forwarding
  server.on('close', () => log.end());
  server.listen(socket ?? { port: 0, host: '127.0.0.1' });
  await once(server, 'listening');

  return server;
}

// Loopback, 0.0.0.0/8, ::, and every address this computer has now: Wi-Fi can change
// between requests. BlockList also matches the IPv4-mapped and long IPv6 forms.
function thisComputer() {
  const addresses = new net.BlockList();
  addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  addresses.addSubnet('0.0.0.0', 8, 'ipv4');
  addresses.addAddress('::', 'ipv6');
  addresses.addAddress('::1', 'ipv6');

  for (const { address, family } of Object.values(os.networkInterfaces()).flatMap(list => list ?? [])) {
    addresses.addAddress(address, family === 'IPv6' ? 'ipv6' : 'ipv4');
  }

  return addresses;
}
