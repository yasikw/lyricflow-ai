/* LyricFlow 演出パック: p_sr_layouts_r — ショーリール構図R(粒子の銀河・リキャップ格子・交差ワイヤー・エンドカード・
   クローム立体・傾く文字の輪・波形見出し)。
   契約: docs/COMPOSE_PACKS.md  (group: layout)  共通ヘルパー: L.mg (p_motion_graphics.js)
   モーションデザインのショーリールの「原理」だけを参考に、全て計算(Canvas2D)で自作。文字列・ロゴは写さない。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_sr_layouts_r';
const clamp = L.clamp, lerp = L.lerp, TAU = L.TAU;

/* ---------------------------------------------------------------- helpers */
/* カット頭からの拍位置(BPM無しは 0.5 秒拍) */
const beatPos = env => {
  const b = env.beat, c = env.cut;
  if (b && b.len > 0 && c && c.beat0 != null) return Math.max(0, b.index - c.beat0 + b.since / b.len);
  return Math.max(0, env.ltb) / M.beatLen(env);
};
const stepped = (env, fr = 0.5, ease = E.inOutCubic) => {
  const p = beatPos(env), k = Math.floor(p);
  return k + ease(clamp((p - k) / fr));
};
const kick = env => { const p = beatPos(env); return Math.exp(-(p - Math.floor(p)) * M.beatLen(env) / 0.11); };
const ih = (a, b = 0, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9e37, 668265263) ^ Math.imul((c | 0) + 0x51ed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return h >>> 0;
};
const ir = (a, b, c) => ih(a, b, c) / 4294967296;
const frac = x => x - Math.floor(x);
const pad2 = M.pad2;

/* 歌詞の項目(箱 w×h に収める) */
const fitItem = (env, x, y, w, h, o = {}) => {
  const font = o.font || L.roleFont(env, o.role || 'display');
  const n = env.cut.n;
  const rows = o.rows || (n > 14 ? 3 : n > 5 ? 2 : 1);
  const fit = M.fitLines(env, env.cut.text, font, w, h, o.cap || Math.min(env.W, env.H) * 0.2, rows);
  return Object.assign({ text: fit.text, font, size: fit.size, x, y }, o.item || {});
};
/* 複数行は行ごとに mi をずらして */
const drawRows = (env, it) => {
  const rows = String(it.text).split('\n');
  if (rows.length < 2) return L.mainDraw(env, it);
  const lh = it.size * (it.lead || 1.18);
  let bb = null;
  rows.forEach((r, i) => { bb = L.unionBB(bb, L.mainDraw(env, Object.assign({}, it, { text: r, y: it.y + (i - (rows.length - 1) / 2) * lh, mi: i }))); });
  return bb;
};
const label = (env, text, x, y, a, o = {}) => {
  if (a <= 0.01 || !text) return null;
  return M.anchored(env, Object.assign({ text, font: M.MONO, weight: 700, size: Math.max(8, env.u * 18), x, y, color: env.sc.sub, alpha: a, ghost: false, track: 0.12 }, o), o.anchor || 'left');
};
/* 図形領域と文字領域(横長=左右、縦長/正方形=上下) */
const split = (env, fr = 0.46, flip = false) => {
  const { W, H, portrait } = env;
  const stack = portrait || W / H < 1.3;
  const mx = W * 0.06, my = H * 0.07;
  if (stack) {
    const gh = (H - my * 2) * 0.54;
    return { stack, g: { x: W / 2, y: my + gh / 2, w: W - mx * 2, h: gh }, t: { x: W / 2, y: my + gh + (H - my * 2 - gh) / 2, w: W - mx * 2, h: (H - my * 2 - gh) * 0.84 } };
  }
  const gw = (W - mx * 2) * fr, tw = (W - mx * 2) - gw - W * 0.04;
  return { stack, g: { x: flip ? W - mx - gw / 2 : mx + gw / 2, y: H / 2, w: gw, h: H - my * 2 }, t: { x: flip ? mx + tw / 2 : W - mx - tw / 2, y: H / 2, w: tw, h: (H - my * 2) * 0.78 } };
};
const rrPath = (ctx, x, y, w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

/* 左揃えの積み見出し: 行ごとの項目(mi 0,1,…)。box = {x0, cy, w, h}。最後の行が差し色 */
const stackCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => stackCache.clear());
const stackLines = (env, text, box, o = {}) => {
  const font = o.font || L.roleFont(env, 'display');
  const cap = o.cap || Math.min(env.W, env.H) * 0.3, lead = o.lead || 1.04;
  const key = [text, font, box.w | 0, box.h | 0, cap | 0, lead].join('|');
  let r = stackCache.get(key);
  if (!r) {
    const n = L.glyphCount(text);
    const cands = n <= 1 ? [1] : n > 11 ? [2, 3] : [2];
    let best = null;
    for (const rows of cands) {
      let lines = L.splitLines(text, Math.ceil(n / rows)).map(s => s.trim()).filter(Boolean);
      if (!lines.length) lines = [text];
      const k = lines.length;
      const hPer = box.h / (1 + lead * (k - 1)) / 1.18;
      let size = cap;
      for (const ln of lines) size = Math.min(size, L.fitSize(ln, font, box.w, hPer * 1.18, { max: cap }));
      if (!best || size > best.size * 1.1) best = { lines, size };
    }
    const ws = best.lines.map(ln => L.measure({ text: ln, font, size: best.size }).w);
    r = { lines: best.lines, size: best.size, ws, font };
    if (stackCache.size > 200) stackCache.clear();
    stackCache.set(key, r);
  }
  const k = r.lines.length, total = r.size * (1 + lead * (k - 1));
  const items = r.lines.map((ln, i) => ({
    text: ln, font: r.font, size: r.size, x: box.x0 + r.ws[i] / 2, y: box.cy - total / 2 + r.size / 2 + i * r.size * lead, mi: i,
    color: k > 1 && i === k - 1 ? (o.c2 || env.sc.accent) : (o.c1 || env.sc.fg),
  }));
  return { items, size: r.size, x0: box.x0, x1: box.x0 + Math.max(...r.ws), y0: box.cy - total / 2 - r.size * 0.09, y1: box.cy + total / 2 + r.size * 0.09, ws: r.ws };
};
const drawItems = (env, items) => { let bb = null; for (const it of items) bb = L.unionBB(bb, L.mainDraw(env, it)); return bb; };

/* ================================================================ 1. 粒子の銀河 */
const galCache = new Map();
const galaxyPts = (N, seed, arms) => {
  const key = N + '|' + seed + '|' + arms;
  let g = galCache.get(key);
  if (g) return g;
  const S = new Float32Array(N * 3), R = new Float32Array(N * 3), G = new Float32Array(N * 3);
  const cS = new Uint8Array(N), cR = new Uint8Array(N), cG = new Uint8Array(N), d = new Float32Array(N);
  const gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    // 球(フィボナッチ格子)
    const y = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - y * y), th = i * gold;
    S[i * 3] = Math.cos(th) * rr; S[i * 3 + 1] = y; S[i * 3 + 2] = Math.sin(th) * rr;
    cS[i] = ih(seed, i, 1) % 9 === 0 ? 1 : 0;
    // 8の字のリボン(帯の幅方向がねじれる)
    const t = (i + ir(seed, i, 2) * 0.8) / N * TAU, w = ir(seed, i, 3) * 2 - 1;
    const tw = t * 2;
    R[i * 3] = 1.3 * Math.sin(t);
    R[i * 3 + 1] = 0.58 * Math.sin(2 * t) + w * 0.17 * Math.cos(tw);
    R[i * 3 + 2] = 0.3 * Math.cos(t) + w * 0.17 * Math.sin(tw);
    cR[i] = Math.abs(w) > 0.88 ? 0 : w > 0 ? 1 : 2;
    // 渦巻き銀河(円盤)
    const core = ir(seed, i, 4) < 0.16;
    const arm = i % arms;
    const rg = core ? Math.pow(ir(seed, i, 5), 1.6) * 0.3 : 0.12 + Math.pow(ir(seed, i, 5), 0.7) * 1.15;
    const ang = arm * TAU / arms + rg * 3.1 + (ir(seed, i, 6) - 0.5) * (core ? TAU : 0.55 * (0.4 + rg));
    G[i * 3] = Math.cos(ang) * rg; G[i * 3 + 2] = Math.sin(ang) * rg;
    G[i * 3 + 1] = (ir(seed, i, 7) - 0.5) * 0.12 * (1.4 - rg);
    cG[i] = core || ir(seed, i, 8) < 0.18 ? 0 : arm % 3 === 0 ? 1 : arm % 3 === 1 ? 2 : 0;
    d[i] = ir(seed, i, 9) * 0.12;
  }
  g = { S, R, G, cS, cR, cG, d, N };
  if (galCache.size > 16) galCache.clear();
  galCache.set(key, g);
  return g;
};
const gX = new Float32Array(1000), gY = new Float32Array(1000), gD = new Float32Array(1000), gA = new Float32Array(1000), gC = new Uint8Array(1000);

L.register('layout', 'r_galaxy', {
  name: '粒子の銀河', tags: ['cyber', 'emotional', 'graphic', 'dark'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({
    n: rng.int(70, 90) * 10, mode: cut.portrait ? 'below' : cut.n > 12 ? rng.pick(['below', 'side']) : rng.pick(['side', 'below', 'center']),
    flip: rng.chance(0.5), tilt: rng.range(0.38, 0.6), spin: rng.sign(), arms: rng.pick([2, 2, 3]), seed: rng.int(1, 99999),
  }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    let cx, cy, R, it, s = null, center = false;
    if (p.mode === 'center') {
      center = true; cx = W / 2; cy = H / 2; R = Math.min(W * 0.3, H * 0.36);
      it = fitItem(env, W / 2, H / 2, W * 0.5, H * 0.2, { cap: m * 0.12 });
    } else if (p.mode === 'side' && !(env.portrait || W / H < 1.3)) {
      s = split(env, 0.48, p.flip);
      cx = s.g.x; cy = s.g.y; R = Math.min(s.g.w / 2 / 1.55, s.g.h / 2 / 1.2);
      it = fitItem(env, s.t.x, s.t.y, s.t.w, s.t.h);
    } else {
      const port = env.portrait;
      const gh = H * (port ? 0.5 : 0.56);
      cx = W / 2; cy = H * (port ? 0.34 : 0.36); R = Math.min(W * 0.86 / 2 / 1.55, gh / 2 / 1.15);
      it = fitItem(env, W / 2, H * (port ? 0.75 : 0.8), W * 0.86, H * (port ? 0.22 : 0.2), { cap: m * 0.16 });
    }
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, seed = p.seed || 1;
      const N = Math.min(env.allowFilter ? 900 : 500, p.n || 800);
      const g = galaxyPts(N, seed, p.arms || 2);
      const T = Math.max(1.2, cut.dur - cut.outDur * 0.5), sP = clamp(env.ltb / T);
      const grow = (0.25 + 0.75 * E.outCubic(clamp(env.lt / 0.7))) * (1 + kick(env) * 0.035);
      const out = E.inCubic(env.pOut);
      const ay = (p.spin || 1) * (env.ltb * 0.35 + stepped(env, 0.5, E.outBack) * 0.1), ax = p.tilt || 0.5;
      const cyA = Math.cos(ay), syA = Math.sin(ay), cxA = Math.cos(ax), sxA = Math.sin(ax);
      const rb = -ay + Math.sin(env.ltb * 0.8) * 0.45, cRb = Math.cos(rb), sRb = Math.sin(rb);
      const bi = env.beat ? env.beat.index : Math.floor(beatPos(env)), K = kick(env);
      const base = Math.max(1, u * 3.3 * R / (m * 0.33));
      const dist = 6;
      for (let i = 0; i < N; i++) {
        const di = g.d[i];
        const m1 = E.inOutCubic(clamp((sP - 0.1 - di) / 0.24)), m2 = E.inOutCubic(clamp((sP - 0.52 - di) / 0.26));
        const j = i * 3;
        const rx = g.R[j] * cRb + g.R[j + 2] * sRb, rz = -g.R[j] * sRb + g.R[j + 2] * cRb;   // リボンは常にほぼ正面を向く
        let x = lerp(lerp(g.S[j], rx, m1), g.G[j], m2);
        let y = lerp(lerp(g.S[j + 1], g.R[j + 1], m1), g.G[j + 1], m2);
        let z = lerp(lerp(g.S[j + 2], rz, m1), g.G[j + 2], m2);
        // 変形中はねじる(高さ・半径に比例した回転)
        const tw = m1 * (1 - m1) * 4 * y * 2.4 + m2 * (1 - m2) * 4 * (1.3 - Math.hypot(x, z)) * 2.2;
        if (tw) { const c = Math.cos(tw), sn = Math.sin(tw); const X = x * c - z * sn; z = x * sn + z * c; x = X; }
        if (out > 0) { const k = 1 + out * (0.8 + ir(seed, i, 11) * 1.6); x *= k; y *= k; z *= k; }
        // 回転(y→x)
        let X = x * cyA + z * syA, Z = -x * syA + z * cyA;
        const Y = y * cxA - Z * sxA; Z = y * sxA + Z * cxA;
        const kp = dist / Math.max(0.5, dist + Z);
        gX[i] = cx + X * R * grow * kp; gY[i] = cy + Y * R * grow * kp;
        const front = clamp(0.5 - Z * 0.5);
        gD[i] = base * kp * (0.55 + 0.6 * front) * (i % 8 === ((bi % 8) + 8) % 8 ? 1 + K * 1.4 : 1);
        gA[i] = io * (0.22 + 0.78 * front);
        gC[i] = m2 > 0.5 ? g.cG[i] : m1 > 0.5 ? g.cR[i] : g.cS[i];
      }
      const cols = [sc.fg, sc.accent, sc.accent2];
      ctx.save();
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = cols[c];
        for (let i = 0; i < N; i++) {
          if (gC[i] !== c) continue;
          ctx.globalAlpha = gA[i];
          const d = gD[i];
          ctx.fillRect(gX[i] - d / 2, gY[i] - d / 2, d, d);
        }
      }
      ctx.restore();
    }
    if (s) {
      const sP = clamp(env.ltb / Math.max(1.2, cut.dur - cut.outDur * 0.5));
      const st = sP < 0.24 ? 'SPHERE' : sP < 0.66 ? 'RIBBON' : 'GALAXY';
      label(env, `PARTICLES ${String(p.n || 800).padStart(4, '0')} · ${st}`, cx, cy + R * 1.28 + u * 10, io * 0.75, { anchor: 'center' });
    }
    if (center) {
      const bb0 = L.itemBox(it), e = E.outCubic(clamp(env.lt / 0.4)) * (1 - E.inCubic(env.pOut));
      if (e > 0.002) {
        const pw = (bb0.w + m * 0.08) * (0.85 + 0.15 * e), ph = bb0.h + m * 0.05;
        env.rrect(W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, u * 10, sc.bg, 0.82 * e, false, L.rgba(sc.fg, 0.3), Math.max(1, u * 1.5));
      }
      return drawRows(env, it);
    }
    return drawRows(env, Object.assign(it, { shadow: { color: L.rgba(sc.bg, 0.9), blur: it.size * 0.3 } }));
  },
}, P);

/* ================================================================ 2. リキャップ格子 */
const MOTIFS = 12;
/* タイル内の小さなモチーフ(原点=タイル中心、w×h、main パスのみ) */
const drawMotif = (env, ctx, kind, w, h, pal, t, bp, K, seed) => {
  const mn = Math.min(w, h), u = env.u;
  ctx.fillStyle = pal.fg; ctx.strokeStyle = pal.fg;
  switch (kind) {
    case 0: {                                     // 弾むボール(つぶれと伸び、点線の軌跡)
      const gy = h * 0.28, r = mn * 0.11, f = frac(bp);
      const hop = 4 * f * (1 - f), sq = Math.exp(-Math.min(f, 1 - f) * 16);
      const x = -w * 0.3 + frac(bp / 4) * w * 0.6, y = gy - r - hop * h * 0.42;
      ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, u * 1.5);
      ctx.beginPath(); ctx.moveTo(-w * 0.42, gy); ctx.lineTo(w * 0.42, gy); ctx.stroke();
      ctx.globalAlpha = 0.45;
      for (let k = 1; k <= 6; k++) {
        const f2 = f - k * 0.06; if (f2 < 0) break;
        const x2 = x - k * w * 0.6 * 0.06 / 4, y2 = gy - r - 4 * f2 * (1 - f2) * h * 0.42;
        ctx.fillRect(x2 - u * 1.5, y2 - u * 1.5, u * 3, u * 3);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = pal.hi;
      ctx.beginPath(); ctx.ellipse(x, y + r * sq * 0.3, r * (1 + sq * 0.3 - hop * 0.06), r * (1 - sq * 0.3 + hop * 0.1), 0, 0, TAU); ctx.fill();
      break;
    }
    case 1: {                                     // ドット格子の波紋
      const cols = 7, rows = Math.max(3, Math.round(7 * h / w)), sp = Math.min(w / (cols + 0.5), h / (rows + 0.5));
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = (i - (cols - 1) / 2) * sp, y = (j - (rows - 1) / 2) * sp;
        const d = Math.hypot(x, y) / sp;
        const r = sp * (0.12 + 0.24 * (0.5 + 0.5 * Math.sin(d * 0.9 - t * 4)));
        ctx.globalAlpha = 1; ctx.fillStyle = (i + j + Math.floor(bp)) % 7 === 0 ? pal.hi : pal.fg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      break;
    }
    case 2: {                                     // 斜めの縞(流れる)
      const sp = mn * 0.22, off = frac(t * 0.6) * sp * 2;
      ctx.save(); ctx.rotate(-0.62);
      const D = Math.hypot(w, h) / 2 + sp * 2;
      for (let x = -D - sp * 2 + off, k = 0; x < D; x += sp, k++) { ctx.fillStyle = k % 2 ? pal.hi : pal.fg; ctx.globalAlpha = k % 2 ? 0.9 : 0.75; ctx.fillRect(x, -D, sp * 0.45, D * 2); }
      ctx.restore();
      break;
    }
    case 3: {                                     // 揺れるブロブ
      const r = mn * 0.3 * (1 + K * 0.08);
      ctx.fillStyle = pal.hi; ctx.globalAlpha = 1; ctx.beginPath();
      for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU, f = 1 + 0.1 * Math.sin(3 * a + t * 2.2) + 0.06 * Math.sin(5 * a - t * 1.7); const x = Math.cos(a) * r * f, y = Math.sin(a) * r * f; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.fill();
      ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(1, u * 2); ctx.strokeStyle = pal.fg;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.35, t, t + 2.2); ctx.stroke();
      break;
    }
    case 4: {                                     // 2本のドットのリボン
      const n = 22;
      for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) {
        const x = -w * 0.4 + i / (n - 1) * w * 0.8, ph = i * 0.42 + t * 3 + s * Math.PI;
        const y = Math.sin(ph) * h * 0.22, dz = 0.5 + 0.5 * Math.cos(ph);
        ctx.fillStyle = s ? pal.hi : pal.fg; ctx.globalAlpha = 0.35 + 0.65 * dz;
        const r = mn * (0.018 + 0.026 * dz);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      break;
    }
    case 5: {                                     // 流れるコード行+ブロックカーソル
      const lh = h * 0.13, off = frac(t * 0.5) * lh;
      for (let k = -1; k < 9; k++) {
        const y = -h * 0.42 + k * lh - off + lh / 2, row = Math.floor(t * 0.5) + k;
        if (y < -h * 0.46 || y > h * 0.4) continue;
        const ind = (ih(seed, row, 1) % 3) * w * 0.07, len = w * (0.2 + (ih(seed, row, 2) % 100) / 100 * 0.45);
        ctx.fillStyle = ih(seed, row, 3) % 4 === 0 ? pal.hi : pal.fg; ctx.globalAlpha = 0.75;
        ctx.fillRect(-w * 0.4 + ind, y - lh * 0.18, len, lh * 0.36);
        if (k === 7 && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = pal.hi; ctx.globalAlpha = 1; ctx.fillRect(-w * 0.4 + ind + len + lh * 0.3, y - lh * 0.3, lh * 0.4, lh * 0.6); }
      }
      break;
    }
    case 6: {                                     // イコライザー
      const n = 7, bw = w * 0.8 / n;
      for (let i = 0; i < n; i++) {
        const v = clamp(0.2 + 0.6 * (0.5 + 0.5 * L.noise1(t * 2.4 + i * 1.7, seed)) + K * 0.25 * (i % 2 ? 1 : 0.5));
        const bh = v * h * 0.66;
        ctx.fillStyle = i === (Math.floor(bp) % n) ? pal.hi : pal.fg; ctx.globalAlpha = 0.9;
        ctx.fillRect(-w * 0.4 + i * bw + bw * 0.18, h * 0.33 - bh, bw * 0.64, bh);
      }
      break;
    }
    case 7: {                                     // 回る弧の輪+衛星
      const r = mn * 0.3;
      ctx.lineWidth = Math.max(1.5, mn * 0.05); ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = k === 1 ? pal.hi : pal.fg; ctx.globalAlpha = 0.9; const a = t * (1.2 + k * 0.5) * (k % 2 ? -1 : 1) + k * 2; ctx.beginPath(); ctx.arc(0, 0, r * (1 - k * 0.28), a, a + 1.6 + k * 0.6); ctx.stroke(); }
      const a = stepped(env, 0.5, E.outBack) * TAU / 4;
      ctx.fillStyle = pal.hi; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, mn * 0.05, 0, TAU); ctx.fill();
      break;
    }
    case 8: {                                     // 細い一字+点(丸が拍で脈打つ)
      const g = L.glyphs(env.cut.text.replace(/\s/g, ''))[0] || 'a';
      const fs = mn * 0.52;
      ctx.globalAlpha = 1; ctx.fillStyle = pal.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `400 ${fs.toFixed(1)}px ${L.fontFam(L.roleFont(env, 'serif'))}`;
      ctx.fillText(g, -mn * 0.06, mn * 0.06);
      ctx.fillStyle = pal.hi; ctx.beginPath(); ctx.arc(mn * 0.3, -mn * 0.26, mn * (0.06 + 0.03 * K), 0, TAU); ctx.fill();
      break;
    }
    case 9: {                                     // ハーフトーン球
      const n = 9, sp = mn * 0.78 / n, lx = Math.cos(t * 0.9) * 0.5, ly = -0.4;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) / ((n - 1) / 2), y = (j - (n - 1) / 2) / ((n - 1) / 2), q = 1 - x * x - y * y;
        if (q <= 0) continue;
        const z = Math.sqrt(q), sh = clamp(0.25 + 0.75 * (x * lx + y * ly + z * 0.75));
        ctx.fillStyle = (i * 3 + j) % 11 === Math.floor(bp) % 11 ? pal.hi : pal.fg; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x * sp * (n - 1) / 2, y * sp * (n - 1) / 2, sp * 0.48 * sh, 0, TAU); ctx.fill();
      }
      break;
    }
    case 10: {                                    // 小さなマーキー(段ごとに逆向き)
      const fs = Math.max(6, h * 0.16), word = 'LYRIC  ●  ';
      ctx.font = `700 ${fs.toFixed(1)}px ${M.MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const ww = ctx.measureText(word).width || fs * 5;
      for (let k = 0; k < 3; k++) {
        const y = (k - 1) * fs * 1.5, dir = k % 2 ? 1 : -1;
        const off = frac(t * 0.35 * dir) * ww;
        ctx.fillStyle = k === 1 ? pal.hi : pal.fg; ctx.globalAlpha = k === 1 ? 1 : 0.7;
        for (let x = -w / 2 - ww + off; x < w / 2; x += ww) ctx.fillText(word, x, y);
      }
      break;
    }
    default: {                                    // ワイヤー立方体
      const v = M.projectCube(0, 0, mn * 0.2, 0.5 + K * 0.3, t * 1.1);
      ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1, mn * 0.02); ctx.strokeStyle = pal.fg;
      ctx.beginPath();
      for (const [a, b] of M.CUBE_E) { ctx.moveTo(v[a][0], v[a][1]); ctx.lineTo(v[b][0], v[b][1]); }
      ctx.stroke();
      ctx.fillStyle = pal.hi;
      for (const q of v) ctx.fillRect(q[0] - mn * 0.022, q[1] - mn * 0.022, mn * 0.044, mn * 0.044);
    }
  }
};
L.register('layout', 'r_montage', {
  name: 'リキャップ格子', tags: ['graphic', 'pop', 'editorial'], w: 0.9, emph: 1.2, busy: true, treat: 'safe', fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => {
    const motifs = Array.from({ length: MOTIFS }, (_, i) => i);
    for (let i = motifs.length - 1; i > 0; i--) { const j = rng.int(0, i); [motifs[i], motifs[j]] = [motifs[j], motifs[i]]; }
    return { motifs, seed: rng.int(1, 99999), order: rng.pick(['center', 'diag', 'random']), wide: cut.n > 5 || rng.chance(0.3) };
  },
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const seed = p.seed || 1, m = Math.min(W, H);
    const ar = W / H;
    let cols, rows, span;                                  // span = [c0, c1, r] (歌詞の枠)
    if (ar < 0.77) { cols = 3; rows = 5; span = [0, 2, 2]; }
    else if (ar > 1.3) { if (p.wide) { cols = 4; rows = 3; span = [1, 2, 1]; } else { cols = 3; rows = 3; span = [1, 1, 1]; } }
    else { cols = 3; rows = 3; span = p.wide ? [0, 2, 1] : [1, 1, 1]; }
    const mx = W * 0.04, my = H * (ar < 0.77 ? 0.035 : 0.05), gap = m * 0.018;
    const cw = (W - mx * 2 - gap * (cols - 1)) / cols, ch = (H - my * 2 - gap * (rows - 1)) / rows;
    const tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r === span[2] && c >= span[0] && c <= span[1]) continue;
      tiles.push({ c, r, x: mx + c * (cw + gap) + cw / 2, y: my + r * (ch + gap) + ch / 2 });
    }
    const lx = mx + span[0] * (cw + gap), lw = (span[1] - span[0] + 1) * cw + (span[1] - span[0]) * gap, ly = my + span[2] * (ch + gap);
    const lcx = lx + lw / 2, lcy = ly + ch / 2;
    // 出現順(中心から / 斜め / ばらばら)
    const nT = tiles.length;
    tiles.forEach((tl, i) => {
      tl.key = p.order === 'diag' ? tl.c + tl.r : p.order === 'random' ? ir(seed, i, 3) * 6 : Math.hypot((tl.x - lcx) / cw, (tl.y - lcy) / ch);
      tl.i = i;
    });
    const sorted = tiles.slice().sort((a, b) => a.key - b.key);
    sorted.forEach((tl, k) => { tl.rank = k; });
    const pos = beatPos(env), K = kick(env);
    const hb = sorted[Math.floor(pos) % nT];
    if (env.pass === 'main') {
      const ctx = env.ctx;
      const lum = L.lum(sc.bg);
      const darkTile = L.mix(sc.bg, sc.fg, lum < 0.45 ? 0.1 : 0.07);
      const paperHi = L.contrast(sc.accent, sc.paper) >= 2 ? sc.accent : sc.onPaper;
      const PALS = [
        { bg: darkTile, fg: sc.fg, hi: sc.accent },
        { bg: sc.accent, fg: sc.onInk, hi: sc.onInk },
        { bg: darkTile, fg: sc.fg, hi: sc.accent2 },
        { bg: sc.accent2, fg: sc.onAccent2, hi: sc.onAccent2 },
        { bg: sc.paper, fg: sc.onPaper, hi: paperHi },
      ];
      const motifs = p.motifs || Array.from({ length: MOTIFS }, (_, i) => i);
      const rr = m * 0.014;
      for (const tl of tiles) {
        const d = 0.04 + tl.rank * Math.min(0.055, 0.6 / nT);
        const pop = E.outBack(clamp((env.lt - d) / 0.34), 1.5);
        const out = E.inBack(clamp(env.pOut * 1.3 - tl.rank / nT * 0.3), 1.2);
        const s = pop * (1 - out);
        if (s <= 0.01) continue;
        const pal = PALS[ih(seed, tl.i, 7) % PALS.length];
        ctx.save();
        ctx.translate(tl.x, tl.y); ctx.scale(s, s);
        ctx.globalAlpha = clamp(pop * 3) * (1 - out);
        ctx.beginPath(); rrPath(ctx, -cw / 2, -ch / 2, cw, ch, rr);
        ctx.fillStyle = pal.bg; ctx.fill();
        ctx.clip();
        const a0 = ctx.globalAlpha;
        ctx.save();
        drawMotif(env, ctx, motifs[tl.i % motifs.length], cw, ch, pal, env.ltb + tl.i * 0.37, pos + tl.i * 0.25, K, seed + tl.i);
        ctx.restore();
        ctx.globalAlpha = a0;
        if (tl === hb) {                                  // 拍ごとに1枚を縁取り
          ctx.globalAlpha = a0 * (0.35 + 0.65 * K); ctx.strokeStyle = pal.bg === darkTile ? sc.fg : pal.fg; ctx.lineWidth = Math.max(2, u * 5);
          ctx.beginPath(); rrPath(ctx, -cw / 2, -ch / 2, cw, ch, rr); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // 歌詞のタイル
    const e = E.outBack(clamp(env.lt / 0.34), 1.4) * (1 - E.inBack(clamp(env.pOut * 1.1), 1.2));
    if (e > 0.01) {
      const w2 = lw * e, h2 = ch * (0.8 + 0.2 * clamp(e));
      env.rrect(lcx - w2 / 2, lcy - h2 / 2, w2, h2, m * 0.014, sc.bg, clamp(e * 2), false, sc.accent, Math.max(1.5, u * 3));
      label(env, `No.${pad2(cut.idx + 1)} — LYRIC`, lcx - w2 / 2 + m * 0.02, lcy - h2 / 2 + m * 0.026, clamp(e) * 0.75, { size: Math.max(7, u * 15), color: sc.accent });
    }
    const it = fitItem(env, lcx, lcy + ch * 0.04, lw * 0.86, ch * 0.62, { cap: ch * 0.5, rows: cut.n > 10 ? 3 : cut.n > 3 ? 2 : 1 });
    return drawRows(env, it);
  },
}, P);

/* ================================================================ 3. 交差ワイヤー */
L.register('layout', 'r_wireWeave', {
  name: '交差ワイヤー', tags: ['cyber', 'graphic', 'dark'], w: 0.9, emph: 1.2, busy: true, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ mode: rng.pick(['corridor', 'corridor', 'plane']), fam: rng.int(2, 3), ang: rng.range(0.55, 0.85), spin: rng.sign(), roll: rng.range(-0.2, 0.2), sp: rng.range(0.42, 0.58) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const it = fitItem(env, W / 2, H / 2, W * 0.84, H * (env.portrait ? 0.24 : 0.3));
    const tb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, K = kick(env);
      const corridor = p.mode !== 'plane';
      const f = Math.max(W, H) * 0.62;
      const hy = corridor ? H / 2 : -H * 0.12;
      const zf = 16, zc = 6;
      const phi = (p.spin || 1) * (env.ltb * 0.07 + stepped(env, 0.5, E.outCubic) * 0.025);
      const open = 0.25 + 0.75 * E.outCubic(io);
      const fam = corridor ? 2 : p.fam || 2, ang = p.ang || 0.7;
      const dirs = [ang, -ang, Math.PI / 2].slice(0, fam);
      const planes = corridor ? [[1, [sc.accent, sc.fg, sc.accent2]], [-1, [sc.accent2, sc.fg, sc.accent]]] : [[1, [sc.accent, sc.accent2, sc.fg]]];
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate((corridor ? p.roll * 0.5 : p.roll || 0) + Math.sin(env.ltb * 0.3) * 0.02); ctx.translate(-W / 2, -H / 2);
      ctx.lineWidth = Math.max(1, u * 0.9); ctx.lineCap = 'butt';            // 細線(1px は高速経路)
      const S = 9, D = 14;
      for (const [yp, colsP] of planes) {
        const Y = yp * (corridor ? 1 : 1.2) * open;
        const zn = Math.max(0.3, Math.abs(Y) * f / (corridor ? H * 0.62 : H * 1.25 - hy));   // 画面外へ伸びる部分は切る
        dirs.forEach((th0, j) => {
          const th = th0 + phi * (j % 2 ? -1 : 1);
          const sp = (p.sp || 0.5) * (1 + 0.16 * Math.sin(env.ltb * 0.8 + j * 2)) * (1 - 0.05 * K);
          const dx = Math.sin(th), dz = Math.cos(th), nx = Math.cos(th), nz = -Math.sin(th);
          const drift = frac(env.ltb * 0.12 * (j % 2 ? 1 : -1)) * sp;
          ctx.strokeStyle = colsP[j]; ctx.globalAlpha = io * (0.7 + 0.3 * K);
          ctx.beginPath();
          const nL = Math.ceil(S * 2 / sp);
          for (let k = 0; k <= nL; k++) {
            const o = -S + k * sp + drift;
            const px = nx * o, pz = zc + nz * o;
            // 線分 P + t·d, t∈[-D,D] を Z∈[zn,zf] に切る
            let t0 = -D, t1 = D;
            if (Math.abs(dz) < 1e-4) { if (pz < zn || pz > zf) continue; }
            else {
              const ta = (zn - pz) / dz, tb2 = (zf - pz) / dz;
              t0 = Math.max(t0, Math.min(ta, tb2)); t1 = Math.min(t1, Math.max(ta, tb2));
              if (t0 >= t1) continue;
            }
            const x0 = px + dx * t0, z0 = pz + dz * t0, x1 = px + dx * t1, z1 = pz + dz * t1;
            ctx.moveTo(W / 2 + x0 / z0 * f, hy + Y / z0 * f);
            ctx.lineTo(W / 2 + x1 / z1 * f, hy + Y / z1 * f);
          }
          ctx.stroke();
        });
      }
      ctx.restore();
      // 地平の霧+歌詞の後ろの暗い帯。横長の大きなグラデ塗りはソフト描画で重いので、濃さを段階にした細い帯を重ねる
      const bh = Math.max(tb.h * 2.5, H * 0.26) * (0.3 + 0.7 * E.outCubic(io));
      {
        const bgf = sc.dark ? sc.bg : L.mix(sc.bg, '#000000', 0.1);
        const fy0 = corridor ? H * 0.28 : 0, fy1 = corridor ? H * 0.72 : H * 0.5;
        const prof = y => {
          const fq = corridor ? 1 - Math.abs((y - H / 2) / ((fy1 - fy0) / 2)) : 1 - (y - fy0) / (fy1 - fy0);
          const fog = (corridor ? 0.9 : 0.85) * L.smooth(0, 1, clamp(fq));
          const bq = 1 - Math.abs(y - H / 2) / (bh / 2);
          return Math.max(fog, 0.88 * L.smooth(0, 0.44, clamp(bq)));
        };
        const sh = H / 44, y0 = Math.min(fy0, H / 2 - bh / 2), y1 = Math.max(fy1, H / 2 + bh / 2);
        ctx.save(); ctx.fillStyle = bgf;
        for (let y = y0; y < y1; y += sh) { const a = prof(y + sh / 2) * io; if (a < 0.01) continue; const ya = Math.round(y), yb = Math.round(Math.min(y1, y + sh)); ctx.globalAlpha = a; ctx.fillRect(0, ya, W, yb - ya); }
        ctx.restore();
      }
      env.line([[W / 2 - W * 0.36 * io, H / 2 + bh * 0.36], [W / 2 + W * 0.36 * io, H / 2 + bh * 0.36]], sc.accent, Math.max(1, u * 1.5), io * 0.6);
    }
    label(env, `WEAVE ${p.mode === 'plane' ? p.fam || 2 : 2}×${Math.ceil(18 / (p.sp || 0.5))}`, W * 0.05, H * 0.06, io * 0.7);
    return drawRows(env, it);
  },
}, P);

/* ================================================================ 4. エンドカード */
const END_LABELS = [
  c => ['LYRIC VIDEO', `No.${pad2(c.line + 1)}`],
  c => [`TRACK ${pad2(c.line + 1)}`, `${L.fmtTime(c.start)} – ${L.fmtTime(c.end)}`],
  c => ['SIDE A · END', `${pad2(c.idx + 1)} / ${L.fmtTime(c.end)}`],
];
L.register('layout', 'r_endCard', {
  name: 'エンドカード', tags: ['editorial', 'graphic', 'calm'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  enterBias: { maskRise: 4, riseOver: 2, slideUp: 1.5 },
  plan: rng => ({ dotC: rng.pick(['accent', 'accent', 'accent2']), sub: rng.pick(['romaji', 'romaji', 'time']), lab: rng.int(0, END_LABELS.length - 1), draw: rng.pick(['center', 'left']) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const m = Math.min(W, H), io = env.inOut(0.4);
    const font = L.roleFont(env, 'display');
    const n = cut.n;
    const rows = portrait ? (n > 10 ? 3 : n > 4 ? 2 : 1) : (n > 16 ? 3 : n > 8 ? 2 : 1);
    const fit = M.fitLines(env, cut.text, font, W * (portrait ? 0.78 : 0.72), H * (portrait ? 0.28 : 0.34), m * 0.3, rows);
    const size = fit.size, r = size * 0.11;
    const it0 = { text: fit.text, font, size, x: W / 2, y: H * 0.43 };
    const mm = L.measure(it0);
    let last = null;
    for (const g of mm.lay) if (!g.space && !L.isPunct(g.ch)) last = g;
    if (!last) last = mm.lay[mm.lay.length - 1] || { x: mm.w / 2, y: 0, w: 0 };
    const extra = r * 2.8;
    const it = Object.assign({}, it0, { x: W / 2 - extra / 2 });
    const bb0 = L.itemBox(it);
    // 本体
    const bb = drawRows(env, it);
    // 末尾の丸(ピリオド)
    const de = E.outBack(clamp((env.lt - cut.inDur * 0.8) / 0.32), 2.2) * (1 - E.inBack(clamp(env.pOut * 1.2), 1.4));
    if (de > 0.005) {
      const dx = it.x + last.x + last.w / 2 + r * 1.6, dy = it.y + last.y + size * 0.36 - r;
      env.circle(dx, dy, r * Math.max(0, de) * (1 + kick(env) * 0.14), p.dotC === 'accent2' ? sc.accent2 : sc.accent, null, 1, clamp(de * 2), true);
    }
    // 細い横罫(描き起こし)+端の目盛り
    const ry = bb0.y1 + Math.max(size * 0.3, u * 24);
    const Lr = Math.min(W * 0.9, Math.max(bb0.w + extra + size * 0.6, W * (portrait ? 0.84 : 0.62)));
    const rx0 = W / 2 - Lr / 2, rx1 = W / 2 + Lr / 2;
    const e2 = E.inOutCubic(clamp((env.lt - 0.1) / 0.7)) * (1 - E.inCubic(env.pOut));
    if (e2 > 0.002) {
      const a0 = p.draw === 'left' ? rx0 : W / 2 - Lr / 2 * e2, a1 = p.draw === 'left' ? rx0 + Lr * e2 : W / 2 + Lr / 2 * e2;
      env.line([[a0, ry], [a1, ry]], sc.fg, Math.max(1, u * 1.8), 0.75 * io);
      const tk = u * 9;
      if (e2 > 0.97) { env.line([[rx0, ry - tk], [rx0, ry + tk]], sc.fg, Math.max(1, u * 1.8), 0.75 * io); env.line([[rx1, ry - tk], [rx1, ry + tk]], sc.fg, Math.max(1, u * 1.8), 0.75 * io); }
    }
    // 両端の小さな等幅ラベル(打字のように現れる)
    const [l1, l2] = END_LABELS[(p.lab || 0) % END_LABELS.length](cut);
    const fs = Math.max(8, u * (portrait ? 17 : 19));
    let fs2 = fs, r2 = l2;
    const lw = (t, z) => L.measure({ text: t, font: M.MONO, weight: 700, size: z, track: 0.12 }).w;
    if (lw(l1, fs2) + lw(r2, fs2) > Lr * 0.88) r2 = L.fmtTime(cut.start);
    const tot = lw(l1, fs2) + lw(r2, fs2);
    if (tot > Lr * 0.88) fs2 = Math.max(6, fs2 * Lr * 0.88 / tot);
    const q = clamp((env.lt - 0.35) / 0.6);
    const cut1 = s => s.slice(0, Math.ceil(s.length * q));
    const ly = ry + fs * 1.4;
    if (q > 0) {
      label(env, cut1(l1), rx0, ly, io * 0.85, { size: fs2, color: sc.fg });
      label(env, cut1(r2), rx1, ly, io * 0.85, { size: fs2, color: sc.sub, anchor: 'right' });
    }
    // 淡い一行(ローマ字 or 時刻)
    const ro = L.romaji(cut.text);
    let faint = p.sub === 'romaji' && ro && ro.replace(/\s/g, '') !== cut.text.toUpperCase().replace(/\s/g, '') ? ro : `TC ${M.tc60(cut.end)}`;
    const fy = ly + fs * 2.4;
    const fsz = Math.min(fs * 0.95, L.fitSize(faint, M.MONO, W * 0.8, fs * 2, { weight: 400, track: 0.3 }));
    const fa = clamp((env.lt - 0.6) / 0.5) * (1 - E.inCubic(env.pOut));
    if (fa > 0.01) env.text({ text: faint, font: M.MONO, weight: 400, size: fsz, x: W / 2, y: fy, color: sc.sub, alpha: fa * 0.55, ghost: false, track: 0.3 });
    return bb;
  },
}, P);

/* ================================================================ 5. クローム立体 */
/* 曲線(単位半径)をサンプリング: [x,y,z] 配列の配列(ストランドごと) */
const chromeCache = new Map();
const chromeCurves = kind => {
  if (chromeCache.has(kind)) return chromeCache.get(kind);
  let strands, tube;
  if (kind === 'twist') {
    tube = 0.15; strands = [0, 1].map(s => Array.from({ length: 64 }, (_, i) => {
      const t = i / 64 * TAU, ph = 3 * t + s * Math.PI, r = 0.8 + 0.15 * Math.cos(ph);
      return [r * Math.cos(t), r * Math.sin(t), 0.15 * Math.sin(ph)];
    }));
  } else if (kind === 'star') {
    tube = 0.27; strands = [Array.from({ length: 64 }, (_, i) => {
      const t = i / 64 * TAU, r = 0.72 + 0.2 * Math.cos(5 * t) + 0.04 * Math.cos(10 * t);
      return [r * Math.cos(t - Math.PI / 2), r * Math.sin(t - Math.PI / 2), 0];
    })];
  } else {
    tube = 0.16; strands = [Array.from({ length: 124 }, (_, i) => {
      const t = i / 124 * TAU, r = (2 + Math.cos(3 * t)) / 3;
      return [r * Math.cos(2 * t), r * Math.sin(2 * t), -Math.sin(3 * t) / 3 * 1.1];
    })];
  }
  const v = { strands, tube };
  chromeCache.set(kind, v);
  return v;
};
/* クロームの円板スプライト(3段の奥行き)。色ごとに1回だけ作ってモジュール内にキャッシュ(毎フレームのグラデ塗りは重い) */
const SPR = 96;
const sprCache = new Map();
const chromeSprite = sc => {
  const key = sc.accent;
  let cv = sprCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = SPR; cv.height = SPR * 3;
  const g = cv.getContext('2d', { willReadFrequently: true });   // CPU 側に置く(GPU↔CPU の往復を避ける)
  for (let lv = 0; lv < 3; lv++) {
    const k = lv * 0.35;
    const c = hex => L.mix(hex, '#000000', clamp(k * 0.55));
    const y0 = lv * SPR;
    const gr = g.createLinearGradient(0, y0, 0, y0 + SPR);
    gr.addColorStop(0, c('#2a2d33')); gr.addColorStop(0.1, c('#9aa1ab')); gr.addColorStop(0.24, c('#ffffff'));
    gr.addColorStop(0.38, c('#d4d8df')); gr.addColorStop(0.5, c('#474c55')); gr.addColorStop(0.57, c('#121418'));
    gr.addColorStop(0.7, c('#6d747f')); gr.addColorStop(0.84, c(L.mix(sc.accent, '#ffffff', 0.35))); gr.addColorStop(1, c('#1d1f24'));
    g.fillStyle = gr; g.beginPath(); g.arc(SPR / 2, y0 + SPR / 2, SPR / 2 - 0.5, 0, TAU); g.fill();
  }
  if (sprCache.size > 8) sprCache.clear();
  sprCache.set(key, cv);
  return cv;
};
const discBuf = [];
L.register('layout', 'r_chromeObj', {
  name: 'クローム立体', tags: ['graphic', 'cyber', 'editorial', 'pop'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ obj: rng.pick(['knot', 'twist', 'star']), spin: rng.sign(), tilt: rng.range(0.35, 0.7), chip: rng.pick(['LYRIC', 'NOW PLAYING', 'MOTION', 'NEW LINE']) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45), m = Math.min(W, H);
    const wide = !(env.portrait || W / H < 1.3);
    let box, ocx, ocy, R;
    if (wide) { box = { x0: W * 0.07, cy: H * 0.47, w: W * 0.46, h: H * 0.5 }; ocx = W * 0.775; ocy = H * 0.5; R = Math.min(W * 0.165, H * 0.32); }
    else if (env.portrait) { box = { x0: W * 0.08, cy: H * 0.29, w: W * 0.84, h: H * 0.3 }; ocx = W * 0.54; ocy = H * 0.72; R = Math.min(W * 0.32, H * 0.17); }
    else { box = { x0: W * 0.08, cy: H * 0.31, w: W * 0.84, h: H * 0.34 }; ocx = W * 0.7; ocy = H * 0.74; R = H * 0.16; }
    const sl = stackLines(env, cut.text, box, { cap: m * 0.24 });
    // 3D 物体
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const cv = chromeCurves(p.obj || 'knot');
      const grow = (0.2 + 0.8 * E.outBack(clamp(env.lt / 0.6), 1.3)) * (1 - 0.8 * E.inBack(env.pOut, 1.2)) * (1 + kick(env) * 0.03);
      const Rk = R * Math.max(0, grow);
      const ay = (p.spin || 1) * (env.ltb * 0.55 + stepped(env, 0.5, E.outBack) * 0.12);
      const ax = (p.tilt || 0.5) + Math.sin(env.ltb * 0.5) * 0.15, az = Math.sin(env.ltb * 0.3) * 0.2;
      // 影
      ctx.save();
      ctx.globalAlpha = io * 0.28; ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(ocx, ocy + R * 1.12, R * 0.8 * Math.max(0, grow), R * 0.1 * Math.max(0, grow), 0, 0, TAU); ctx.fill();
      ctx.restore();
      let n = 0;
      for (const st of cv.strands) {
        const pr = st.map(q => M.persp(ocx, ocy, Rk, M.rot3(q, ax, ay, az), 4.5));
        const N = pr.length;
        for (let i = 0; i < N; i++) {
          const a = pr[(i - 1 + N) % N], b = pr[(i + 1) % N], c = pr[i];
          let tx = b[0] - a[0], ty = b[1] - a[1];
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          let nx = -ty, ny = tx;
          if (ny > 0) { nx = -nx; ny = -ny; }            // 明るい帯を上側に
          const d = discBuf[n] || (discBuf[n] = {});
          d.x = c[0]; d.y = c[1]; d.z = c[2]; d.r = cv.tube * Rk * c[3]; d.ang = Math.atan2(ny, nx) + Math.PI / 2;
          n++;
        }
      }
      const list = discBuf.slice(0, n).sort((A, B) => B.z - A.z);
      const spr = chromeSprite(sc);
      ctx.save();
      ctx.globalAlpha = clamp(io * 1.5);
      for (const d of list) {
        if (d.r < 0.3) continue;
        const lv = d.z > 0.35 ? 2 : d.z > -0.1 ? 1 : 0;
        const c = Math.cos(d.ang), sn = Math.sin(d.ang);
        ctx.save();
        ctx.transform(c, sn, -sn, c, d.x, d.y);
        ctx.drawImage(spr, 0, lv * SPR, SPR, SPR, -d.r, -d.r, d.r * 2, d.r * 2);
        ctx.restore();
      }
      ctx.restore();
    }
    // 見出し
    const bb = drawItems(env, sl.items);
    // 番号・チップ・矢印
    const fs = Math.max(8, Math.min(u * 24, Math.max(u * 15, sl.size * 0.16)));
    label(env, `${pad2(cut.idx % 5 + 1)} / 05`, box.x0, Math.max(H * 0.06, sl.y0 - fs * 1.8), io * 0.8, { size: fs, color: sc.sub });
    const ce = E.outCubic(clamp((env.lt - 0.25) / 0.4)) * (1 - E.inCubic(env.pOut));
    if (ce > 0.01) {
      const txt = p.chip || 'LYRIC';
      const tw = L.measure({ text: txt, font: M.MONO, weight: 700, size: fs, track: 0.12 }).w;
      const cy2 = Math.min(sl.y1 + fs * 1.9, H * 0.95), ph = fs * 1.9, pw = tw + fs * 1.8;
      env.rrect(box.x0, cy2 - ph / 2, pw * ce, ph, ph / 2, null, ce, false, sc.fg, Math.max(1, u * 2));
      label(env, txt, box.x0 + fs * 0.9, cy2, ce, { size: fs, color: sc.fg });
      const ax0 = box.x0 + pw + fs * 1.1, s = fs * 0.75, ay0 = cy2 + s / 2;
      const kk = kick(env) * s * 0.25;
      env.line([[ax0, ay0], [ax0 + s + kk, ay0 - s - kk]], sc.accent, Math.max(1.5, u * 2.5), ce);
      env.line([[ax0 + s * 0.35 + kk, ay0 - s - kk], [ax0 + s + kk, ay0 - s - kk], [ax0 + s + kk, ay0 - s * 0.35 - kk]], sc.accent, Math.max(1.5, u * 2.5), ce);
    }
    return bb;
  },
}, P);

/* ================================================================ 6. 傾く文字の輪 */
L.register('layout', 'r_textRing3d', {
  name: '傾く文字の輪', tags: ['graphic', 'editorial', 'cyber', 'pop'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ pos: cut.portrait || cut.W / cut.H < 1.3 ? 'center' : rng.pick(['center', 'center', 'left']), view: rng.range(0.3, 0.42), roll: rng.range(-0.16, 0.16), spin: rng.sign(), src: rng.pick(['romaji', 'romaji', 'glyph']), speed: rng.range(0.28, 0.42) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const wide = !(env.portrait || W / H < 1.3);
    const left = p.pos === 'left' && wide;
    let cx, cy, Rr, view = p.view || 0.36;
    if (left) { cx = W * 0.72; cy = H * 0.5; Rr = Math.min(W * 0.22, H * 0.42); view = Math.max(view, 0.42); }
    else if (wide) { cx = W / 2; cy = H / 2; Rr = Math.min(W * 0.4, H * 0.95); }
    else { cx = W / 2; cy = H / 2; Rr = W * 0.42; view = Math.max(view, env.portrait ? 0.7 : 0.55); }
    const ry = Rr * Math.sin(view);
    // 輪の文字列
    const ro = L.romaji(cut.text);
    const useRo = p.src !== 'glyph' && ro && ro.trim();
    const unit = useRo ? ro.replace(/\s+/g, ' ').trim() : cut.text.replace(/\s+/g, ' ').trim();
    const rfont = useRo || L.hasLatinWords(unit) ? M.MONO : L.roleFont(env, 'display');
    const rweight = 700;
    let fs = Math.max(8, u * (left ? 36 : 44));
    const gl = L.glyphs(unit);
    const advs = gl.map(ch => (L.isSpace(ch) ? 0.4 : L.adv(rfont, rweight, ch)));
    const sepW = 1.4;
    let unitW = (advs.reduce((a, b) => a + b, 0) + sepW) * fs;
    const circ = TAU * Rr;
    if (unitW > circ * 0.95) { fs *= circ * 0.95 / unitW; unitW = circ * 0.95; }
    let rep = Math.max(1, Math.floor(circ / unitW));
    while (rep > 1 && rep * (gl.length + 1) > 96) rep--;
    const spc = circ / (rep * unitW);               // 間隔を少し広げて一周ぴったりに
    // 見出し
    let items, hb;
    if (left) {
      const sl = stackLines(env, cut.text, { x0: W * 0.07, cy: H * 0.5, w: W * 0.4, h: H * 0.56 }, { cap: m * 0.24 });
      items = sl.items;
    } else {
      const hh = Math.max(ry * 2 - fs * 2.2, H * 0.12) * 0.9, hw = Rr * 1.5;
      items = [fitItem(env, cx, cy, hw, hh, { cap: m * 0.24 })];
    }
    const rot = (p.spin || 1) * (env.ltb * (p.speed || 0.35) + stepped(env, 0.5, E.outBack) * 0.12);
    const az = (p.roll || 0) + Math.sin(env.ltb * 0.4) * 0.03;
    const ax = view;                                 // 0=真横 … π/2=正面
    const grow = 0.55 + 0.45 * E.outCubic(io);
    const K = kick(env), bi = Math.floor(beatPos(env));
    const glyphAt = (theta) => {
      const ct = Math.cos(theta), st = Math.sin(theta);
      const c = M.rot3([ct, 0, st], ax, 0, az), tg = M.rot3([-st, 0, ct], ax, 0, az), up = M.rot3([0, 1, 0], ax, 0, az);
      const k = 5 / Math.max(0.5, 5 + c[2]);
      return { x: cx + c[0] * Rr * grow * k, y: cy + c[1] * Rr * grow * k, z: c[2], ax: tg[0] * k, ay: tg[1] * k, bx: up[0] * k, by: up[1] * k };
    };
    const drawRing = back => {
      if (env.pass !== 'main' || io <= 0.002) return;
      const ctx = env.ctx;
      ctx.save();
      // 帯の縁(細い楕円)
      ctx.lineWidth = Math.max(1, u * 1.4); ctx.strokeStyle = back ? sc.sub : sc.fg;
      for (const off of [-0.72, 0.72]) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 72; i++) {
          const th = i / 72 * TAU, g = glyphAt(th);
          const on = back ? g.z > 0 : g.z <= 0;
          const x = g.x + g.bx * off * fs, y = g.y + g.by * off * fs;
          if (on) { if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } } else started = false;
        }
        ctx.globalAlpha = io * (back ? 0.18 : 0.4); ctx.stroke();
      }
      ctx.font = `${rweight} ${fs.toFixed(2)}px ${L.fontFam(rfont)}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let s = 0;
      for (let r = 0; r < rep; r++) {
        const hi = ((bi % rep) + rep) % rep === r;
        for (let i = 0; i <= gl.length; i++) {
          const wAdv = (i < gl.length ? advs[i] : sepW) * fs * spc;
          const th = rot + (s + wAdv / 2) / Rr;
          s += wAdv;
          const g = glyphAt(th);
          if ((g.z > 0) !== back) continue;
          const front = clamp(0.5 - g.z * 0.5);
          if (i === gl.length) {                     // 区切りの丸
            ctx.globalAlpha = io * (back ? 0.35 : 1); ctx.fillStyle = sc.accent;
            ctx.beginPath(); ctx.arc(g.x, g.y, fs * 0.16 * (back ? 0.8 : 1 + K * 0.3), 0, TAU); ctx.fill();
            continue;
          }
          if (L.isSpace(gl[i])) continue;
          ctx.globalAlpha = io * (back ? 0.16 + 0.3 * front : 0.55 + 0.45 * front);
          ctx.fillStyle = hi && !back ? sc.accent : back ? sc.sub : sc.fg;
          ctx.save();
          ctx.transform(g.ax, g.ay, g.bx, g.by, g.x, g.y);
          ctx.fillText(gl[i], 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
    };
    drawRing(true);
    if (left && env.pass === 'main' && io > 0.002) {        // 輪の中心の球
      const ctx = env.ctx, r = Rr * 0.3 * grow * (1 + K * 0.05);
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, L.mix(sc.accent, '#ffffff', 0.55)); g.addColorStop(0.6, sc.accent); g.addColorStop(1, L.mix(sc.accent, '#000000', 0.45));
      ctx.save(); ctx.globalAlpha = io; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (!left) items[0] = Object.assign(items[0], { shadow: { color: L.rgba(sc.bg, 0.85), blur: items[0].size * 0.25 } });
    hb = left ? drawItems(env, items) : drawRows(env, items[0]);
    drawRing(false);
    return hb;
  },
}, P);

/* ================================================================ 7. 波形見出し */
const starPts = (cx, cy, r, rot, n = 5, inner = 0.5) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot - Math.PI / 2 + i / (n * 2) * TAU, rr = i % 2 ? r * inner : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return pts;
};
L.register('layout', 'r_waveHeadline', {
  name: '波形見出し', tags: ['editorial', 'pop', 'graphic'], w: 1, emph: 1.2, busy: true, treat: 'safe', fits: n => n >= 1 && n <= 24,
  plan: rng => ({ paper: rng.chance(0.5), bars: rng.int(52, 72), sticker: rng.pick(['star', 'blob']), seed: rng.int(1, 99999) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4), m = Math.min(W, H);
    const paper = !!p.paper;
    const bgc = paper ? sc.paper : sc.bg;
    const c1 = paper ? sc.onPaper : sc.fg;
    const c2 = L.fitContrast(sc.accent, bgc, 3);
    const stc = L.fitContrast(sc.accent2, bgc, 2.2);
    if (paper && env.pass === 'main') {                   // 紙の地(左からワイプ、退場でフェード)
      const e = E.outCubic(clamp(env.lt / 0.3)), a = 1 - E.inCubic(env.pOut);
      if (e > 0.001 && a > 0.001) { const ctx = env.ctx; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = sc.paper; ctx.fillRect(0, 0, W * e, H); ctx.restore(); }
    }
    const wide = W / H >= 1.3;
    const box = wide ? { x0: W * 0.07, cy: H * 0.37, w: W * 0.78, h: H * 0.46 } : portrait ? { x0: W * 0.08, cy: H * 0.36, w: W * 0.84, h: H * 0.38 } : { x0: W * 0.08, cy: H * 0.35, w: W * 0.84, h: H * 0.4 };
    const sl = stackLines(env, cut.text, box, { cap: m * 0.26, c1, c2 });
    // 波形の帯
    const x0 = W * 0.07, x1 = W * 0.93, yc = H * (portrait ? 0.8 : 0.79), hh = H * (portrait ? 0.05 : 0.075);
    const nb = Math.round(clamp((p.bars || 60) * (W / H) / 1.78, 24, 80));
    const prog = clamp(env.lt / Math.max(0.1, cut.dur));
    const px = lerp(x0, x1, prog);
    const K = kick(env), en = env.energy == null ? 0.5 : env.energy;
    const seed = p.seed || 1;
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, step = (x1 - x0) / nb, bw = Math.max(1, step * 0.56);
      ctx.save();
      for (let i = 0; i < nb; i++) {
        const x = x0 + (i + 0.5) * step;
        const g = E.outBack(clamp((env.lt - i / nb * 0.35) / 0.3), 1.4) * (1 - E.inCubic(clamp(env.pOut * 1.3 - (1 - i / nb) * 0.3)));
        if (g <= 0.001) continue;
        let a = 0.2 + 0.8 * (0.5 + 0.5 * L.noise1(i * 0.21, seed)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.37 + seed)));
        const d = Math.abs(x - px) / (step * 6);
        if (d < 1) a *= 1 + (0.5 * K + en * 0.35) * (1 - d);
        a *= 0.88 + 0.12 * Math.sin(env.ltb * 6 + i * 0.9);
        const bh = Math.max(u * 2, a * hh * g);
        ctx.globalAlpha = io * (x < px ? 1 : 0.32); ctx.fillStyle = x < px ? c2 : c1;
        ctx.fillRect(x - bw / 2, yc - bh, bw, bh * 2);
      }
      ctx.restore();
    }
    // 再生ヘッド
    if (io > 0.002) {
      const ph = hh * 1.55;
      env.line([[px, yc - ph], [px, yc + ph]], c1, Math.max(1.5, u * 2.5), io);
      env.poly([[px - u * 7, yc - ph - u * 10], [px + u * 7, yc - ph - u * 10], [px, yc - ph]], c1, io);
      env.line([[x0, yc + ph + u * 6], [x1, yc + ph + u * 6]], c1, Math.max(1, u * 1.2), io * 0.35);
    }
    const fs = Math.max(8, u * 18);
    label(env, L.fmtTime(cut.start), x0, yc + hh * 1.55 + fs * 1.4, io * 0.85, { size: fs, color: c1 });
    label(env, L.fmtTime(cut.end), x1, yc + hh * 1.55 + fs * 1.4, io * 0.85, { size: fs, color: c1, anchor: 'right' });
    label(env, L.fmtTime(env.t), clamp(px, x0 + fs * 3, x1 - fs * 3), yc - hh * 1.55 - u * 10 - fs * 0.9, io * 0.8, { size: fs * 0.9, color: c2, anchor: 'center' });
    // 見出し
    const bb = drawItems(env, sl.items);
    // ぷっくりステッカー(拍で弾む)
    const r = m * 0.055;
    const lastW = sl.ws[sl.ws.length - 1], firstW = sl.ws[0];
    const lastIt = sl.items[sl.items.length - 1], firstIt = sl.items[0];
    let sx, sy;
    if (box.x0 + lastW + r * 2.8 < W * 0.94) { sx = box.x0 + lastW + r * 1.6; sy = lastIt.y; }
    else if (box.x0 + firstW + r * 2.8 < W * 0.94) { sx = box.x0 + firstW + r * 1.6; sy = firstIt.y; }
    else if (sl.y0 - r * 2.4 > H * 0.03) { sx = W * 0.9; sy = sl.y0 - r * 1.2; }
    else { sx = x1 - r; sy = yc - hh * 1.55 - r * 1.8; }
    const se = E.outBack(clamp((env.lt - 0.3) / 0.4), 2) * (1 - E.inBack(clamp(env.pOut * 1.2), 1.3));
    if (se > 0.01 && env.pass === 'main') {
      const ctx = env.ctx, f = frac(beatPos(env));
      const hop = 4 * f * (1 - f), sq = Math.exp(-Math.min(f, 1 - f) * 12);
      const cyS = sy - hop * r * 0.7;
      const rs = r * Math.max(0, se);
      ctx.save();
      ctx.translate(sx, cyS + rs * 0.6); ctx.scale(1 + sq * 0.18, 1 - sq * 0.18); ctx.translate(0, -rs * 0.6);
      ctx.rotate(Math.sin(env.ltb * 1.3) * 0.15 + (p.sticker === 'star' ? stepped(env, 0.4, E.outBack) * TAU / 10 : 0));
      ctx.globalAlpha = clamp(se * 2) * io;
      ctx.beginPath();
      if (p.sticker === 'blob') {
        for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, f2 = 1 + 0.12 * Math.sin(4 * a + env.ltb * 2); const x = Math.cos(a) * rs * f2, y = Math.sin(a) * rs * f2 * 0.92; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      } else {
        const pts = starPts(0, 0, rs * 0.88, 0, 5, 0.52);
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c1; ctx.lineWidth = rs * 0.34 + u * 5; ctx.stroke();       // 縁(ステッカーの白フチ風)
      ctx.strokeStyle = stc; ctx.lineWidth = rs * 0.34; ctx.stroke();              // ぷっくり(太い丸角)
      ctx.fillStyle = stc; ctx.fill();
      ctx.globalAlpha *= 0.55; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-rs * 0.25, -rs * 0.3, rs * 0.2, rs * 0.11, -0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    return bb;
  },
}, P);
})();
