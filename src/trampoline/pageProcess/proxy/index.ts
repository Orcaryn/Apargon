import dns from 'dns';
import { once } from 'events';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';

export const LOG_CAP = 10 * 1024 * 1024;

// The egress log: one file, appended to by every open .papp file. At the cap it is renamed to .1, the one before it dropped, and a fresh one started: the log is for what went where lately.
function egressLog(file: string, onError: () => void) {
  let size = 0;

  const open = () => {
    size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;

    if (size >= LOG_CAP) {
      try {
        fs.rmSync(`${file}.1`, { force: true });
        fs.renameSync(file, `${file}.1`);
        size = 0;
      } catch {
        // Another .papp file holds it open, which Windows won't rename: keep appending.
      }
    }

    return fs.createWriteStream(file, { flags: 'a' }).on('error', onError);
  };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  let stream = open();

  return {
    write(line: string) {
      if (size >= LOG_CAP) {
        stream.end();
        stream = open();
      }

      size += Buffer.byteLength(line);
      stream.write(line);
    },
    end: () => stream.end(),
  };
}

// All of a .papp file's network goes through here: its window, its programs, papp.connect. The sandbox has no network and no DNS, so this is its only way out.
// The name is checked first, and only an allowed name is looked up: even a lookup can leak.
export async function startProxy(sites: string[], logFile: string) {
  const log = egressLog(logFile, () => server.close());
  const note = (what: string, status: number) => log.write(`${new Date().toISOString()} ${what} ${status}\n`);

  // The address to connect to, or null. Not the proxy's own port: it would call itself without end.
  const addressIfAllowed = async (host: string, port: string) => {
    const site = `${host.toLowerCase().replace(/\.$/, '')}:${port}`;
    const ownPort = (server.address() as net.AddressInfo).port;

    if (!sites.includes(site) || (ownPort === +port && ['localhost', '127.0.0.1'].includes(host))) {
      return null;
    }

    const name = site.slice(0, site.lastIndexOf(':'));

    // localhost is this computer, by the address programs listen on.
    return name === 'localhost' ? '127.0.0.1' : net.isIP(name) ? name : (await dns.promises.lookup(name)).address;
  };

  const server = http.createServer(async (request, response) => {
    const url = URL.parse(request.url!);
    const port = url?.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url?.port;
    const address = url && port && url.protocol === 'http:' ? await addressIfAllowed(url.hostname, port).catch(() => null) : null;
    response.on('finish', () => note(`${request.method} ${url ? `${url.hostname}:${port}` : request.url}`, response.statusCode));

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
      note(`CONNECT ${target}`, 403);

      return socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }

    const upstream = net.connect(+port, address, () => {
      note(`CONNECT ${target}`, 200);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => {
      note(`CONNECT ${target}`, 502);
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    });
    socket.on('close', () => upstream.destroy());
  });

  server.on('close', () => log.end());
  server.listen({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');

  return server;
}
