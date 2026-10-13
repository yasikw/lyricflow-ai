/* LyricFlow AI — Live2D キャラ層
   Live2D(Cubism 3 以降, .model3.json)のキャラを読み込み、歌に合わせて口パクし、拍に合わせて踊らせる。
   描画: PixiJS + pixi-live2d-display(MIT) + 公式 Cubism Core(scripts/fetch_live2d.sh で取得)。
   決定論: 姿勢はすべて時刻 t の関数(drive)で決める。物理(髪・服の揺れ)は 1/30 秒刻みで進め、時刻が飛んだら
   1.2 秒前から回し直すので、プレビューでも書き出しでも同じ時刻ならほぼ同じ絵になる。
   モデルのアイドルモーション(ランダム)と自動まばたきは止め、まばたきも時刻から決める。 */
(() => {
'use strict';

// 母音ごとの口の開き・口の形(ParamMouthForm: -1=すぼめ … 1=横に引く)
const OPEN = { a: 1, i: 0.5, u: 0.45, e: 0.72, o: 0.82, n: 0.12 };
const FORM = { a: 0.1, i: 0.85, u: -0.8, e: 0.5, o: -0.55, n: 0 };
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const hash01 = (...a) => { let h = 2166136261; for (const v of a) { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } } return ((h >>> 0) % 100000) / 100000; };
const SMALL = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/;
const VOWELS = 'aiueo';

/* 1語 → 口の動きの単位(モーラ)ごとの母音列 */
const moraCache = new Map();
function moras(word) {
  let v = moraCache.get(word);
  if (v) return v;
  v = [];
  const L = window.LFC;
  const gs = Array.from(String(word || '').replace(/[\s、。，．,.!！?？「」『』（）()・…〜～]/g, ''));
  if (/^[A-Za-z' -]+$/.test(word || '')) {
    for (const ch of (word || '').toLowerCase()) if (VOWELS.includes(ch)) v.push(ch);
  } else {
    for (const ch of gs) {
      if (SMALL.test(ch)) { if (v.length) { const r = L && L.romaji ? L.romaji(ch) : null; if (r) v[v.length - 1] = r.slice(-1); } continue; }
      if (ch === 'ー') { v.push(v.length ? v[v.length - 1] : 'a'); continue; }
      if (ch === 'っ' || ch === 'ッ') { v.push('n'); continue; }
      if (ch === 'ん' || ch === 'ン') { v.push('n'); continue; }
      const r = L && L.romaji ? L.romaji(ch) : null;
      if (r) { const last = r.slice(-1); v.push(VOWELS.includes(last) ? last : 'n'); continue; }
      // 漢字など読みの分からない字は 2 モーラとして、字から決まる母音を当てる
      v.push(VOWELS[Math.floor(hash01(ch, 1) * 5)], VOWELS[Math.floor(hash01(ch, 2) * 5)]);
    }
  }
  if (!v.length) v = ['a'];
  if (moraCache.size > 4000) moraCache.clear();
  moraCache.set(word, v);
  return v;
}

/* 歌詞の語(開始順)から時刻 t の語を二分探索 */
function wordAt(words, t) {
  let lo = 0, hi = words.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (words[m].start <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

/* 口パク: 歌詞のタイミング(歌っている語)× ボーカル帯の音量 × 語の中のモーラの開閉 */
function lip(engine, d, t) {
  const tl = engine.timeline || {};
  const words = engine._l2dWords(tl);
  const v = engine.vocalAt ? engine.vocalAt(t) : engine.energyAt(t);
  const gain = 0.4 + 1.2 * (d.lipsync ?? 0.8);
  if (!words.length || d.lipGate === false) {
    // 歌詞のタイミングが無い時は、音量だけで開閉(細かい揺れは音量の揺れそのもの)
    const o = clamp((v - 0.12) * 1.6 * gain);
    return { open: o, form: 0.15 };
  }
  const i = wordAt(words, t + 0.03);
  if (i < 0) return { open: 0, form: 0 };
  const w = words[i];
  const ws = w.start - 0.03, we = Math.max(w.end || w.start + 0.3, ws + 0.12) + 0.05;
  if (t > we + 0.09) return { open: 0, form: 0 };
  const tail = t > we ? 1 - (t - we) / 0.09 : 1;
  const ms = moras(w.word);
  const p = clamp((t - ws) / (we - ws), 0, 0.9999) * ms.length;
  const k = Math.floor(p), f = p - k;
  const vow = ms[k], next = ms[Math.min(ms.length - 1, k + 1)];
  const shape = Math.pow(Math.sin(Math.PI * clamp(f * 1.15)), 0.6);
  const open = clamp((0.3 + 0.95 * v) * gain) * (0.22 + 0.78 * shape) * OPEN[vow] * tail;
  const form = lerp(FORM[vow], FORM[next], clamp((f - 0.7) / 0.3));
  return { open: clamp(open), form };
}

/* 踊り: 拍(BPM)に合わせた頭・体・腕の動き。拍が無ければ音量に合わせてゆっくり揺れる */
function dance(engine, d, t) {
  const tl = engine.timeline || {};
  const k = (d.intensity ?? 0.7) * (d.style === 'none' ? 0 : 1);
  const e = clamp(engine.energyAt(t));
  const amp = k * (0.55 + 0.6 * e);
  const bpm = tl.bpm || 0;
  const bl = bpm ? 60 / bpm : 0.75;
  const b = (t - (tl.beatOffset || 0) - (d.offset || 0)) / bl;
  const ph = b - Math.floor(b);
  const kick = Math.exp(-ph * 6.5);                 // 拍の頭で 1 → すぐ減衰
  const S = Math.sin, PI = Math.PI;
  const p = {};
  let dy = 0, rot = 0, dx = 0;
  const style = !d.style || d.style === 'motion' ? 'groove' : d.style;   // モーションの無いモデルはグルーヴで代用
  if (style === 'groove') {                         // 横揺れ+拍で軽く沈む
    p.ParamAngleX = 13 * amp * S(PI * b);
    p.ParamAngleZ = 8 * amp * S(PI * b + 0.4);
    p.ParamAngleY = 2 - 7 * amp * kick;
    p.ParamBodyAngleX = 7 * amp * S(PI * b - 0.6);
    p.ParamBodyAngleZ = 5 * amp * S(PI * b / 2);
    p.ParamBodyAngleY = -3 * amp * kick;
    p['~ParamArmLA'] = 0.5 + 0.35 * amp * S(PI * b);
    p['~ParamArmRA'] = 0.5 - 0.35 * amp * S(PI * b);
    dy = -Math.abs(S(PI * b)) * 0.018 * amp;
    rot = 2.2 * amp * S(PI * b + 0.4);
  } else if (style === 'bounce') {                  // 拍ごとに跳ねる+うなずき
    p.ParamAngleY = 6 - 16 * amp * kick;
    p.ParamAngleX = 6 * amp * S(PI * b / 2);
    p.ParamAngleZ = 4 * amp * S(PI * b / 2 + 1);
    p.ParamBodyAngleY = -6 * amp * kick;
    p.ParamBodyAngleX = 4 * amp * S(PI * b / 2);
    p['~ParamArmLA'] = 0.5 + 0.3 * amp * (1 - 2 * kick);
    p['~ParamArmRA'] = 0.5 + 0.3 * amp * (1 - 2 * kick);
    dy = -Math.pow(S(PI * ph), 2) * 0.04 * amp;
  } else if (style === 'idol') {                    // 拍ごとに首を左右へ、小節の頭で腕を上げる
    const side = Math.floor(b) % 2 ? 1 : -1;
    const snap = 1 - Math.pow(1 - clamp(ph / 0.25), 3);
    const prev = -side;
    p.ParamAngleZ = 12 * amp * lerp(prev, side, snap);
    p.ParamAngleX = 10 * amp * lerp(prev, side, snap);
    p.ParamAngleY = 3 - 5 * amp * kick;
    p.ParamBodyAngleZ = 6 * amp * lerp(prev, side, snap);
    p.ParamBodyAngleX = 5 * amp * S(PI * b / 2);
    const bar = (b / 4) - Math.floor(b / 4);
    const up = clamp(1 - bar * 2.2) * amp;           // 小節の頭で上がって下りる
    p['~ParamArmLA'] = 0.5 + 0.45 * up;
    p['~ParamArmRA'] = 0.5 + 0.45 * up;
    p.ParamEyeLSmile = p.ParamEyeRSmile = 0.25 + 0.4 * e * k;
    dy = -Math.abs(S(PI * b)) * 0.022 * amp;
    rot = 3 * amp * lerp(prev, side, snap);
  } else if (style === 'calm') {                    // 4拍かけてゆったり
    p.ParamAngleX = 9 * amp * S(PI * b / 4);
    p.ParamAngleZ = 6 * amp * S(PI * b / 4 + 0.8);
    p.ParamAngleY = 2 * amp * S(PI * b / 2);
    p.ParamBodyAngleX = 5 * amp * S(PI * b / 4 - 0.5);
    p.ParamBodyAngleZ = 3 * amp * S(PI * b / 4);
    dy = -Math.abs(S(PI * b / 2)) * 0.008 * amp;
    rot = 1.2 * amp * S(PI * b / 4 + 0.8);
  }
  // 視線は頭の向きに少し付いていく
  p.ParamEyeBallX = clamp((p.ParamAngleX || 0) / 30, -1, 1) * 0.4;
  p.ParamEyeBallY = 0;
  // 呼吸
  p.ParamBreath = 0.5 + 0.5 * S(2 * PI * t / 3.4);
  // まばたき(4 秒ごとの区間に 1 回、区間ごとに決まった位置で)
  const win = Math.floor(t / 3.7);
  const bt = win * 3.7 + 0.4 + hash01('blink', win) * 2.6;
  const db = (t - bt) / 0.16;
  const blink = db > 0 && db < 1 ? 1 - Math.sin(Math.PI * db) : 1;
  p.ParamEyeLOpen = p.ParamEyeROpen = blink;
  return { p, dy, rot, dx };
}

/* ---------------- モデル自身のモーション(motion3.json)を時刻から評価する ----------------
   pixi-live2d-display の再生は内部時計に依存するので、決定論のために自前で読む。
   Segments: [t0, v0, 種類, 点…] 種類 0=直線 1=ベジェ(制御点2+終点) 2=階段 3=逆階段 */
function parseMotion(json, name, fin, fout) {
  const meta = json.Meta || {};
  const restricted = !!meta.AreBeziersRestricted;
  const curves = [];
  for (const c of json.Curves || []) {
    if (c.Target !== 'Parameter' && c.Target !== 'PartOpacity') continue;
    const sg = c.Segments || [];
    if (sg.length < 2) continue;
    const segs = [];
    let x0 = sg[0], y0 = sg[1], i = 2;
    while (i < sg.length) {
      const ty = sg[i];
      if (ty === 1) { segs.push({ ty, p: [x0, y0, sg[i + 1], sg[i + 2], sg[i + 3], sg[i + 4], sg[i + 5], sg[i + 6]] }); x0 = sg[i + 5]; y0 = sg[i + 6]; i += 7; }
      else { segs.push({ ty, p: [x0, y0, sg[i + 1], sg[i + 2]] }); x0 = sg[i + 1]; y0 = sg[i + 2]; i += 3; }
    }
    curves.push({ part: c.Target === 'PartOpacity', id: c.Id, first: sg[1], segs });
  }
  const dur = meta.Duration || 1;
  // 動きの大きさ(頭・体・腕の変化量/秒) … サビでは大きい動きを選ぶため
  let act = 0;
  for (const c of curves) {
    if (c.part || !/Angle|Arm|Hand|Body|Shoulder/.test(c.id)) continue;
    let prev = c.first;
    for (const g of c.segs) { const y = g.ty === 1 ? g.p[7] : g.p[3]; act += Math.abs(y - prev) / (/Angle/.test(c.id) ? 30 : 1); prev = y; }
  }
  return { name, dur, loop: meta.Loop !== false, fin: fin ?? meta.FadeInTime ?? 0.5, fout: fout ?? meta.FadeOutTime ?? 0.5, curves, restricted, act: act / dur };
}
function bez(a, b, c, d, s) { const u = 1 - s; return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d; }
function evalCurve(c, t, restricted) {
  const segs = c.segs;
  if (t <= segs[0].p[0]) return c.first;
  for (const g of segs) {
    const p = g.p;
    const x1 = g.ty === 1 ? p[6] : p[2];
    if (t > x1) continue;
    if (g.ty === 0) { const f = (t - p[0]) / ((p[2] - p[0]) || 1); return p[1] + (p[3] - p[1]) * f; }
    if (g.ty === 2) return p[1];
    if (g.ty === 3) return p[3];
    // ベジェ: 時間軸の s を二分法で求めてから値を出す(制限付きなら s は時間に比例)
    let sv;
    if (restricted) sv = (t - p[0]) / ((p[6] - p[0]) || 1);
    else { let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (bez(p[0], p[2], p[4], p[6], m) < t) lo = m; else hi = m; } sv = (lo + hi) / 2; }
    return bez(p[1], p[3], p[5], p[7], sv);
  }
  const g = segs[segs.length - 1];
  return g.ty === 1 ? g.p[7] : g.p[3];
}
function evalMotion(m, lt) {
  const t = m.loop ? ((lt % m.dur) + m.dur) % m.dur : clamp(lt, 0, m.dur);
  const out = { p: {}, parts: {} };
  for (const c of m.curves) (c.part ? out.parts : out.p)[c.id] = evalCurve(c, t, m.restricted);
  return out;
}

/* 振付表: 歌詞の1行ごとにモーションを切り替える(サビ/盛り上がりは大きい動き、静かな所は小さい動き)。
   モーションの長さは小節に合わせて伸縮。行の間が空いたら一番おだやかなモーションで待つ */
function buildChoreo(engine, d, stage) {
  const tl = engine.timeline || {};
  const lyr = (tl.tracks && tl.tracks.lyrics) || [];
  const key = [stage.url, lyr.length, lyr.length ? lyr[0].start + '/' + lyr[lyr.length - 1].end : '', tl.bpm || 0, d.seed || 0].join('|');
  if (stage._choreoKey === key) return stage._choreo;
  const ms = stage.motions;
  const lines = new Map();
  for (const w of lyr) {
    if (!w || !String(w.word || '').trim()) continue;
    const k = w.line ?? 0, L = lines.get(k) || { start: Infinity, end: -Infinity };
    L.start = Math.min(L.start, +w.start || 0); L.end = Math.max(L.end, +w.end || +w.start || 0); lines.set(k, L);
  }
  const ls = [...lines.values()].filter(l => isFinite(l.start)).sort((a, b) => a.start - b.start);
  const byAct = ms.map((m, i) => i).sort((a, b) => ms[a].act - ms[b].act);
  const calm = byAct[0], half = Math.max(1, Math.ceil(byAct.length / 2));
  const lowPool = byAct.slice(0, half + 1), highPool = byAct.slice(Math.max(0, byAct.length - half - 1));
  const bl = tl.bpm ? 60 / tl.bpm : 0.5, bar = bl * 4;
  const speedFor = m => { const n = Math.max(1, Math.round(m.dur / bar)); return clamp(m.dur / (n * bar), 0.75, 1.35); };
  const ent = [{ start: -1e9, mi: calm, speed: 1 }];
  let prev = -1;
  ls.forEach((l, i) => {
    let e = 0, n = 0;
    for (let x = l.start; x <= l.end; x += 0.25) { e += engine.energyAt(x); n++; }
    const sc = engine.sceneAt ? engine.sceneAt((l.start + l.end) / 2) : null;
    const hot = (sc && /chorus|サビ/i.test(sc.label || '')) || e / Math.max(1, n) > 0.68;
    const pool = (hot ? highPool : lowPool).filter(k => k !== prev);
    const mi = (pool.length ? pool : byAct)[Math.floor(hash01(stage.url, i, d.seed || 0) * (pool.length || byAct.length))];
    ent.push({ start: l.start - 0.25, mi, speed: speedFor(ms[mi]), hot });
    prev = mi;
    const next = ls[i + 1];
    if (next && next.start - l.end > 2.6) { ent.push({ start: l.end + 0.4, mi: calm, speed: 1 }); prev = calm; }
  });
  stage._choreoKey = key; stage._choreo = ent;
  return ent;
}
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
/* 時刻 t のモーションの値(前のモーションからクロスフェード) */
function motionAt(engine, d, stage, t) {
  const ent = buildChoreo(engine, d, stage);
  let lo = 0, hi = ent.length - 1, k = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (ent[m].start <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  const cur = ent[k], mc = stage.motions[cur.mi];
  const ev = e => evalMotion(stage.motions[e.mi], Math.max(0, t - Math.max(0, e.start)) * e.speed);
  const a = ev(cur);
  const w = smooth((t - cur.start) / Math.max(0.2, mc.fin));
  if (w >= 1 || k === 0) return { v: a, hot: !!cur.hot };
  const b = ev(ent[k - 1]);
  const out = { p: {}, parts: {} };
  for (const id of new Set([...Object.keys(a.p), ...Object.keys(b.p)])) {
    const da = stage.def[id] ?? 0;
    out.p[id] = lerp(b.p[id] ?? da, a.p[id] ?? da, w);
  }
  for (const id of new Set([...Object.keys(a.parts), ...Object.keys(b.parts)])) out.parts[id] = lerp(b.parts[id] ?? 1, a.parts[id] ?? 1, w);
  return { v: out, hot: !!cur.hot || (!!ent[k - 1].hot && w < 0.5) };
}

/* 'motion' スタイル: モデルのモーション + 拍のノリ(うなずき・沈み・肩)+ 表情(サビで頬・笑顔・眉)+ 視線 */
function motionDance(engine, d, stage, t) {
  const tl = engine.timeline || {};
  const k = d.intensity ?? 0.7;
  const { v, hot } = motionAt(engine, d, stage, t);
  const p = {};
  const gain = 0.55 + 0.75 * k;                      // モーションの振れ幅
  for (const id in v.p) { const df = stage.def[id] ?? 0; p[id] = df + (v.p[id] - df) * (/Eye|Mouth|Brow|Cheek/.test(id) ? 1 : gain); }
  const e = clamp(engine.energyAt(t));
  const bl = tl.bpm ? 60 / tl.bpm : 0;
  if (bl) {
    const b = (t - (tl.beatOffset || 0) - (d.offset || 0)) / bl, ph = b - Math.floor(b);
    const kick = Math.exp(-ph * 6.5) * k * (0.6 + 0.6 * e);
    p.ParamAngleY = (p.ParamAngleY ?? 0) - 7 * kick;          // 拍でうなずく
    p.ParamBodyAngleY = (p.ParamBodyAngleY ?? 0) - 4 * kick;  // 体が沈む
    p.ParamAngleZ = (p.ParamAngleZ ?? 0) + 3 * k * Math.sin(Math.PI * b);
    if (stage.idx.ParamShoulder != null) { const [mn, mx] = stage.rng.ParamShoulder; p.ParamShoulder = (p.ParamShoulder ?? stage.def.ParamShoulder ?? 0) + (mx - mn) * 0.18 * kick; }
  }
  // 表情: サビ・盛り上がりで頬を染めて笑顔、眉を上げる
  const joy = clamp((hot ? 0.75 : 0) + (e - 0.55) * 1.2) * (0.5 + 0.5 * k);
  if (stage.idx.ParamCheek != null) p.ParamCheek = Math.max(p.ParamCheek ?? 0, joy);
  p.ParamEyeLSmile = Math.max(p.ParamEyeLSmile ?? 0, joy * 0.7);
  p.ParamEyeRSmile = Math.max(p.ParamEyeRSmile ?? 0, joy * 0.7);
  p.ParamBrowLY = (p.ParamBrowLY ?? 0) + joy * 0.4;
  p.ParamBrowRY = (p.ParamBrowRY ?? 0) + joy * 0.4;
  // 視線: 歌っている間はこちらを見る、間奏では少し見回す
  const words = engine._l2dWords(tl);
  const wi = wordAt(words, t);
  const singing = wi >= 0 && t <= (words[wi].end || words[wi].start) + 0.6;
  const look = singing ? 0 : 1;
  p.ParamEyeBallX = lerp((p.ParamEyeBallX ?? 0) * 0.3, Math.sin(t * 0.9) * 0.6, look);
  p.ParamEyeBallY = lerp((p.ParamEyeBallY ?? 0) * 0.3, Math.sin(t * 0.63 + 1) * 0.3, look);
  // 呼吸・まばたき(モーションの目の開きに掛け合わせる)
  p.ParamBreath = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / 3.4);
  const win = Math.floor(t / 3.7), bt = win * 3.7 + 0.4 + hash01('blink', win) * 2.6, db = (t - bt) / 0.16;
  const blink = db > 0 && db < 1 ? 1 - Math.sin(Math.PI * db) : 1;
  p.ParamEyeLOpen = (p.ParamEyeLOpen ?? 1) * blink;
  p.ParamEyeROpen = (p.ParamEyeROpen ?? 1) * blink;
  const dy = bl ? -Math.pow(Math.sin(Math.PI * ((t - (tl.beatOffset || 0)) / bl)), 2) * 0.008 * k : 0;
  return { p, parts: v.parts, dy, rot: 0, dx: 0, mouthForm: p.ParamMouthForm };
}

class Live2DStage {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 16;
    this.app = null; this.model = null; this.url = null; this.ready = false; this.loading = null;
    this.simT = null; this.elapsed = 0; this.cur = { p: {} };
    this.failAt = 0; this.failedUrl = null; this.error = null;
  }
  static available() { return !!(window.PIXI && window.PIXI.live2d && window.Live2DCubismCore); }
  _ensureApp() {
    if (this.app) return;
    this.app = new PIXI.Application({ view: this.canvas, width: 16, height: 16, backgroundAlpha: 0, autoStart: false, antialias: true, preserveDrawingBuffer: true, resolution: 1 });
    this.app.ticker.stop();
  }
  load(url) {
    if (!Live2DStage.available()) return Promise.reject(new Error('Live2D の部品(Cubism Core)が読み込まれていません'));
    if (this.url === url && (this.ready || this.loading)) return this.loading || Promise.resolve();
    if (url === this.failedUrl && performance.now() - this.failAt < 5000) return Promise.reject(this.error || new Error('retry later'));
    this.url = url; this.ready = false;
    this._ensureApp();
    this.loading = (async () => {
      const model = await PIXI.live2d.Live2DModel.from(url, { autoInteract: false, autoUpdate: false });
      if (this.url !== url) { model.destroy(); return; }
      if (this.model) { this.app.stage.removeChild(this.model); this.model.destroy(); }
      const im = model.internalModel;
      im.eyeBlink = undefined;                                         // まばたきは時刻から決める
      try { im.motionManager.state.shouldRequestIdleMotion = () => false; im.motionManager.stopAllMotions(); } catch (e) {}
      const cm = im.coreModel;
      const ids = cm.getModel().parameters.ids;
      this.idx = {}; this.rng = {};
      for (let i = 0; i < ids.length; i++) { this.idx[ids[i]] = i; this.rng[ids[i]] = [cm.getParameterMinimumValue(i), cm.getParameterMaximumValue(i)]; }
      this.def = {};
      for (let i = 0; i < ids.length; i++) this.def[ids[i]] = cm.getParameterDefaultValue(i);
      // モデル自身のモーションを全部読む(グループは問わない)
      this.motions = [];
      try {
        const mj = await (await fetch(url)).json();
        const groups = (mj.FileReferences && mj.FileReferences.Motions) || {};
        const base = new URL(url, location.href);
        const list = [];
        for (const g of Object.keys(groups)) for (const m of groups[g] || []) if (m && m.File) list.push({ g, m });
        const seen = new Set();
        for (const { g, m } of list) {
          if (seen.has(m.File)) continue; seen.add(m.File);
          try { const js = await (await fetch(new URL(m.File, base))).json(); this.motions.push(parseMotion(js, g + ':' + m.File, m.FadeInTime, m.FadeOutTime)); } catch (e) { /* 読めないモーションは飛ばす */ }
        }
      } catch (e) { /* モーション無しのモデル */ }
      this._choreoKey = null;
      im.on('afterMotionUpdate', () => this._apply());
      this.model = model;
      this.app.stage.addChild(model);
      this.baseW = im.width; this.baseH = im.height;
      this.simT = null; this.ready = true; this.error = null; this.loading = null;
    })().catch(e => { this.error = e; this.failAt = performance.now(); this.failedUrl = url; this.url = null; this.loading = null; throw e; });
    return this.loading;
  }
  _apply() {
    const cm = this.model.internalModel.coreModel, p = this.cur.p;
    if (this.cur.parts) for (const id in this.cur.parts) cm.setPartOpacityById(id, clamp(this.cur.parts[id]));
    for (const key in p) {
      const norm = key[0] === '~';
      const id = norm ? key.slice(1) : key;
      const i = this.idx[id];
      if (i == null) continue;
      const [mn, mx] = this.rng[id];
      const v = norm ? mn + (mx - mn) * clamp(p[key]) : clamp(p[key], mn, mx);
      cm.setParameterValueByIndex(i, v);
    }
  }
  /* 時刻 t の姿を描く。drive(t) → {p:{パラメータ}, dy, rot, dx}。w×h は描画先の大きさ */
  renderAt(t, drive, w, h) {
    if (!this.ready || !this.model) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) this.app.renderer.resize(w, h);
    const im = this.model.internalModel;
    const STEP = 1 / 30;
    if (this.simT == null || t < this.simT - 1e-4 || t - this.simT > 0.5) this.simT = t - 1.2;   // 時刻が飛んだら物理を回し直す
    while (this.simT + STEP <= t - 1e-6) {
      this.simT += STEP; this.cur = drive(this.simT); this.elapsed += STEP * 1000;
      im.update(STEP * 1000, this.elapsed);
    }
    const dt = Math.max(0, t - this.simT);
    this.simT = t; this.cur = drive(t); this.elapsed += dt * 1000;
    im.update(dt * 1000, this.elapsed);
    // 配置: 描画先の下端に足元、高さいっぱい(上に少し余白)。拍の上下・傾きはここで
    const s = (h * 0.94) / this.baseH;
    const m = this.model;
    m.scale.set(s);
    m.pivot.set(this.baseW / 2, this.baseH);
    m.position.set(w / 2 + (this.cur.dx || 0) * h, h + (this.cur.dy || 0) * h);
    m.rotation = ((this.cur.rot || 0) * Math.PI) / 180;
    m.deltaTime = 0; m.elapsedTime = this.elapsed;                         // 描画時の内部更新で時間を進めない
    this.app.renderer.render(this.app.stage);
    return true;
  }
  aspect() { return this.ready ? this.baseW / this.baseH : 0.6; }
}

window.Live2DStage = {
  create: () => new Live2DStage(),
  available: () => Live2DStage.available(),
  /* FX エンジン用の駆動関数(時刻 → 姿勢) */
  driver: (engine, d, stage) => t => {
    const useMotion = (d.style || 'motion') === 'motion' && stage && stage.motions && stage.motions.length;
    const dn = useMotion ? motionDance(engine, d, stage, t) : dance(engine, d, t);
    // 口は 3 点平均で少しなめらかに(時刻の関数のまま)
    const a = lip(engine, d, t), b = lip(engine, d, t - 0.025), c = lip(engine, d, t - 0.05);
    dn.p.ParamMouthOpenY = (a.open * 2 + b.open + c.open) / 4;
    const form = (a.form * 2 + b.form + c.form) / 4;
    dn.p.ParamMouthForm = dn.mouthForm != null ? lerp(dn.mouthForm, form, 0.75) : form;
    return dn;
  },
  hasMotions: stage => !!(stage && stage.motions && stage.motions.length),
  SAMPLE: { name: 'Hiyori(Live2D 公式サンプル)', url: '/live2d-samples/hiyori/Hiyori.model3.json' },
  _moras: moras,
};
})();
