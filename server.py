#!/usr/bin/env python3
"""LyricFlow AI — 次世代AI動画クリエイティブSaaS (MVP server)

仕様書 spec_final.pdf に基づく実装:
- /api/v1/* REST API (JWT Bearer認証, エラーは {"error":{code,message}})
- 非同期AIジョブ (歌詞同期 / シーン解析 / 翻訳) + レンダリングジョブ (ffmpeg)
- ホワイトラベル外部API (X-API-Key)
標準ライブラリのみで動作。DB=SQLite, ファイル=ローカルストレージ。
"""
import base64, hashlib, hmac, json, math, mimetypes, os, random, re, secrets, shutil, sqlite3, struct, subprocess, tempfile, threading, time, urllib.request, urllib.parse, uuid, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
UPLOADS = os.path.join(DATA, "uploads")
RENDERS = os.path.join(DATA, "renders")
DB_PATH = os.path.join(DATA, "lyricflow.db")
STATIC = os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "4189"))
ACCESS_TTL = 3600           # 1時間 (仕様 2.1.1)
REFRESH_TTL = 30 * 86400    # 30日
# 仕様 9.1 サブスクリプションプラン / 2.3.1 ファイルサイズ上限 (Free 100MB, Pro以上 500MB)
PLAN_LIMITS = {
    "free":       {"projects": 5,    "storage": 1 << 30,   "exports_month": 3,    "ai_month": 3,    "max_res": 720,  "watermark": True,  "formats": ["mp4"],                  "brand_kit": False, "custom_font": False, "api_rate": 0,    "file_max": 100 << 20},
    "pro":        {"projects": None, "storage": 10 << 30,  "exports_month": None, "ai_month": None, "max_res": 2160, "watermark": False, "formats": ["mp4", "webm", "gif"],    "brand_kit": False, "custom_font": True,  "api_rate": 60,   "file_max": 500 << 20},
    "team":       {"projects": None, "storage": 100 << 30, "exports_month": None, "ai_month": None, "max_res": 2160, "watermark": False, "formats": ["mp4", "webm", "gif", "prores"], "brand_kit": True, "custom_font": True, "api_rate": 300,  "file_max": 500 << 20},
    "enterprise": {"projects": None, "storage": 1 << 40,   "exports_month": None, "ai_month": None, "max_res": 2160, "watermark": False, "formats": ["mp4", "webm", "gif", "prores"], "brand_kit": True, "custom_font": True, "api_rate": 1200, "file_max": 2000 << 20},
}
def plan_limits(plan):
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
RES_HEIGHTS = {"720p": 720, "1080p": 1080, "4k": 2160}

os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(RENDERS, exist_ok=True)

_secret_path = os.path.join(DATA, "secret.key")
if not os.path.exists(_secret_path):
    with open(_secret_path, "wb") as f:
        f.write(secrets.token_bytes(32))
SECRET = open(_secret_path, "rb").read()

FFMPEG = None
for p in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"):
    try:
        subprocess.run([p, "-version"], capture_output=True, timeout=5)
        FFMPEG = p
        break
    except Exception:
        continue

# ---------------------------------------------------------------- Whisper 強制アライメント (faster-whisper, 専用conda環境)
WHISPER_PY = next((p for p in [os.environ.get("WHISPER_PY", ""),
                               "/opt/homebrew/Caskroom/miniconda/base/envs/lyricflow-whisper/bin/python"]
                   if p and os.path.exists(p)), None)
WHISPER_SCRIPT = os.path.join(ROOT, "scripts", "whisper_align.py")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")   # smallは日本語の頭出し精度がbaseより高い

def whisper_available():
    return bool(WHISPER_PY and os.path.exists(WHISPER_SCRIPT))

def run_whisper_align(audio_path, lyrics_text, language, progress_cb=None, timeout=1800):
    """専用環境のfaster-whisperをサブプロセス実行し、歌詞をアライメントしたタイムスタンプを返す。"""
    if not whisper_available():
        raise RuntimeError("whisper未導入")
    with tempfile.TemporaryDirectory() as td:
        lf = os.path.join(td, "lyrics.txt")
        with open(lf, "w", encoding="utf-8") as f:
            f.write(lyrics_text)
        cmd = [WHISPER_PY, WHISPER_SCRIPT, audio_path, lf, language or "auto", WHISPER_MODEL]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        def pump():
            for line in proc.stderr:
                m = re.match(r"PROGRESS (\d+) (.*)", line.strip())
                if m and progress_cb:
                    try:
                        progress_cb(int(m.group(1)), m.group(2))
                    except Exception:
                        pass
        th = threading.Thread(target=pump, daemon=True)
        th.start()
        out = proc.stdout.read()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise RuntimeError("whisper タイムアウト")
        th.join(timeout=2)
        if proc.returncode != 0:
            raise RuntimeError("whisper 実行に失敗しました")
        js = [l for l in (out or "").strip().splitlines() if l.strip().startswith("{")]
        if not js:
            raise RuntimeError("whisper 出力が空です")
        return json.loads(js[-1])

# ---------------------------------------------------------------- Codex CLI (選択式AIエンジン)
CODEX_BIN = shutil.which("codex") or next(
    (p for p in ("/opt/homebrew/bin/codex", "/usr/local/bin/codex") if os.path.exists(p)), None)

def codex_available():
    return bool(CODEX_BIN)

def codex_json(prompt, schema, timeout=120):
    """codex exec を非対話・read-onlyサンドボックスで実行し、JSON Schemaに沿った出力を返す。
    副作用防止: read-onlyサンドボックス + 一時ディレクトリで実行。失敗時は例外(呼び出し側でbuiltinへフォールバック)。"""
    if not CODEX_BIN:
        raise RuntimeError("codex CLI が見つかりません")
    with tempfile.TemporaryDirectory() as td:
        schema_f = os.path.join(td, "schema.json")
        out_f = os.path.join(td, "out.json")
        with open(schema_f, "w") as f:
            json.dump(schema, f)
        cmd = [CODEX_BIN, "exec", "--skip-git-repo-check", "-s", "read-only", "--color", "never",
               "--output-schema", schema_f, "-o", out_f, prompt]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=td,
                           env={**os.environ, "RUST_LOG": "error"})
        if r.returncode != 0:
            raise RuntimeError("codex 実行に失敗: " + (r.stderr or "")[-300:])
        raw = ""
        if os.path.exists(out_f):
            raw = open(out_f).read().strip()
        if not raw:
            raw = (r.stdout or "").strip()
        # 念のため最初の JSON オブジェクトを抽出
        m = re.search(r"\{.*\}", raw, re.S)
        return json.loads(m.group(0) if m else raw)

# ---------------------------------------------------------------- DB
def db():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con

def _month_start():
    lt = time.localtime()
    return time.mktime((lt.tm_year, lt.tm_mon, 1, 0, 0, 0, 0, 0, -1))

def ws_plan(con, wid):
    r = con.execute("SELECT plan_type FROM workspaces WHERE id=?", (wid,)).fetchone()
    return r["plan_type"] if r else "free"

def usage_snapshot(con, wid):
    plan = ws_plan(con, wid)
    lim = plan_limits(plan)
    ms = _month_start()
    projects = con.execute("SELECT COUNT(*) c FROM projects WHERE workspace_id=? AND status!='archived'", (wid,)).fetchone()["c"]
    exports = con.execute("""SELECT COUNT(*) c FROM render_jobs r JOIN projects p ON p.id=r.project_id
                             WHERE p.workspace_id=? AND r.status='completed' AND r.created_at>=?""", (wid, ms)).fetchone()["c"]
    ai = con.execute("SELECT COUNT(*) c FROM ai_jobs WHERE workspace_id=? AND kind='sync-lyrics' AND created_at>=?", (wid, ms)).fetchone()["c"]
    used = con.execute("SELECT COALESCE(SUM(size_bytes),0) s FROM assets WHERE workspace_id=?", (wid,)).fetchone()["s"]
    return plan, lim, {"projects": projects, "exports_month": exports, "ai_month": ai, "storage": used}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  name TEXT NOT NULL, avatar_url TEXT, mfa_secret TEXT, mfa_enabled INTEGER DEFAULT 0,
  created_at REAL, updated_at REAL);
CREATE TABLE IF NOT EXISTS workspaces(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, plan_type TEXT NOT NULL DEFAULT 'pro',
  brand_kit_json TEXT, owner_user_id TEXT NOT NULL, created_at REAL);
CREATE TABLE IF NOT EXISTS workspace_users(
  workspace_id TEXT, user_id TEXT, role TEXT CHECK(role IN('Owner','Admin','Editor','Viewer')),
  PRIMARY KEY(workspace_id,user_id));
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','rendering','exported','archived')),
  timeline_data_json TEXT NOT NULL, aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  thumbnail_url TEXT, created_at REAL, updated_at REAL);
CREATE TABLE IF NOT EXISTS project_versions(
  id TEXT PRIMARY KEY, project_id TEXT, timeline_data_json TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS assets(
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT,
  type TEXT CHECK(type IN('audio','image','video','font')), url TEXT NOT NULL,
  filename TEXT NOT NULL, size_bytes INTEGER NOT NULL, metadata_json TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS ai_jobs(
  id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, kind TEXT,
  status TEXT DEFAULT 'pending', progress_pct INTEGER DEFAULT 0, stage TEXT,
  payload_json TEXT, result_json TEXT, error_message TEXT, created_at REAL, completed_at REAL);
CREATE TABLE IF NOT EXISTS render_jobs(
  id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN('pending','processing','completed','failed','cancelled')),
  output_settings_json TEXT, output_url TEXT, progress_pct INTEGER DEFAULT 0,
  error_message TEXT, created_at REAL, completed_at REAL);
CREATE TABLE IF NOT EXISTS templates(
  id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, author TEXT, preview_url TEXT,
  data_json TEXT, is_public INTEGER DEFAULT 1, price_usd REAL DEFAULT 0, rating REAL DEFAULT 4.5,
  sales INTEGER DEFAULT 0, created_at REAL);
CREATE TABLE IF NOT EXISTS api_keys(
  id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, key TEXT UNIQUE, created_at REAL, last_used_at REAL);
"""

# ---------------------------------------------------------------- auth helpers
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${h}"

def check_pw(pw, stored):
    try:
        salt, _ = stored.split("$", 1)
        return hmac.compare_digest(hash_pw(pw, salt), stored)
    except Exception:
        return False

def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def b64u_dec(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def make_token(user_id, kind="access"):
    ttl = ACCESS_TTL if kind == "access" else REFRESH_TTL
    payload = b64u(json.dumps({"sub": user_id, "typ": kind, "exp": time.time() + ttl}).encode())
    sig = b64u(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"

def verify_token(token, kind="access"):
    try:
        payload, sig = token.split(".")
        good = b64u(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(b64u_dec(payload))
        if data.get("typ") != kind or data.get("exp", 0) < time.time():
            return None
        return data["sub"]
    except Exception:
        return None

# ---------------------------------------------------------------- MFA (TOTP, RFC 6238)
def _b32(b):
    return base64.b32encode(b).decode().rstrip("=")

def _b32_dec(s):
    s = s.upper()
    return base64.b32decode(s + "=" * (-len(s) % 8))

def totp(secret_b32, t=None, step=30, digits=6):
    counter = int((t if t is not None else time.time()) // step)
    msg = struct.pack(">Q", counter)
    h = hmac.new(_b32_dec(secret_b32), msg, hashlib.sha1).digest()
    off = h[-1] & 0x0F
    code = (struct.unpack(">I", h[off:off + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)

def totp_verify(secret_b32, code, step=30):
    if not code:
        return False
    code = str(code).strip().replace(" ", "")
    now = time.time()
    return any(hmac.compare_digest(totp(secret_b32, now + off * step), code) for off in (-1, 0, 1))

# ---------------------------------------------------------------- rate limiting (external API)
_RATE = {}
_RATE_LOCK = threading.Lock()

def rate_check(key, limit_per_min):
    if not limit_per_min:
        return True, 0
    now = time.time()
    with _RATE_LOCK:
        q = _RATE.setdefault(key, [])
        cutoff = now - 60
        while q and q[0] < cutoff:
            q.pop(0)
        if len(q) >= limit_per_min:
            return False, int(60 - (now - q[0]))
        q.append(now)
        return True, 0

# ---------------------------------------------------------------- login brute-force lockout (仕様 8.3: 5回失敗で15分ロック)
_LOGIN_FAILS = {}
_LOGIN_LOCK = threading.Lock()
LOGIN_MAX_FAILS = 5
LOGIN_LOCK_SEC = 15 * 60

def login_locked(key):
    """返り値: ロック中なら残り秒数(>0)、そうでなければ0。"""
    now = time.time()
    with _LOGIN_LOCK:
        rec = _LOGIN_FAILS.get(key)
        if not rec:
            return 0
        fails, first = rec
        if now - first > LOGIN_LOCK_SEC:
            _LOGIN_FAILS.pop(key, None)
            return 0
        if fails >= LOGIN_MAX_FAILS:
            return int(LOGIN_LOCK_SEC - (now - first))
        return 0

def login_fail(key):
    now = time.time()
    with _LOGIN_LOCK:
        fails, first = _LOGIN_FAILS.get(key, (0, now))
        if now - first > LOGIN_LOCK_SEC:
            fails, first = 0, now
        _LOGIN_FAILS[key] = (fails + 1, first)

def login_reset(key):
    with _LOGIN_LOCK:
        _LOGIN_FAILS.pop(key, None)

# ---------------------------------------------------------------- language detection (依存なし)
def detect_language(text):
    counts = {"ja": 0, "ko": 0, "zh": 0, "ar": 0, "he": 0, "ru": 0, "la": 0}
    for ch in text:
        o = ord(ch)
        if 0x3040 <= o <= 0x30FF:
            counts["ja"] += 2               # かな = 日本語確定寄り
        elif 0xAC00 <= o <= 0xD7A3:
            counts["ko"] += 1
        elif 0x4E00 <= o <= 0x9FFF:
            counts["zh"] += 1               # 漢字 (日本語にも出る)
        elif 0x0600 <= o <= 0x06FF:
            counts["ar"] += 1
        elif 0x0590 <= o <= 0x05FF:
            counts["he"] += 1
        elif 0x0400 <= o <= 0x04FF:
            counts["ru"] += 1
        elif 0x41 <= (o & ~0x20) <= 0x5A:
            counts["la"] += 1
    if counts["ja"]:
        return "ja"
    if counts["zh"] and not counts["ko"]:
        return "zh"
    best = max(counts, key=counts.get)
    return best if counts[best] else "und"

RTL_LANGS = {"ar", "he", "fa", "ur"}

# ---------------------------------------------------------------- upload MIME sniffing (仕様 8.3 ファイルアップロード攻撃対策)
def sniff_kind(data, ext):
    """マジックバイトからファイル種別を推定し、拡張子から期待する種別と照合する。"""
    head = data[:16]
    detected = None
    if head[:3] == b"ID3" or head[:2] == b"\xff\xfb" or head[:2] == b"\xff\xf3" or head[:2] == b"\xff\xf2":
        detected = "audio"                                  # MP3
    elif head[:4] == b"RIFF" and data[8:12] == b"WAVE":
        detected = "audio"                                  # WAV
    elif head[:4] == b"\x00\x00\x00\x1c" or data[4:8] == b"ftyp":
        detected = "video" if ext in ("mp4", "m4a", "mov") else "audio"  # MP4/M4A container
        if ext == "m4a":
            detected = "audio"
    elif head[:4] == b"\x1aE\xdf\xa3":
        detected = "video"                                  # WebM/Matroska
    elif head[:8] == b"\x89PNG\r\n\x1a\n":
        detected = "image"                                  # PNG
    elif head[:3] == b"\xff\xd8\xff":
        detected = "image"                                  # JPEG
    elif head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        detected = "image"                                  # WebP
    elif head[:5] == b"<?xml" or head.lstrip()[:4] == b"<svg":
        detected = "image"                                  # SVG
    elif head[:4] in (b"\x00\x01\x00\x00", b"OTTO", b"true", b"ttcf"):
        detected = "font"                                   # TTF/OTF
    elif head[:4] == b"wOF2" or head[:4] == b"wOFF":
        detected = "font"                                   # WOFF/WOFF2
    return detected

# ---------------------------------------------------------------- AI engines
def _percentile(sorted_vals, q):
    if not sorted_vals:
        return 0.0
    i = min(len(sorted_vals) - 1, max(0, int(q * (len(sorted_vals) - 1))))
    return sorted_vals[i]

def detect_vocal_range(env, hop, duration):
    """RMSエンベロープから歌唱(高エネルギー持続)区間を推定する。"""
    if not env:
        return duration * 0.08, duration * 0.97
    s = sorted(env)
    thr = max(0.02, _percentile(s, 0.35))
    n = len(env)
    win = max(1, int(0.6 / hop))
    start_i, end_i = 0, n - 1
    for i in range(n - win):
        if all(env[j] >= thr for j in range(i, i + win)):
            start_i = i
            break
    for i in range(n - 1, win, -1):
        if all(env[j] >= thr * 0.8 for j in range(i - win, i)):
            end_i = i
            break
    st, en = start_i * hop, end_i * hop
    if en - st < duration * 0.3:
        st, en = duration * 0.08, duration * 0.97
    return round(st + 0.15, 2), round(min(en, duration), 2)

def split_words(line):
    """歌詞行を単語(チャンク)に分割。空白区切り優先、CJKは2文字チャンク。"""
    line = line.strip()
    if not line:
        return []
    if " " in line or "　" in line:
        return [w for w in re.split(r"[\s　]+", line) if w]
    if re.search(r"[぀-ヿ㐀-鿿]", line):
        chunks, i = [], 0
        while i < len(line):
            step = 3 if (i + 3 <= len(line) and len(line) - i != 4) else 2
            step = min(step, len(line) - i)
            chunks.append(line[i:i + step])
            i += step
        return chunks
    return [line]

def _smooth(env, win):
    n = len(env)
    out = []
    for i in range(n):
        a, b = max(0, i - win), min(n, i + win + 1)
        out.append(sum(env[a:b]) / (b - a))
    return out

def active_intervals(env, hop, duration):
    """エネルギーが立っている(=歌/演奏している)区間を検出。無音/間奏は除外する。"""
    if not env:
        return [(round(duration * 0.05, 2), round(duration * 0.97, 2))]
    sm = _smooth(env, max(1, int(0.15 / hop)))
    mx = max(sm) or 1
    sm = [v / mx for v in sm]
    thr = max(0.12, _percentile(sorted(sm), 0.45))
    active = [v >= thr for v in sm]
    n = len(active)
    min_gap = max(1, int(0.22 / hop))    # これ未満の谷は繋ぐ
    min_run = max(1, int(0.30 / hop))    # これ未満の山は捨てる
    j = 0
    while j < n:                          # 短い無音を埋める
        if not active[j]:
            k = j
            while k < n and not active[k]:
                k += 1
            if 0 < j and k < n and k - j < min_gap:
                for x in range(j, k):
                    active[x] = True
            j = k
        else:
            j += 1
    intervals, j = [], 0
    while j < n:
        if active[j]:
            k = j
            while k < n and active[k]:
                k += 1
            if k - j >= min_run:
                intervals.append((round(j * hop, 3), round(min(duration, k * hop), 3)))
            j = k
        else:
            j += 1
    if not intervals:
        intervals = [(round(duration * 0.05, 2), round(duration * 0.97, 2))]
    return intervals

def detect_onsets(env, hop):
    """エネルギーの立ち上がり(フレーズ/ビート/発声の頭)を検出。行頭スナップに使う。"""
    if not env:
        return []
    sm = _smooth(env, max(1, int(0.08 / hop)))
    mx = max(sm) or 1
    sm = [v / mx for v in sm]
    onsets, win = [], max(1, int(0.2 / hop))
    for i in range(1, len(sm)):
        base = sum(sm[max(0, i - win):i]) / max(1, min(i, win))
        if sm[i] - sm[i - 1] > 0.05 and sm[i] > base * 1.2 and sm[i] > 0.16:
            if not onsets or i * hop - onsets[-1] > 0.12:
                onsets.append(round(i * hop, 3))
    return onsets

def sync_lyrics_engine(lyrics_text, env, hop, duration):
    """Word-levelタイムスタンプ生成。無音/間奏を飛ばしアクティブ区間へ配分、行頭をオンセットにスナップ。
    ※本物のASRアライメント(Whisper/MFA)ではないため近似。正確な同期はタップ同期を推奨。"""
    lines = [l.strip() for l in lyrics_text.splitlines() if l.strip()]
    if not lines or duration <= 0:
        return []
    hop = hop or 0.1
    phrases = active_intervals(env or [], hop, duration)
    onsets = detect_onsets(env or [], hop)
    N, P = len(lines), len(phrases)

    def snap(tsec):                       # 近傍0.3s以内のオンセットへスナップ
        best, bd = None, 0.3
        for o in onsets:
            if abs(o - tsec) < bd:
                bd, best = abs(o - tsec), o
        return best if best is not None else tsec

    # 行↔フレーズを対応付け: フレーズが多ければ連続グループ化、少なければフレーズ内を分割
    line_span = []
    if P >= N:
        for i in range(N):
            gs, ge = i * P // N, (i + 1) * P // N
            ge = max(ge, gs + 1)
            line_span.append((phrases[gs][0], phrases[min(ge, P) - 1][1]))
    else:
        for i in range(N):
            pi = i * P // N
            s, e = phrases[pi]
            first = next(j for j in range(N) if j * P // N == pi)
            cnt = sum(1 for j in range(N) if j * P // N == pi)
            order = i - first
            seg = (e - s) / cnt
            line_span.append((s + order * seg, s + (order + 1) * seg))
    out = []
    for li, line in enumerate(lines):
        ls, le = line_span[li]
        ls = snap(ls)
        le = min(le, duration)
        if le <= ls:
            le = min(duration, ls + 1.2)
        words = split_words(line)
        wsum = sum(max(1, len(w)) for w in words) or 1
        gap = min(0.5, (le - ls) * 0.12)
        usable = (le - ls) - gap
        wt = ls
        for w in words:
            wd = usable * max(1, len(w)) / wsum
            out.append({"id": uuid.uuid4().hex[:8], "word": w, "line": li,
                        "start": round(wt, 2), "end": round(min(wt + wd, duration), 2)})
            wt += wd
    return out

def analyze_scene_engine(env, hop, duration):
    """エンベロープから曲構成 (Intro/Verse/Chorus/Bridge/Outro) を検出。"""
    if not env or duration <= 0:
        n = max(1, int(duration or 1))
        return [{"label": "Verse", "start": 0, "end": duration, "energy": 0.5}]
    hop = hop or 0.1
    win = max(1, int(1.6 / hop))
    sm = []
    for i in range(len(env)):
        a, b = max(0, i - win), min(len(env), i + win)
        sm.append(sum(env[a:b]) / (b - a))
    mx = max(sm) or 1
    sm = [v / mx for v in sm]
    qs = sorted(sm)
    hi = max(0.35, _percentile(qs, 0.70))
    lo = min(hi - 0.08, max(0.12, _percentile(qs, 0.30)))
    secs, cur, cur_start = [], None, 0.0
    def lvl(v):
        return "high" if v >= hi else ("low" if v < lo else "mid")
    for i, v in enumerate(sm):
        l = lvl(v)
        if cur is None:
            cur, cur_start = l, 0.0
        elif l != cur:
            t = i * hop
            if t - cur_start >= 3.0:
                secs.append([cur, cur_start, t])
                cur, cur_start = l, t
            else:
                cur = cur if (t - cur_start) < 1.2 else l
    secs.append([cur or "mid", cur_start, duration])
    out, chorus_n, verse_n = [], 0, 0
    for i, (l, s, e) in enumerate(secs):
        avg = sum(sm[int(s / hop):max(int(s / hop) + 1, int(e / hop))]) / max(1, int(e / hop) - int(s / hop))
        if i == 0 and l != "high":
            label = "Intro"
        elif i == len(secs) - 1 and l == "low":
            label = "Outro"
        elif l == "high":
            chorus_n += 1
            label = "Chorus"
        elif l == "low":
            label = "Bridge"
        else:
            verse_n += 1
            label = "Verse"
        if out and out[-1]["label"] == label:
            out[-1]["end"] = round(e, 2)
            out[-1]["energy"] = round((out[-1]["energy"] + avg) / 2, 3)
        else:
            out.append({"label": label, "start": round(s, 2), "end": round(e, 2), "energy": round(avg, 3)})
    return out

MOCK_DICT = {
    "星が降り注ぐ夜に": "On a night when stars pour down",
    "君の声が心を照らす": "Your voice lights up my heart",
    "遠く霞む街の灯り": "City lights blurred in the distance",
    "夢の先で僕らは出会う": "Beyond the dream, we will meet",
    "きらめきを集めて": "Gathering every sparkle",
    "夜空へ放つメロディー": "A melody released into the night sky",
    "何度でも歌うよ": "I will sing it again and again",
    "君に届くまで": "Until it reaches you",
}

def translate_engine(lyrics_text, target, engine="builtin"):
    lines = [l for l in lyrics_text.splitlines()]
    # Codexエンジン: 元の行順・空行を保ったまま自然な訳を返す
    if engine == "codex" and codex_available():
        try:
            nonblank = [l for l in lines if l.strip()]
            schema = {"type": "object", "properties": {"lines": {"type": "array", "items": {"type": "string"}}},
                      "required": ["lines"], "additionalProperties": False}
            prompt = ("You are a professional lyric translator. Translate each line below into natural, "
                      f"singable {target}. Preserve line order and count exactly. Return JSON "
                      '{"lines":[...]} with one entry per input line.\n\nLines:\n' + "\n".join(nonblank))
            res = codex_json(prompt, schema, timeout=120)
            it = iter(res.get("lines", []))
            merged = [next(it, "") if l.strip() else "" for l in lines]
            return merged, "codex"
        except Exception as e:
            print("  codex translate fallback:", e)
    key = os.environ.get("DEEPL_API_KEY")
    if key:
        try:
            body = json.dumps({"text": [l for l in lines if l.strip()], "target_lang": target.upper()}).encode()
            req = urllib.request.Request(
                "https://api-free.deepl.com/v2/translate", data=body,
                headers={"Authorization": f"DeepL-Auth-Key {key}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                res = json.loads(r.read())
            it = iter(t["text"] for t in res["translations"])
            return [next(it) if l.strip() else "" for l in lines], "deepl"
        except Exception:
            pass
    out = []
    for l in lines:
        if not l.strip():
            out.append("")
        elif target.lower().startswith("en") and l.strip() in MOCK_DICT:
            out.append(MOCK_DICT[l.strip()])
        else:
            out.append(f"[{target.upper()}] {l.strip()}")
    return out, "preview"

# ---------------------------------------------------------------- 演出提案 (Creative Director, 仕様 2.4 差別化機能)
SCENE_OPTS = ["city", "sky", "stars", "grid", "sunset", "stage", "flat"]
PARTICLE_OPTS = ["rain", "sakura", "snow", "stars", "embers", "none"]
ANIM_OPTS = ["glow-pop", "fade", "fade-up", "slide-up", "pop-scale", "glitch-in",
             "zoom-in", "drop-in", "rise-soft", "spin-in", "flip-in", "swing-in",
             "blur-in", "stretch-in", "typewriter", "cascade", "wave", "tumble"]
LETTERING_OPTS = ["neon", "outline", "marker", "brush", "chrome", "longshadow",
                  "gold", "gradient", "rainbow", "fire", "ice", "shadow3d",
                  "glitch", "retro", "sticker", "pill"]
ORIENT_OPTS = ["horizontal", "vertical"]

def suggest_direction(lyrics_text, mood="", engine="builtin"):
    """歌詞の雰囲気から背景シーン・配色・パーティクル・エフェクト強度を提案する。"""
    if engine == "codex" and codex_available():
        try:
            schema = {"type": "object", "additionalProperties": False,
                      "required": ["scene", "particles", "anim", "lettering", "orient", "colors", "fx", "rationale"],
                      "properties": {
                          "scene": {"type": "string", "enum": SCENE_OPTS},
                          "particles": {"type": "string", "enum": PARTICLE_OPTS},
                          "anim": {"type": "string", "enum": ANIM_OPTS},
                          "lettering": {"type": "string", "enum": LETTERING_OPTS},
                          "orient": {"type": "string", "enum": ORIENT_OPTS},
                          "colors": {"type": "object", "additionalProperties": False,
                                     "required": ["bg1", "bg2", "accent", "accent2", "text"],
                                     "properties": {k: {"type": "string"} for k in ("bg1", "bg2", "accent", "accent2", "text")}},
                          "fx": {"type": "object", "additionalProperties": False,
                                 "required": ["bloom", "glitch", "chroma", "wave", "godray", "flare", "dof"],
                                 "properties": {k: {"type": "number"} for k in ("bloom", "glitch", "chroma", "wave", "godray", "flare", "dof")}},
                          "rationale": {"type": "string"}}}
            prompt = ("You are an art director for cinematic anime-style lyric music videos. Based on the lyrics' mood, "
                      "design one cohesive visual look. Choose scene from " + str(SCENE_OPTS) +
                      " ('stage' = concert stage with spotlights), particles from " + str(PARTICLE_OPTS) +
                      ", lyric animation from " + str(ANIM_OPTS) + ", lettering style from " + str(LETTERING_OPTS) +
                      ", text orientation from " + str(ORIENT_OPTS) + " (vertical = Japanese tategaki, good for ballads). "
                      "Provide 5 hex colors (bg1/bg2 dark background gradient, accent & accent2 neon highlights, "
                      "text usually #ffffff) and fx intensities 0..1 (bloom, glitch, chroma, wave, godray=light shafts, "
                      "flare=lens flare, dof=depth of field). Write a one-sentence Japanese rationale. Return JSON only.\n\n"
                      + (f"Mood hint: {mood}\n" if mood else "") + "Lyrics:\n" + lyrics_text[:1500])
            res = codex_json(prompt, schema, timeout=120)
            res["engine"] = "codex"
            return res
        except Exception as e:
            print("  codex suggest fallback:", e)
    # builtin: 歌詞のキーワードからヒューリスティックに選ぶ
    t = lyrics_text
    def has(*ws):
        return any(w in t for w in ws)
    if has("桜", "春", "花", "はな"):
        pick = dict(scene="sky", particles="sakura", anim="fade-up",
                    colors=dict(bg1="#2b1530", bg2="#5a2a52", accent="#ff9ecf", accent2="#ffd6e8", text="#fff5fa"),
                    fx=dict(bloom=0.5, glitch=0.0, chroma=0.2, wave=0.2))
    elif has("雪", "冬", "白", "凍"):
        pick = dict(scene="sky", particles="snow", anim="fade-up",
                    colors=dict(bg1="#0a1526", bg2="#1d3a52", accent="#bfe3ff", accent2="#e8f6ff", text="#f4faff"),
                    fx=dict(bloom=0.45, glitch=0.0, chroma=0.15, wave=0.1))
    elif has("雨", "涙", "泣"):
        pick = dict(scene="city", particles="rain", anim="slide-up",
                    colors=dict(bg1="#050a18", bg2="#1a2340", accent="#6fb7ff", accent2="#7b8cff", text="#eef4ff"),
                    fx=dict(bloom=0.55, glitch=0.05, chroma=0.35, wave=0.25))
    elif has("星", "夜", "空", "宇宙"):
        pick = dict(scene="stars", particles="stars", anim="glow-pop",
                    colors=dict(bg1="#030722", bg2="#14104a", accent="#8ab4ff", accent2="#c3a6ff", text="#f0f4ff"),
                    fx=dict(bloom=0.7, glitch=0.05, chroma=0.3, wave=0.1))
    elif has("炎", "火", "熱", "燃"):
        pick = dict(scene="grid", particles="embers", anim="pop-scale",
                    colors=dict(bg1="#160500", bg2="#3d0f00", accent="#ff9d2e", accent2="#ff4e3a", text="#fff8f0"),
                    fx=dict(bloom=0.85, glitch=0.25, chroma=0.4, wave=0.2))
    else:
        pick = dict(scene="city", particles="rain", anim="glow-pop",
                    colors=dict(bg1="#050a18", bg2="#1a0b38", accent="#00d4ff", accent2="#7b2ff7", text="#ffffff"),
                    fx=dict(bloom=0.8, glitch=0.15, chroma=0.5, wave=0.0))
    pick["rationale"] = "歌詞のキーワードから雰囲気を推定し、配色とエフェクトを自動選定しました。"
    pick["engine"] = "builtin"
    return pick

# ---------------------------------------------------------------- job workers
def run_ai_job(job_id):
    con = db()
    job = con.execute("SELECT * FROM ai_jobs WHERE id=?", (job_id,)).fetchone()
    if not job:
        con.close()
        return
    payload = json.loads(job["payload_json"] or "{}")
    kind = job["kind"]

    def upd(pct, stage):
        con.execute("UPDATE ai_jobs SET status='processing',progress_pct=?,stage=? WHERE id=?", (pct, stage, job_id))
        con.commit()
        time.sleep(0.35)
    try:
        if kind == "sync-lyrics":
            engine = payload.get("engine", "builtin")
            result = None
            # Whisperエンジン: 実音声を認識して歌詞を強制アライメント (最も正確)
            if engine == "whisper" and whisper_available():
                aid = payload.get("audio_asset_id")
                arow = con.execute("SELECT url FROM assets WHERE id=?", (aid,)).fetchone() if aid else None
                apath = os.path.join(DATA, arow["url"].replace("/media/", "", 1).lstrip("/")) if arow else None
                if apath and os.path.exists(apath):
                    def wprog(p, st):
                        pc = db()
                        pc.execute("UPDATE ai_jobs SET status='processing',progress_pct=?,stage=? WHERE id=?", (p, st, job_id))
                        pc.commit()
                        pc.close()
                    try:
                        wr = run_whisper_align(apath, payload.get("lyrics_text", ""),
                                               payload.get("language"), progress_cb=wprog)
                        ts = wr.get("timestamps", [])
                        for w in ts:
                            w["id"] = uuid.uuid4().hex[:8]
                        result = {"timestamps": ts, "vocal_start": ts[0]["start"] if ts else 0,
                                  "vocal_end": ts[-1]["end"] if ts else 0,
                                  "language": wr.get("language"), "engine": "whisper"}
                    except Exception as e:
                        print("  whisper fallback:", e)
                else:
                    print("  whisper: audio not found, fallback")
            if result is None:               # builtinヒューリスティック (無音除外+オンセットスナップ)
                upd(20, "アクティブ区間検出")
                upd(55, "フレーズ対応付け")
                upd(80, "オンセットにスナップ")
                ts = sync_lyrics_engine(payload.get("lyrics_text", ""), payload.get("envelope"),
                                        payload.get("hop", 0.1), float(payload.get("duration", 0)))
                v_start, v_end = detect_vocal_range(payload.get("envelope") or [], payload.get("hop", 0.1),
                                                    float(payload.get("duration", 0)))
                lang = payload.get("language") or detect_language(payload.get("lyrics_text", ""))
                result = {"timestamps": ts, "vocal_start": v_start, "vocal_end": v_end, "language": lang, "engine": "builtin"}
        elif kind == "analyze-scene":
            upd(20, "BPM・スペクトル解析 (Librosa)")
            upd(60, "シーン境界検出")
            secs = analyze_scene_engine(payload.get("envelope"), payload.get("hop", 0.1),
                                        float(payload.get("duration", 0)))
            result = {"sections": secs}
        elif kind == "translate-lyrics":
            eng = payload.get("engine", "builtin")
            upd(30, "言語検出 (langdetect)")
            src_lang = detect_language(payload.get("lyrics_text", ""))
            upd(60, "AI翻訳 (Codex)" if eng == "codex" else "AI翻訳 (DeepL / GPT-4o)")
            target = payload.get("target", "en")
            lines, engine = translate_engine(payload.get("lyrics_text", ""), target, eng)
            result = {"lines": lines, "engine": engine, "target": target,
                      "source_language": src_lang, "rtl": target.split("-")[0].lower() in RTL_LANGS}
        elif kind == "suggest":
            eng = payload.get("engine", "builtin")
            upd(35, "歌詞のムード解析 (Codex)" if eng == "codex" else "歌詞のムード解析")
            upd(65, "配色・演出の設計")
            result = suggest_direction(payload.get("lyrics_text", ""), payload.get("mood", ""), eng)
        else:
            raise ValueError(f"unknown job kind {kind}")
        con.execute("UPDATE ai_jobs SET status='completed',progress_pct=100,stage='完了',result_json=?,completed_at=? WHERE id=?",
                    (json.dumps(result, ensure_ascii=False), time.time(), job_id))
        con.commit()
    except Exception as e:
        con.execute("UPDATE ai_jobs SET status='failed',error_message=? WHERE id=?", (str(e), job_id))
        con.commit()
    finally:
        con.close()

def run_render_job(job_id, src_path):
    con = db()
    job = con.execute("SELECT * FROM render_jobs WHERE id=?", (job_id,)).fetchone()
    if not job:
        con.close()
        return
    settings = json.loads(job["output_settings_json"] or "{}")
    fmt = settings.get("format", "mp4")
    ext = {"mp4": "mp4", "webm": "webm", "prores": "mov", "gif": "gif"}.get(fmt, "mp4")
    # 元音源を解決 (映像のみキャプチャ + サーバー側で高音質ミックス)
    audio_path = None
    if settings.get("mux_source_audio") and fmt != "gif":
        prj = con.execute("SELECT timeline_data_json FROM projects WHERE id=?", (job["project_id"],)).fetchone()
        if prj:
            aid = (json.loads(prj["timeline_data_json"]) or {}).get("audio_asset_id")
            if aid:
                arow = con.execute("SELECT url FROM assets WHERE id=?", (aid,)).fetchone()
                if arow:
                    ap = os.path.join(DATA, arow["url"].replace("/media/", "", 1).lstrip("/"))
                    if os.path.exists(ap):
                        audio_path = ap
    try:
        con.execute("UPDATE render_jobs SET status='processing',progress_pct=5 WHERE id=?", (job_id,))
        con.commit()
        out_name = f"{job_id}.{ext}"
        out_path = os.path.join(RENDERS, out_name)
        if not FFMPEG:
            out_name = f"{job_id}.webm"
            os.replace(src_path, os.path.join(RENDERS, out_name))
        else:
            dur = 0.0
            try:
                pr = subprocess.run([FFMPEG.replace("ffmpeg", "ffprobe"), "-v", "quiet", "-show_entries",
                                     "format=duration", "-of", "csv=p=0", src_path], capture_output=True, text=True, timeout=20)
                dur = float(pr.stdout.strip() or 0)
            except Exception:
                pass
            inputs = ["-i", src_path]
            maps, tail, ac = [], [], []
            if audio_path:
                inputs += ["-i", audio_path]
                maps = ["-map", "0:v:0", "-map", "1:a:0"]
                tail = ["-shortest"]
            if fmt == "prores":            # ProRes 422 HQ (映像制作ワークフロー, 仕様 2.6.2)
                vc = ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
                if audio_path:
                    ac = ["-c:a", "pcm_s16le"]
            elif fmt == "gif":             # SNSサムネイル用GIF (palettegenで高品質化)
                inputs = ["-i", src_path]; maps = []; tail = []
                vc = ["-vf", "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=224[p];[s1][p]paletteuse=dither=sierra2_4a",
                      "-an", "-loop", "0"]
            elif fmt == "webm":            # VP9はそのままコピーし音声のみ付与 (再エンコード無し=劣化なし)
                vc = ["-c:v", "copy"]
                if audio_path:
                    ac = ["-c:a", "libopus", "-b:a", "192k"]
            else:                          # MP4 H.264 (アニメ調に最適な -tune animation, 高品質CRF18)
                preset = "fast" if settings.get("height", 1080) >= 2160 else "medium"
                vc = ["-c:v", "libx264", "-preset", preset, "-crf", "18", "-tune", "animation",
                      "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
                if audio_path:
                    ac = ["-c:a", "aac", "-b:a", "256k"]
            cmd = [FFMPEG, "-y", *inputs, *maps, *vc, *ac, *tail, "-progress", "pipe:1", "-nostats", out_path]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            for line in proc.stdout:
                m = re.match(r"out_time_ms=(\d+)", line.strip())
                if m and dur > 0:
                    pct = min(97, int(int(m.group(1)) / 1_000_000 / dur * 100))
                    con.execute("UPDATE render_jobs SET progress_pct=? WHERE id=?", (pct, job_id))
                    con.commit()
                row = con.execute("SELECT status FROM render_jobs WHERE id=?", (job_id,)).fetchone()
                if row and row["status"] == "cancelled":
                    proc.kill()
                    con.close()
                    return
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError("ffmpeg変換に失敗しました")
            os.remove(src_path)
        con.execute("UPDATE render_jobs SET status='completed',progress_pct=100,output_url=?,completed_at=? WHERE id=?",
                    (f"/media/renders/{out_name}", time.time(), job_id))
        con.execute("UPDATE projects SET status='exported',updated_at=? WHERE id=?", (time.time(), job["project_id"]))
        con.commit()
    except Exception as e:
        con.execute("UPDATE render_jobs SET status='failed',error_message=? WHERE id=?", (str(e), job_id))
        con.commit()
    finally:
        con.close()

def resolve_project_audio(con, project_id):
    prj = con.execute("SELECT timeline_data_json FROM projects WHERE id=?", (project_id,)).fetchone()
    if not prj:
        return None
    aid = (json.loads(prj["timeline_data_json"]) or {}).get("audio_asset_id")
    if not aid:
        return None
    arow = con.execute("SELECT url FROM assets WHERE id=?", (aid,)).fetchone()
    if not arow:
        return None
    ap = os.path.join(DATA, arow["url"].replace("/media/", "", 1).lstrip("/"))
    return ap if os.path.exists(ap) else None

def run_frames_encode(job_id):
    """決定論的レンダリング: クライアントが1フレームずつ正確な時刻で描いて送ったJPEG連番を、
    ffmpegで高品質(H.264 crf16 / ProRes422 HQ 等)に無劣化エンコードし元音源をミックスする。
    リアルタイムキャプチャと違いフレーム落ち・ズレが原理的に無い。"""
    con = db()
    job = con.execute("SELECT * FROM render_jobs WHERE id=?", (job_id,)).fetchone()
    if not job:
        con.close()
        return
    settings = json.loads(job["output_settings_json"] or "{}")
    fmt = settings.get("format", "mp4")
    fps = float(settings.get("fps", 30)) or 30
    ext = {"mp4": "mp4", "webm": "webm", "prores": "mov", "gif": "gif"}.get(fmt, "mp4")
    frames_dir = os.path.join(RENDERS, f"frames_{job_id}")
    out_name = f"{job_id}.{ext}"
    out_path = os.path.join(RENDERS, out_name)
    audio_path = resolve_project_audio(con, job["project_id"]) if fmt != "gif" else None
    try:
        con.execute("UPDATE render_jobs SET status='processing' WHERE id=?", (job_id,))
        con.commit()
        n = len([f for f in os.listdir(frames_dir) if f.endswith(".jpg")]) if os.path.isdir(frames_dir) else 0
        if not FFMPEG or n == 0:
            raise RuntimeError("フレームがありません" if n == 0 else "ffmpegが見つかりません")
        dur = n / fps
        inputs = ["-framerate", str(fps), "-i", os.path.join(frames_dir, "%06d.jpg")]
        maps, ac, tail = [], [], []
        if audio_path:
            inputs += ["-i", audio_path]
            maps = ["-map", "0:v:0", "-map", "1:a:0"]
            tail = ["-shortest"]
        if fmt == "prores":
            vc = ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
            if audio_path:
                ac = ["-c:a", "pcm_s16le"]
        elif fmt == "gif":
            inputs = ["-framerate", str(fps), "-i", os.path.join(frames_dir, "%06d.jpg")]
            maps = []; tail = []
            vc = ["-vf", "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=224[p];[s1][p]paletteuse=dither=sierra2_4a",
                  "-loop", "0"]
        elif fmt == "webm":
            vc = ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "24", "-pix_fmt", "yuv420p", "-row-mt", "1"]
            if audio_path:
                ac = ["-c:a", "libopus", "-b:a", "192k"]
        else:                          # MP4 H.264 高品質 (crf16, アニメ向けtune)
            preset = "medium" if settings.get("height", 1080) < 2160 else "faster"
            vc = ["-c:v", "libx264", "-preset", preset, "-crf", "16", "-tune", "animation",
                  "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
            if audio_path:
                ac = ["-c:a", "aac", "-b:a", "320k"]
        cmd = [FFMPEG, "-y", *inputs, *maps, *vc, *ac, *tail, "-progress", "pipe:1", "-nostats", out_path]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        for line in proc.stdout:
            m = re.match(r"out_time_ms=(\d+)", line.strip())
            if m and dur > 0:
                pct = min(99, int(int(m.group(1)) / 1_000_000 / dur * 100))
                con.execute("UPDATE render_jobs SET progress_pct=? WHERE id=?", (pct, job_id))
                con.commit()
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError("ffmpegエンコードに失敗しました")
        con.execute("UPDATE render_jobs SET status='completed',progress_pct=100,output_url=?,completed_at=? WHERE id=?",
                    (f"/media/renders/{out_name}", time.time(), job_id))
        con.execute("UPDATE projects SET status='exported',updated_at=? WHERE id=?", (time.time(), job["project_id"]))
        con.commit()
    except Exception as e:
        con.execute("UPDATE render_jobs SET status='failed',error_message=? WHERE id=?", (str(e), job_id))
        con.commit()
    finally:
        con.close()
        try:
            shutil.rmtree(frames_dir, ignore_errors=True)   # フレーム連番を掃除
        except Exception:
            pass

# ---------------------------------------------------------------- demo song synthesis
def synth_demo_song(path):
    """デモ用のオリジナル楽曲(約42秒, J-POP進行 IV-V-iii-vi)をWAVで生成。"""
    sr = 44100
    bpm = 112.0
    beat = 60.0 / bpm
    bar = beat * 4
    bars = 20  # intro4 + verse8 + chorus8
    total = bar * bars
    n = int(sr * total)
    left = [0.0] * n
    right = [0.0] * n
    NOTE = {k: 440.0 * 2 ** ((i - 9) / 12) for i, k in enumerate(
        ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
    def freq(name, octv):
        return NOTE[name] * 2 ** (octv - 4)
    CHORDS = [("F", ["F", "A", "C"]), ("G", ["G", "B", "D"]), ("E", ["E", "G", "B"]), ("A", ["A", "C", "E"])]
    def add_tone(start, dur, f, amp, pan=0.5, shape="sine", attack=0.02, decay=None):
        s0 = int(start * sr)
        nd = int(dur * sr)
        decay = decay if decay is not None else dur
        for i in range(nd):
            t = i / sr
            if shape == "sine":
                v = math.sin(2 * math.pi * f * t)
            elif shape == "tri":
                v = 2 / math.pi * math.asin(math.sin(2 * math.pi * f * t))
            else:
                v = math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t)
            env = min(1.0, t / attack) * math.exp(-t / max(0.05, decay))
            idx = s0 + i
            if 0 <= idx < n:
                sm = v * amp * env
                left[idx] += sm * (1 - pan)
                right[idx] += sm * pan
    def kick(start):
        s0 = int(start * sr)
        for i in range(int(0.14 * sr)):
            t = i / sr
            f = 120 * math.exp(-t * 26) + 44
            v = math.sin(2 * math.pi * f * t) * math.exp(-t * 17) * 0.85
            if s0 + i < n:
                left[s0 + i] += v
                right[s0 + i] += v
    rnd = random.Random(7)
    def hat(start, amp=0.12):
        s0 = int(start * sr)
        for i in range(int(0.03 * sr)):
            v = (rnd.random() * 2 - 1) * amp * math.exp(-i / sr * 220)
            if s0 + i < n:
                left[s0 + i] += v * 0.7
                right[s0 + i] += v
    for b in range(bars):
        t0 = b * bar
        section = "intro" if b < 4 else ("verse" if b < 12 else "chorus")
        _, tones = CHORDS[b % 4]
        pad_amp = {"intro": 0.10, "verse": 0.13, "chorus": 0.17}[section]
        for ti, tn in enumerate(tones):
            add_tone(t0, bar, freq(tn, 4) * (1.0015 if ti == 1 else 1), pad_amp, 0.35 + 0.3 * ti / 2, "rich", 0.4, bar * 1.5)
        add_tone(t0, bar, freq(tones[0], 2), 0.20 if section != "intro" else 0.12, 0.5, "sine", 0.02, bar)
        if section != "intro":
            for step in range(8):
                st = t0 + step * beat / 2
                tn = tones[step % 3]
                add_tone(st, beat / 2 * 0.9, freq(tn, 5), 0.10 if section == "verse" else 0.13,
                         0.25 + 0.5 * (step % 2), "tri", 0.01, 0.28)
        if section == "chorus":
            mel = [(0, tones[2], 5), (1, tones[1], 5), (2, tones[0], 5), (3, tones[2], 5)]
            for (bt, tn, ov) in mel:
                add_tone(t0 + bt * beat, beat * 0.92, freq(tn, ov) * 2, 0.11, 0.5, "rich", 0.03, 0.5)
        if section != "intro":
            for bt in range(4):
                kick(t0 + bt * beat)
                hat(t0 + bt * beat + beat / 2, 0.10 if section == "verse" else 0.16)
            if section == "chorus":
                hat(t0 + 3 * beat + beat * 0.75, 0.14)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right)) or 1
    g = 0.88 / peak
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = bytearray()
        for i in range(n):
            frames += struct.pack("<hh", int(left[i] * g * 32767), int(right[i] * g * 32767))
        w.writeframes(bytes(frames))
    return total

def wav_envelope(path, hop=0.1):
    with wave.open(path, "rb") as w:
        sr, ch, nf = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = w.readframes(nf)
    step = int(sr * hop)
    env = []
    total = nf
    for s in range(0, total, step):
        e = min(total, s + step)
        acc = 0.0
        cnt = 0
        for i in range(s, e, max(1, (e - s) // 200)):
            v = struct.unpack_from("<h", raw, i * ch * 2)[0] / 32768.0
            acc += v * v
            cnt += 1
        env.append(math.sqrt(acc / max(1, cnt)))
    return env

# ---------------------------------------------------------------- built-in templates
BUILTIN_TEMPLATES = [
    ("tpl-neon-city", "Neon City", "lyricflow", 0, {"scene": "city", "particles": "rain", "anim": "glow-pop",
        "colors": {"bg1": "#050a18", "bg2": "#1a0b38", "accent": "#00d4ff", "accent2": "#7b2ff7", "text": "#ffffff"},
        "font": "'Noto Sans JP', sans-serif", "fx": {"bloom": 0.8, "glitch": 0.15, "chroma": 0.5, "wave": 0}}),
    ("tpl-sakura-rain", "Sakura Rain", "hanami.studio", 15, {"scene": "sky", "particles": "sakura", "anim": "fade-up",
        "colors": {"bg1": "#2b1530", "bg2": "#5a2a52", "accent": "#ff9ecf", "accent2": "#ffd6e8", "text": "#fff5fa"},
        "font": "'Noto Serif JP', serif", "fx": {"bloom": 0.5, "glitch": 0, "chroma": 0.2, "wave": 0.2}}),
    ("tpl-cyberpunk", "Cyberpunk Glitch", "neonworks", 24, {"scene": "grid", "particles": "embers", "anim": "glitch-in",
        "colors": {"bg1": "#0a0014", "bg2": "#26003a", "accent": "#ff2d95", "accent2": "#00f0ff", "text": "#ffffff"},
        "font": "'Noto Sans JP', sans-serif", "fx": {"bloom": 0.9, "glitch": 0.7, "chroma": 0.9, "wave": 0.15}}),
    ("tpl-minimal-dark", "Minimal Dark", "void.design", 12, {"scene": "flat", "particles": "none", "anim": "fade",
        "colors": {"bg1": "#0d1117", "bg2": "#161b26", "accent": "#e6edf3", "accent2": "#8b949e", "text": "#e6edf3"},
        "font": "'Noto Sans JP', sans-serif", "fx": {"bloom": 0.15, "glitch": 0, "chroma": 0, "wave": 0}}),
    ("tpl-starry-night", "Starry Night", "synthwave.kai", 19, {"scene": "stars", "particles": "stars", "anim": "pop-scale",
        "colors": {"bg1": "#030722", "bg2": "#14104a", "accent": "#8ab4ff", "accent2": "#c3a6ff", "text": "#f0f4ff"},
        "font": "'Noto Serif JP', serif", "fx": {"bloom": 0.7, "glitch": 0.05, "chroma": 0.3, "wave": 0.1}}),
    ("tpl-midnight-wave", "Midnight Wave", "lyricflow", 0, {"scene": "sunset", "particles": "stars", "anim": "slide-up",
        "colors": {"bg1": "#12041f", "bg2": "#4a1259", "accent": "#ff7edb", "accent2": "#36d1ff", "text": "#ffffff"},
        "font": "'Noto Sans JP', sans-serif", "fx": {"bloom": 0.6, "glitch": 0.1, "chroma": 0.5, "wave": 0.6}}),
    ("tpl-snow-memory", "Snow Memory", "fuyu.works", 9, {"scene": "sky", "particles": "snow", "anim": "fade-up",
        "colors": {"bg1": "#0a1526", "bg2": "#1d3a52", "accent": "#bfe3ff", "accent2": "#e8f6ff", "text": "#f4faff"},
        "font": "'Noto Serif JP', serif", "fx": {"bloom": 0.45, "glitch": 0, "chroma": 0.15, "wave": 0.1}}),
    ("tpl-ember-beat", "Ember Beat", "hibana", 21, {"scene": "grid", "particles": "embers", "anim": "pop-scale",
        "colors": {"bg1": "#160500", "bg2": "#3d0f00", "accent": "#ff9d2e", "accent2": "#ff4e3a", "text": "#fff8f0"},
        "font": "'Noto Sans JP', sans-serif", "fx": {"bloom": 0.85, "glitch": 0.25, "chroma": 0.4, "wave": 0.2}}),
    ("tpl-cinematic-stage", "Cinematic Stage", "lyricflow", 0, {"scene": "stage", "particles": "embers", "anim": "glow-pop",
        "lettering": "chrome", "orient": "horizontal",
        "colors": {"bg1": "#04060e", "bg2": "#140a2e", "accent": "#5fd0ff", "accent2": "#b98cff", "text": "#ffffff"},
        "font": "'Noto Serif JP', serif", "fx": {"bloom": 0.9, "glitch": 0.05, "chroma": 0.35, "wave": 0.1, "godray": 0.7, "flare": 0.5, "dof": 0.5}}),
    ("tpl-tategaki-ballad", "縦書きバラード", "lyricflow", 0, {"scene": "sky", "particles": "snow", "anim": "fade-up",
        "lettering": "brush", "orient": "vertical",
        "colors": {"bg1": "#0a1020", "bg2": "#231a3a", "accent": "#cbb8ff", "accent2": "#8ab4ff", "text": "#f4f0ff"},
        "font": "'Noto Serif JP', serif", "fx": {"bloom": 0.55, "glitch": 0, "chroma": 0.15, "wave": 0.1, "godray": 0.35, "flare": 0.2, "dof": 0.55}}),
]

DEMO_LYRICS = "星が降り注ぐ夜に\n君の声が心を照らす\n遠く霞む街の灯り\n夢の先で僕らは出会う\nきらめきを集めて\n夜空へ放つメロディー\n何度でも歌うよ\n君に届くまで"

def ensure_builtin_templates(con):
    """既存DBにも新しいビルトインテンプレートを冪等に追加する。"""
    now = time.time()
    for tid, title, author, price, cfg in BUILTIN_TEMPLATES:
        row = con.execute("SELECT 1 FROM templates WHERE id=?", (tid,)).fetchone()
        if not row:
            con.execute("INSERT INTO templates VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (tid, None, title, author, None, json.dumps(cfg), 1, price,
                         round(4.2 + (hash(tid) % 8) / 10, 1), 40 + hash(title) % 300, now))
    con.commit()

def seed():
    con = db()
    con.executescript(SCHEMA)
    if con.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]:
        ensure_builtin_templates(con)   # 既存DBにも新テンプレを反映
        con.close()
        return
    now = time.time()
    uid, wid = str(uuid.uuid4()), str(uuid.uuid4())
    con.execute("INSERT INTO users(id,email,password_hash,name,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (uid, "demo@lyricflow.app", hash_pw("demo1234"), "Kaito", None, now, now))
    con.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?)",
                (wid, "Demo Studio", "team",
                 json.dumps({"logo_text": "LF", "primary": "#00d4ff", "secondary": "#7b2ff7",
                             "accent": "#ff7edb", "font": "'Noto Sans JP', sans-serif"}), uid, now))
    con.execute("INSERT INTO workspace_users VALUES(?,?,?)", (wid, uid, "Owner"))
    for m_email, m_name, role in [("hanako@lyricflow.app", "Hanako Suzuki", "Editor"),
                                  ("kenji@lyricflow.app", "Kenji Tanaka", "Viewer")]:
        mid = str(uuid.uuid4())
        con.execute("INSERT INTO users(id,email,password_hash,name,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", (mid, m_email, hash_pw("demo1234"), m_name, None, now, now))
        con.execute("INSERT INTO workspace_users VALUES(?,?,?)", (wid, mid, role))
    for tid, title, author, price, cfg in BUILTIN_TEMPLATES:
        con.execute("INSERT INTO templates VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (tid, None, title, author, None, json.dumps(cfg), 1, price,
                     round(4.2 + (hash(tid) % 8) / 10, 1), 40 + hash(title) % 300, now))
    # デモ楽曲を合成してサンプルプロジェクトを構築
    song_path = os.path.join(UPLOADS, "demo_song.wav")
    duration = synth_demo_song(song_path)
    env = wav_envelope(song_path)
    aid = str(uuid.uuid4())
    con.execute("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)",
                (aid, wid, None, "audio", "/media/uploads/demo_song.wav", "星空のメロディー.wav",
                 os.path.getsize(song_path),
                 json.dumps({"duration": round(duration, 2), "envelope": [round(v, 4) for v in env], "hop": 0.1}), now))
    ts = sync_lyrics_engine(DEMO_LYRICS, env, 0.1, duration)
    sections = analyze_scene_engine(env, 0.1, duration)
    tpl = BUILTIN_TEMPLATES[0][4]
    timeline = {
        "duration": round(duration, 2), "template": "tpl-neon-city", "audio_asset_id": aid,
        "sceneDefault": tpl["scene"],
        "lyrics_text": DEMO_LYRICS, "language": "ja",
        "lyricStyle": {"font": tpl["font"], "size": 64, "color": "#ffffff", "anim": "glow-pop", "glow": 0.8},
        "tracks": {"lyrics": ts,
                   "background": [{"id": "bg1", "start": 0, "end": round(duration, 2), "scene": tpl["scene"]}],
                   "effects": [{"id": "fx1", "type": "bloom", "start": 0, "end": round(duration, 2), "intensity": 0.8}],
                   "overlay": [{"id": "ov1", "type": "text", "text": "星空のメロディー", "x": 0.5, "y": 0.12,
                                "start": 0.5, "end": 5.5, "size": 34, "color": "#00d4ff"}]},
        "scenes": sections, "fx": tpl["fx"], "colors": tpl["colors"], "particles": tpl["particles"],
        "watermark": False,
    }
    pid = str(uuid.uuid4())
    con.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?)",
                (pid, wid, "星空のメロディー", "draft", json.dumps(timeline, ensure_ascii=False), "16:9", None, now, now))
    con.execute("INSERT INTO api_keys VALUES(?,?,?,?,?,?)",
                (str(uuid.uuid4()), wid, "Default Key", "lfk_" + secrets.token_hex(20), now, None))
    con.commit()
    con.close()
    print(f"  seeded demo data (song {duration:.1f}s)")

# ---------------------------------------------------------------- multipart parser
def parse_multipart(body, content_type):
    m = re.search(r"boundary=([^;]+)", content_type)
    if not m:
        return {}, {}
    boundary = m.group(1).strip('"').encode()
    fields, files = {}, {}
    for part in body.split(b"--" + boundary):
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if b"\r\n\r\n" not in part:
            continue
        head, content = part.split(b"\r\n\r\n", 1)
        head_s = head.decode(errors="replace")
        nm = re.search(r'name="([^"]*)"', head_s)
        fn = re.search(r'filename="([^"]*)"', head_s)
        if not nm:
            continue
        if fn:
            files[nm.group(1)] = {"filename": fn.group(1), "data": content}
        else:
            fields[nm.group(1)] = content.decode(errors="replace")
    return fields, files

# ---------------------------------------------------------------- HTTP handler
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    # ---- plumbing
    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def err(self, code, ecode, msg):
        self.send_json({"error": {"code": ecode, "message": msg}}, code)

    def body(self):
        ln = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(ln) if ln else b""

    def json_body(self):
        try:
            return json.loads(self.body() or b"{}")
        except Exception:
            return {}

    def auth_user(self):
        h = self.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            return verify_token(h[7:])
        return None

    def api_key_ws(self):
        key = self.headers.get("X-API-Key", "")
        if not key:
            return None
        con = db()
        row = con.execute("SELECT workspace_id FROM api_keys WHERE key=?", (key,)).fetchone()
        if row:
            con.execute("UPDATE api_keys SET last_used_at=? WHERE key=?", (time.time(), key))
            con.commit()
        con.close()
        return row["workspace_id"] if row else None

    # ---- routing
    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        try:
            path = self.path.split("?")[0]
            if path.startswith("/api/"):
                self.handle_api(method, path)
            elif method == "GET" and path.startswith("/media/"):
                self.serve_file(os.path.join(DATA, path[len("/media/"):]))
            elif method == "GET":
                self.serve_static(path)
            else:
                self.err(404, "not_found", "not found")
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                self.err(500, "internal", str(e))
            except Exception:
                pass

    def serve_file(self, fpath):
        fpath = os.path.abspath(fpath)
        if not fpath.startswith(DATA) or not os.path.isfile(fpath):
            return self.err(404, "not_found", "file not found")
        ctype = mimetypes.guess_type(fpath)[0] or "application/octet-stream"
        size = os.path.getsize(fpath)
        rng = self.headers.get("Range")
        with open(fpath, "rb") as f:
            if rng:
                m = re.match(r"bytes=(\d*)-(\d*)", rng)
                start = int(m.group(1) or 0)
                end = int(m.group(2) or size - 1)
                end = min(end, size - 1)
                f.seek(start)
                chunk = f.read(end - start + 1)
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(chunk)))
                self.end_headers()
                self.wfile.write(chunk)
            else:
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(size))
                self.end_headers()
                while True:
                    chunk = f.read(1 << 16)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        fpath = os.path.abspath(os.path.join(STATIC, path.lstrip("/")))
        if not fpath.startswith(STATIC) or not os.path.isfile(fpath):
            fpath = os.path.join(STATIC, "index.html")  # SPA fallback
        ctype = mimetypes.guess_type(fpath)[0] or "text/html"
        with open(fpath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- API
    def handle_api(self, method, path):
        seg = path.strip("/").split("/")  # ['api','v1',...]
        if len(seg) < 3 or seg[0] != "api" or seg[1] != "v1":
            return self.err(404, "not_found", "unknown endpoint")
        s = seg[2:]
        con = db()
        try:
            # ---------- auth ----------
            if s[0] == "auth":
                b = self.json_body()
                if s[1] == "register" and method == "POST":
                    email, pw, name = (b.get("email") or "").strip().lower(), b.get("password") or "", (b.get("name") or "").strip()
                    if not email or len(pw) < 8 or not name:
                        return self.err(400, "invalid_input", "メール・8文字以上のパスワード・名前が必要です")
                    if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                        return self.err(409, "email_taken", "このメールアドレスは登録済みです")
                    now = time.time()
                    uid, wid = str(uuid.uuid4()), str(uuid.uuid4())
                    con.execute("INSERT INTO users(id,email,password_hash,name,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", (uid, email, hash_pw(pw), name, None, now, now))
                    con.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?)",
                                (wid, f"{name} の Workspace", "free", None, uid, now))
                    con.execute("INSERT INTO workspace_users VALUES(?,?,?)", (wid, uid, "Owner"))
                    con.commit()
                    return self.send_json({"access_token": make_token(uid), "refresh_token": make_token(uid, "refresh"),
                                           "user": {"id": uid, "email": email, "name": name}})
                if s[1] == "login" and method == "POST":
                    email = (b.get("email") or "").strip().lower()
                    lock_key = f"{self.client_address[0]}|{email}"
                    locked = login_locked(lock_key)         # 仕様 8.3: 5回失敗で15分ロック
                    if locked:
                        return self.err(429, "account_locked",
                                        f"ログイン試行が上限を超えました。約{(locked + 59) // 60}分後に再試行してください。")
                    row = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
                    if not row or not check_pw(b.get("password") or "", row["password_hash"] or ""):
                        login_fail(lock_key)
                        return self.err(401, "invalid_credentials", "メールアドレスまたはパスワードが違います")
                    if row["mfa_enabled"]:                # 仕様 2.1.1: TOTP多要素認証
                        code = b.get("mfa_code")
                        if not code:
                            return self.send_json({"mfa_required": True})
                        if not totp_verify(row["mfa_secret"], code):
                            login_fail(lock_key)
                            return self.err(401, "invalid_mfa", "認証コードが正しくありません")
                    login_reset(lock_key)
                    return self.send_json({"access_token": make_token(row["id"]), "refresh_token": make_token(row["id"], "refresh"),
                                           "user": {"id": row["id"], "email": row["email"], "name": row["name"]}})
                if s[1] == "refresh" and method == "POST":
                    uid = verify_token(b.get("refresh_token") or "", "refresh")
                    if not uid:
                        return self.err(401, "invalid_token", "リフレッシュトークンが無効です")
                    return self.send_json({"access_token": make_token(uid)})
                if s[1] == "logout" and method == "POST":
                    return self.send_json({"ok": True})
                return self.err(404, "not_found", "unknown auth endpoint")

            # ---------- external (X-API-Key) ----------
            if s[0] == "external":
                wid = self.api_key_ws()
                if not wid:
                    return self.err(401, "invalid_api_key", "X-API-Key が無効です")
                # 仕様 6.6 / 2.7.2: プラン別レート制限 (サブスクAPIとは独立)
                ok, retry = rate_check("apikey:" + self.headers.get("X-API-Key", ""),
                                       plan_limits(ws_plan(con, wid))["api_rate"])
                if not ok:
                    self.send_response(429)
                    self.send_header("Retry-After", str(retry))
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    body = json.dumps({"error": {"code": "rate_limited", "message": f"レート制限を超えました。{retry}秒後に再試行してください。"}}).encode()
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if s[1] == "templates" and method == "GET":
                    rows = con.execute("SELECT id,title,author,price_usd,data_json FROM templates WHERE is_public=1").fetchall()
                    return self.send_json({"templates": [{"id": r["id"], "title": r["title"], "author": r["author"],
                                                          "price_usd": r["price_usd"]} for r in rows]})
                if s[1] == "generate-video" and method == "POST":
                    b = self.json_body()
                    tpl = con.execute("SELECT * FROM templates WHERE id=?", (b.get("template_id"),)).fetchone()
                    if not tpl:
                        return self.err(404, "template_not_found", "テンプレートが見つかりません")
                    jid = str(uuid.uuid4())
                    payload = {"lyrics_text": b.get("lyrics_text", ""), "duration": float(b.get("duration", 30)),
                               "language": b.get("language", "ja")}
                    con.execute("INSERT INTO ai_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                                (jid, wid, None, "sync-lyrics", "pending", 0, None,
                                 json.dumps(payload, ensure_ascii=False), None, None, time.time(), None))
                    con.commit()
                    threading.Thread(target=run_ai_job, args=(jid,), daemon=True).start()
                    return self.send_json({"job_id": jid}, 202)
                if s[1] == "jobs" and len(s) > 2 and method == "GET":
                    row = con.execute("SELECT * FROM ai_jobs WHERE id=? AND workspace_id=?", (s[2], wid)).fetchone()
                    if not row:
                        return self.err(404, "job_not_found", "ジョブが見つかりません")
                    return self.send_json({"status": row["status"], "progress_pct": row["progress_pct"],
                                           "result": json.loads(row["result_json"] or "null")})
                return self.err(404, "not_found", "unknown external endpoint")

            # ---------- authenticated ----------
            uid = self.auth_user()
            if not uid:
                return self.err(401, "unauthorized", "認証が必要です")

            def ws_role(wid):
                r = con.execute("SELECT role FROM workspace_users WHERE workspace_id=? AND user_id=?", (wid, uid)).fetchone()
                return r["role"] if r else None

            if s[0] == "me" and method == "GET":
                u = con.execute("SELECT id,email,name,mfa_enabled FROM users WHERE id=?", (uid,)).fetchone()
                wss = con.execute("""SELECT w.*, wu.role FROM workspaces w
                                     JOIN workspace_users wu ON wu.workspace_id=w.id WHERE wu.user_id=?""", (uid,)).fetchall()
                out = []
                for w in wss:
                    plan, lim, usage = usage_snapshot(con, w["id"])
                    out.append({"id": w["id"], "name": w["name"], "plan_type": plan, "role": w["role"],
                                "brand_kit": json.loads(w["brand_kit_json"] or "null"), "storage_used": usage["storage"],
                                "storage_limit": lim["storage"], "limits": lim, "usage": usage})
                return self.send_json({"user": {"id": u["id"], "email": u["email"], "name": u["name"],
                                                "mfa_enabled": bool(u["mfa_enabled"])},
                                       "workspaces": out, "ffmpeg": bool(FFMPEG), "codex_available": codex_available(),
                                       "whisper_available": whisper_available()})

            # ---------- MFA (TOTP) ----------
            if s[0] == "mfa":
                urow = con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
                if len(s) == 2 and s[1] == "setup" and method == "POST":
                    secret = _b32(secrets.token_bytes(20))
                    con.execute("UPDATE users SET mfa_secret=? WHERE id=?", (secret, uid))
                    con.commit()
                    label = urllib.parse.quote(f"LyricFlow AI:{urow['email']}")
                    uri = f"otpauth://totp/{label}?secret={secret}&issuer=LyricFlow%20AI&digits=6&period=30"
                    return self.send_json({"secret": secret, "otpauth_uri": uri, "current_code": totp(secret)})
                if len(s) == 2 and s[1] == "enable" and method == "POST":
                    if not urow["mfa_secret"]:
                        return self.err(400, "no_secret", "先に /mfa/setup を実行してください")
                    if not totp_verify(urow["mfa_secret"], self.json_body().get("code")):
                        return self.err(401, "invalid_mfa", "認証コードが正しくありません")
                    con.execute("UPDATE users SET mfa_enabled=1 WHERE id=?", (uid,))
                    con.commit()
                    return self.send_json({"ok": True, "mfa_enabled": True})
                if len(s) == 2 and s[1] == "disable" and method == "POST":
                    if urow["mfa_enabled"] and not totp_verify(urow["mfa_secret"], self.json_body().get("code")):
                        return self.err(401, "invalid_mfa", "認証コードが正しくありません")
                    con.execute("UPDATE users SET mfa_enabled=0,mfa_secret=NULL WHERE id=?", (uid,))
                    con.commit()
                    return self.send_json({"ok": True, "mfa_enabled": False})
                return self.err(404, "not_found", "unknown mfa endpoint")

            # ---------- workspaces/{id}/... ----------
            if s[0] == "workspaces" and len(s) >= 3:
                wid = s[1]
                role = ws_role(wid)
                if not role:
                    return self.err(403, "forbidden", "このワークスペースへのアクセス権がありません")
                sub = s[2]
                if sub == "projects":
                    if method == "GET":
                        qs = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
                        archived = qs.get("archived", ["0"])[0] == "1"
                        cond = "status='archived'" if archived else "status!='archived'"
                        rows = con.execute(f"""SELECT id,title,status,aspect_ratio,thumbnail_url,created_at,updated_at,
                                              json_extract(timeline_data_json,'$.template') tpl,
                                              json_extract(timeline_data_json,'$.duration') dur
                                              FROM projects WHERE workspace_id=? AND {cond}
                                              ORDER BY updated_at DESC""", (wid,)).fetchall()
                        exports = con.execute("""SELECT COUNT(*) c FROM render_jobs r JOIN projects p ON p.id=r.project_id
                                                 WHERE p.workspace_id=? AND r.status='completed'""", (wid,)).fetchone()["c"]
                        return self.send_json({"projects": [dict(r) for r in rows], "exports": exports})
                    if method == "POST":
                        if role == "Viewer":
                            return self.err(403, "forbidden", "Viewerはプロジェクトを作成できません")
                        plan, lim, usage = usage_snapshot(con, wid)
                        if lim["projects"] is not None and usage["projects"] >= lim["projects"]:
                            return self.err(402, "plan_limit", f"{plan.upper()}プランのプロジェクト上限（{lim['projects']}件）に達しました。Proにアップグレードすると無制限になります。")
                        b = self.json_body()
                        tpl_id = b.get("template", "tpl-neon-city")
                        tpl_row = con.execute("SELECT data_json FROM templates WHERE id=?", (tpl_id,)).fetchone()
                        cfg = json.loads(tpl_row["data_json"]) if tpl_row else BUILTIN_TEMPLATES[0][4]
                        now = time.time()
                        pid = str(uuid.uuid4())
                        timeline = {"duration": 0, "template": tpl_id, "audio_asset_id": None,
                                    "sceneDefault": cfg["scene"],
                                    "lyrics_text": b.get("lyrics_text", ""), "language": b.get("language", "ja"),
                                    "lyricStyle": {"font": cfg["font"], "size": 64, "color": cfg["colors"]["text"],
                                                   "anim": cfg["anim"], "glow": cfg["fx"]["bloom"],
                                                   "lettering": cfg.get("lettering", "neon"),
                                                   "orient": cfg.get("orient", "horizontal")},
                                    "tracks": {"lyrics": [], "background": [], "effects": [], "overlay": []},
                                    "scenes": [], "fx": cfg["fx"], "colors": cfg["colors"], "particles": cfg["particles"]}
                        con.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?)",
                                    (pid, wid, b.get("title") or "Untitled Project", "draft",
                                     json.dumps(timeline, ensure_ascii=False), b.get("aspect_ratio", "16:9"), None, now, now))
                        con.commit()
                        return self.send_json({"id": pid}, 201)
                if sub == "assets":
                    if method == "GET":
                        rows = con.execute("SELECT * FROM assets WHERE workspace_id=? ORDER BY created_at DESC", (wid,)).fetchall()
                        return self.send_json({"assets": [dict(r) | {"metadata": json.loads(r["metadata_json"] or "null")} for r in rows]})
                    if method == "POST":
                        if role == "Viewer":
                            return self.err(403, "forbidden", "Viewerはアップロードできません")
                        fields, files = parse_multipart(self.body(), self.headers.get("Content-Type", ""))
                        f = files.get("file")
                        if not f:
                            return self.err(400, "no_file", "ファイルがありません")
                        ext = os.path.splitext(f["filename"])[1].lower()
                        kind = {"mp3": "audio", "wav": "audio", "m4a": "audio", "png": "image", "jpg": "image",
                                "jpeg": "image", "svg": "image", "webp": "image", "mp4": "video", "webm": "video",
                                "ttf": "font", "otf": "font", "woff2": "font"}.get(ext.lstrip("."))
                        if not kind:
                            return self.err(400, "bad_type", f"未対応のファイル形式です: {ext}")
                        # 仕様 8.3: マジックバイトによるMIME検証 (拡張子偽装を拒否)
                        detected = sniff_kind(f["data"], ext.lstrip("."))
                        if detected is None:
                            return self.err(400, "bad_content", "ファイルの内容を判別できませんでした。破損しているか未対応の形式です。")
                        if detected != kind:
                            return self.err(400, "mime_mismatch",
                                            f"拡張子({ext})とファイル内容({detected})が一致しません。アップロードを拒否しました。")
                        plan, lim, usage = usage_snapshot(con, wid)
                        # 仕様 2.3.1: プラン別の1ファイルサイズ上限
                        if len(f["data"]) > lim["file_max"]:
                            return self.err(413, "file_too_large",
                                            f"1ファイルの上限（{lim['file_max'] >> 20}MB）を超えています（{plan.upper()}プラン）。")
                        if kind == "font" and not lim["custom_font"]:
                            return self.err(402, "plan_limit", f"カスタムフォントはProプラン以上の機能です（現在: {plan.upper()}）。")
                        if usage["storage"] + len(f["data"]) > lim["storage"]:
                            return self.err(402, "storage_full", f"ストレージ上限（{lim['storage'] >> 30}GB）を超えます。不要なアセットを削除するかアップグレードしてください。")
                        aid = str(uuid.uuid4())
                        fname = aid + ext
                        with open(os.path.join(UPLOADS, fname), "wb") as fh:
                            fh.write(f["data"])
                        meta = json.loads(fields.get("metadata") or "null")
                        if kind == "audio" and FFMPEG and not (meta and meta.get("duration")):
                            try:
                                pr = subprocess.run([FFMPEG.replace("ffmpeg", "ffprobe"), "-v", "quiet",
                                                     "-show_entries", "format=duration", "-of", "csv=p=0",
                                                     os.path.join(UPLOADS, fname)], capture_output=True, text=True, timeout=20)
                                meta = (meta or {}) | {"duration": round(float(pr.stdout.strip() or 0), 2)}
                            except Exception:
                                pass
                        con.execute("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)",
                                    (aid, wid, fields.get("project_id") or None, kind, f"/media/uploads/{fname}",
                                     f["filename"], len(f["data"]), json.dumps(meta) if meta else None, time.time()))
                        con.commit()
                        row = con.execute("SELECT * FROM assets WHERE id=?", (aid,)).fetchone()
                        return self.send_json(dict(row) | {"metadata": meta}, 201)
                if sub == "renders" and method == "GET":
                    rows = con.execute("""SELECT r.*, p.title FROM render_jobs r JOIN projects p ON p.id=r.project_id
                                          WHERE p.workspace_id=? ORDER BY r.created_at DESC LIMIT 30""", (wid,)).fetchall()
                    return self.send_json({"renders": [dict(r) for r in rows]})
                if sub == "plan" and method == "PUT":
                    # デモ用: プラン変更 (本番はStripe Checkout/Customer Portal経由)
                    if role not in ("Owner",):
                        return self.err(403, "forbidden", "プラン変更はOwnerのみ可能です")
                    newp = self.json_body().get("plan_type")
                    if newp not in PLAN_LIMITS:
                        return self.err(400, "bad_plan", "不正なプランです")
                    con.execute("UPDATE workspaces SET plan_type=? WHERE id=?", (newp, wid))
                    con.commit()
                    return self.send_json({"ok": True, "plan_type": newp})
                if sub == "brand-kit" and method == "PUT":
                    if role in ("Viewer",):
                        return self.err(403, "forbidden", "権限がありません")
                    if not plan_limits(ws_plan(con, wid))["brand_kit"]:
                        return self.err(402, "plan_limit", "ブランドキットはTeamプラン以上の機能です。")
                    con.execute("UPDATE workspaces SET brand_kit_json=? WHERE id=?",
                                (json.dumps(self.json_body(), ensure_ascii=False), wid))
                    con.commit()
                    return self.send_json({"ok": True})
                if sub == "members":
                    if method == "GET":
                        rows = con.execute("""SELECT u.id,u.email,u.name,wu.role FROM workspace_users wu
                                              JOIN users u ON u.id=wu.user_id WHERE wu.workspace_id=?""", (wid,)).fetchall()
                        return self.send_json({"members": [dict(r) for r in rows]})
                    if method == "POST":
                        if role not in ("Owner", "Admin"):
                            return self.err(403, "forbidden", "メンバー招待はAdmin以上が必要です")
                        b = self.json_body()
                        email = (b.get("email") or "").strip().lower()
                        new_role = b.get("role", "Editor")
                        if new_role not in ("Admin", "Editor", "Viewer"):
                            return self.err(400, "bad_role", "ロールが不正です")
                        u = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
                        if not u:
                            nid = str(uuid.uuid4())
                            now = time.time()
                            con.execute("INSERT INTO users(id,email,password_hash,name,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                                        (nid, email, hash_pw(secrets.token_hex(8)), email.split("@")[0], None, now, now))
                            u = con.execute("SELECT * FROM users WHERE id=?", (nid,)).fetchone()
                        con.execute("INSERT OR REPLACE INTO workspace_users VALUES(?,?,?)", (wid, u["id"], new_role))
                        con.commit()
                        return self.send_json({"ok": True}, 201)
                if sub == "api-keys":
                    if method == "GET":
                        rows = con.execute("SELECT * FROM api_keys WHERE workspace_id=?", (wid,)).fetchall()
                        return self.send_json({"api_keys": [dict(r) for r in rows]})
                    if method == "POST":
                        if role not in ("Owner", "Admin"):
                            return self.err(403, "forbidden", "APIキー発行はAdmin以上が必要です")
                        kid, key = str(uuid.uuid4()), "lfk_" + secrets.token_hex(20)
                        con.execute("INSERT INTO api_keys VALUES(?,?,?,?,?,?)",
                                    (kid, wid, self.json_body().get("name") or "API Key", key, time.time(), None))
                        con.commit()
                        return self.send_json({"id": kid, "key": key}, 201)
                return self.err(404, "not_found", "unknown workspace endpoint")

            # ---------- projects ----------
            if s[0] == "projects" and len(s) >= 2:
                pid = s[1]
                row = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
                if not row:
                    return self.err(404, "not_found", "プロジェクトが見つかりません")
                role = ws_role(row["workspace_id"])
                if not role:
                    return self.err(403, "forbidden", "アクセス権がありません")
                if len(s) == 2 and method == "GET":
                    plan = ws_plan(con, row["workspace_id"])
                    return self.send_json(dict(row) | {"timeline_data": json.loads(row["timeline_data_json"]),
                                                       "role": role, "plan": plan, "watermark": plan_limits(plan)["watermark"]})
                if len(s) == 2 and method == "PUT":
                    if role == "Viewer":
                        return self.err(403, "forbidden", "Viewerは編集できません")
                    b = self.json_body()
                    now = time.time()
                    if "timeline_data" in b:
                        con.execute("INSERT INTO project_versions VALUES(?,?,?,?)",
                                    (str(uuid.uuid4()), pid, row["timeline_data_json"], now))
                        con.execute("""DELETE FROM project_versions WHERE project_id=? AND id NOT IN
                                       (SELECT id FROM project_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 50)""",
                                    (pid, pid))
                        con.execute("UPDATE projects SET timeline_data_json=?,updated_at=? WHERE id=?",
                                    (json.dumps(b["timeline_data"], ensure_ascii=False), now, pid))
                    for k in ("title", "status", "aspect_ratio", "thumbnail_url"):
                        if k in b:
                            con.execute(f"UPDATE projects SET {k}=?,updated_at=? WHERE id=?", (b[k], now, pid))
                    con.commit()
                    return self.send_json({"ok": True, "updated_at": now})
                if len(s) == 2 and method == "DELETE":
                    if role == "Viewer":
                        return self.err(403, "forbidden", "権限がありません")
                    con.execute("DELETE FROM projects WHERE id=?", (pid,))
                    con.commit()
                    return self.send_json({"ok": True})
                if len(s) == 3 and s[2] == "duplicate" and method == "POST":
                    nid, now = str(uuid.uuid4()), time.time()
                    con.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?)",
                                (nid, row["workspace_id"], row["title"] + " (copy)", "draft",
                                 row["timeline_data_json"], row["aspect_ratio"], row["thumbnail_url"], now, now))
                    con.commit()
                    return self.send_json({"id": nid}, 201)
                # 仕様 2.2: バージョン履歴 (最大50件) の閲覧とロールバック
                if len(s) == 3 and s[2] == "versions" and method == "GET":
                    rows = con.execute("""SELECT id, created_at,
                                          json_extract(timeline_data_json,'$.duration') dur,
                                          json_extract(timeline_data_json,'$.template') tpl
                                          FROM project_versions WHERE project_id=?
                                          ORDER BY created_at DESC""", (pid,)).fetchall()
                    return self.send_json({"versions": [dict(r) for r in rows], "current_updated_at": row["updated_at"]})
                if len(s) == 4 and s[2] == "versions" and method == "GET":
                    ver = con.execute("SELECT * FROM project_versions WHERE id=? AND project_id=?", (s[3], pid)).fetchone()
                    if not ver:
                        return self.err(404, "not_found", "バージョンが見つかりません")
                    return self.send_json({"timeline_data": json.loads(ver["timeline_data_json"])})
                if len(s) == 5 and s[2] == "versions" and s[4] == "restore" and method == "POST":
                    if role == "Viewer":
                        return self.err(403, "forbidden", "権限がありません")
                    ver = con.execute("SELECT * FROM project_versions WHERE id=? AND project_id=?", (s[3], pid)).fetchone()
                    if not ver:
                        return self.err(404, "not_found", "バージョンが見つかりません")
                    now = time.time()
                    # 復元前の現状も履歴に退避してからロールバック
                    con.execute("INSERT INTO project_versions VALUES(?,?,?,?)",
                                (str(uuid.uuid4()), pid, row["timeline_data_json"], now))
                    con.execute("""DELETE FROM project_versions WHERE project_id=? AND id NOT IN
                                   (SELECT id FROM project_versions WHERE project_id=? ORDER BY created_at DESC LIMIT 50)""",
                                (pid, pid))
                    con.execute("UPDATE projects SET timeline_data_json=?,updated_at=? WHERE id=?",
                                (ver["timeline_data_json"], now, pid))
                    con.commit()
                    return self.send_json({"ok": True, "timeline_data": json.loads(ver["timeline_data_json"])})
                # 仕様 2.2: アーカイブ / 復元
                if len(s) == 3 and s[2] in ("archive", "unarchive") and method == "POST":
                    if role == "Viewer":
                        return self.err(403, "forbidden", "権限がありません")
                    new_status = "archived" if s[2] == "archive" else "draft"
                    con.execute("UPDATE projects SET status=?,updated_at=? WHERE id=?", (new_status, time.time(), pid))
                    con.commit()
                    return self.send_json({"ok": True, "status": new_status})
                if len(s) == 3 and s[2] == "publish-template" and method == "POST":
                    # 仕様 2.7.1: プロジェクトをテンプレートとして公開
                    if role == "Viewer":
                        return self.err(403, "forbidden", "権限がありません")
                    b = self.json_body()
                    tl = json.loads(row["timeline_data_json"])
                    cfg = {"scene": tl.get("sceneDefault", "city"),
                           "particles": tl.get("particles", "stars"),
                           "anim": tl.get("lyricStyle", {}).get("anim", "glow-pop"),
                           "colors": tl.get("colors", BUILTIN_TEMPLATES[0][4]["colors"]),
                           "font": tl.get("lyricStyle", {}).get("font", "'Noto Sans JP', sans-serif"),
                           "fx": tl.get("fx", BUILTIN_TEMPLATES[0][4]["fx"])}
                    author = con.execute("SELECT name FROM users WHERE id=?", (uid,)).fetchone()["name"]
                    tid = str(uuid.uuid4())
                    price = max(0.0, float(b.get("price_usd", 0) or 0))
                    con.execute("INSERT INTO templates VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                (tid, row["workspace_id"], b.get("title") or row["title"], author, None,
                                 json.dumps(cfg, ensure_ascii=False), 1, price, 5.0, 0, time.time()))
                    con.commit()
                    return self.send_json({"id": tid, "price_usd": price}, 201)

            # ---------- AI jobs ----------
            if s[0] == "ai":
                if s[1] in ("sync-lyrics", "analyze-scene", "translate-lyrics", "suggest") and method == "POST":
                    b = self.json_body()
                    wid = b.get("workspace_id")
                    if wid and not ws_role(wid):
                        return self.err(403, "forbidden", "アクセス権がありません")
                    if b.get("engine") == "codex" and not codex_available():
                        return self.err(400, "codex_unavailable", "Codex CLIが利用できません。builtinエンジンをご利用ください。")
                    if wid and s[1] == "sync-lyrics":       # 仕様 9.1: FreeはAI歌詞同期 月3回
                        plan, lim, usage = usage_snapshot(con, wid)
                        if lim["ai_month"] is not None and usage["ai_month"] >= lim["ai_month"]:
                            return self.err(402, "plan_limit", f"{plan.upper()}プランのAI歌詞同期は月{lim['ai_month']}回までです。Proで無制限になります。")
                    jid = str(uuid.uuid4())
                    con.execute("INSERT INTO ai_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                                (jid, wid, uid, s[1], "pending", 0, None,
                                 json.dumps(b, ensure_ascii=False), None, None, time.time(), None))
                    con.commit()
                    threading.Thread(target=run_ai_job, args=(jid,), daemon=True).start()
                    return self.send_json({"job_id": jid}, 202)
                if s[1] == "jobs" and len(s) > 2 and method == "GET":
                    row = con.execute("SELECT * FROM ai_jobs WHERE id=?", (s[2],)).fetchone()
                    if not row:
                        return self.err(404, "not_found", "ジョブが見つかりません")
                    return self.send_json({"id": row["id"], "kind": row["kind"], "status": row["status"],
                                           "progress_pct": row["progress_pct"], "stage": row["stage"],
                                           "result": json.loads(row["result_json"] or "null"),
                                           "error_message": row["error_message"]})

            # ---------- render ----------
            if s[0] == "render":
                # 決定論的フレームレンダリング (高品質): start → frame×N → finish
                if len(s) == 3 and s[1] == "frames" and s[2] == "start" and method == "POST":
                    b = self.json_body()
                    pid = b.get("project_id")
                    settings = b.get("settings") or {}
                    prj = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
                    if not prj or not ws_role(prj["workspace_id"]):
                        return self.err(403, "forbidden", "アクセス権がありません")
                    plan, lim, usage = usage_snapshot(con, prj["workspace_id"])
                    if lim["exports_month"] is not None and usage["exports_month"] >= lim["exports_month"]:
                        return self.err(402, "plan_limit", f"{plan.upper()}プランの月間エクスポート数（{lim['exports_month']}回）に達しました。")
                    if settings.get("format", "mp4") not in lim["formats"]:
                        return self.err(402, "plan_limit", f"{settings.get('format','mp4').upper()}出力は現在のプラン（{plan.upper()}）では利用できません。")
                    if int(settings.get("height", 720)) > lim["max_res"]:
                        return self.err(402, "plan_limit", f"{plan.upper()}プランの最大解像度は{lim['max_res']}pです。")
                    jid = str(uuid.uuid4())
                    os.makedirs(os.path.join(RENDERS, f"frames_{jid}"), exist_ok=True)
                    con.execute("INSERT INTO render_jobs VALUES(?,?,?,?,?,?,?,?,?,?)",
                                (jid, pid, uid, "processing", json.dumps(settings), None, 0, None, time.time(), None))
                    con.execute("UPDATE projects SET status='rendering',updated_at=? WHERE id=?", (time.time(), pid))
                    con.commit()
                    return self.send_json({"job_id": jid}, 201)
                if len(s) == 4 and s[1] == "frames" and s[3].isdigit() and method == "POST":
                    jid, idx = s[2], int(s[3])
                    fd = os.path.join(RENDERS, f"frames_{jid}")
                    if not os.path.isdir(fd):
                        return self.err(404, "not_found", "レンダリングジョブが見つかりません")
                    with open(os.path.join(fd, f"{idx:06d}.jpg"), "wb") as fh:
                        fh.write(self.body())
                    n = len(os.listdir(fd))
                    con.execute("UPDATE render_jobs SET progress_pct=? WHERE id=?", (min(60, n * 60 // max(1, int(self.headers.get('X-Total-Frames', n)))), jid))
                    con.commit()
                    return self.send_json({"ok": True})
                if len(s) == 4 and s[1] == "frames" and s[3] == "finish" and method == "POST":
                    self.body()          # ボディを読み捨て(keep-alive混線防止)
                    jid = s[2]
                    row = con.execute("SELECT * FROM render_jobs WHERE id=?", (jid,)).fetchone()
                    if not row:
                        return self.err(404, "not_found", "ジョブが見つかりません")
                    threading.Thread(target=run_frames_encode, args=(jid,), daemon=True).start()
                    return self.send_json({"ok": True}, 202)
                if len(s) == 1 and method == "POST":
                    fields, files = parse_multipart(self.body(), self.headers.get("Content-Type", ""))
                    f = files.get("file")
                    settings = json.loads(fields.get("settings") or "{}")
                    pid = fields.get("project_id")
                    if not f or not pid:
                        return self.err(400, "invalid_input", "file と project_id が必要です")
                    prj = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
                    if not prj or not ws_role(prj["workspace_id"]):
                        return self.err(403, "forbidden", "アクセス権がありません")
                    # 仕様 9.1: プラン別のエクスポート回数/解像度/フォーマット制限
                    plan, lim, usage = usage_snapshot(con, prj["workspace_id"])
                    if lim["exports_month"] is not None and usage["exports_month"] >= lim["exports_month"]:
                        return self.err(402, "plan_limit", f"{plan.upper()}プランの月間エクスポート数（{lim['exports_month']}回）に達しました。")
                    fmt = settings.get("format", "mp4")
                    if fmt not in lim["formats"]:
                        return self.err(402, "plan_limit", f"{fmt.upper()}出力は現在のプラン（{plan.upper()}）では利用できません。")
                    if int(settings.get("height", 720)) > lim["max_res"]:
                        return self.err(402, "plan_limit", f"{plan.upper()}プランの最大解像度は{lim['max_res']}pです。")
                    jid = str(uuid.uuid4())
                    src = os.path.join(RENDERS, f"{jid}_src.webm")
                    with open(src, "wb") as fh:
                        fh.write(f["data"])
                    con.execute("INSERT INTO render_jobs VALUES(?,?,?,?,?,?,?,?,?,?)",
                                (jid, pid, uid, "pending", json.dumps(settings), None, 0, None, time.time(), None))
                    con.execute("UPDATE projects SET status='rendering',updated_at=? WHERE id=?", (time.time(), pid))
                    con.commit()
                    threading.Thread(target=run_render_job, args=(jid, src), daemon=True).start()
                    return self.send_json({"job_id": jid}, 202)
                if len(s) == 2 and method == "GET":
                    row = con.execute("SELECT * FROM render_jobs WHERE id=?", (s[1],)).fetchone()
                    if not row:
                        return self.err(404, "not_found", "ジョブが見つかりません")
                    return self.send_json({"status": row["status"], "progress_pct": row["progress_pct"],
                                           "output_url": row["output_url"], "error_message": row["error_message"]})
                if len(s) == 2 and method == "DELETE":
                    con.execute("UPDATE render_jobs SET status='cancelled' WHERE id=? AND status IN('pending','processing')", (s[1],))
                    con.commit()
                    return self.send_json({}, 204) if False else self.send_json({"ok": True})

            # ---------- templates ----------
            if s[0] == "templates" and method == "GET":
                rows = con.execute("SELECT * FROM templates WHERE is_public=1 ORDER BY sales DESC").fetchall()
                return self.send_json({"templates": [dict(r) | {"config": json.loads(r["data_json"])} for r in rows]})

            # ---------- assets(delete) ----------
            if s[0] == "assets" and len(s) == 2 and method == "DELETE":
                row = con.execute("SELECT * FROM assets WHERE id=?", (s[1],)).fetchone()
                if not row or not ws_role(row["workspace_id"]):
                    return self.err(404, "not_found", "アセットが見つかりません")
                con.execute("DELETE FROM assets WHERE id=?", (s[1],))
                con.commit()
                try:
                    os.remove(os.path.join(DATA, row["url"].lstrip("/media/").lstrip("/")))
                except Exception:
                    pass
                return self.send_json({"ok": True})

            return self.err(404, "not_found", f"unknown endpoint: {path}")
        finally:
            con.close()


def main():
    seed()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"LyricFlow AI  →  http://localhost:{PORT}")
    print(f"  demo: demo@lyricflow.app / demo1234   ffmpeg: {'OK' if FFMPEG else 'なし(webm出力のみ)'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
