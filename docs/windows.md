# Windows

resworb refuses to open pages on Windows. This page holds the plan, and why it is not built: there is no Windows 11 machine to test on yet.

## The plan: MXC

[Microsoft eXecution Container](https://github.com/microsoft/mxc) (MXC) is Microsoft's open-source sandbox launcher, MIT licensed. The SDK is at v1.0.1 as of October 2026. Codex and GitHub Copilot CLI use it on Windows.

For resworb, MXC would do what `sandbox-exec` does on macOS and `bwrap` on Linux: the trampoline starts `process.execPath --no-sandbox page.lmth` inside it.

Its Windows backend is called **ProcessContainer**. It is an AppContainer, a job object and Windows firewall rules. The trampoline would write each page's limits as JSON and start the page through `@microsoft/mxc-sdk/v1`. The SDK needs Node 24; resworb's Electron 45 has Node 24.22.

| resworb today                   | MXC on Windows                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `seatbeltProfile` / `bwrapArgs` | a container request built from `Permissions`                                            |
| `spawn('sandbox-exec' …)`       | `spawn()` from the SDK, with no timeout                                                 |
| `--unshare-net`                 | `network.egress.default: "deny"` and `network.ingress.default: "deny"`                  |
| write folders                   | `filesystem.readwritePaths`: folders, not patterns, like `bwrap` on Linux               |
| own folder                      | `filesystem.readonlyPaths`                                                              |
| proxy on loopback               | `runtimeConfig.networkProxy`; MXC also sets `HTTP_PROXY` and `HTTPS_PROXY` for the page |
| fd 3 for the child's messages   | needs another channel; Windows cannot pass an fd                                        |
| `canBindLoopback`               | a new check; see below                                                                  |

## What its code shows

Read in the MXC source on 2026-10-25, not only in its docs:

- **A window can open.** MXC blocks the GUI only when `ui.disable` is `true`. Microsoft's own test tool, `wxc_ui_probe`, opens a visible window inside the container.
- **Nothing in it would break Electron.** It does not ban dynamic code, so V8's JIT runs. The job object only kills the processes when the container closes and applies the GUI limits. No cap on the number of processes or on memory.
- **Child processes stay inside.** The process starts paused, joins the job, then runs. Everything it starts is inside too. That is what `resworb-run` needs.
- **Windows enforces the limits, not MXC.** MXC turns the JSON into a policy and calls `CreateProcessSecurityEnvironment` in `processmodel.dll`. The OS then limits files and network, as the OS does with `bwrap` and Seatbelt.

## What is not known

- **Nobody has run Chromium inside ProcessContainer.** Not in MXC's repository, not anywhere found. The code shows no reason it would fail, but that is a guess until the first run.
- **The offline check.** Inside the container, binding a loopback port may succeed, so `canBindLoopback` cannot tell sandbox from no sandbox there. The Windows check should ask the process token whether it is an AppContainer token, and refuse if not.
- **`resworb-net`.** For the page to reach the proxy, the container needs the `networkLoopback` capability. Unless the proxy is a packaged AppContainer app, that capability also lets the page reach every other loopback port on the machine. So a first Windows release would offer read, write and run only, with `resworb-net` later and the gap listed in `SECURITY.md`.
- **Full Node pages.** On Windows, granting a drive root (`C:\`) does not grant its subfolders. "The whole disk" needs another shape.

## Windows versions

Process isolation needs Windows 11 24H2 build 26100.9278 or 25H2 build 26200.9278 (KB5120998, August 2026). Builds 26100.9550 and 26200.9550 (KB5124010) are better. Older builds do not have it. The SDK's `getPlatformSupport()` says what the machine supports; resworb should refuse to open pages unless it says `processcontainer`.

## Why not yet

No Windows 11 machine is at hand, and nothing else works:

| Environment                     | Why not                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Docker on macOS                 | Linux containers; no Windows kernel                                                |
| Windows containers              | Server Core, no desktop: no window can open                                        |
| Cloudflare Workers, Containers  | V8 isolates and Linux only                                                         |
| AWS EC2                         | Windows Server 2025 only; same build number as 24H2, but MXC lists Windows 11 only |
| GitHub Actions `windows-latest` | Windows Server too; good for repeat tests later, not for the first run             |

What works: a Windows 11 ARM64 VM on the Mac (UTM or VMware Fusion; MXC ships ARM64 binaries), or an Azure Windows 11 25H2 VM.

## First run checklist

Each is a yes or no, in this order:

1. `getPlatformSupport()` says `processcontainer`.
2. A page with no tags opens and shows its window.
3. In the page, `fetch('https://example.com')` fails, and a declared program such as `curl.exe example.com` fails.
4. Electron started by hand with `RESWORB` set, outside MXC, refuses to open the page.
5. A write outside `resworb-write` fails; one inside succeeds.
