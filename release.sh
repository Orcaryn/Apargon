#!/bin/bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

REPO="Orcaryn/Apargon"
TEAM_ID="PURHNJF27S"
SIGNING_IDENTITY="Developer ID Application"
NOTARY_PROFILE="notarize"

main() {
  if [[ $# != 1 || ! "$1" =~ ^--(major|minor|patch)$ ]]; then
    cat >&2 <<EOF
Usage: ./release.sh --major | --minor | --patch

Runs the checks, bumps the version, builds a notarized .dmg and .zip for Apple silicon and
Intel and a .deb for Linux, commits and tags the version, pushes, then publishes a GitHub
release with the update feeds installed copies read.
Requires main up to date with its remote, a clean working tree, and committed release notes
at release-notes/<version>.md.
EOF
    exit 1
  fi

  local current_version major minor patch
  current_version="$(node -p "require('./package.json').version")"
  IFS=. read -r major minor patch <<< "$current_version"

  case "$1" in
    --major) VERSION="$((major + 1)).0.0" ;;
    --minor) VERSION="$major.$((minor + 1)).0" ;;
    --patch) VERSION="$major.$minor.$((patch + 1))" ;;
  esac

  DMGS=("dist/Apargon-$VERSION-x64.dmg" "dist/Apargon-$VERSION-arm64.dmg")
  ZIPS=("dist/Apargon-$VERSION-x64.zip" "dist/Apargon-$VERSION-arm64.zip")
  DEB="dist/apargon_${VERSION}_amd64.deb"

  echo "==> Version: $current_version -> $VERSION"
  refuse_unless_ready

  pnpm install --frozen-lockfile
  pnpm format:check
  pnpm lint
  pnpm test

  trap 'git checkout -- package.json' EXIT
  npm pkg set version="$VERSION"

  build

  git commit -m "Release $VERSION" -- package.json
  trap - EXIT
  git tag -a "v$VERSION" -m "Apargon $VERSION"

  publish
}

refuse_unless_ready() {
  local -a problems=()

  [[ "$(git rev-parse --abbrev-ref HEAD)" == main ]] || problems+=("Not on main.")
  [[ -z "$(git status --porcelain)" ]] || problems+=("The working tree is not clean.")
  git fetch --quiet --tags || problems+=("Cannot fetch from the remote.")
  [[ -z "$(git rev-list "HEAD..@{u}")" ]] || problems+=("main is behind its remote. Pull first.")
  [[ -z "$(git tag --list "v$VERSION")" ]] || problems+=("Tag v$VERSION already exists.")
  [[ -f "release-notes/$VERSION.md" ]] || problems+=("release-notes/$VERSION.md is missing.")
  security find-identity -v -p codesigning | grep "\"$SIGNING_IDENTITY: .*($TEAM_ID)\"" >/dev/null || problems+=("Signing identity '$SIGNING_IDENTITY' for team $TEAM_ID is missing.")
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 || problems+=("Keychain profile '$NOTARY_PROFILE' for notarytool is missing or invalid.")
  [[ "$(gh api "repos/$REPO" --jq .permissions.push)" == true ]] || problems+=("The gh account cannot publish to $REPO. Run: gh auth switch")

  if ((${#problems[@]})); then
    echo "Cannot release $VERSION:" >&2
    printf '  - %s\n' "${problems[@]}" >&2
    exit 1
  fi
}

build() {
  local app dmg

  rm -rf dist
  APPLE_KEYCHAIN_PROFILE="$NOTARY_PROFILE" pnpm dist --publish never
  pnpm dist:linux --publish never

  for app in dist/mac/Apargon.app dist/mac-arm64/Apargon.app; do
    codesign -dv "$app" 2>&1 | grep "TeamIdentifier=$TEAM_ID" >/dev/null || { echo "Not signed by team $TEAM_ID: $app" >&2; exit 1; }
    xcrun stapler validate "$app"
    spctl --assess --type execute --verbose=2 "$app"
  done

  for dmg in "${DMGS[@]}"; do
    codesign --sign "$SIGNING_IDENTITY" --timestamp "$dmg"
    xcrun notarytool submit "$dmg" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$dmg"
    spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
  done
}

publish() {
  local arch
  local -a feeds=()

  (cd dist && shasum -a 256 "${DMGS[@]#dist/}" "${ZIPS[@]#dist/}" "${DEB#dist/}") > dist/SHA256SUMS

  for arch in x64 arm64; do
    feeds+=("$(write_feed darwin "$arch" "Apargon-$VERSION-$arch.zip")")
  done

  feeds+=("$(write_feed linux x64 "${DEB#dist/}")")

  {
    cat "release-notes/$VERSION.md"
    printf '\n---\n\nApargon checks for a new version once a day when a page opens, unless you turned that off under Permissions. If you did, watch this repository to hear about security fixes: **Watch → Custom → Releases**.\n'
  } > dist/release-notes.md

  git push --follow-tags
  gh release create "v$VERSION" --repo "$REPO" --verify-tag --title "Apargon $VERSION" --notes-file dist/release-notes.md "${DMGS[@]}" "${ZIPS[@]}" "$DEB" dist/SHA256SUMS "${feeds[@]}"

  echo "==> https://github.com/$REPO/releases/tag/v$VERSION"
}

write_feed() {
  local platform="$1" arch="$2" asset="$3"
  local feed="dist/update-$platform-$arch.json"

  node - "$REPO" "$VERSION" "$asset" "release-notes/$VERSION.md" > "$feed" <<'JS'
const [repo, version, asset, notesFile] = process.argv.slice(2);
const notes = require('fs').readFileSync(notesFile, 'utf8');
const url = `https://github.com/${repo}/releases/download/v${version}/${asset}`;
const pubDate = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
const updateTo = { version, name: `Apargon ${version}`, pub_date: pubDate, notes, url };
console.log(JSON.stringify({ currentRelease: version, releases: [{ version, updateTo }] }, null, 2));
JS

  echo "$feed"
}

main "$@"
