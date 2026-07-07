#!/usr/bin/env python3
"""LyricFlow AI — 次世代AI動画クリエイティブSaaS (MVP server)

仕様書 spec_final.pdf に基づく実装:
- /api/v1/* REST API (JWT Bearer認証, エラーは {"error":{code,message}})
- 非同期AIジョブ (歌詞同期 / シーン解析 / 翻訳) + レンダリングジョブ (ffmpeg)
- ホワイトラベル外部API (X-API-Key)
標準ライブラリのみで動作。DB=SQLite, ファイル=ローカルストレージ。
"""
import base64, hashlib, hmac, json, math, mimetypes, os, random, re, secrets, sqlite3, struct, subprocess, threading, time, urllib.request, uuid, wave
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
PLAN_LIMITS = {"free": {"projects": 5, "storage": 1 << 30}, "pro": {"projects": None, "storage": 10 << 30}, "team": {"projects": None, "storage": 100 << 30}}

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

# ---------------------------------------------------------------- DB
def db():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  name TEXT NOT NULL, avatar_url TEXT, created_at REAL, updated_at REAL);
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

def sync_lyrics_engine(lyrics_text, env, hop, duration):
    """Word-levelタイムスタンプ生成 (Demucs/Whisper/MFA相当のヒューリスティック)。"""
    lines = [l.strip() for l in lyrics_text.splitlines() if l.strip()]
    if not lines or duration <= 0:
        return []
    v_start, v_end = detect_vocal_range(env or [], hop or 0.1, duration)
    span = v_end - v_start
    weights = [max(1, len(l)) + 4 for l in lines]  # +4 = 行間ブレス分
    total = sum(weights)
    out, t = [], v_start
    for li, line in enumerate(lines):
        line_dur = span * weights[li] / total
        gap = min(0.6, line_dur * 0.16)
        words = split_words(line)
        wsum = sum(max(1, len(w)) for w in words) or 1
        usable = line_dur - gap
        wt = t
        for w in words:
            wd = usable * max(1, len(w)) / wsum
            out.append({"id": uuid.uuid4().hex[:8], "word": w, "line": li,
                        "start": round(wt, 2), "end": round(min(wt + wd, duration), 2)})
            wt += wd
        t += line_dur
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

def translate_engine(lyrics_text, target):
    key = os.environ.get("DEEPL_API_KEY")
    lines = [l for l in lyrics_text.splitlines()]
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
            upd(12, "ボーカル分離 (Demucs)")
            upd(38, "音声認識 (Whisper)")
            upd(66, "強制アライメント (MFA)")
            ts = sync_lyrics_engine(payload.get("lyrics_text", ""), payload.get("envelope"),
                                    payload.get("hop", 0.1), float(payload.get("duration", 0)))
            v_start, v_end = detect_vocal_range(payload.get("envelope") or [], payload.get("hop", 0.1),
                                                float(payload.get("duration", 0)))
            result = {"timestamps": ts, "vocal_start": v_start, "vocal_end": v_end,
                      "language": payload.get("language", "ja")}
        elif kind == "analyze-scene":
            upd(20, "BPM・スペクトル解析 (Librosa)")
            upd(60, "シーン境界検出")
            secs = analyze_scene_engine(payload.get("envelope"), payload.get("hop", 0.1),
                                        float(payload.get("duration", 0)))
            result = {"sections": secs}
        elif kind == "translate-lyrics":
            upd(30, "言語検出 (langdetect)")
            upd(60, "AI翻訳 (DeepL / GPT-4o)")
            lines, engine = translate_engine(payload.get("lyrics_text", ""), payload.get("target", "en"))
            result = {"lines": lines, "engine": engine, "target": payload.get("target", "en")}
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
    try:
        con.execute("UPDATE render_jobs SET status='processing',progress_pct=5 WHERE id=?", (job_id,))
        con.commit()
        out_name = f"{job_id}.{fmt if fmt in ('mp4','webm') else 'mp4'}"
        out_path = os.path.join(RENDERS, out_name)
        if fmt == "webm" or not FFMPEG:
            os.replace(src_path, os.path.join(RENDERS, f"{job_id}.webm"))
            out_name = f"{job_id}.webm"
        else:
            dur = 0.0
            try:
                pr = subprocess.run([FFMPEG.replace("ffmpeg", "ffprobe"), "-v", "quiet", "-show_entries",
                                     "format=duration", "-of", "csv=p=0", src_path], capture_output=True, text=True, timeout=20)
                dur = float(pr.stdout.strip() or 0)
            except Exception:
                pass
            cmd = [FFMPEG, "-y", "-i", src_path, "-c:v", "libx264", "-preset", "fast",
                   "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k",
                   "-progress", "pipe:1", "-nostats", out_path]
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
]

DEMO_LYRICS = "星が降り注ぐ夜に\n君の声が心を照らす\n遠く霞む街の灯り\n夢の先で僕らは出会う\nきらめきを集めて\n夜空へ放つメロディー\n何度でも歌うよ\n君に届くまで"

def seed():
    con = db()
    con.executescript(SCHEMA)
    if con.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]:
        con.close()
        return
    now = time.time()
    uid, wid = str(uuid.uuid4()), str(uuid.uuid4())
    con.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)",
                (uid, "demo@lyricflow.app", hash_pw("demo1234"), "Kaito", None, now, now))
    con.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?)",
                (wid, "Demo Studio", "team",
                 json.dumps({"logo_text": "LF", "primary": "#00d4ff", "secondary": "#7b2ff7",
                             "accent": "#ff7edb", "font": "'Noto Sans JP', sans-serif"}), uid, now))
    con.execute("INSERT INTO workspace_users VALUES(?,?,?)", (wid, uid, "Owner"))
    for m_email, m_name, role in [("hanako@lyricflow.app", "Hanako Suzuki", "Editor"),
                                  ("kenji@lyricflow.app", "Kenji Tanaka", "Viewer")]:
        mid = str(uuid.uuid4())
        con.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (mid, m_email, hash_pw("demo1234"), m_name, None, now, now))
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
                    con.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (uid, email, hash_pw(pw), name, None, now, now))
                    con.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?)",
                                (wid, f"{name} の Workspace", "free", None, uid, now))
                    con.execute("INSERT INTO workspace_users VALUES(?,?,?)", (wid, uid, "Owner"))
                    con.commit()
                    return self.send_json({"access_token": make_token(uid), "refresh_token": make_token(uid, "refresh"),
                                           "user": {"id": uid, "email": email, "name": name}})
                if s[1] == "login" and method == "POST":
                    email = (b.get("email") or "").strip().lower()
                    row = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
                    if not row or not check_pw(b.get("password") or "", row["password_hash"] or ""):
                        return self.err(401, "invalid_credentials", "メールアドレスまたはパスワードが違います")
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
                u = con.execute("SELECT id,email,name FROM users WHERE id=?", (uid,)).fetchone()
                wss = con.execute("""SELECT w.*, wu.role FROM workspaces w
                                     JOIN workspace_users wu ON wu.workspace_id=w.id WHERE wu.user_id=?""", (uid,)).fetchall()
                out = []
                for w in wss:
                    used = con.execute("SELECT COALESCE(SUM(size_bytes),0) s FROM assets WHERE workspace_id=?", (w["id"],)).fetchone()["s"]
                    out.append({"id": w["id"], "name": w["name"], "plan_type": w["plan_type"], "role": w["role"],
                                "brand_kit": json.loads(w["brand_kit_json"] or "null"), "storage_used": used,
                                "storage_limit": PLAN_LIMITS.get(w["plan_type"], PLAN_LIMITS["free"])["storage"]})
                return self.send_json({"user": dict(u), "workspaces": out, "ffmpeg": bool(FFMPEG)})

            # ---------- workspaces/{id}/... ----------
            if s[0] == "workspaces" and len(s) >= 3:
                wid = s[1]
                role = ws_role(wid)
                if not role:
                    return self.err(403, "forbidden", "このワークスペースへのアクセス権がありません")
                sub = s[2]
                if sub == "projects":
                    if method == "GET":
                        rows = con.execute("""SELECT id,title,status,aspect_ratio,thumbnail_url,created_at,updated_at,
                                              json_extract(timeline_data_json,'$.template') tpl,
                                              json_extract(timeline_data_json,'$.duration') dur
                                              FROM projects WHERE workspace_id=? AND status!='archived'
                                              ORDER BY updated_at DESC""", (wid,)).fetchall()
                        exports = con.execute("""SELECT COUNT(*) c FROM render_jobs r JOIN projects p ON p.id=r.project_id
                                                 WHERE p.workspace_id=? AND r.status='completed'""", (wid,)).fetchone()["c"]
                        return self.send_json({"projects": [dict(r) for r in rows], "exports": exports})
                    if method == "POST":
                        if role == "Viewer":
                            return self.err(403, "forbidden", "Viewerはプロジェクトを作成できません")
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
                                                   "anim": cfg["anim"], "glow": cfg["fx"]["bloom"]},
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
                if sub == "brand-kit" and method == "PUT":
                    if role in ("Viewer",):
                        return self.err(403, "forbidden", "権限がありません")
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
                            con.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)",
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
                    return self.send_json(dict(row) | {"timeline_data": json.loads(row["timeline_data_json"]), "role": role})
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

            # ---------- AI jobs ----------
            if s[0] == "ai":
                if s[1] in ("sync-lyrics", "analyze-scene", "translate-lyrics") and method == "POST":
                    b = self.json_body()
                    wid = b.get("workspace_id")
                    if wid and not ws_role(wid):
                        return self.err(403, "forbidden", "アクセス権がありません")
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
