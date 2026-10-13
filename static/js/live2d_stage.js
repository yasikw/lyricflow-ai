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
  const style = d.style || 'groove';
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
  driver: (engine, d) => t => {
    const dn = dance(engine, d, t);
    // 口は 3 点平均で少しなめらかに(時刻の関数のまま)
    const a = lip(engine, d, t), b = lip(engine, d, t - 0.025), c = lip(engine, d, t - 0.05);
    dn.p.ParamMouthOpenY = (a.open * 2 + b.open + c.open) / 4;
    dn.p.ParamMouthForm = (a.form * 2 + b.form + c.form) / 4;
    return dn;
  },
  SAMPLE: { name: 'Hiyori(Live2D 公式サンプル)', url: '/live2d-samples/hiyori/Hiyori.model3.json' },
  _moras: moras,
};
})();
