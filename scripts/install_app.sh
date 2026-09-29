#!/bin/bash
# LyricFlow AI を /Applications/LyricFlow AI.app としてインストール(更新も同じコマンド)
#   ./scripts/install_app.sh
# - 本体: node_modules/electron の Electron.app を複製し、Contents/Resources/app にアプリ一式を入れる
# - データ: ~/Library/Application Support/LyricFlow AI/data(本体を入れ替えても残る)。
#   初回だけ、リポの data/ と .env をそこへコピーする(既にあれば触らない)
# - サーバーは Mac の python3(/opt/homebrew 等)で動く。ポートは 4389(開発用 4189/4289 と別)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
NAME="LyricFlow AI"
DEST="/Applications/$NAME.app"
BUNDLE_ID="com.yasikw.lyricflow-ai"
SUPPORT="$HOME/Library/Application Support/$NAME"
ELECTRON_APP="$ROOT/node_modules/electron/dist/Electron.app"
[ -d "$ELECTRON_APP" ] || { echo "Electron が見つかりません。先に npm install を実行してください"; exit 1; }
[ -f "$ROOT/dev/icon/lyricflow.icns" ] || "$ROOT/dev/icon/make_icon.sh"

VERSION=$(python3 -c "import json;print(json.load(open('$ROOT/package.json'))['version'])")
BUILD=$(mktemp -d /tmp/lf_app.XXXXXX)
APP="$BUILD/$NAME.app"
echo "== 組み立て: $APP"
cp -R "$ELECTRON_APP" "$APP"
RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
rsync -a --exclude '__pycache__' --exclude '.DS_Store' \
  "$ROOT/package.json" "$ROOT/server.py" "$ROOT/electron" "$ROOT/static" "$ROOT/scripts" "$RES/app/"
cp "$ROOT/dev/icon/lyricflow.icns" "$RES/lyricflow.icns"

PL="$APP/Contents/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" >/dev/null 2>&1 || true; }
pb "Set :CFBundleName $NAME"
pb "Add :CFBundleDisplayName string $NAME"; pb "Set :CFBundleDisplayName $NAME"
pb "Set :CFBundleIdentifier $BUNDLE_ID"
pb "Set :CFBundleIconFile lyricflow.icns"
pb "Set :CFBundleShortVersionString $VERSION"
pb "Set :CFBundleVersion $VERSION"
pb "Delete :CFBundleIconName"
# 中身を入れ替えたので署名し直す(アドホック署名。このMac専用)
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "(署名に失敗しましたが続行します)"

# 初回だけデータを引き継ぐ
if [ ! -d "$SUPPORT/data" ]; then
  echo "== データを引き継ぎ: $ROOT/data → $SUPPORT/data"
  mkdir -p "$SUPPORT"
  rsync -a "$ROOT/data/" "$SUPPORT/data/"
  [ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$SUPPORT/data/.env"
else
  echo "== データは既存のものを使います: $SUPPORT/data"
fi

# 起動中なら終了してから入れ替える
if pgrep -f "$DEST/Contents/MacOS/Electron" >/dev/null 2>&1; then
  echo "== 起動中の $NAME を終了"
  osascript -e "tell application \"$NAME\" to quit" >/dev/null 2>&1 || true
  sleep 2
  pkill -f "$DEST/Contents/MacOS/Electron" 2>/dev/null || true
fi
if [ -d "$DEST" ]; then
  OLD_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$DEST/Contents/Info.plist" 2>/dev/null || echo "")
  [ "$OLD_ID" = "$BUNDLE_ID" ] || { echo "$DEST は別のアプリです($OLD_ID)。中止します"; exit 1; }
  rm -rf "$DEST"
fi
mv "$APP" "$DEST"
rm -rf "$BUILD"
touch "$DEST"                                   # Finder/Dock のアイコンを更新
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" >/dev/null 2>&1 || true
echo "== インストール完了: $DEST (v$VERSION)"
