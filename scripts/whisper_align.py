#!/usr/bin/env python3
"""LyricFlow AI — Whisper 強制アライメント (faster-whisper)

使い方: python whisper_align.py <audio> <lyrics_txt_file> [language] [model_size]
音声をWhisperで文字起こし(word_timestamps付き)し、実際の発話セグメント境界に
ユーザーの歌詞を割り付けて Word-level タイムスタンプJSONを stdout に出力する。

出力: {"timestamps":[{"word","line","start","end"}...], "language","duration","segments","engine"}
進捗は stderr に "PROGRESS <pct> <stage>" で出す(サーバーが拾う)。
"""
import sys, json, re


def split_words(line):
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


def prog(pct, stage):
    print(f"PROGRESS {pct} {stage}", file=sys.stderr, flush=True)


def main():
    audio = sys.argv[1]
    lyrics = open(sys.argv[2], encoding="utf-8").read() if len(sys.argv) > 2 else ""
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] not in ("", "auto") else None
    model_size = sys.argv[4] if len(sys.argv) > 4 else "base"

    prog(10, "モデル読み込み")
    from faster_whisper import WhisperModel
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    prog(25, "音声認識 (Whisper)")
    seg_iter, info = model.transcribe(audio, language=language, word_timestamps=True,
                                      vad_filter=True, vad_parameters={"min_silence_duration_ms": 400})
    duration = info.duration or 0.0
    segments = []
    for s in seg_iter:
        segments.append({"start": float(s.start), "end": float(s.end),
                         "words": [{"w": w.word, "start": float(w.start), "end": float(w.end)}
                                   for w in (s.words or []) if w.start is not None]})
        # 進捗をだいたいで更新
        if duration > 0:
            prog(min(85, 25 + int(s.end / duration * 55)), "音声認識 (Whisper)")

    prog(90, "歌詞アライメント")
    lines = [l.strip() for l in lyrics.splitlines() if l.strip()]
    N, P = len(lines), len(segments)
    out = []

    def emit(li, s, e, wwords):
        words = split_words(lines[li])
        if not words:
            return
        s = max(0.0, s)
        e = min(duration or e, max(e, s + 0.4))
        # Whisperの単語時刻が使えるなら、その onset を利用して語頭を寄せる
        if wwords and len(wwords) >= len(words):
            # wwordsをlen(words)個に均等バケット化し各バケット先頭時刻を語頭に
            starts = [wwords[int(round(k * (len(wwords) - 1) / max(1, len(words) - 1)))]["start"]
                      for k in range(len(words))] if len(words) > 1 else [wwords[0]["start"]]
            for k, w in enumerate(words):
                st = starts[k]
                en = starts[k + 1] if k + 1 < len(words) else e
                if en <= st:
                    en = min(duration or (st + 0.4), st + 0.4)
                out.append({"word": w, "line": li, "start": round(st, 2), "end": round(min(en, duration or en), 2)})
            return
        # フォールバック: セグメント span を文字数按分
        wsum = sum(max(1, len(w)) for w in words) or 1
        gap = min(0.4, (e - s) * 0.1)
        usable = (e - s) - gap
        t = s
        for w in words:
            wd = usable * max(1, len(w)) / wsum
            out.append({"word": w, "line": li, "start": round(t, 2), "end": round(min(t + wd, duration or (t + wd)), 2)})
            t += wd

    if P == 0:
        # 発話が検出できない → 全体に均等配置
        tot = sum(len(x) + 2 for x in lines) or 1
        t = (duration or 30) * 0.05
        span = (duration or 30) * 0.9
        for li in range(N):
            e = t + span * (len(lines[li]) + 2) / tot
            emit(li, t, e, [])
            t = e
    elif P >= N:
        # セグメントが多い → 連続グループ化
        for i in range(N):
            gs = i * P // N
            ge = max((i + 1) * P // N, gs + 1)
            grp = segments[gs:min(ge, P)]
            ww = [w for sg in grp for w in sg["words"]]
            emit(i, grp[0]["start"], grp[-1]["end"], ww)
    else:
        # セグメントが少ない → セグメント内を行で分割。単語時刻があれば行頭に利用
        for i in range(N):
            pi = i * P // N
            seg = segments[pi]
            first = next(j for j in range(N) if j * P // N == pi)
            cnt = sum(1 for j in range(N) if j * P // N == pi)
            order = i - first
            segd = (seg["end"] - seg["start"]) / cnt
            ls = seg["start"] + order * segd
            le = seg["start"] + (order + 1) * segd
            ww = [w for w in seg["words"] if ls - 0.05 <= w["start"] < le + 0.05]
            emit(i, ls, le, ww)

    # 単調増加を保証
    out.sort(key=lambda w: (w["line"],))
    prog(100, "完了")
    print(json.dumps({"timestamps": out, "language": info.language, "duration": round(duration, 2),
                      "segments": P, "engine": "whisper"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
