import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleLine, type Answer, type CallHandlers, type EventHandlers, type PageEvents } from '../../src/shared/protocol.ts';

// A papp-system page can write any line to the trampoline: each must end in a handler of its own, an answer or an error, never in a function of Object's or in silence.
const told: string[] = [];
const answers: Answer[] = [];
const answer = (sent: Answer) => answers.push(sent);
const events = { open: (file: string) => told.push(file) } as unknown as EventHandlers<PageEvents>;
const calls = {
  given: () => ['a'],
  getSecret: () => {
    throw new Error('thrown');
  },
  setSecret: () => Promise.reject(new Error('rejected')),
} as unknown as CallHandlers;
const streamLines: unknown[] = [];
const handle = (line: Record<string, unknown>) => handleLine(line, events, calls, answer, sent => streamLines.push(sent));
const answerTo = (id: string) => answers.find(sent => sent.id === id);
const handled = [
  handle({ call: 'given', id: 'g' }),
  handle({ call: 'getSecret', id: 't', args: { name: 'key' } }),
  handle({ call: 'setSecret', id: 'r', args: { name: 'key', value: null } }),
  handle({ call: 'nothing', id: 'n' }),
  handle({ call: 'constructor', id: 'c' }),
  handle({ call: 'toString', id: 'o' }),
  handle({ call: 'hasOwnProperty', id: 'h' }),
  handle({ event: 'open', args: '/a.papp' }),
];
await new Promise(resolve => setImmediate(resolve));

test('a call is answered with its value', () => assert.deepEqual(answerTo('g'), { id: 'g', value: ['a'] }));
test('a handler that throws is answered with its error', () => assert.deepEqual(answerTo('t'), { id: 't', error: 'thrown' }));
test('a handler that rejects is answered with its error', () => assert.deepEqual(answerTo('r'), { id: 'r', error: 'rejected' }));
test('an unknown call is answered with an error', () => assert.deepEqual(answerTo('n'), { id: 'n', error: 'Apargon: no such call nothing.' }));

test("Object's own names are unknown calls", () => {
  for (const id of ['c', 'o', 'h']) {
    assert.match(JSON.stringify(answerTo(id)), /no such call/);
  }
});

test('every call is answered once', () => assert.equal(answers.length, 7));
test('an event runs its handler', () => assert.deepEqual(told, ['/a.papp']));
test('every event and call counts as handled', () => assert.ok(handled.every(Boolean)));
test('an unknown event throws', () => assert.throws(() => handle({ event: 'constructor' }), { message: 'no such event constructor' }));
test('a call without an id is output', () => assert.equal(handle({ call: 'given' }), false));

test("a stream's line goes to the streams, whatever else it names", () => {
  assert.equal(handle({ stream: 's', data: 'aGk=', call: 'given', id: 'never' }), true);
  assert.deepEqual(streamLines, [{ stream: 's', data: 'aGk=', call: 'given', id: 'never' }]);
  assert.equal(answerTo('never'), undefined);
});

test('a line that is no event or call is output', () => {
  for (const line of [{ id: 'x', value: 1 }, { text: 'hi' }, {}]) {
    assert.equal(handle(line), false);
  }
});
