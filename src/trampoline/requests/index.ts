import type { Permissions } from '../../permissions/tags/index.ts';
import { handleLine, type CallHandlers, type EventHandlers, type PageEvents, type Tell, type TrampolineEvents } from '../../shared/wire/protocol/index.ts';
import { byteStreams } from '../../shared/wire/streams/index.ts';
import type { StartedPage } from '../pageProcess/index.ts';
import { desktopRequests } from './desktop/index.ts';
import { fileRequests } from './files/index.ts';
import { readLines } from './lines/index.ts';
import { networkRequests } from './network/index.ts';
import { programStarter } from './programs/index.ts';

// Answers what a running .papp file sends, by name, until close. Its process could be hostile, so each handler checks again what the process already checked: the tags, and where it may write.
export function serveRequests(page: string, permissions: Permissions, { child, prepared, own }: StartedPage, openPage: (file: string) => void, refreshMenus: () => void) {
  // A reply answered after the .papp file quit has no one to read it: the pipe refuses the write, and that is all.
  child.replies.on('error', () => undefined);
  const sendToPage = (message: object) => child.replies.write(JSON.stringify(message) + '\n');
  const tell: Tell<TrampolineEvents> = (event, ...args) => sendToPage({ event, args: args[0] });
  const bytes = byteStreams(sendToPage);
  const desktop = desktopRequests(page, permissions, bytes.receive, tell, openPage, refreshMenus);
  const network = networkRequests(permissions, bytes, tell);
  const files = fileRequests(page, permissions, own, bytes.receive, tell);
  const programs = programStarter(page, permissions, prepared, tell, bytes);
  const events: EventHandlers<PageEvents> = { ...desktop.events, ...network.events, programKill: programs.kill };
  const calls: CallHandlers = { ...desktop.calls, ...network.calls, ...files.calls, startProgram: programs.start };

  readLines(page, child, line => handleLine(line, events, calls, sendToPage, bytes.handle));

  return {
    tell,
    // The process is gone: its programs stop, and so does everything else it had open.
    close() {
      programs.stopAll();
      bytes.closeAll();
      desktop.close();
      network.close();
    },
  };
}
