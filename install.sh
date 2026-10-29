#!/bin/sh
# Installs Apargon and the papp skill for coding agents: curl -fsSL https://apargon.com/install.sh | sh
# Without the skill: curl -fsSL https://apargon.com/install.sh | sh -s -- --no-skill
set -eu

main() {
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT
  cd "$dir"

  case $(uname -s) in
    Darwin)
      if pgrep -xq Apargon; then
        echo 'apargon: quit Apargon first, then run this again.' >&2
        exit 1
      fi

      # 1 on Apple silicon, also in a Rosetta shell, where uname -m says x86_64.
      if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; else arch=x64; fi
      curl -fLOJ "https://apargon.com/download/mac-$arch"
      hdiutil attach -quiet -nobrowse -readonly -mountpoint "$dir/image" Apargon-*.dmg
      trap 'hdiutil detach -quiet "$dir/image"; rm -rf "$dir"' EXIT

      # curl does not quarantine what it downloads, so Gatekeeper would never check the app: check it here, before the installed one is replaced.
      codesign --verify --deep --strict image/Apargon.app
      spctl --assess image/Apargon.app
      if ! codesign -dv image/Apargon.app 2>&1 | grep -qx 'TeamIdentifier=PURHNJF27S'; then
        echo 'apargon: the app is not signed by Apargon.' >&2
        exit 1
      fi

      # Removed first, so no file of the old version stays in the new one.
      rm -rf /Applications/Apargon.app
      ditto image/Apargon.app /Applications/Apargon.app
      echo 'apargon: installed /Applications/Apargon.app.'
      open=open
      ;;
    Linux)
      curl -fLOJ https://apargon.com/download/linux
      curl -fsSL https://github.com/Orcaryn/Apargon/releases/latest/download/SHA256SUMS | grep '_amd64\.deb$' | sha256sum --check
      echo 'apargon: installing the .deb with apt-get, which needs sudo.'
      sudo apt-get install -y ./apargon_*_amd64.deb
      open=apargon
      ;;
    *)
      echo 'apargon: Apargon runs on macOS and Linux.' >&2
      exit 1
      ;;
  esac

  if [ "${1:-}" != --no-skill ]; then
    for folder in ~/.claude/skills/papp ~/.agents/skills/papp; do
      mkdir -p "$folder"
      curl -fsSL https://apargon.com/.well-known/agent-skills/papp/SKILL.md -o "$folder/SKILL.md"
    done
    echo 'apargon: installed the papp skill in ~/.claude/skills/papp and ~/.agents/skills/papp.'
  fi

  echo "apargon: done. Open a page with: $open page.papp"
}

# Called last, so a download cut short runs nothing.
main "$@"
