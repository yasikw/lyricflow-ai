#!/bin/bash
# LyricFlow AI を /Applications/LyricFlow AI.app としてインストール(更新も同じコマンド)
#   ./scripts/install_app.sh            # 通常(コードだけ更新。.app は必要なときだけ作り直す)
#   ./scripts/install_app.sh --rebuild  # .app も作り直す
#
# 構成:
# - コード: ~/Library/Application Support/LyricFlow AI/app (package.json/server.py/electron/static/scripts)
# - .app  : node_modules/electron の Electron.app を複製し、Contents/Resources/app を上のコードへのリンクにしたもの。
#           更新でコードだけ入れ替えるので .app の署名は変わらない
#           (Little Snitch などの通信許可を、更新のたびに聞き直されない)。
#           作り直すのは「初回 / Electron の版が変わった / アイコンが変わった / --rebuild」のときだけ
# - データ: ~/Library/Application Support/LyricFlow AI/data(LF_DATA_DIR。.env もここ)。
#           初回だけリポの data/ と .env をコピー(既にあれば触らない)
# - サーバーは Mac の python3(/opt/homebrew 等)で動く。ポートは 4389(開発用 4189/4289 と別)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
NAME="LyricFlow AI"
DEST="/Applications/$NAME.app"
BUNDLE_ID="com.yasikw.lyricflow-ai"
SUPPORT="$HOME/Library/Application Support/$NAME"
CODE="$SUPPORT/app"
ELECTRON_APP="$ROOT/node_modules/electron/dist/Electron.app"
REBUILD=0; [ "${1:-}" = "--rebuild" ] && REBUILD=1
[ -d "$ELECTRON_APP" ] || { echo "Electron が見つかりません。先に npm install を実行してください"; exit 1; }
[ -f "$ROOT/dev/icon/lyricflow.icns" ] || "$ROOT/dev/icon/make_icon.sh"
VERSION=$(python3 -c "import json;print(json.load(open('$ROOT/package.json'))['version'])")
EL_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$ELECTRON_APP/Contents/Info.plist")
ICON_MD5=$(md5 -q "$ROOT/dev/icon/lyricflow.icns")
STAMP="electron=$EL_VER icon=$ICON_MD5 layout=link"

quit_app() {
  if pgrep -f "$DEST/Contents/MacOS/Electron" >/dev/null 2>&1; then
    echo "== 起動中の $NAME を終了"
    osascript -e "tell application \"$NAME\" to quit" >/dev/null 2>&1 || true
    sleep 2
    pkill -f "$DEST/Contents/MacOS/Electron" 2>/dev/null || true
    sleep 1
  fi
}

# 1) コード(.app の外)を更新
quit_app
echo "== コードを更新: $CODE"
mkdir -p "$CODE"
rsync -a --delete --exclude '__pycache__' --exclude '.DS_Store' \
  "$ROOT/package.json" "$ROOT/server.py" "$ROOT/electron" "$ROOT/static" "$ROOT/scripts" "$CODE/"

# 2) 初回だけデータを引き継ぐ
if [ ! -d "$SUPPORT/data" ]; then
  echo "== データを引き継ぎ: $ROOT/data → $SUPPORT/data"
  rsync -a "$ROOT/data/" "$SUPPORT/data/"
  [ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$SUPPORT/data/.env"
else
  echo "== データは既存のものを使います: $SUPPORT/data"
fi

# 3) .app は必要なときだけ作り直す(署名が変わるのはこの時だけ)
CUR_STAMP=""
[ -f "$DEST/Contents/Resources/lf-bundle.txt" ] && CUR_STAMP=$(cat "$DEST/Contents/Resources/lf-bundle.txt")
if [ $REBUILD = 1 ] || [ "$CUR_STAMP" != "$STAMP" ] || [ ! -L "$DEST/Contents/Resources/app" ]; then
  BUILD=$(mktemp -d /tmp/lf_app.XXXXXX)
  APP="$BUILD/$NAME.app"
  echo "== .app を組み立て(Electron $EL_VER)"
  cp -R "$ELECTRON_APP" "$APP"
  RES="$APP/Contents/Resources"
  rm -f "$RES/default_app.asar"
  ln -s "$CODE" "$RES/app"
  cp "$ROOT/dev/icon/lyricflow.icns" "$RES/lyricflow.icns"
  echo "$STAMP" > "$RES/lf-bundle.txt"
  PL="$APP/Contents/Info.plist"
  pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" >/dev/null 2>&1 || true; }
  pb "Set :CFBundleName $NAME"
  pb "Add :CFBundleDisplayName string $NAME"; pb "Set :CFBundleDisplayName $NAME"
  pb "Set :CFBundleIdentifier $BUNDLE_ID"
  pb "Set :CFBundleIconFile lyricflow.icns"
  pb "Set :CFBundleShortVersionString $VERSION"
  pb "Set :CFBundleVersion $VERSION"
  pb "Delete :CFBundleIconName"
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "(署名に失敗しましたが続行します)"
  if [ -d "$DEST" ]; then
    OLD_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$DEST/Contents/Info.plist" 2>/dev/null || echo "")
    [ "$OLD_ID" = "$BUNDLE_ID" ] || { echo "$DEST は別のアプリです($OLD_ID)。中止します"; exit 1; }
    rm -rf "$DEST"
  fi
  mv "$APP" "$DEST"
  rm -rf "$BUILD"
  touch "$DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" >/dev/null 2>&1 || true
  echo "== .app を作り直しました(署名が変わったので、通信許可を一度だけ聞かれることがあります)"
else
  echo "== .app はそのまま(署名は変わりません)"
fi
echo "== インストール完了: $DEST (v$VERSION)"
