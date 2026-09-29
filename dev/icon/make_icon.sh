#!/bin/bash
# アプリアイコンを作る: dev/icon/icon.html(canvas) → icon.png(1024) → lyricflow.icns
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
HS=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1)
CHROME=${HS:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d /tmp/lf_icon.XXXXXX)
perl -e 'alarm 60; exec @ARGV' "$CHROME" --disable-gpu --no-sandbox --virtual-time-budget=15000 --user-data-dir="$TMP/u" --dump-dom "file://$DIR/icon.html" > "$TMP/dom.html" 2>/dev/null || true
python3 -c "
import re,base64,sys
d=open('$TMP/dom.html').read(); m=re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)',d)
open('$DIR/icon.png','wb').write(base64.b64decode(m.group(1)))"
IS="$TMP/lyricflow.iconset"; mkdir -p "$IS"
for s in 16 32 128 256 512; do
  sips -z $s $s "$DIR/icon.png" --out "$IS/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$DIR/icon.png" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$IS" -o "$DIR/lyricflow.icns"
rm -rf "$TMP"
echo "icon -> $DIR/lyricflow.icns"
