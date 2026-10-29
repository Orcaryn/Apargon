---
name: release
description: Never run without a direct command! Use when releasing a new Apargon version, writing release notes, recovering from a failed release, or changing release.sh.
---

# Releasing Apargon

`./release.sh --patch|--minor|--major` runs every check, bumps the version, builds a notarized `.dmg` and `.zip` for each Mac architecture and a `.deb`, commits, tags, pushes and publishes a GitHub release with the update feeds. `release.sh` is the source of truth for the steps.

Publishing is public and cannot be taken back. Installed copies read the feeds of the latest release: macOS installs it on its own, Linux shows a notice with a link to the notes. Users who turned the check off get nothing. Get the user's approval on the version and the notes before running it.

## Order

1. **Preflight.** Run each check in `refuse_unless_ready` yourself, then `pnpm format:check`, `pnpm lint` and `pnpm test`. Don't run the script for this: when every check passes, it publishes. A dirty tree is expected if the only change is the notes file.
2. **Ask about Linux.** The script does not run the Linux checks. Ask the user whether they ran the checks in AGENTS.md's "The installed `.deb`" for this commit.
3. **Report.** List what still blocks the release, each with the failing command's output. Fix what you can and hand the rest to the user, such as `gh auth switch`.
4. **Propose the version, write the notes and get approval.**
5. **Commit the notes.** That commit holds only `release-notes/<new-version>.md`. It is the one commit you make without being asked. The script pushes it.
6. **Run the release** in the background. Notarization takes several minutes per file.
7. **Check the download links.** apargon.com's Worker (`../apargon-landing/worker/index.ts`) reads the version from the latest release's `update-linux-x64.json` and builds each file's name, so a release changes nothing on the site. Within five minutes each of these must redirect to the new version's file, and that file must answer 200:

   ```sh
   for t in mac-arm64 mac-x64 linux; do curl -sIL -o /dev/null -w "%{http_code} %{url_effective}\n" "https://apargon.com/download/$t"; done
   ```

   If a link still leads to the old version, the feeds are missing from the release (see Failure recovery). If `release.sh` named a file differently, update `FILES` in the Worker and deploy it with `pnpm deploy` in `../apargon-landing`, after the user says yes.

## Version

The new version is `version` in `package.json`, bumped. Before 1.0: `--minor` for new features or a change to what a page may ask for or what the fence allows; `--patch` for fixes only. Propose one with a reason and let the user choose.

## Release notes

- Range: `v<current version>..HEAD`. Read the diffs, not only the commit messages.
- No such tag means this is the first release. Ask the user what the notes should cover.
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
- **It fails in `update_cask`:** the release is out; only the cask is stale. Fix the cause and run `update_cask`'s steps by hand with `VERSION`, `REPO` and `TAP` set.
- **The release is broken:** macOS copies install it on their own, so ship a newer version soon. Don't delete a published release or tag.

## Never

- **Skip a check**, in the script or by running its steps by hand.
- **Change a published release's files.** `SHA256SUMS` must match what users downloaded.
- **Touch or print signing identities, keychain profiles or `gh` tokens.** Missing or expired credentials: stop and tell the user.
