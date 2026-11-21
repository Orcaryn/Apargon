# AGENTS.md

Apargon runs a `.papp` file, one HTML file, as a desktop app. A reverse browser:

- A browser: all of the internet, none of your computer.
- Apargon: your files, none of the internet.

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
- What differs by OS goes in a `platform/` folder. No other file asks `process.platform`.
- Every module is a folder with an `index.ts`. A folder used by one module sits inside it; one used by two siblings sits in their parent.

## Building rules

- Block by default: network, mounts, devices, links, and services for programs.
- The limits are set once, at start.
- Programs stop when the `.papp` file closes.
- Refuse old and unsafe systems.

## Release rules

- Tested and passed: supported.
- Not tested yet: refused. This is for features and desktops, not OS versions.
- Can't be tested: we don't say it works.
- **A test finds a leak: it's critical.** Stop and tell the user. That feature or setup doesn't ship until the leak has a proper fix.

## Never

- Skip the offline check.

## Code review

- Critical: data can leave the computer without the user saying yes.

## Tests and releases

- `pnpm test` must stay green. It needs Node 22.18+.
- Release only with `./release.sh --major | --minor | --patch`.
