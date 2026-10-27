#!/bin/sh
set -eu
command -v rsvg-convert >/dev/null || { echo "Needs rsvg-convert: brew install librsvg" >&2; exit 1; }
command -v iconutil >/dev/null || { echo "Needs iconutil, which comes with macOS" >&2; exit 1; }
cd "$(dirname "$0")/.."
out=build
mkdir -p "$out"

icns() {
  name=$1; svg="assets/$name.svg"; set="/tmp/$name.iconset"
  rm -rf "$set"; mkdir -p "$set"
  for s in 16 32 128 256 512; do
    rsvg-convert -w "$s"       -h "$s"       "$svg" -o "$set/icon_${s}x${s}.png"
    rsvg-convert -w $((s*2))   -h $((s*2))   "$svg" -o "$set/icon_${s}x${s}@2x.png"
  done
  iconutil -c icns "$set" -o "$out/$name.icns"
  rsvg-convert -w 1024 -h 1024 "$svg" -o "$out/$name.png"
  rm -rf "$set"
  echo "  $out/$name.icns  $out/$name.png"
}

echo "icons:"
icns icon
icns papp
rsvg-convert -w 18 -h 18 assets/tray.svg -o src/trampoline/tray.png
rsvg-convert -w 36 -h 36 assets/tray.svg -o src/trampoline/tray@2x.png
echo "  src/trampoline/tray.png  src/trampoline/tray@2x.png"
