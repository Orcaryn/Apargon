import type { Permissions } from '../../permissions/tags/index.ts';
import { handleLine, type CallHandlers, type EventHandlers, type PappEvents, type Tell, type TrampolineEvents } from '../../shared/wire/protocol/index.ts';
import { byteStreams } from '../../shared/wire/streams/index.ts';
import type { StartedPapp } from '../pappProcess/index.ts';
import { records } from '../records/index.ts';
import { desktopRequests } from './desktop/index.ts';
import { fileRequests } from './files/index.ts';
import { readLines } from './lines/index.ts';
import { networkRequests } from './network/index.ts';
import { programStarter } from './programs/index.ts';

// Answers what a running .papp file sends, by name, until close. Its process could be hostile, so each handler checks again what the process already checked: the tags, and where it may write.
export function serveRequests(papp: string, permissions: Permissions, { child, prepared, own }: StartedPapp, openPapp: (file: string) => void, refreshMenus: () => void) {
  // A reply answered after the .papp file quit has no one to read it: the pipe refuses the write, and that is all.
  child.replies.on('error', () => undefined);
  const sendToPapp = (message: object) => child.replies.write(JSON.stringify(message) + '\n');
  const tell: Tell<TrampolineEvents> = (event, ...args) => sendToPapp({ event, args: args[0] });
  const bytes = byteStreams(sendToPapp);
  const desktop = desktopRequests(papp, permissions, bytes.receive, tell, openPapp, refreshMenus);
  const network = networkRequests(permissions, bytes, tell);
  const files = fileRequests(papp, permissions, own, bytes.receive, tell);
  const programs = programStarter(papp, permissions, prepared, tell, bytes);
  let restarting = false;
  const events: EventHandlers<PappEvents> = {
    ...desktop.events,
    ...network.events,
    programKill: programs.kill,
    // A script, style or other .papp file it loaded for the first time since the yes: from here on the yes covers these bytes.
    code: ({ file, hash }) => records.change(papp, { code: { ...records.get(papp).code, [file]: hash } }),
    restart: () => {
      restarting = true;
      tell('forceQuit');
    },
  };
  const calls: CallHandlers = { ...desktop.calls, ...network.calls, ...files.calls, startProgram: programs.start };

  readLines(papp, child, line => handleLine(line, events, calls, sendToPapp, bytes.handle));

  return {
    tell,
    get restarting() {
      return restarting;
    },
    // The process is gone: its programs stop, and so does everything else it had open.
    close() {
      programs.stopAll();
      bytes.closeAll();
      desktop.close();
      network.close();
    },
  };
}
