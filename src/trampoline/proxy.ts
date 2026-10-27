import dns from 'dns';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { privateNetwork } from '../permissions/tags.ts';
import { EGRESS_LOG } from '../shared.ts';

export async function startProxy(patterns: string[], socketFile: string | null) {
  fs.mkdirSync(path.dirname(EGRESS_LOG), { recursive: true });
  const log = fs.createWriteStream(EGRESS_LOG, { flags: 'a' });

  const addressIfDeclared = async (host: string, port: string) => {
    const declared = patterns.some(pattern => {
      const [allowedHost, allowedPort] = pattern.split(':');
      const hostMatches = allowedHost === '*' || allowedHost === host || (allowedHost.startsWith('*.') && host.endsWith(allowedHost.slice(1)));

      return hostMatches && (allowedPort === '*' || allowedPort === port);
    });

    if (!declared) {
      return null;
    }

    const { address, family } = await dns.promises.lookup(host);
    const own = Object.values(os.networkInterfaces()).flat().some(each => each?.address === address);
    const declaredByNumber = net.isIPv4(host) && patterns.includes(`${host}:${port}`);

    return own || (privateNetwork().check(address, family === 6 ? 'ipv6' : 'ipv4') && !declaredByNumber) ? null : address;
  };

  const server = http.createServer(async (request, response) => {
    const url = URL.parse(request.url!);
    const port = url?.port === '' ? '80' : url?.port;
    const address = url && port ? await addressIfDeclared(url.hostname, port).catch(() => null) : null;
    response.on('finish', () => log.write(`${new Date().toISOString()} ${request.method} ${url ? `${url.hostname}:${port}` : request.url} ${response.statusCode}\n`));

    if (!url || !address) {
      response.writeHead(403);

      return response.end('Apargon: host not declared\n');
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

  server.on('connect', async (request, socket) => {
    socket.on('error', () => socket.destroy());
    const target = request.url!.toLowerCase();
    const [host, port] = target.split(':');
    const address = /^\d+$/.test(port) ? await addressIfDeclared(host, port).catch(() => null) : null;

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

  log.on('error', () => server.close());
  server.on('close', () => log.end());
  server.listen(socketFile ?? { port: 0, host: '127.0.0.1' });
  await once(server, 'listening');

  return server;
}
