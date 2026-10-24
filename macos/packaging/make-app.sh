#!/bin/sh
# Builds NMRemView.app (Apple silicon) and zips it to macos/NMRemView/out/NMRemView-macOS-arm64.zip
set -eu
cd "$(dirname "$0")/../NMRemView"
swift build -c release --arch arm64
BIN="$(swift build -c release --arch arm64 --show-bin-path)"
APP=out/NMRemView.app
rm -rf out && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/NMRemView" "$APP/Contents/MacOS/NMRemView"
cp Sources/NMRemView/Resources/nmrcore.js "$APP/Contents/Resources/"
cp ../packaging/Info.plist "$APP/Contents/Info.plist"
# Ad-hoc signature: required to launch on Apple silicon; not notarised.
codesign --force --deep --sign - "$APP"
ditto -c -k --keepParent "$APP" out/NMRemView-macOS-arm64.zip
echo "built $APP"
