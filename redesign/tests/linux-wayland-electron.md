# Linux: Electron on Wayland, no X

CI, ubuntu-24.04, 2026-11-07. [Run 42358439623](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42358439623), scripts `redesign/wayland.sh` and `redesign/victim.cjs`.

## Why

Refusing X11 only works if Electron runs on Wayland alone.

## How

- Headless weston, sway, KDE (KWin) and GNOME (mutter).
- `DISPLAY` unset, no Xvfb.
- Electron 45.2.3 with `--ozone-platform=wayland`: open a window, capture it, read the GPU status.

## Result

| Compositor | Window | Painted                         |
| ---------- | ------ | ------------------------------- |
| weston     | yes    | capture failed (window visible) |
| sway       | yes    | yes                             |
| KDE        | yes    | yes                             |
| GNOME      | yes    | yes                             |

GPU: software everywhere. The runner has no GPU.

## So

- Electron runs on Wayland with no X.
- Still to test: a real GPU, and headless Wayland for the release tests.
