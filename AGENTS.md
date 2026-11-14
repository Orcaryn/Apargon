# AGENTS.md

Apargon runs a `.papp` file, one HTML file, as a desktop app. The design is [redesign/plan.md](redesign/plan.md). The code in `src/` is that design, built. Where the two disagree, ask the user.

## The premise

**No network unless the user allows it.**

Judge everything by one question: **can data leave the computer without the user saying yes?**

- No: out of scope. Don't fix it, and don't raise it.
- Yes: block it, or put it behind a tag the user approves.

## Words

- Call the `.papp` file the `.papp` file, not the page.
- The trampoline (`src/trampoline/`) starts first and has network.
- The page process (`src/page/`) is the sandboxed one.

## Rules

- `SECURITY.md` claims exactly what the code does. A change to what is enforced changes it too.
- Popup text: a few plain words, what it can do, with real names. The user approves every line.
- What differs by OS goes in a `platform/` folder. No other file asks `process.platform` (`test/node/platforms.ts` checks).
- Every module is a folder with an `index.ts`. A folder used by one module sits inside it; one used by two siblings sits in their parent.
- A test finds a leak: stop and tell the user. It is fixed by removing a capability, never by a patch.

## Never

- Skip the offline check.
- Add telemetry or a crash reporter.

## Tests and releases

- `pnpm test` must stay green. It needs Node 22.18+.
- Release only with `./release.sh --major | --minor | --patch`.
