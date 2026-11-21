import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { test } from 'node:test';
import type { Permissions } from '../../src/permissions/tags/index.ts';
import type { Prepared } from '../../src/trampoline/platform/index.ts';
import { byteStreams } from '../../src/shared/wire/streams/index.ts';
import { programStarter } from '../../src/trampoline/requests/programs/index.ts';

// The trampoline's side of a program: what it wrote reaches the .papp file even when the program exits before the .papp file asks for its output.
test("a program's output is kept until the .papp file asks for it", { timeout: 10_000 }, async () => {
  const [page, trampoline]: ReturnType<typeof byteStreams>[] = [
    byteStreams(line => setImmediate(() => trampoline.handle(line))),
    byteStreams(line => setImmediate(() => page.handle(line))),
  ];
  const exited = Promise.withResolvers<void>();
  const permissions = { run: { node: { file: process.execPath, unfenced: true } } } as unknown as Permissions;
  const programs = programStarter(import.meta.filename, permissions, {} as Prepared, () => exited.resolve(), trampoline);
  const input = page.send(Readable.from([]));
  const { stdout } = programs.start({ id: 'p', name: 'node', args: ['-e', 'process.stdout.write("free")'], cwd: '.', input });
  await exited.promise;
  assert.equal((await buffer(page.receive(stdout))).toString(), 'free');
});
