#!/bin/bash
# LyricFlow 演出エンジン: コンタクトシート / スモークテスト
#   dev/compose/sheet.sh <group> <ids|all> [outdir] [sheet|smoke] [style]
#   group: layout enter hold exit decor treat cam trans style  (smoke は all も可)
#   出力: <outdir>/<group>_<id>.png と report.json(エラー・最遅フレーム)
set -e
GROUP=${1:-layout}; IDS=${2:-all}; OUT=${3:-/tmp/lfc_sheets}; MODE=${4:-sheet}; STYLE=${5:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# chrome-headless-shell は dump 後に正しく終了する(通常Chromeの --headless=new は終了しないため alarm で保険)
HS=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1)
CHROME=${HS:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
URL="file://$ROOT/dev/compose/sheet.html?group=$GROUP&ids=$IDS&mode=$MODE&style=$STYLE&bpm=${BPM:-}"
mkdir -p "$OUT"
TMP=$(mktemp -d /tmp/lfc_chrome.XXXXXX)
perl -e 'alarm 600; exec @ARGV' "$CHROME" --disable-gpu --no-sandbox --allow-file-access-from-files --hide-scrollbars \
  --virtual-time-budget=120000 --user-data-dir="$TMP" --dump-dom "$URL" > "$TMP/dom.html" 2>/dev/null || true
python3 - "$TMP/dom.html" "$OUT" "$GROUP" <<'PY'
import sys, re, base64, json, html, os
dom = open(sys.argv[1], encoding='utf-8', errors='replace').read()
out, group = sys.argv[2], sys.argv[3]
m = re.search(r'<pre id="report">(.*?)</pre>', dom, re.S)
rep = html.unescape(m.group(1)) if m else 'NO REPORT (page did not finish)'
n = 0
for pm in re.finditer(r'<pre class="png" data-id="([^"]+)">data:image/png;base64,([^<]+)</pre>', dom):
    pid, b64 = pm.group(1), pm.group(2)
    with open(os.path.join(out, f'{group}_{pid}.png'), 'wb') as f:
        f.write(base64.b64decode(b64))
    n += 1
with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
    f.write(rep)
print(f'sheets={n}  out={out}')
print(rep[:4000])
PY
rm -rf "$TMP"
