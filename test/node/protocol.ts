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
const handle = (line: Record<string, unknown>) => handleLine(line, events, calls, answer);
const answerTo = (id: string) => JSON.stringify(answers.find(sent => sent.id === id));
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

const checks = [
  { name: 'a call is answered with its value', ok: answerTo('g') === '{"id":"g","value":["a"]}' },
  { name: 'a handler that throws is answered with its error', ok: answerTo('t') === '{"id":"t","error":"thrown"}' },
  { name: 'a handler that rejects is answered with its error', ok: answerTo('r') === '{"id":"r","error":"rejected"}' },
  { name: 'an unknown call is answered with an error', ok: answerTo('n') === '{"id":"n","error":"Apargon: no such call nothing."}' },
  { name: "Object's own names are unknown calls", ok: ['c', 'o', 'h'].every(id => answerTo(id)?.includes('no such call')) },
  { name: 'every call is answered once', ok: answers.length === 7 },
  { name: 'an event runs its handler', ok: told.join() === '/a.papp' },
  { name: 'every event and call counts as handled', ok: handled.every(Boolean) },
  {
    name: 'an unknown event throws',
    ok: (() => {
      try {
        handle({ event: 'constructor' });

        return false;
      } catch (err) {
        return (err as Error).message === 'no such event constructor';
      }
    })(),
  },
  { name: 'a call without an id is output', ok: handle({ call: 'given' }) === false },
  { name: 'a line that is no event or call is output', ok: [{ id: 'x', value: 1 }, { text: 'hi' }, {}].every(line => handle(line) === false) },
];

checks.forEach(({ name, ok }) => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`));
process.exit(checks.every(({ ok }) => ok) ? 0 : 1);
