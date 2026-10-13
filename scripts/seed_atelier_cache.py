#!/usr/bin/env python3
"""VRM Atelier のアバター/モーションを LyricFlow の控え(DATA/atelier_cache)へ先に入れておく。

3Dダンスレイヤーは VRM Atelier から素材を読む。Atelier を起動していない時でも描けるよう、
プロジェクトが使っているファイルを Atelier のデータフォルダから(読むだけで)コピーする。

    python3 scripts/seed_atelier_cache.py [--atelier-data ~/manus/vrm-avatar-platform/data]

データの場所は server.py と同じ規則(LF_DATA_DIR → リポの .env → data/)。
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def data_dir():
    v = os.environ.get("LF_DATA_DIR")
    if not v:
        env = os.path.join(ROOT, ".env")
        if os.path.isfile(env):
            m = re.search(r"^LF_DATA_DIR=(.*)$", open(env, encoding="utf-8").read(), re.M)
            if m:
                v = m.group(1).strip().strip('"').strip("'")
    return os.path.abspath(os.path.expanduser(v or os.path.join(ROOT, "data")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--atelier-data", default="~/manus/vrm-avatar-platform/data")
    a = ap.parse_args()
    src_root = os.path.abspath(os.path.expanduser(a.atelier_data))
    data = data_dir()
    cache = os.path.join(data, "atelier_cache")
    os.makedirs(cache, exist_ok=True)
    con = sqlite3.connect(os.path.join(data, "lyricflow.db"), timeout=15)
    wanted = set()
    for (tj,) in con.execute("SELECT timeline_data_json FROM projects"):
        try:
            d = (json.loads(tj or "{}") or {}).get("dance") or {}
        except Exception:
            continue
        for k in ("vrm_url", "vmd_url"):
            u = d.get(k) or ""
            if "atelier/file" not in u:
                continue
            p = (urllib.parse.parse_qs(u.split("?", 1)[1]).get("path") or [""])[0]
            if re.match(r"^/files/(avatars|motions|thumbs)/[\w.-]+$", p):
                wanted.add(p)
    copied = missing = kept = 0
    for p in sorted(wanted):
        dst = os.path.join(cache, p.strip("/").replace("/", "__"))
        src = os.path.join(src_root, p[len("/files/"):])
        if os.path.isfile(dst):
            kept += 1
        elif os.path.isfile(src):
            shutil.copy2(src, dst)
            copied += 1
        else:
            missing += 1
            print("見つからない:", p)
    print(f"使われている素材 {len(wanted)} 件: コピー {copied} / 既にある {kept} / 見つからない {missing} → {cache}")


if __name__ == "__main__":
    main()
