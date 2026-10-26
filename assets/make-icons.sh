#!/bin/sh
# Render the SVG sources in assets/ into the icns + png that electron-builder consumes.
# Needs: rsvg-convert (brew install librsvg), iconutil (macOS).
set -eu
cd "$(dirname "$0")/.."
out=build
mkdir -p "$out"

icns() { # <name>  -> build/<name>.icns + build/<name>.png (1024, for Linux)
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
