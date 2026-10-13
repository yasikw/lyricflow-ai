#!/bin/bash
# Live2D 対応に必要なファイルを取得する(初回・更新時に1回)
#   ./scripts/fetch_live2d.sh
#
# - Cubism Core(Live2D社のプロプライエタリ部品)… 公式CDN https://cubism.live2d.com から取得。
#   利用は Live2D Proprietary Software License に従う(個人・小規模事業者は無償)。
#   https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_jp.html
# - サンプルモデル Hiyori … Live2D 公式 CubismWebSamples から取得。Live2D 無償提供マテリアル使用許諾に従う。
#   https://www.live2d.com/eula/live2d-free-material-license-agreement_jp.html
# どちらも再配布条件があるので git には入れない(.gitignore 済み)。描画ライブラリ(PixiJS/pixi-live2d-display, MIT)はリポに同梱。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VEND="$ROOT/static/vendor/live2d"
SAMPLES="$ROOT/static/live2d-samples"
mkdir -p "$VEND" "$SAMPLES"

echo "== Cubism Core (公式CDN)"
curl -fsSL "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js" -o "$VEND/live2dcubismcore.min.js"
head -c 300 "$VEND/live2dcubismcore.min.js" | grep -q "Live2D" || { echo "Cubism Core の取得に失敗しました"; exit 1; }
echo "   $(wc -c < "$VEND/live2dcubismcore.min.js") bytes"

echo "== サンプルモデル Hiyori (Live2D/CubismWebSamples)"
TMP=$(mktemp -d /tmp/lf_l2d.XXXXXX)
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/Live2D/CubismWebSamples.git "$TMP/repo"
git -C "$TMP/repo" sparse-checkout set Samples/Resources/Hiyori >/dev/null
rm -rf "$SAMPLES/hiyori"
cp -R "$TMP/repo/Samples/Resources/Hiyori" "$SAMPLES/hiyori"
rm -rf "$TMP"
ls "$SAMPLES/hiyori"
echo "== 完了"
