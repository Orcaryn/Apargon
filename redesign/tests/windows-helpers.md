# Windows: can a program ask Windows to go online for it?

CI, windows-11-arm (build 26200, MXC ProcessContainer), 2026-11-07. Runs [42379925060](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42379925060) and [42380601713](https://github.com/HaMMeRSI/apargon-windows-spike/actions/runs/42380601713). Scripts: `redesign/helpers.ts`, `redesign/helpers-probe.ts`.

## Why

A program in the sandbox has no network. Could it ask a Windows helper outside the sandbox to send data for it?

## How

- Each try used a unique name.
- A packet capture (`pktmon`) watched all traffic. If that name shows up, it leaked.
- Ran inside the sandbox in two modes: offline, and through Apargon's proxy.
- Control: the same tries outside the sandbox.

## Result

| Way out | Inside | Control outside | Leak |
| --- | --- | --- | --- |
| Task Scheduler (`schtasks`, COM API) | refused | sent | no |
| Open a link (`start`, `explorer`, `Start-Process`, `ShellExecute`, `rundll32`) | nothing sent | sent | no |
| Internet Explorer (COM) | error | sent | no |
| BITS (`bitsadmin`, `Start-BitsTransfer`) | refused | sent | no |
| `curl`, `ServerXMLHTTP`, `WinHttpRequest` | offline: nothing. Proxy: refused by the proxy | sent | no |
| `certutil` | refused | refused on ARM too | no (weak) |
| Named pipes | 4 of 81 open (crash reporter, `epmapper`); none led out | 31 open | no |
| Your browser reaching a listener inside | nothing arrived | arrived | no |
| A second drive (VHD as `E:`) | read works, write refused | readable | no |

The controls sent the name on 13 routes, so the tests could see a leak.

## So

- No Windows helper leaked. `papp-run` can be on for Windows.
- Not tested: x64 Windows 11. GitHub's only x64 runner is Server 2025, where MXC doesn't run.
- The known DNS leak through `\\host\share` paths still stands. It's Microsoft's, and it's disclosed.
