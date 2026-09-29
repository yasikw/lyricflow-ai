#!/bin/bash
# 各構図の「歌詞が画面を占める割合」を実測して static/js/compose/size_table.js を作り直す
# (文字の大きさ=大きめ(MV) のとき、計画がこの表で大きく組む構図を優先する)
#   dev/compose/size_table.sh
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HS=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1)
CHROME=${HS:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d /tmp/lfc_size.XXXXXX)
perl -e 'alarm 600; exec @ARGV' "$CHROME" --disable-gpu --no-sandbox --allow-file-access-from-files \
  --virtual-time-budget=120000 --user-data-dir="$TMP" --dump-dom "file://$ROOT/dev/compose/size_survey.html" > "$TMP/dom.html" 2>/dev/null || true
python3 - "$TMP/dom.html" "$ROOT/static/js/compose/size_table.js" <<'PY'
import sys, re, html, json
d = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'<pre id="report">(.*?)</pre>', d, re.S)
rows = json.loads(html.unescape(m.group(1)))
tab = {k: v for k, v, _ in rows}
js = ("/* 自動生成: dev/compose/size_table.sh — 構図ごとの歌詞の画面占有率(幅 or 高さ×1.6 の平均、16:9 と 9:16)。\n"
      "   文字の大きさ=大きめ(MV) のとき L.planCut がこの値で構図の重みを変える */\n"
      "(() => { const L = window.LFC; if (!L) return; L.SIZE = " + json.dumps(tab, separators=(',', ':')) + "; })();\n")
open(sys.argv[2], 'w').write(js)
print(f'layouts={len(tab)} -> {sys.argv[2]}')
PY
rm -rf "$TMP"
