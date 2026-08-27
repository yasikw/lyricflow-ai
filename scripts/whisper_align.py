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
    # speech_pad_ms は既定400msあり区間頭を前に広げて先頭が早くズレる。100msに縮小して頭出しを正す
    seg_iter, info = model.transcribe(audio, language=language, word_timestamps=True,
                                      vad_filter=True,
                                      vad_parameters={"min_silence_duration_ms": 400, "speech_pad_ms": 100})
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

    # 全単語をフラット化。オンセットは単語開始のみ(セグメント境界はVADパディングで甘いため使わない)
    flat = [w for seg in segments for w in seg["words"] if w.get("start") is not None]
    flat.sort(key=lambda w: w["start"])
    onsets = sorted(set(round(w["start"], 3) for w in flat))
    dur = duration or (flat[-1]["end"] if flat else 30.0)

    def seg_start(seg):   # 区間の実頭 = 最初の単語開始(無ければ区間開始)
        return seg["words"][0]["start"] if seg["words"] else seg["start"]

    def seg_end(seg):
        return seg["words"][-1]["end"] if seg["words"] else seg["end"]

    # 配分レンジ: 認識できた発話全域。ただし認識が疎(全体の40%未満)なら曲全体へ広げる
    if flat and (flat[-1]["end"] - flat[0]["start"]) >= dur * 0.4:
        span_s, span_e = flat[0]["start"], flat[-1]["end"]
    else:
        span_s, span_e = dur * 0.03, dur * 0.97

    def snap(t, win=0.6):
        best, bd = None, win
        for o in onsets:
            if abs(o - t) < bd:
                bd, best = abs(o - t), o
        return best if best is not None else t

    # 行頭の決め方:
    #  (A) 認識が曲全体をカバー(頭〜終盤に発話がある) → セグメント境界を直接使う=実タイミングで高精度
    #  (B) 認識が曲の一部に偏る → 字数按分でspan全域に散らし詰め込みを防止(近似)
    coverage_ok = bool(flat) and flat[0]["start"] <= dur * 0.4 and flat[-1]["end"] >= dur * 0.55
    starts = []
    if coverage_ok:
        segs = segments
        Pn = len(segs)
        if Pn >= N:
            for i in range(N):
                starts.append(seg_start(segs[i * Pn // N]))
            end_sentinel = seg_end(segs[-1])
        else:
            for i in range(N):
                pi = i * Pn // N
                seg = segs[pi]
                s0, e0 = seg_start(seg), seg_end(seg)
                first = next(j for j in range(N) if j * Pn // N == pi)
                cnt = sum(1 for j in range(N) if j * Pn // N == pi)
                order = i - first
                starts.append(s0 + (e0 - s0) * order / cnt)
            end_sentinel = seg_end(segs[-1])
    else:
        weights = [max(1, len(l)) for l in lines]
        tot_w = sum(weights) or 1
        cum = 0.0
        for i in range(N):
            starts.append(snap(span_s + (span_e - span_s) * cum / tot_w))
            cum += weights[i]
        end_sentinel = span_e
    for i in range(1, N):                 # 単調増加を保証
        if starts[i] <= starts[i - 1] + 0.2:
            starts[i] = starts[i - 1] + 0.3
    starts.append(min(dur, max(end_sentinel, starts[-1] + 0.6)))

    for li, line in enumerate(lines):
        ls = starts[li]
        le = min(starts[li + 1], dur)
        if le <= ls:
            le = min(dur, ls + 1.2)
        # 行内: 該当区間に入るWhisper単語オンセットがあれば語頭に利用、無ければ字数按分
        words = split_words(line)
        seg_ons = [o for o in onsets if ls - 0.05 <= o < le]
        if len(seg_ons) >= len(words) and len(words) > 1:
            picks = [seg_ons[int(round(k * (len(seg_ons) - 1) / (len(words) - 1)))] for k in range(len(words))]
            for k, w in enumerate(words):
                st = picks[k]
                en = picks[k + 1] if k + 1 < len(words) else le
                if en <= st:
                    en = min(dur, st + 0.4)
                out.append({"word": w, "line": li, "start": round(st, 2), "end": round(min(en, dur), 2)})
        else:
            wsum = sum(max(1, len(w)) for w in words) or 1
            gap = min(0.4, (le - ls) * 0.1)
            usable = (le - ls) - gap
            t = ls
            for w in words:
                wd = usable * max(1, len(w)) / wsum
                out.append({"word": w, "line": li, "start": round(t, 2), "end": round(min(t + wd, dur), 2)})
                t += wd

    prog(100, "完了")
    print(json.dumps({"timestamps": out, "language": info.language, "duration": round(dur, 2),
                      "segments": P, "engine": "whisper"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
