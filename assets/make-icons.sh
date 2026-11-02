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

node - assets/papp.svg "$out/papp.ico" <<'JS'
const { execFileSync } = require('child_process');
const fs = require('fs');
const [svg, out] = process.argv.slice(2);
const sizes = [16, 32, 48, 256];
const pngs = sizes.map(size => execFileSync('rsvg-convert', ['-w', `${size}`, '-h', `${size}`, svg]));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size % 256, entry);
  header.writeUInt8(size % 256, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(pngs[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(out, Buffer.concat([header, ...pngs]));
JS
echo "  $out/papp.ico"
rsvg-convert -w 18 -h 18 assets/tray.svg -o src/trampoline/requests/tray/images/tray.png
rsvg-convert -w 36 -h 36 assets/tray.svg -o src/trampoline/requests/tray/images/tray@2x.png
echo "  src/trampoline/requests/tray/images/tray.png  src/trampoline/requests/tray/images/tray@2x.png"
