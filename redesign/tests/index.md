# Redesign tests

Run on 2026-11-07, before the redesign was built. Each test has a control.

Where:

- **Mac:** macOS 26 (Darwin 25.2), `sandbox-exec`.
- **VPS:** Ubuntu 24.04, installed Apargon `.deb`.
- **CI:** GitHub Actions, private repo `HaMMeRSI/apargon-windows-spike`, branch `redesign-tests`.

| Test                                         | Question                                      | Result                                                                                   | File                                                     |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| macOS hard links                             | Write outside the folder through a hard link? | New links refused. Old links let writes through                                          | [macos-hard-links.md](macos-hard-links.md)               |
| macOS nested profile                         | Can a sandbox add a stricter one?             | No                                                                                       | [macos-nested-profile.md](macos-nested-profile.md)       |
| macOS program profile                        | Do tools work with no services?               | Yes. Ways out refused                                                                    | [macos-program-profile.md](macos-program-profile.md)     |
| macOS local disks                            | Read local disks only?                        | Yes, aliases too                                                                         | [macos-local-disks.md](macos-local-disks.md)             |
| macOS network mounts                         | Reach a server by mounting?                   | **Hole**, closed by 2 rules                                                              | [macos-network-mounts.md](macos-network-mounts.md)       |
| macOS `hear`                                 | Does it send anything?                        | No (code check)                                                                          | [macos-hear.md](macos-hear.md)                           |
| macOS Electron services (optional hardening) | Which services does Electron need?            | 10. None goes online                                                                     | [macos-electron-services.md](macos-electron-services.md) |
| X11 untrusted cookie                         | Block typing into other windows?              | Yes, but no GPU                                                                          | [x11-untrusted-cookie.md](x11-untrusted-cookie.md)       |
| Linux hard links                             | Same as macOS, bwrap                          | Same as macOS                                                                            | [linux-hard-links.md](linux-hard-links.md)               |
| Linux sockets, D-Bus                         | Does read-all expose other programs?          | **Hole**: every socket file                                                              | [linux-sockets-dbus.md](linux-sockets-dbus.md)           |
| Linux Electron on Wayland                    | Runs with no X?                               | Yes, 4 compositors                                                                       | [linux-wayland-electron.md](linux-wayland-electron.md)   |
| Linux Wayland input                          | Type into other windows?                      | **Hole**: sway; D-Bus on GNOME. KDE: no typing found (clipboard reading is out of scope) | [linux-wayland-input.md](linux-wayland-input.md)         |
| Windows MXC read all                         | Grant read of everything?                     | Yes, as a folder list                                                                    | [windows-mxc-read-all.md](windows-mxc-read-all.md)       |
| Windows helpers                              | Can a program ask Windows to go online?       | No leak on 13 routes                                                                     | [windows-helpers.md](windows-helpers.md)                 |
| Linux late mount (2026-11-08)                | Does a drive mounted after start show inside? | **Hole**: yes. Closed: only the disks mounted at start                                   | [linux-late-mount.md](linux-late-mount.md)               |

Not run yet (where: Mac = this Mac, CI = GitHub Actions in the spike repo):

- Mac: marking written files.
- Mac: the device list.
- Mac: a share mounted after start, outside `/Volumes`.
- CI Linux: programs can't connect to other programs' sockets.
- CI Linux: `security-context-v1` on sway.
- CI Linux: KDE blocks typing (headless only).
- After the build: the macOS tests again (Mac), the `.deb` (VPS).

Can't test with what we have:

- A real GPU on Wayland.
- Real Linux desktops with a user logged in.
- OneDrive online-only files.
- Windows on a real PC, and x64 Windows 11 (no GitHub runner).
