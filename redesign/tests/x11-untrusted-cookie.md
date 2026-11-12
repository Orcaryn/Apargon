# X11: the untrusted cookie

VPS, 2026-11-07, private display `:77`.

## Why

On X11 any app can type into any window, for example `curl … | sh` into a terminal. An "untrusted" cookie is meant to stop that. Does it, and does Apargon still run under it?

## How

- Xvfb `:77` with a trusted cookie.
- An untrusted cookie: `xauth generate :77 MIT-MAGIC-COOKIE-1 untrusted timeout 3600`.
- Victim: `xev`, logging key presses.
- Attacker: Python with `libXtst`, sending 3 fake keys.
- Run the attacker with each cookie.
- Run Apargon's `selftest.papp` with each cookie and compare the results.

## Result

| Cookie | Keys reaching the victim |
| --- | --- |
| trusted (control) | 3 of 3 |
| untrusted | **0** |

- Apargon with the untrusted cookie: ran, and all 75 result fields matched.
- But no GPU: 48 "GLX is not present" errors, against 0 with the trusted cookie.
- `timeout 0` makes the cookie expire at once.

## So

It blocks typing but costs the GPU. Decision: **Wayland only, X11 refused.**

Later, 2026-11-09: no GPU and other problems, so the cookie is dropped. X11 opens after a popup that says Apargon can't keep its promise there.
