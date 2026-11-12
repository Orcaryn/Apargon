# macOS: services Electron needs

Mac, 2026-11-07. Apple M1 Pro.

**Optional hardening, not part of the plan.** The `.papp` file's code reaches services only through `papp.*`; reaching them directly needs a Chromium bug, which is out of scope. See the plan's appendix.

## Why

The plan blocks all macOS system services. But Electron can't start without some of them. Which ones does it need? And do any of them go online?

## Online lists

Nobody publishes this list. Browsers only lock their small helper processes, not the whole app. Apple's own sandbox allows a long list.

| Source                                                                                                                       | What it covers             | What we took from it                     |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------- |
| Firefox [SandboxPolicyContent.h](https://kdab.searchfox.org/firefox-main/source/security/sandbox/mac/SandboxPolicyContent.h) | Firefox's web page process | A short list to start from (7)           |
| Chromium [gpu.sb](https://chromium.googlesource.com/chromium/src/+/HEAD/sandbox/policy/mac/gpu.sb)                           | Chrome's graphics process  | The GPU service                          |
| `/System/Library/Sandbox/Profiles/application.sb`                                                                            | Every App Store app        | The most an app might need               |
| [Althar PR #539](https://github.com/AltharIDE/althar/pull/539)                                                               | Electron in a sandbox      | Electron must also register its own port |

## How

- Run a small Electron app in the sandbox, with all services blocked except a list.
- Remove one service at a time and see what breaks.
- Check the window really appears, by asking macOS. (Electron's own screenshot works even when the window never shows.)
- Control: all services allowed.
- Scripts: [macos-electron-services/](macos-electron-services/). `basic` checks the window, typing, the clipboard and sound. `media` checks the GPU, video and fonts.

## Result

| Service                                  | Without it                                 |
| ---------------------------------------- | ------------------------------------------ |
| `com.apple.windowserver.active`          | Crashes                                    |
| `com.apple.coreservices.launchservicesd` | Crashes                                    |
| `com.apple.windowmanager.server`         | No window                                  |
| `com.apple.CARenderServer`               | No window                                  |
| `com.apple.lsd.mapdb`                    | No typing                                  |
| `com.apple.pasteboard.1`                 | No clipboard                               |
| `com.apple.audio.audiohald`              | Sound only in a fallback mode              |
| `com.apple.MTLCompilerService`           | No GPU: no WebGL, slower video and drawing |
| `com.apple.coremedia.videoencoder`       | No fast video recording                    |
| `com.apple.fonts`                        | No fonts the user installed                |

With these 10, everything works, same as the control.

None of the 10 goes online.

The services that do go online (`trustd`, `ocspd`, `nsurlsessiond`) aren't needed. They stay blocked.

## Not tested

- Input methods (like Japanese or Chinese). None is installed on this Mac. Probably needs 4 more: `com.apple.inputmethodkit.getxpcendpoint`, `.launchagent`, `.launcher`, and `com.apple.tsm.uiserver`.
- Apargon's own features: tray, notifications, shortcuts, share, `hear`.
- The real Apargon app. Its port is named after its ID: `com.hammer.apargon.MachPortRendezvousServer`.

## So

- Allow these 10 services, plus Electron's own port.
- Test again on the real app, with an input method and Apargon's features.
