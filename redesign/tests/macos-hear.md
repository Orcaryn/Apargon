# macOS: what `hear` does

Code check, 2026-11-07. Not run.

## Why

A review asked whether `hear` uses server speech recognition.

## How

Searched `src/` for `hear`, `speech`, `SFSpeech`, `recogni`, `postNotification` and `NSDistributed`.

## Result

- `hear` listens for broadcasts from other apps, such as the song playing (`src/papp/platform/macos/index.ts:14`).
- No speech code.
- Nothing lets a `.papp` file send a broadcast.

## So

`hear` only receives. It's not a way out.
