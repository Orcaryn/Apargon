import { once } from 'events';
import net from 'net';
import { workerData } from 'worker_threads';
import { startMux } from '../../shared/wire/mux/index.ts';
import type { Relay } from '../../shared/wire/protocol/index.ts';

// Linux: each relay listens inside the sandbox and leads, through the mux, to the trampoline. In a thread of its own: on X11, Chromium's main thread waits on the screen's answer, which comes through a relay.
// ready turns 1 once every relay listens.
const { muxFd, relays, ready } = workerData as { muxFd: number; relays: Relay[]; ready: Int32Array };
const mux = startMux(new net.Socket({ fd: muxFd, readable: true, writable: true }), null);

await Promise.all(relays.map(({ port, target }) => once(net.createServer({ allowHalfOpen: true }, socket => mux.open(target, socket)).listen(port, '127.0.0.1'), 'listening')));
Atomics.store(ready, 0, 1);
Atomics.notify(ready, 0);
