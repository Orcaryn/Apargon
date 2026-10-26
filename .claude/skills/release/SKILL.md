---
name: release
description: Never run without a direct command! Use when releasing a new papp version, writing release notes, recovering from a failed release, or changing release.sh.
---

# Releasing papp

`./release.sh --patch|--minor|--major` runs every check, bumps the version, builds a notarized `.dmg` and `.zip` for each Mac architecture and a `.deb`, commits, tags, pushes and publishes a GitHub release with the update feeds. `release.sh` is the source of truth for the steps.

Publishing is public and cannot be taken back. Installed copies read the feeds of the latest release: macOS installs it on its own, Linux shows a notice with a link to the notes. Users who turned the check off get nothing. Get the user's approval on the version and the notes before running it.

## Order

1. **Preflight.** Run each check in `refuse_unless_ready` yourself, then `pnpm format:check`, `pnpm lint` and `pnpm test`. Don't run the script for this: when every check passes, it publishes. A dirty tree is expected if the only change is the notes file.
2. **Ask about Linux.** The script does not run the Linux checks. Ask the user whether they ran `docs/verification.md` on the `.deb` for this commit.
3. **Report.** List what still blocks the release, each with the failing command's output. Fix what you can and hand the rest to the user, such as `gh auth switch`.
4. **Propose the version, write the notes and get approval.**
5. **Commit the notes.** That commit holds only `release-notes/<new-version>.md`. It is the one commit you make without being asked. The script pushes it.
6. **Run the release** in the background. Notarization takes several minutes per file.

## Version

The new version is `version` in `package.json`, bumped. Before 1.0: `--minor` for new features or a change to what a page may ask for or what the fence allows; `--patch` for fixes only. Propose one with a reason and let the user choose.

## Release notes

- Range: `v<current version>..HEAD`. Read the diffs, not only the commit messages.
- No such tag means this is the first release. Ask the user what the notes should cover, and whether `README.md` and `docs/using.md` should stop saying "There are no releases yet".
- Use only these headings, in this order, and leave out the empty ones:
  - `### Security`: fixes to the fence, the popup, the tag rules or `pageApi`, and any new gap in `SECURITY.md` under "Not enforced". Say what a page could do before and cannot now, or the reverse.
  - `### New`
  - `### Changed`: anything that may break a page that worked before, such as a tag value now refused. Say what the user has to change.
  - `### Fixed`
- Write for people who open pages and people who write them. Tag names and `window.papp` methods are fine; internal names (trampoline, offline process, `bwrapArgs`, paths in `src/`) are not.
- Claim exactly what the release does. Name the platform when a change is macOS or Linux only.
- One line per bullet, short plain sentences. Run `pnpm exec prettier --write` on the file.
- Leave out the "watch this repository" footer. `publish` appends it.
- Nothing user-visible changed: say so instead of releasing.
- Show the full notes in chat when asking for approval. The user approves what they read, not a file path.

## Failure recovery

- **The script refuses before the bump:** nothing changed. Relay the whole list, fix what you can, rerun once.
- **It fails before `Release <version>` is committed:** the trap puts `package.json` back. Fix the cause and rerun.
- **It fails after the tag:** never rerun `release.sh`; it would bump again. Run the rest of `publish` by hand, with `VERSION`, `DMGS`, `ZIPS` and `DEB` set as in `main`. The built files are in `dist/`. A release without its `update-*.json` feeds reaches no one.
- **The release is broken:** macOS copies install it on their own, so ship a newer version soon. Don't delete a published release or tag.

## Never

- **Skip a check**, in the script or by running its steps by hand.
- **Change a published release's files.** `SHA256SUMS` must match what users downloaded.
- **Touch or print signing identities, keychain profiles or `gh` tokens.** Missing or expired credentials: stop and tell the user.
