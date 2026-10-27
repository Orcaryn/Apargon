#!/bin/sh
cd "$(dirname "$0")" || exit 1
from=$(echo '<plist version="1.0"><array><string>https://example.com/</string></array></plist>' | plutil -convert binary1 -o - - | xxd -p | tr -d '\n')

for page in downloaded-*.papp; do
  xattr -w com.apple.quarantine "0081;00000000;Safari;" "$page"
  xattr -wx com.apple.metadata:kMDItemWhereFroms "$from" "$page"
done
