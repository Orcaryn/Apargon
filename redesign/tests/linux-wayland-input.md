# Linux: Wayland input and screen

CI, ubuntu-24.04, 2026-11-07. [Run 42358439623](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42358439623), scripts `redesign/wayland.sh`, `redesign/victim.cjs` and `redesign/mutter-inject.py`.

## Why

Wayland is meant to stop apps typing into or watching other windows. Some compositors add features that allow it.

## How

- `wayland-info` lists what each compositor offers a normal app.
- Victim: an Electron window logging keys.
- Attacker: `wtype hello`, typing through the virtual keyboard feature.
- GNOME also: typing through its D-Bus remote desktop service (`org.gnome.Mutter.RemoteDesktop`).

## Result

| Compositor | `wtype`              | Risky features any app gets                                     |
| ---------- | -------------------- | --------------------------------------------------------------- |
| sway       | **9 keys delivered** | typing, pointer, clipboard reading, screen capture, window list |
| KDE        | refused              | **clipboard reading**                                           |
| GNOME      | refused              | none                                                            |

- GNOME through D-Bus: **7 keys delivered**.
- KDE had no positive typing control.

## So

- Wayland alone isn't enough.
- GNOME: safe once the app has no D-Bus.
- KDE: no typing found. Its clipboard reading is out of scope (reading isn't sending). Still to test: a positive typing control.
- sway: needs `security-context-v1`. Not tested yet.
- Other wlroots compositors (Hyprland, river): likely like sway. Not tested.
