import path from 'path';
import readline from 'readline';
import type { PappProcess } from '../../platform/index.ts';

// onRequest: handles a line the process sent as a request. False when the line is no request, but the process's own output.
export function readLines(papp: string, child: PappProcess, onRequest: (line: Record<string, unknown>) => boolean) {
  // Its requests, and its output as plain text: given the terminal itself, it could type commands into the shell that started Apargon.
  new Set([child.requests, child.output, child.errors]).forEach(stream => {
    readline.createInterface({ input: stream }).on('line', line => {
      let handled = false;

      if (stream === child.requests && line.startsWith('{')) {
        try {
          handled = onRequest(parseLine(line));
        } catch (err) {
          handled = true;
          console.error(`Apargon: ${path.basename(papp)} sent a bad request: ${(err as Error).message}`);
        }
      }

      if (!handled && line.trim()) {
        (stream === child.errors ? console.error : console.log)(line.replace(/[\p{Cc}\p{Cf}]/gu, ''));
      }
    });
  });
}

// A line starting with { parses to an object, or to none: output, as a line with no event or call is.
function parseLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line);
  } catch {
    return {};
  }
}
