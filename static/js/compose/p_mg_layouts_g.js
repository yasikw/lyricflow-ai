/* LyricFlow 演出パック: p_mg_layouts_g — MGレイアウトG（3D・ジオメトリ）
   契約: docs/COMPOSE_PACKS.md  (group: layout)  共通ヘルパー: L.mg (p_motion_graphics.js)
   計算で描く3D(点群・ワイヤー・地形・アイソメ・カード環)と幾何学(バウハウス・万華鏡・タイル・線画…)を
   拍のグリッドに乗せる(拍でスナップ/ポップ/段送り回転)。実装はLyricFlow独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_mg_layouts_g';
const clamp = L.clamp, lerp = L.lerp, TAU = L.TAU;

/* ---------------- helpers ---------------- */
/* カット頭からの拍位置(拍グリッドに揃う)。BPM無しは 0.5 秒拍 */
const beatPos = env => {
  const b = env.beat, c = env.cut;
  if (b && b.len > 0 && c && c.beat0 != null) return Math.max(0, b.index - c.beat0 + b.since / b.len);
  return Math.max(0, env.ltb) / M.beatLen(env);
};
/* 拍ごとに1段進むカウンタ(拍頭から frac 拍の間にイージングで進む) */
const stepped = (env, frac = 0.5, ease = E.inOutCubic, off = 0) => {
  const p = Math.max(0, beatPos(env) - off), k = Math.floor(p);
  return k + ease(clamp((p - k) / frac));
};
const kick = env => { const p = beatPos(env); return Math.exp(-(p - Math.floor(p)) * M.beatLen(env) / 0.11); };
/* 軽い整数ハッシュ(描画ループ用。L.h より速い) */
const ih = (a, b = 0, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9e37, 668265263) ^ Math.imul((c | 0) + 0x51ed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return h >>> 0;
};
const ir = (a, b, c) => ih(a, b, c) / 4294967296;
const frac = x => x - Math.floor(x);

/* 歌詞の項目(箱 w×h に収める)。行数は字数から */
const lyricItem = (env, x, y, w, h, o = {}) => {
  const font = o.font || L.roleFont(env, o.role || 'display');
  const n = env.cut.n;
  const rows = o.rows || (n > 14 ? 3 : n > 5 ? 2 : 1);
  const fit = M.fitLines(env, env.cut.text, font, w, h, o.cap || Math.min(env.W, env.H) * 0.2, rows);
  return Object.assign({ text: fit.text, font, size: fit.size, x, y }, o.item || {});
};
/* 背景色のにじみ(図形の上でも読めるように) */
const halo = (env, it, k = 0.3) => Object.assign(it, { shadow: { color: L.rgba(env.sc.bg, 0.95), blur: it.size * k } });
/* 歌詞の下敷きプレート(出入りでアニメ) */
const plate = (env, bb, a, o = {}) => {
  if (!bb || a <= 0.002) return;
  const { u, sc } = env;
  const px = o.px == null ? Math.max(u * 22, bb.h * 0.28) : o.px, py = o.py == null ? Math.max(u * 14, bb.h * 0.14) : o.py;
  const e = E.outCubic(clamp(a));
  const w = (bb.w + px * 2) * (o.wipe ? e : 0.9 + 0.1 * e), h = bb.h + py * 2;
  env.rrect(bb.cx - w / 2, bb.cy - h / 2, w, h, o.r == null ? u * 8 : o.r, o.fill || sc.bg, a * (o.alpha == null ? 0.92 : o.alpha), false, o.stroke || null, o.lw || Math.max(1, u * 2));
};
/* 複数行を行ごとの項目にして mi でずらして出す */
const drawRows = (env, it) => {
  const rows = String(it.text).split('\n');
  if (rows.length < 2) return L.mainDraw(env, it);
  const lh = it.size * (it.lead || 1.18);
  let bb = null;
  rows.forEach((r, i) => { bb = L.unionBB(bb, L.mainDraw(env, Object.assign({}, it, { text: r, y: it.y + (i - (rows.length - 1) / 2) * lh, mi: i }))); });
  return bb;
};
const label = (env, text, x, y, a, o = {}) => {
  if (a <= 0.01) return null;
  return M.anchored(env, Object.assign({ text, font: M.MONO, weight: 700, size: Math.max(8, env.u * 18), x, y, color: env.sc.sub, alpha: a, ghost: false, track: 0.12 }, o), o.anchor || 'left');
};
/* 図形領域と文字領域に分ける(横長=左右、縦長/正方形=上下) */
const split = (env, fr = 0.42, flip = false) => {
  const { W, H, portrait } = env;
  const stack = portrait || W / H < 1.3;
  const mx = W * 0.06, my = H * 0.07;
  if (stack) {
    const gh = (H - my * 2) * 0.52;
    return { stack, g: { x: W / 2, y: my + gh / 2, w: W - mx * 2, h: gh }, t: { x: W / 2, y: my + gh + (H - my * 2 - gh) / 2, w: W - mx * 2, h: (H - my * 2 - gh) * 0.86 } };
  }
  const gw = (W - mx * 2) * fr, tw = (W - mx * 2) - gw - W * 0.04;
  return { stack, g: { x: flip ? W - mx - gw / 2 : mx + gw / 2, y: H / 2, w: gw, h: H - my * 2 }, t: { x: flip ? mx + tw / 2 : W - mx - tw / 2, y: H / 2, w: tw, h: (H - my * 2) * 0.8 } };
};
/* 投影済み点列 [x,y,z] を区間ごとに奥行きで濃淡を付けて描く(z<0 が手前) */
const strokeDepth = (ctx, pts, closed, col, lw, a, chunk = 8, backA = 0.25) => {
  const n = pts.length, segN = closed ? n : n - 1;
  if (n < 2 || a <= 0.002) return;
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let s = 0; s < segN; s += chunk) {
    const e = Math.min(segN, s + chunk);
    let z = 0;
    for (let i = s; i <= e; i++) z += pts[i % n][2];
    const f = clamp(0.5 - z / (e - s + 1) * 0.5);
    ctx.globalAlpha = clamp(a * (backA + (1 - backA) * f));
    ctx.lineWidth = lw * (0.55 + 0.65 * f);
    ctx.beginPath(); ctx.moveTo(pts[s % n][0], pts[s % n][1]);
    for (let i = s + 1; i <= e; i++) ctx.lineTo(pts[i % n][0], pts[i % n][1]);
    ctx.stroke();
  }
};
const polyPts = (cx, cy, r, sides, rot) => {
  const a = [];
  for (let i = 0; i < sides; i++) { const t = rot - Math.PI / 2 + i / sides * TAU; a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
  return a;
};
const pathPoly = (ctx, pts) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };

/* ================================================================ 3D */
const fibCache = new Map();
const fib = n => {
  let a = fibCache.get(n);
  if (a) return a;
  a = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), th = i * g; a.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
  fibCache.set(n, a);
  return a;
};

L.register('layout', 'g_dotSphere', {
  name: 'ドット球体', tags: ['cyber', 'graphic', 'emotional'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ n: rng.int(48, 62) * 12, mode: cut.n > 16 ? 'center' : rng.pick(['center', 'center', 'side']), tilt: rng.range(0.25, 0.55), spin: rng.sign(), band: rng.chance(0.7), flip: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    let cx = W / 2, cy = H / 2, R = m * 0.4, it, s = null;
    if (p.mode === 'side') {
      s = split(env, 0.42, p.flip);
      cx = s.g.x; cy = s.g.y; R = Math.min(s.g.w, s.g.h) * 0.42;
      it = lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h);
    } else it = halo(env, lyricItem(env, W / 2, H / 2, W * 0.86, H * (env.portrait ? 0.3 : 0.4)));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, pts = fib(Math.min(1200, p.n || 600));
      const grow = (0.25 + 0.75 * E.outBack(clamp(env.lt / 0.6), 1.2)) * (1 - 0.3 * E.inCubic(env.pOut));
      const Rk = R * grow * (1 + kick(env) * 0.04 * io);
      const ay = (p.spin || 1) * (stepped(env, 0.55, E.outBack) * TAU / 10 + env.ltb * 0.12);
      const ax = p.tilt || 0.4;
      const bv = stepped(env, 0.5) % 10, bandY = -0.8 + (bv < 5 ? bv : 10 - bv) / 5 * 1.6;   // 拍ごとに緯度の帯が上下へ段送り
      const base = Math.max(1, u * 3.6 * R / (m * 0.4));
      ctx.save();
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? sc.accent : sc.fg;
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const isBand = !!p.band && Math.abs(q[1] - bandY) < 0.075;
          if ((pass === 1) !== isBand) continue;
          const r = M.rot3(q, ax, ay, 0), v = M.persp(cx, cy, Rk, r, 3.4);
          const front = clamp(0.5 - r[2] * 0.5);
          ctx.globalAlpha = io * (0.14 + 0.86 * front);
          const d = base * v[3] * (0.5 + 0.65 * front) * (isBand ? 1.45 : 1);
          ctx.fillRect(v[0] - d / 2, v[1] - d / 2, d, d);
        }
      }
      ctx.restore();
    }
    if (s) label(env, `SPHERE · ${p.n || 600} PTS`, cx, cy + R * 1.12 + u * 12, io * 0.8, { anchor: 'center' });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_torus', {
  name: 'ワイヤートーラス', tags: ['cyber', 'graphic', 'dark'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ view: cut.n > 9 ? 'flat' : rng.pick(['face', 'face', 'flat']), r: rng.range(0.3, 0.38), mer: rng.int(16, 22), par: rng.int(5, 7), spin: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const r = p.r || 0.34, face = p.view === 'face';
    const Rt = (face ? m * 0.46 : Math.min(W * 0.36, H * 0.6)) / (1 + r);
    const cx = W / 2, cy = H / 2;
    let it;
    if (face) { const hole = (1 - r) * Rt; it = lyricItem(env, cx, cy, hole * 1.72, hole * 0.95, { cap: hole * 0.8 }); }
    else it = halo(env, lyricItem(env, cx, cy, W * 0.84, H * (env.portrait ? 0.28 : 0.34)));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const grow = (0.3 + 0.7 * E.outBack(clamp(env.lt / 0.6), 1.2)) * (1 - 0.25 * E.inCubic(env.pOut));
      const R = Rt * grow, K = kick(env) * io;
      const mer = p.mer || 18, par = p.par || 6;
      const ay = (p.spin || 1) * (stepped(env, 0.5, E.outBack) * TAU / mer + env.ltb * 0.08);
      const ax = face ? Math.PI / 2 - 0.3 + Math.sin(env.ltb * 0.7) * 0.1 : 0.4 + Math.sin(env.ltb * 0.5) * 0.06;
      const az = face ? 0 : Math.sin(env.ltb * 0.4) * 0.06;
      const P3 = (a, v) => { const c = 1 + r * Math.cos(v); return M.persp(cx, cy, R, M.rot3([c * Math.cos(a), r * Math.sin(v), c * Math.sin(a)], ax, ay, az), 4.5); };
      const scan = Math.floor(beatPos(env)) % mer;
      ctx.save();
      for (let j = 0; j < mer; j++) {                // 子午線(拍ごとに1コマ送り)
        const a = j / mer * TAU, pts = [];
        for (let i = 0; i < 16; i++) pts.push(P3(a, i / 16 * TAU));
        strokeDepth(ctx, pts, true, j === scan ? sc.accent2 : sc.fg, Math.max(1, u * (j === scan ? 3.2 : 2)), io * (j === scan ? 1 : 0.8), 4, 0.18);
      }
      for (let k = 0; k < par; k++) {                // 緯線
        const v = k / par * TAU, pts = [];
        for (let i = 0; i < 48; i++) pts.push(P3(i / 48 * TAU, v));
        strokeDepth(ctx, pts, true, k === 0 ? sc.accent : sc.sub, Math.max(1, u * (k === 0 ? 4 + K * 3 : 1.6)), io * (k === 0 ? 1 : 0.7), 6, 0.2);
      }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_terrain', {
  name: '波グリッド地形', tags: ['cyber', 'graphic', 'dark', 'emotional'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ rows: rng.int(18, 24), cols: rng.int(24, 30), amp: rng.range(0.28, 0.4), freq: rng.range(1.3, 2.1), dots: rng.chance(0.3), hz: rng.range(0.5, 0.56) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5);
    const hy = H * (env.portrait ? 0.54 : (p.hz || 0.53));
    const it = lyricItem(env, W / 2, hy * 0.52, W * 0.86, hy * 0.66, { cap: Math.min(W, H) * 0.2 });
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const rows = p.rows || 20, cols = p.cols || 26, amp = (p.amp || 0.34) * (1 + kick(env) * 0.55) * E.outCubic(io);
      const fq = p.freq || 1.7;
      const tr = stepped(env, 0.45, E.outCubic), f = frac(tr), base = Math.floor(tr);
      const span = 4.4, Hh = (H - hy) * 1.15;
      const grid = [];
      for (let j = 0; j <= rows; j++) {
        const z = j + 1 - f, d = 0.75 + z * 0.62, w = j + base, row = [];
        for (let c = 0; c < cols; c++) {
          const xs = (c / (cols - 1) - 0.5) * span, xw = xs * (1 + d * 0.6);   // 奥ほど世界を広く(横いっぱいに地平まで)
          const h = amp * (Math.sin(xw * fq + w * 0.55) * Math.cos(xw * 0.55 * fq - w * 0.33) * 0.7 + Math.sin(w * 0.9 + xw * 0.35 + env.ltb * 0.3) * 0.3) * (0.35 + 0.65 * Math.min(1, Math.abs(xw) / 1.6));
          row.push([W / 2 + xw * W * 0.34 / d, hy + (1 - h) * Hh / d]);
        }
        grid.push({ row, a: Math.pow(clamp((rows - z) / rows * 1.25), 1.6) * clamp(z * 1.2) * io, lw: Math.max(1, u * 3.2 / Math.sqrt(d)), hi: ((w % 4) + 4) % 4 === 0 });
      }
      ctx.save(); ctx.lineJoin = 'round';
      if (p.dots) {
        for (const g of grid) {
          ctx.fillStyle = g.hi ? sc.accent : sc.fg; ctx.globalAlpha = g.a;
          for (const q of g.row) ctx.fillRect(q[0] - g.lw, q[1] - g.lw, g.lw * 2, g.lw * 2);
        }
      } else {
        for (const g of grid) {
          if (g.a <= 0.01) continue;
          ctx.globalAlpha = g.a * (g.hi ? 1 : 0.75); ctx.strokeStyle = g.hi ? sc.accent : sc.fg; ctx.lineWidth = g.lw * (g.hi ? 1.4 : 1);
          ctx.beginPath(); g.row.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
        }
        ctx.strokeStyle = sc.sub; ctx.lineWidth = Math.max(1, u * 1.2);
        for (let c = 0; c < cols; c += 2) {
          ctx.globalAlpha = io * 0.45;
          ctx.beginPath();
          for (let j = 0; j <= rows; j++) { const q = grid[j].row[c]; if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
          ctx.stroke();
        }
      }
      ctx.restore();
      env.line([[W / 2 - W * 0.5 * E.outCubic(io), hy], [W / 2 + W * 0.5 * E.outCubic(io), hy]], sc.accent, Math.max(1, u * 2), io * 0.8);
    }
    label(env, `ALT ${(kick(env) * 99).toFixed(0).padStart(2, '0')} · GRID ${p.cols || 26}×${p.rows || 20}`, W * 0.06, hy - Math.min(W, H) * 0.035, io * 0.7);
    return L.mainDraw(env, it);
  },
}, P);

/* アイソメ積み木: 拍ごとにブロックが落ちて積み上がる */
const ISO_H = {
  stair: [[3, 2, 1], [3, 2, 1], [2, 1, 0]],
  tower: [[4, 3, 1], [3, 2, 0], [1, 0, 0]],
  pyramid: [[1, 2, 1], [2, 3, 2], [1, 2, 1]],
};
const isoCache = new Map();
const isoBlocks = kind => {
  if (isoCache.has(kind)) return isoCache.get(kind);
  const hm = ISO_H[kind] || ISO_H.stair, bl = [];
  hm.forEach((row, gy) => row.forEach((h, gx) => { for (let gz = 0; gz < h; gz++) bl.push([gx, gy, gz]); }));
  bl.sort((a, b) => a[2] - b[2] || (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y, z] of bl) for (const [dx, dy, dz] of [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 0], [1, 0, 0], [0, 1, 0]]) {
    const sx = (x + dx - y - dy) * 0.866, sy = (x + dx + y + dy) * 0.5 - (z + dz);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const v = { bl, box: [x0, y0, x1, y1] };
  isoCache.set(kind, v);
  return v;
};
L.register('layout', 'g_isoStack', {
  name: 'アイソメ積み木', tags: ['graphic', 'pop', 'editorial'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ kind: rng.pick(['stair', 'tower', 'pyramid']), flip: rng.chance(0.5), seed: rng.int(1, 99999) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4);
    const s = split(env, 0.44, p.flip);
    const { bl, box } = isoBlocks(p.kind || 'stair');
    const S = Math.min(s.g.w * 0.86 / (box[2] - box[0]), s.g.h * 0.82 / (box[3] - box[1]));
    const ox = s.g.x - S * (box[0] + box[2]) / 2, oy = s.g.y - S * (box[1] + box[3]) / 2;
    const bpb = clamp(Math.ceil(bl.length / Math.max(1, cut.dur * 0.55 / M.beatLen(env))), 1, 4);  // 1拍あたりの個数
    const pos = beatPos(env);
    let shown = 0;
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const iso = (x, y, z) => [ox + (x - y) * 0.866 * S, oy + ((x + y) * 0.5 - z) * S];
      const pal = [sc.accent, sc.fg, sc.accent2, sc.accent];
      const vis = [];
      bl.forEach((b, j) => {
        const t0 = Math.floor(j / bpb) + (j % bpb) * 0.14;
        const q = clamp((pos - t0) / 0.42);
        if (q <= 0) return;
        shown++;
        const out = E.inCubic(clamp(env.pOut * 1.4 - (bl.length - j) * 0.02));
        vis.push({ b, j, dz: (1 - E.outBounce(q)) * 3.2 - out * 1.5, a: clamp(q * 5) * (1 - out) });
      });
      vis.sort((A, B) => (A.b[0] + A.b[1] + A.b[2]) - (B.b[0] + B.b[1] + B.b[2]) || A.b[2] - B.b[2]);
      ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = sc.bg; ctx.lineWidth = Math.max(1, u * 2);
      for (const v of vis) {
        const [x, y] = v.b, z = v.b[2] + v.dz;
        const c = pal[ih(p.seed || 1, v.j) % pal.length];
        const faces = [
          [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1], c],
          [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x, y + 1, z], L.mix(c, '#000000', 0.3)],
          [[x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x + 1, y, z], L.mix(c, '#000000', 0.5)],
        ];
        ctx.globalAlpha = io * v.a;
        for (const f of faces) {
          ctx.beginPath(); pathPoly(ctx, f.slice(0, 4).map(q => iso(q[0], q[1], q[2])));
          ctx.fillStyle = f[4]; ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    }
    label(env, `BLOCK ${M.pad2(Math.min(bl.length, Math.ceil(pos + 0.001) * bpb))}/${M.pad2(bl.length)}`, s.g.x - s.g.w * 0.46, s.g.y + s.g.h * 0.47, io * 0.8);
    return drawRows(env, lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h));
  },
}, P);

L.register('layout', 'g_prism', {
  name: '回転プリズム', tags: ['graphic', 'cyber', 'editorial'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ sides: rng.pick([3, 4, 5, 6, 8, 24]), lean: rng.range(0.28, 0.45), spin: rng.sign(), stripes: rng.chance(0.55) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45);
    const N = p.sides || 6, cx = W / 2, cy = H / 2;
    const R0 = Math.min(W * 0.27, H * 0.3), hN = Math.min(1.5, H * 0.36 / R0);
    const it = halo(env, lyricItem(env, cx, cy, W * 0.84, H * (env.portrait ? 0.26 : 0.32)));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const R = R0 * (0.3 + 0.7 * E.outBack(clamp(env.lt / 0.55), 1.3)) * (1 - 0.3 * E.inCubic(env.pOut));
      const ay = (p.spin || 1) * (stepped(env, 0.5, E.outBack) * TAU / (N > 12 ? 12 : N) + env.ltb * 0.05);
      const ax = p.lean || 0.35;
      const V = (a, y) => M.persp(cx, cy, R, M.rot3([Math.cos(a), y, Math.sin(a)], ax, ay, 0), 4.5);
      const top = [], bot = [];
      for (let i = 0; i < N; i++) { const a = i / N * TAU; top.push(V(a, -hN)); bot.push(V(a, hN)); }
      ctx.save(); ctx.lineCap = 'round';
      // いちばん手前の面を拍で光らせる
      let best = 0, bz = 1e9;
      for (let i = 0; i < N; i++) { const z = top[i][2] + top[(i + 1) % N][2]; if (z < bz) { bz = z; best = i; } }
      if (N <= 12) {
        const i2 = (best + 1) % N;
        ctx.globalAlpha = io * (0.12 + 0.22 * kick(env));
        ctx.fillStyle = sc.accent; ctx.beginPath(); pathPoly(ctx, [top[best], top[i2], bot[i2], bot[best]]); ctx.fill();
      }
      for (let i = 0; i < N; i++) strokeDepth(ctx, [top[i], bot[i]], false, i === best && N <= 12 ? sc.accent : sc.fg, Math.max(1, u * (N > 12 ? 2 : 3.2)), io, 1, 0.15);
      strokeDepth(ctx, top, true, sc.fg, Math.max(1, u * 3), io, 1, 0.2);
      strokeDepth(ctx, bot, true, sc.fg, Math.max(1, u * 3), io, 1, 0.2);
      if (p.stripes) {
        const sp = stepped(env, 0.5, E.inOutCubic) * 0.25;
        for (let j = 0; j < 4; j++) {
          const y = lerp(-hN, hN, frac(j / 4 + sp)), ring = [];
          for (let i = 0; i < 40; i++) ring.push(V(i / 40 * TAU, y));
          strokeDepth(ctx, ring, true, sc.accent2, Math.max(1, u * 2), io * 0.8, 5, 0.15);
        }
      }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_cardRing', {
  name: '回るカード環', tags: ['graphic', 'editorial', 'pop'], w: 1, emph: 1.3, treat: 'safe', fits: n => n >= 1 && n <= 20,
  plan: rng => ({ n: rng.int(7, 9), tilt: rng.range(0.14, 0.26), spin: rng.sign(), fill: rng.pick(['paper', 'accent', 'paper']) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45);
    const n = p.n || 8, cx = W / 2, cy = H / 2;
    const vert = portrait || W / H < 1.3;                 // 縦長/正方形は縦回りのカルーセル
    const Rr = vert ? H * 0.34 : Math.min(W * 0.4, H * 0.95);
    const cw = portrait ? W * 0.82 : W / H < 1.3 ? W * 0.72 : Math.min(W * 0.5, H * 1.2);
    const ch = Math.min(cw * 0.6, H * (portrait ? 0.3 : 0.44));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const rot = (p.spin || 1) * stepped(env, 0.5, E.outBack) * TAU / n;
      const ht = Math.sin(Math.PI / n) * 0.9, ax = p.tilt || 0.2;
      const hA = vert ? ht * 1.5 : ht, hB = vert ? ht : ht * 0.68;   // カードの横/縦の半分
      const cards = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rot + Math.PI / n, sa = Math.sin(a), ca = Math.cos(a);
        const c = vert ? [0, sa, -ca] : [sa, 0, -ca], t = vert ? [0, ca, sa] : [ca, 0, sa], o = vert ? [1, 0, 0] : [0, 1, 0];
        const A = vert ? o : t, B = vert ? t : o;
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => M.persp(cx, cy, Rr * (0.6 + 0.4 * E.outCubic(io)),
          M.rot3([c[0] + A[0] * hA * sx + B[0] * hB * sy, c[1] + A[1] * hA * sx + B[1] * hB * sy, c[2] + A[2] * hA * sx + B[2] * hB * sy], vert ? 0 : ax, vert ? ax : 0, 0), 4));
        const z = (cs[0][2] + cs[1][2] + cs[2][2] + cs[3][2]) / 4;
        cards.push({ cs, z, i, fade: clamp((Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) - 0.25) / 0.6) });
      }
      cards.sort((A, B) => B.z - A.z);
      ctx.save(); ctx.lineJoin = 'round';
      for (const c of cards) {
        const f = clamp(0.5 - c.z * 0.5);
        const a = io * c.fade * (0.35 + 0.65 * f);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.beginPath(); pathPoly(ctx, c.cs);
        ctx.fillStyle = c.i % 3 === 0 ? sc.accent2 : sc.bg2; ctx.fill();
        ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 2); ctx.stroke();
        // カード上の2本線(遠近に沿って)
        ctx.strokeStyle = c.i % 3 === 0 ? sc.onAccent2 : sc.sub; ctx.lineWidth = Math.max(1, u * 2.5 * f);
        const [q0, q1, q2, q3] = c.cs;
        ctx.beginPath();
        for (const [k0, k1] of [[0.3, 0.3], [0.45, 0.6]]) {
          const L0 = [lerp(q0[0], q3[0], k0), lerp(q0[1], q3[1], k0)], R0 = [lerp(q1[0], q2[0], k0), lerp(q1[1], q2[1], k0)];
          ctx.moveTo(lerp(L0[0], R0[0], 0.15), lerp(L0[1], R0[1], 0.15)); ctx.lineTo(lerp(L0[0], R0[0], 0.15 + k1 * 0.7), lerp(L0[1], R0[1], 0.15 + k1 * 0.7));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // 手前のカード(歌詞)
    const paperMode = p.fill !== 'accent';
    const fill = paperMode ? sc.paper : sc.accent, tcol = paperMode ? sc.onPaper : sc.onInk;
    const e = E.outBack(clamp(env.lt / 0.45), 1.4) * (1 - E.inBack(env.pOut, 1.2)) * (1 + kick(env) * 0.012);
    const w = cw * Math.max(0, e), h = ch * (0.85 + 0.15 * clamp(e));
    if (w > 1) {
      env.rrect(cx - w / 2 + u * 8, cy - h / 2 + u * 10, w, h, u * 14, '#000000', 0.18 * io, false);
      env.rrect(cx - w / 2, cy - h / 2, w, h, u * 14, fill, clamp(e), false, sc.fg, Math.max(1, u * 2.5));
      label(env, `No.${M.pad2(cut.idx + 1)}`, cx - w / 2 + ch * 0.1, cy - h / 2 + ch * 0.12, io * clamp(e) * 0.7, { color: tcol, size: Math.max(8, u * 17) });
      label(env, `${M.pad2((Math.floor(beatPos(env)) % n) + 1)}/${M.pad2(n)}`, cx + w / 2 - ch * 0.1, cy + h / 2 - ch * 0.12, io * clamp(e) * 0.7, { color: tcol, size: Math.max(8, u * 17), anchor: 'right' });
    }
    return L.mainDraw(env, lyricItem(env, cx, cy, cw * 0.84, ch * 0.64, { item: { color: tcol } }));
  },
}, P);

L.register('layout', 'g_warp', {
  name: 'スターワープ', tags: ['cyber', 'dark', 'emotional', 'graphic'], w: 1, emph: 1.5, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ n: rng.int(220, 320), vx: rng.range(-0.05, 0.05), vy: rng.range(-0.04, 0.04), tint: rng.chance(0.6), seed: rng.int(1, 99999) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4);
    const vx = W / 2 + (p.vx || 0) * W, vy = H / 2 + (p.vy || 0) * H;
    const it = halo(env, lyricItem(env, vx, vy, W * 0.84, H * (env.portrait ? 0.28 : 0.36)), 0.4);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, seed = p.seed || 1, N = Math.min(400, p.n || 260);
      const pos = beatPos(env), k = Math.floor(pos), f = pos - k;
      const travel = pos * 0.1 + (k + E.outExpo(clamp(f / 0.55))) * 0.16;   // 拍頭で加速
      const tail = 0.025 + 0.12 * Math.exp(-f * 3.2) + E.inCubic(env.pOut) * 0.3;
      const Rs = Math.hypot(W, H) * 0.06, lim = Math.hypot(W, H);
      const B = [[0, 0.3, 3.4, 0.95], [0.3, 0.62, 2.2, 0.6], [0.62, 1.01, 1.3, 0.32]];
      const tb = L.itemBox(it), px = tb.h * 0.25, inText = (x, y) => x > tb.x0 - px && x < tb.x1 + px && y > tb.y0 - px && y < tb.y1 + px;   // 文字の後ろは空ける
      ctx.save(); ctx.lineCap = 'round';
      for (let tinted = 0; tinted < 2; tinted++) {
        if (tinted && !p.tint) break;
        ctx.strokeStyle = tinted ? sc.accent : sc.fg;
        for (const [z0, z1, lw, al] of B) {
          ctx.lineWidth = Math.max(1, u * lw); ctx.globalAlpha = io * al;
          ctx.beginPath();
          for (let i = 0; i < N; i++) {
            if ((p.tint && i % 6 === 0 ? 1 : 0) !== tinted) continue;
            const z = Math.max(0.035, 1 - frac(ir(seed, i, 3) + travel));
            if (z < z0 || z >= z1) continue;
            const ang = ir(seed, i, 1) * TAU, rad = 0.2 + ir(seed, i, 2) * 1.1;
            const r1 = rad / z * Rs;
            if (r1 > lim) continue;
            const r2 = rad / Math.min(1.2, z + tail * (1.2 - z)) * Rs;
            const c = Math.cos(ang), s = Math.sin(ang);
            if (inText(vx + c * r1, vy + s * r1)) continue;
            ctx.moveTo(vx + c * r2, vy + s * r2); ctx.lineTo(vx + c * r1, vy + s * r1);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      const m = Math.min(W, H);
      env.circle(vx, vy, m * (0.32 + 0.4 * E.outCubic(f)), null, sc.accent2, Math.max(1, u * 2), io * 0.4 * (1 - f));
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_helix', {
  name: 'DNA螺旋', tags: ['cyber', 'graphic', 'emotional'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ place: rng.pick(['low', 'high', 'through']), turns: rng.range(1.6, 2.4), n: rng.int(34, 44), rungs: rng.chance(0.75), spin: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45);
    const place = p.place || 'low';
    const rad = portrait ? W * 0.13 : Math.min(H * 0.13, W * 0.1);
    const ay = place === 'low' ? H * (portrait ? 0.78 : 0.74) : place === 'high' ? H * (portrait ? 0.22 : 0.26) : H / 2;
    let it;
    if (place === 'through') it = halo(env, lyricItem(env, W / 2, H / 2, W * 0.84, H * (portrait ? 0.26 : 0.32)));
    else {
      const top = place === 'low' ? H * 0.07 : ay + rad * 1.5, bot = place === 'low' ? ay - rad * 1.5 : H * 0.93;
      it = lyricItem(env, W / 2, (top + bot) / 2, W * 0.86, (bot - top) * 0.9);
    }
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, N = p.n || 40, turns = p.turns || 2;
      const ph = (p.spin || 1) * (stepped(env, 0.5, E.outBack) * Math.PI / 2 + env.ltb * 0.3);
      const draw = E.outCubic(clamp(env.lt / 0.8));
      const pulse = frac(stepped(env, 0.4) / 8);
      const x0 = W * 0.04, len = W * 0.92, K = kick(env) * io;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        if (t > draw) break;
        const a = ph + t * turns * TAU, c = Math.cos(a), s = Math.sin(a);
        const X = x0 + len * t, hot = Math.abs(t - pulse) < 0.05;
        pts.push({ X, A: [X, ay + c * rad, s], B: [X, ay - c * rad, -s], hot, i });
      }
      ctx.save();
      if (p.rungs) {
        ctx.strokeStyle = sc.sub; ctx.lineWidth = Math.max(1, u * 2);
        for (const q of pts) { if (q.i % 2) continue; ctx.globalAlpha = io * 0.5; ctx.beginPath(); ctx.moveTo(q.A[0], q.A[1]); ctx.lineTo(q.B[0], q.B[1]); ctx.stroke(); }
      }
      for (let front = 0; front < 2; front++) {
        for (const q of pts) {
          for (const [v, col] of [[q.A, sc.accent], [q.B, sc.accent2]]) {
            if ((v[2] < 0) !== !!front) continue;
            const f = 0.5 - v[2] * 0.5, d = u * (5 + 6 * f) * (q.hot ? 1.5 + K * 0.6 : 1);
            ctx.globalAlpha = io * (0.3 + 0.7 * f) * (place === 'through' ? 0.6 : 1);
            ctx.fillStyle = q.hot ? sc.fg : col;
            ctx.beginPath(); ctx.arc(v[0], v[1], d, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_gridFloor', {
  name: '地平グリッド', tags: ['cyber', 'dark', 'graphic', 'emotional'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ sun: rng.chance(0.65), ceil: rng.chance(0.3), lanes: rng.int(7, 10), hz: rng.range(0.56, 0.62) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const ceil = !!p.ceil, hy = ceil ? H / 2 : H * (portrait ? 0.58 : (p.hz || 0.58));
    const it = halo(env, ceil ? lyricItem(env, W / 2, hy, W * 0.84, H * 0.24) : lyricItem(env, W / 2, hy * 0.55, W * 0.86, hy * 0.62), 0.35);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const tr = stepped(env, 0.5, E.outCubic), f = frac(tr);
      const Hf = (H - hy) * 1.0, Z = 12, lanes = p.lanes || 8, sp = W * 0.2;
      ctx.save();
      if (p.sun && !ceil) {                         // 縞の太陽(拍で縞が1段上がる)
        const Rs = Math.min(W * 0.24, hy * 0.62), sy = hy + Rs * 0.1 + Rs * (1 - E.outCubic(io)) * 0.9;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
        ctx.beginPath(); ctx.arc(W / 2, sy, Rs, 0, TAU); ctx.clip();
        const g = ctx.createLinearGradient(0, sy - Rs, 0, sy);
        g.addColorStop(0, sc.accent); g.addColorStop(1, L.mix(sc.accent, sc.accent2, 0.55));
        ctx.globalAlpha = io; ctx.fillStyle = g;
        ctx.beginPath(); ctx.rect(W / 2 - Rs, sy - Rs, Rs * 2, Rs * 2);
        const ph = frac(stepped(env, 0.5) / 2);
        for (let i = 0; i < 7; i++) { const t = (i + 1 - ph) / 7, y = sy - Rs * 0.55 + t * Rs * 0.6, h = Rs * (0.012 + t * 0.07); ctx.rect(W / 2 - Rs, y, Rs * 2, h); }
        ctx.fill('evenodd');
        ctx.restore();
      }
      for (const dir of ceil ? [1, -1] : [1]) {
        ctx.strokeStyle = sc.fg;
        for (let j = 0; j < Z; j++) {
          const z = j + 1 - f, y = hy + dir * Hf / z;
          ctx.globalAlpha = io * clamp((Z - z) / 5) * clamp(z * 1.5) * 0.85 * clamp((Hf / z - H * (ceil ? 0.07 : 0.004)) / (H * (ceil ? 0.12 : 0.03)));
          ctx.lineWidth = Math.max(1, u * 3.5 / Math.sqrt(z));
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.lineWidth = Math.max(1, u * 1.6);
        const reach = E.outCubic(io);
        for (let i = -lanes; i <= lanes; i++) {
          const zf = ceil ? 4.5 : Z, zn = lerp(zf, 0.6, reach);
          ctx.globalAlpha = io * 0.55; ctx.strokeStyle = i === 0 ? sc.accent : sc.fg;
          ctx.beginPath(); ctx.moveTo(W / 2 + i * sp / zf, hy + dir * Hf / zf); ctx.lineTo(W / 2 + i * sp / zn, hy + dir * Hf / zn); ctx.stroke();
        }
      }
      ctx.restore();
      env.line([[W / 2 - W * 0.5 * E.outCubic(io), hy], [W / 2 + W * 0.5 * E.outCubic(io), hy]], sc.accent, Math.max(1.5, u * 3 * (1 + kick(env) * 0.8)), io);
      if (!ceil) label(env, 'HORIZON', W * 0.05, hy + m * 0.03, io * 0.7);
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_ripple', {
  name: '波紋プレーン', tags: ['calm', 'emotional', 'graphic', 'cyber'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ place: rng.pick(['low', 'low', 'behind']), tilt: rng.range(0.42, 0.62), gx: rng.int(24, 30), gz: rng.int(14, 18), seed: rng.int(1, 99999), roam: rng.chance(0.5), lines: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5);
    const low = p.place !== 'behind';
    const cx = W / 2, cy = low ? H * (portrait ? 0.7 : 0.68) : H / 2;
    const R = portrait ? W * 0.46 : Math.min(W * 0.3, H * 0.55);
    const it = low ? lyricItem(env, W / 2, H * (portrait ? 0.3 : 0.27), W * 0.86, H * (portrait ? 0.34 : 0.36)) : halo(env, lyricItem(env, W / 2, H / 2, W * 0.84, H * 0.3));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, seed = p.seed || 1;
      const pos = beatPos(env), k = Math.floor(pos);
      const GX = p.gx || 26, GZ = p.gz || 16, A = 0.3 * E.outCubic(io);
      const src = b => (p.roam ? [(ir(seed, b, 1) - 0.5) * 1.6, (ir(seed, b, 2) - 0.5) * 0.9] : [0, 0]);
      const waves = [];
      for (let b = Math.max(0, k - 2); b <= k; b++) waves.push({ s: src(b), age: pos - b });
      const ax = p.tilt || 0.5;
      ctx.save();
      const rowsP = [];
      for (let iz = 0; iz < GZ; iz++) {
        const row = [];
        for (let ix = 0; ix < GX; ix++) {
          const x = (ix / (GX - 1) - 0.5) * 3.2, z = (iz / (GZ - 1) - 0.5) * 2;
          let y = 0;
          for (const w of waves) {
            const d = Math.hypot(x - w.s[0], z - w.s[1]), front = w.age * 1.25;
            if (d > front) continue;
            y += A * Math.sin((d - front) * 5.5) * Math.exp(-w.age * 0.8) * clamp((front - d) * 3) * Math.exp(-d * 0.35);
          }
          const v = M.persp(cx, cy, R, M.rot3([x, -y, z], ax, 0, 0), 4);
          v.push(y);
          row.push(v);
        }
        rowsP.push(row);
      }
      for (const row of rowsP) {                        // 奥行きの行ごとの線(波で持ち上がる)
        const f = clamp(0.5 - row[0][2] * 0.5);
        if (p.lines) { ctx.globalAlpha = io * (0.15 + 0.55 * f); ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * (1 + 1.6 * f)); ctx.beginPath(); row.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.stroke(); }
        for (const v of row) {
          const crest = v[4] > A * 0.2, d = Math.max(1.2, u * (2.8 + 4.4 * f) * (crest ? 1.7 : 1));
          ctx.globalAlpha = io * (0.25 + 0.75 * f); ctx.fillStyle = crest ? sc.accent : sc.fg;
          ctx.fillRect(v[0] - d / 2, v[1] - d / 2, d, d);
        }
      }
      const w = waves[waves.length - 1];
      if (w && w.age < 2.5) {
        const ring = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; ring.push(M.persp(cx, cy, R, M.rot3([w.s[0] + Math.cos(a) * w.age * 1.25, 0, w.s[1] + Math.sin(a) * w.age * 1.25], ax, 0, 0), 4)); }
        strokeDepth(ctx, ring, false, sc.accent2, Math.max(1, u * 3), io * (1 - w.age / 2.5), 6, 0.3);
      }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_orbits', {
  name: '軌道リング', tags: ['graphic', 'calm', 'cyber', 'emotional'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ rings: rng.int(3, 4), tilt: rng.range(0.34, 0.5), roll: rng.range(-0.22, 0.22), spin: rng.sign(), seed: rng.int(1, 99999) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const it = halo(env, lyricItem(env, cx, cy, W * 0.66, H * (env.portrait ? 0.24 : 0.28), { cap: m * 0.18 }));
    const bb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, NR = p.rings || 3;
      const maxR = W * 0.47, rin = Math.min(maxR * 0.7, Math.max(bb.w / 2 * 1.08, m * 0.2));
      const ax = p.tilt || 0.4, az = p.roll || 0;
      const st = stepped(env, 0.5, E.outBack);
      const hot = Math.floor(beatPos(env)) % NR, K = kick(env);
      const planets = [];
      ctx.save();
      for (let i = 0; i < NR; i++) {
        const r = NR > 1 ? lerp(rin, maxR, i / (NR - 1)) / maxR : 1;
        const e = clamp(io * 1.5 - i * 0.15);
        if (e <= 0) continue;
        const ring = [];
        const segs = Math.max(2, Math.round(72 * E.outCubic(e)));
        for (let s = 0; s <= segs; s++) { const a = -Math.PI / 2 + s / 72 * TAU; ring.push(M.persp(cx, cy, maxR, M.rot3([Math.cos(a) * r, 0, Math.sin(a) * r], ax, 0, az), 5)); }
        strokeDepth(ctx, ring, false, i === hot ? sc.accent : sc.fg, Math.max(1, u * (i === hot ? 2.5 + K * 2 : 1.8)), io * (i === hot ? 1 : 0.6), 6, 0.3);
        const np = 1 + (ih(p.seed || 1, i) % 2);
        for (let j = 0; j < np; j++) {
          const a = ir(p.seed || 1, i, j + 5) * TAU + (p.spin || 1) * (st * TAU / 8 / (1 + i * 0.6) + env.ltb * 0.15 / (1 + i));
          const v = M.persp(cx, cy, maxR, M.rot3([Math.cos(a) * r, 0, Math.sin(a) * r], ax, 0, az), 5);
          planets.push({ v, s: m * (0.012 + 0.008 * ((NR - i) % 3)) * v[3], col: [sc.accent, sc.accent2, sc.fg][(i + j) % 3], a: e });
        }
      }
      planets.sort((A, B) => B.v[2] - A.v[2]);
      for (const q of planets) { ctx.globalAlpha = io * q.a; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.v[0], q.v[1], q.s, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_gyro', {
  name: 'ジャイロ環', tags: ['cyber', 'graphic', 'editorial'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ spin: rng.sign(), beads: rng.chance(0.7), tilt: rng.range(0.3, 0.5) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45), m = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const it = halo(env, lyricItem(env, cx, cy, W * 0.7, H * (env.portrait ? 0.24 : 0.3), { cap: m * 0.18 }), 0.4);
    const bb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const R = clamp(Math.hypot(bb.w, bb.h) / 2 * 1.06, m * 0.24, m * 0.47) * (0.4 + 0.6 * E.outBack(clamp(env.lt / 0.55), 1.3)) * (1 - 0.3 * E.inCubic(env.pOut));
      const pos = beatPos(env), k = Math.floor(pos), f = E.outBack(clamp((pos - k) / 0.55), 1.6);
      const ang = i => { const cnt = k >= i ? Math.floor((k - i) / 3) + 1 : 0; return (k % 3 === i && k >= i ? cnt - 1 + f : cnt) * Math.PI / 2; };  // 拍ごとに1本ずつ90°スナップ
      const gx = p.tilt || 0.4, gy = env.ltb * 0.18 * (p.spin || 1);
      const cols = [sc.accent, sc.fg, sc.accent2];
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const r = 1 - i * 0.12, th = ang(i) * (p.spin || 1), pts = [];
        for (let s = 0; s < 64; s++) {
          const a = s / 64 * TAU;
          let q = i === 0 ? [Math.cos(a) * r, 0, Math.sin(a) * r] : i === 1 ? [0, Math.cos(a) * r, Math.sin(a) * r] : [Math.cos(a) * r, Math.sin(a) * r, 0];
          q = i === 0 ? M.rot3(q, th, 0, 0) : i === 1 ? M.rot3(q, 0, th, 0) : M.rot3(q, th * 0.5 + 0.6, 0, th);
          pts.push(M.persp(cx, cy, R, M.rot3(q, gx, gy, 0), 4.5));
        }
        strokeDepth(ctx, pts, true, cols[i], Math.max(1.5, u * 5), io, 4, 0.22);
        if (p.beads) {
          const b = pts[Math.floor(frac(env.ltb * 0.25 + i / 3) * 64)];
          ctx.globalAlpha = io * (0.4 + 0.6 * clamp(0.5 - b[2] * 0.5)); ctx.fillStyle = cols[i];
          ctx.beginPath(); ctx.arc(b[0], b[1], u * 9 * b[3], 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ geometry */
const BH_KINDS = ['circle', 'half', 'quarter', 'rect', 'tri', 'ring'];
const bhShape = (ctx, kind, hs) => {
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(0, 0, hs * 0.8, 0, TAU);
  else if (kind === 'half') { ctx.arc(0, hs * 0.45, hs * 0.92, Math.PI, TAU); ctx.closePath(); }
  else if (kind === 'quarter') { ctx.moveTo(-hs, hs); ctx.arc(-hs, hs, hs * 1.9, -Math.PI / 2, 0); ctx.closePath(); }
  else if (kind === 'rect') ctx.rect(-hs, -hs, hs * 2, hs);
  else if (kind === 'tri') { ctx.moveTo(-hs, hs); ctx.lineTo(hs, hs); ctx.lineTo(-hs, -hs); ctx.closePath(); }
  else { ctx.arc(0, 0, hs * 0.74, 0, TAU); ctx.arc(0, 0, hs * 0.42, 0, TAU, true); }
};
L.register('layout', 'g_bauhaus', {
  name: 'バウハウス構成', tags: ['graphic', 'editorial', 'pop'], w: 1.1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ seed: rng.int(1, 99999), mode: rng.pick(['side', 'side', 'strips']), flip: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4), seed = p.seed || 1;
    const tiles = [];
    let it;
    if (p.mode === 'strips') {
      const nx = portrait ? 4 : W / H < 1.3 ? 5 : 7;
      const t = Math.min(W * 0.9 / nx, H * (portrait ? 0.14 : 0.2));
      const x0 = W / 2 - t * nx / 2, ya = H * 0.06, yb = H * 0.94 - t;
      for (let i = 0; i < nx; i++) { tiles.push([x0 + i * t, ya, t]); tiles.push([x0 + i * t, yb, t]); }
      it = lyricItem(env, W / 2, H / 2, W * 0.86, (yb - ya - t) * 0.82);
    } else {
      const s = split(env, 0.42, p.flip);
      const S = Math.min(s.g.w, s.g.h) * 0.96, t = S / 3;
      const x0 = s.g.x - S / 2, y0 = s.g.y - S / 2;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tiles.push([x0 + i * t, y0 + j * t, t]);
      it = lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h);
    }
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, T = tiles.length;
      const pos = beatPos(env), k = Math.floor(pos), f = pos - k;
      const turns = new Array(T).fill(0);
      for (let b = 0; b < k && b < 64; b++) turns[ih(seed, b, 7) % T]++;
      const cur = ih(seed, k, 7) % T, e = E.outBack(clamp(f / 0.5), 1.8);
      const pal = [sc.accent, sc.accent2, sc.fg, sc.accent];
      ctx.save();
      tiles.forEach(([x, y, t], i) => {
        const q = E.outBack(clamp((env.lt - i * 0.04) / 0.4), 1.5) * (1 - E.inCubic(clamp(env.pOut * 1.3 - (i / T) * 0.3)));
        if (q <= 0.01) return;
        const hs = t * 0.42 * q;
        ctx.globalAlpha = io;
        if ((i + ih(seed, i)) % 2 === 0) { ctx.fillStyle = sc.dim; ctx.fillRect(x + t / 2 - hs * 1.14, y + t / 2 - hs * 1.14, hs * 2.28, hs * 2.28); }
        const kind = BH_KINDS[ih(seed, i, 1) % BH_KINDS.length];
        const rot = (ih(seed, i, 2) % 4 + turns[i] + (i === cur ? e : 0)) * Math.PI / 2;
        const pop = i === cur ? 1 + 0.1 * Math.sin(Math.PI * clamp(f / 0.5)) : 1;
        ctx.save(); ctx.translate(x + t / 2, y + t / 2); ctx.rotate(rot); ctx.scale(pop, pop);
        bhShape(ctx, kind, hs);
        ctx.fillStyle = pal[ih(seed, i, 3) % pal.length]; ctx.fill('evenodd');
        ctx.restore();
      });
      ctx.restore();
    }
    return drawRows(env, it);
  },
}, P);

L.register('layout', 'g_kaleido', {
  name: '万華鏡', tags: ['graphic', 'pop', 'glitch', 'emotional'], w: 0.9, emph: 1.4, busy: true, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ k: rng.pick([6, 8, 10, 12]), seed: rng.int(1, 99999), m: rng.int(4, 6), spin: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45), m = Math.min(W, H);
    const cx = W / 2, cy = H / 2, disk = cut.n <= 8;
    const it = disk ? lyricItem(env, cx, cy, m * 0.44, m * 0.26, { cap: m * 0.16 }) : lyricItem(env, cx, cy, W * 0.84, H * (env.portrait ? 0.22 : 0.26));
    const bb = L.itemBox(it);
    const rd = disk ? Math.hypot(bb.w, bb.h) / 2 + m * 0.035 : 0;
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, K = p.k || 8, seed = p.seed || 1, NS = p.m || 5;
      const Rk = Math.hypot(W, H) * 0.52 * (0.3 + 0.7 * E.outCubic(io));
      const rot = (p.spin || 1) * (stepped(env, 0.5, E.outBack) * Math.PI / K + env.ltb * 0.04);
      const K2 = kick(env) * io;
      const pal = [sc.accent, sc.accent2, sc.fg, sc.sub];
      const shapes = [];
      for (let j = 0; j < NS; j++) {
        const r = (0.3 + 0.66 * ir(seed, j, 1)) * Rk * (0.9 + 0.1 * Math.sin(env.ltb * 0.9 + j * 1.7));
        const th = ir(seed, j, 2) * Math.PI / K;
        const s = Rk * (0.03 + 0.045 * ir(seed, j, 3)) * (1 + K2 * (j % 2 ? 0.25 : -0.12));
        shapes.push({ x: Math.cos(th) * r, y: Math.sin(th) * r, s, kind: ih(seed, j, 4) % 4, col: pal[ih(seed, j, 5) % (ih(seed, j, 4) % 4 === 3 ? 4 : 3)], sr: stepped(env, 0.5, E.outBack, j * 0.05) * Math.PI / 2 * (j % 2 ? 1 : -1) });
      }
      ctx.save(); ctx.translate(cx, cy);
      for (let sgm = 0; sgm < K; sgm++) for (const mir of [1, -1]) {
        ctx.save(); ctx.rotate(sgm * TAU / K + rot); ctx.scale(1, mir);
        for (const q of shapes) {
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.sr);
          ctx.globalAlpha = io * 0.85; ctx.fillStyle = q.col; ctx.strokeStyle = q.col; ctx.lineWidth = Math.max(1, u * 3);
          ctx.beginPath();
          if (q.kind === 0) { ctx.arc(0, 0, q.s, 0, TAU); ctx.fill(); }
          else if (q.kind === 1) { ctx.moveTo(0, -q.s); ctx.lineTo(q.s * 0.87, q.s * 0.5); ctx.lineTo(-q.s * 0.87, q.s * 0.5); ctx.closePath(); ctx.fill(); }
          else if (q.kind === 2) { ctx.rect(-q.s * 0.7, -q.s * 0.7, q.s * 1.4, q.s * 1.4); ctx.fill(); }
          else { ctx.arc(0, 0, q.s * 0.8, 0, TAU); ctx.stroke(); }
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.restore();
    }
    if (disk) {
      const e = E.outBack(clamp(env.lt / 0.4), 1.3) * (1 - E.inCubic(env.pOut));
      env.circle(cx, cy, rd * e, sc.bg, sc.accent, Math.max(1.5, u * 4), 0.96 * clamp(e), false);
      env.circle(cx, cy, rd * e * 1.08, null, sc.fg, Math.max(1, u * 1.5), 0.6 * clamp(e), false);
    } else plate(env, bb, io, { r: 0, px: W, stroke: sc.accent, lw: Math.max(1, u * 2.5) });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_counterPoly', {
  name: '逆回転多角形', tags: ['graphic', 'cyber', 'editorial'], w: 1, emph: 1.3, busy: true, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ sides: rng.pick([3, 4, 6, 6, 8]), count: rng.int(7, 10), filled: rng.chance(0.4), spin: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4), m = Math.min(W, H);
    const cx = W / 2, cy = H / 2, band = cut.n > 9;
    const it = band ? lyricItem(env, cx, cy, W * 0.84, H * (env.portrait ? 0.22 : 0.26)) : lyricItem(env, cx, cy, m * 0.62, m * 0.3, { cap: m * 0.17 });
    const bb = L.itemBox(it);
    const N = p.sides || 6, C = p.count || 8;
    const inner = band ? m * 0.14 : Math.hypot(bb.w, bb.h) / 2 + m * 0.03;
    const r0 = inner / Math.cos(Math.PI / N), rMax = Math.hypot(W, H) * 0.6;
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const polys = [];
      for (let j = 0; j < C; j++) {
        const q = E.outBack(clamp((env.lt - j * 0.04) / 0.4), 1.2) * (1 - E.inCubic(clamp(env.pOut * 1.3 - (C - j) * 0.03)));
        if (q <= 0.01) continue;
        const dir = (j % 2 ? -1 : 1) * (p.spin || 1);
        const rot = dir * (stepped(env, 0.55, E.outBack, j * 0.045) * Math.PI / N + env.ltb * 0.04);
        polys.push({ j, q, pts: polyPts(cx, cy, lerp(r0, rMax, j / (C - 1)) * (0.7 + 0.3 * q), N, rot) });
      }
      ctx.save(); ctx.lineJoin = 'round';
      if (p.filled) {
        for (let i = polys.length - 1; i >= 0; i--) {
          const g = polys[i];
          ctx.globalAlpha = io * g.q; ctx.fillStyle = g.j % 2 ? sc.bg : (g.j % 4 === 0 ? sc.accent : sc.accent2);
          ctx.beginPath(); pathPoly(ctx, g.pts); ctx.fill();
        }
        if (!band) { ctx.globalAlpha = io; ctx.fillStyle = sc.bg; ctx.beginPath(); ctx.arc(cx, cy, inner * 0.97, 0, TAU); ctx.fill(); }
      } else {
        for (const g of polys) {
          ctx.globalAlpha = io * g.q * (g.j % 2 ? 0.7 : 1); ctx.strokeStyle = g.j % 3 === 0 ? sc.accent : sc.fg;
          ctx.lineWidth = Math.max(1, u * (g.j % 2 ? 2 : 5));
          ctx.beginPath(); pathPoly(ctx, g.pts); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (band) plate(env, bb, io, { r: 0, px: W, stroke: sc.accent });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_burst', {
  name: '放射ウェッジ', tags: ['pop', 'graphic'], w: 1, emph: 1.5, busy: true, treat: 'safe', fits: n => n >= 1 && n <= 30,
  plan: rng => ({ n: rng.pick([12, 16, 20, 24]), origin: rng.pick(['center', 'center', 'corner']), corner: rng.int(0, 3) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4), m = Math.min(W, H);
    const center = p.origin !== 'corner', cr = p.corner || 0;
    const ox = center ? W / 2 : cr % 2 ? W * 1.02 : -W * 0.02, oy = center ? H / 2 : cr > 1 ? H * 1.02 : -H * 0.02;
    const badge = center && cut.n <= 10;
    const it = badge ? lyricItem(env, W / 2, H / 2, m * 0.5, m * 0.3, { cap: m * 0.17 }) : lyricItem(env, W / 2, H / 2, W * 0.8, H * (env.portrait ? 0.24 : 0.3));
    const bb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, N = p.n || 16;
      const R = Math.hypot(W, H) * 1.1 * E.outCubic(io);
      const rot = stepped(env, 0.45, E.outCubic) * TAU / N + env.ltb * 0.03;
      const wd = TAU / N * E.outCubic(clamp(env.lt / 0.5)) * (1 - 0.8 * E.inCubic(env.pOut));
      ctx.save();
      for (let i = 0; i < N; i += 2) {
        const a = rot + i * TAU / N;
        ctx.globalAlpha = io * 0.85; ctx.fillStyle = i % 4 === 2 ? sc.accent2 : sc.accent;   // 常に2色交互(単色の放射は避ける)
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, R, a, a + wd); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (badge) {
      const rd = (Math.hypot(bb.w, bb.h) / 2 + m * 0.04) * (1 + kick(env) * 0.03 * io);
      const e = E.outBack(clamp(env.lt / 0.4), 1.4) * (1 - E.inCubic(env.pOut));
      env.circle(W / 2, H / 2, rd * e, sc.bg, sc.fg, Math.max(1.5, u * 4), clamp(e), false);
      if (env.pass === 'main' && e > 0.02) {
        const n2 = 24, st = stepped(env, 0.4, E.outCubic) * TAU / n2 * -1;
        for (let i = 0; i < n2; i++) { const a = st + i / n2 * TAU; env.circle(W / 2 + Math.cos(a) * rd * e * 1.14, H / 2 + Math.sin(a) * rd * e * 1.14, u * 4, sc.fg, null, 1, clamp(e) * (i % 2 ? 0.4 : 1)); }
      }
    } else plate(env, bb, io, { stroke: sc.fg, lw: Math.max(1, u * 3), r: u * 4, wipe: true });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_blob', {
  name: '液体ブロブ', tags: ['pop', 'emotional', 'graphic'], w: 1.1, emph: 1.3, treat: 'safe', fits: n => n >= 1 && n <= 30,
  plan: rng => ({ lobes: rng.int(5, 7), seed: rng.int(1, 9999), fill: rng.pick(['accent', 'accent', 'accent2']), echo: rng.chance(0.7) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.35);
    const cx = W / 2, cy = H / 2;
    const fillC = p.fill === 'accent2' ? sc.accent2 : sc.accent, tcol = p.fill === 'accent2' ? sc.onAccent2 : sc.onInk;
    const it = lyricItem(env, cx, cy, portrait ? W * 0.5 : Math.min(W * 0.46, H * 0.95), portrait ? W * 0.5 : H * 0.34, { item: { color: tcol } });
    const bb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, seed = p.seed || 1, lobes = p.lobes || 6;
      const rx = Math.min(W * 0.46, bb.w / 2 * 1.46 + Math.min(W, H) * 0.04), ry = Math.min(H * 0.46, bb.h / 2 * 1.75 + Math.min(W, H) * 0.04);
      const g = E.outBack(clamp(env.lt / 0.35), 1.5) * (1 - 0.35 * E.inCubic(env.pOut));
      const k = Math.floor(beatPos(env)), K = kick(env) * io;
      const blob = (t, sc2) => {
        const pts = [];
        for (let i = 0; i < 72; i++) {
          const th = i / 72 * TAU;
          let f = 1;
          for (let h = 2; h <= 4; h++) f += (0.02 + 0.03 * L.noise1(t * 0.6 + h * 10, seed)) * Math.sin(h * th + t * (0.5 + 0.3 * h) * (h % 2 ? 1 : -1) + h);
          f += 0.06 * K * Math.sin(lobes * th + k * 1.7);
          pts.push([cx + Math.cos(th) * rx * f * g * sc2, cy + Math.sin(th) * ry * f * g * sc2]);
        }
        return pts;
      };
      const smooth = pts => {
        const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        ctx.beginPath(); const s = mid(pts[n - 1], pts[0]); ctx.moveTo(s[0], s[1]);
        for (let i = 0; i < n; i++) { const q = mid(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
        ctx.closePath();
      };
      ctx.save();
      if (p.echo) { smooth(blob(env.ltb - 0.35, 1.1)); ctx.globalAlpha = io * 0.9; ctx.strokeStyle = p.fill === 'accent2' ? sc.accent : sc.accent2; ctx.lineWidth = Math.max(1.5, u * 4); ctx.stroke(); }
      smooth(blob(env.ltb, 1)); ctx.globalAlpha = io; ctx.fillStyle = fillC; ctx.fill();
      ctx.restore();
    }
    return L.mainDraw(env, it);
  },
}, P);

const LISSA = [[1, 2], [2, 3], [3, 4], [3, 2], [1, 3], [4, 5], [5, 4], [2, 5]];
L.register('layout', 'g_lissajous', {
  name: 'リサージュ曲線', tags: ['editorial', 'cyber', 'calm', 'graphic'], w: 1, emph: 1, fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ pair: rng.int(0, LISSA.length - 1), d: rng.range(0, Math.PI), mode: cut.n > 14 ? 'side' : rng.pick(['side', 'big']), flip: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4);
    const [a, b] = LISSA[(p.pair || 0) % LISSA.length];
    const side = p.mode === 'side';
    let cx, cy, rx, ry, it, s = null;
    if (side) {
      s = split(env, 0.42, p.flip);
      const S = Math.min(s.g.w, s.g.h) * 0.92;
      cx = s.g.x; cy = s.g.y; rx = ry = S * 0.4;
      env.rrect(cx - S / 2, cy - S / 2, S, S, u * 10, L.rgba(sc.fg, 0.04), io, false, L.rgba(sc.fg, 0.3), Math.max(1, u * 1.5));
      env.line([[cx - S / 2, cy], [cx + S / 2, cy]], sc.sub, Math.max(1, u), io * 0.5, false, [u * 5, u * 6]);
      env.line([[cx, cy - S / 2], [cx, cy + S / 2]], sc.sub, Math.max(1, u), io * 0.5, false, [u * 5, u * 6]);
      it = lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h);
    } else {
      cx = W / 2; cy = H / 2; rx = W * 0.44; ry = H * 0.42;
      it = halo(env, lyricItem(env, cx, cy, W * 0.8, H * (env.portrait ? 0.24 : 0.3)), 0.4);
    }
    const st = stepped(env, 0.6, E.outCubic);
    const draw = clamp(st / 4);                            // 1拍ごとに1/4ずつ描き起こす
    const d = (p.d || 0) + Math.max(0, st - 4) * Math.PI / 12;
    const curve = dd => { const pts = []; for (let i = 0; i <= 220; i++) { const t = i / 220 * TAU; pts.push([cx + Math.sin(a * t + dd) * rx, cy + Math.sin(b * t) * ry]); } return pts; };
    if (env.pass === 'main' && io > 0.002) {
      if (st > 4) env.line(curve(d - Math.PI / 12), sc.sub, Math.max(1, u * 1.5), io * 0.35);
      const pts = curve(d);
      env.polyPartial(pts, draw, sc.accent, Math.max(1.5, u * (side ? 4 : 3)), io * (side ? 1 : 0.7));
      const hi = draw < 1 ? draw : frac(beatPos(env) / 4);
      const t = hi * TAU, K = kick(env) * io;
      const hx = cx + Math.sin(a * t + d) * rx, hy = cy + Math.sin(b * t) * ry;
      env.circle(hx, hy, u * (12 + 8 * K), sc.accent2, sc.bg, Math.max(1, u * 3), io);
      env.circle(hx, hy, u * (22 + 34 * (1 - K)), null, sc.accent2, Math.max(1, u * 2.5), io * K * 0.8);
    }
    if (side) label(env, `${a}:${b}  δ ${Math.round((d * 180 / Math.PI) % 360)}°`, cx - rx * 1.1, cy - ry * 1.1, io * 0.85, { color: sc.accent });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_tiles', {
  name: 'タイル反転', tags: ['graphic', 'pop', 'glitch'], w: 0.9, emph: 1.2, busy: true, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ kind: rng.pick(['tri', 'hex', 'tri']), ang: rng.range(0, TAU), seed: rng.int(1, 99999), sz: rng.range(0.12, 0.16) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const it = lyricItem(env, W / 2, H / 2, W * 0.8, H * (env.portrait ? 0.24 : 0.3));
    const bb = L.itemBox(it);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, seed = p.seed || 1, s = m * (p.sz || 0.14);
      const pos = beatPos(env), k = Math.floor(pos), f = pos - k;
      const ca = Math.cos(p.ang || 0), sa = Math.sin(p.ang || 0), D = Math.hypot(W, H);
      const pal = [sc.dim, sc.bg2, sc.accent, sc.dim, sc.bg2, sc.accent2];
      const tiles = [];
      if (p.kind === 'hex') {
        const r = s * 0.58, dx = r * Math.sqrt(3), dy = r * 1.5;
        for (let j = -1, rows = Math.ceil(H / dy) + 1; j <= rows; j++) for (let i = -1, cols = Math.ceil(W / dx) + 1; i <= cols; i++) {
          const x = i * dx + (j % 2 ? dx / 2 : 0), y = j * dy;
          tiles.push({ x, y, pts: polyPts(0, 0, r * 0.94, 6, 0), id: (j + 50) * 1000 + i + 50 });
        }
      } else {
        const h = s * 0.866;
        for (let j = -1, rows = Math.ceil(H / h) + 1; j <= rows; j++) for (let i = -2, cols = Math.ceil(W / (s / 2)) + 2; i <= cols; i++) {
          const up = (i + j) % 2 === 0, x = i * s / 2, y = j * h;
          const pts = up ? [[0, -h * 0.62], [s * 0.47, h * 0.36], [-s * 0.47, h * 0.36]] : [[0, h * 0.62], [s * 0.47, -h * 0.36], [-s * 0.47, -h * 0.36]];
          tiles.push({ x, y: y + (up ? h * 0.12 : -h * 0.12) + h / 2, pts, id: (j + 50) * 1000 + i + 50 });
        }
      }
      ctx.save();
      for (const t of tiles) {
        const w = ((t.x - W / 2) * ca + (t.y - H / 2) * sa) / D + 0.5;          // 0..1 の波座標
        const ph = t.id % 3, flipBeat = (k + ph) % 3 === 0;                      // 各タイルは3拍に1回反転(毎拍 1/3 ずつ)
        const g = Math.floor((k + ph) / 3);
        let q = flipBeat ? clamp((f / 0.7 - w) * 3.5) : 1;
        const col = pal[ih(seed, t.id, q > 0.5 || !flipBeat ? g : g - 1) % pal.length];
        const sy = flipBeat ? Math.abs(Math.cos(Math.PI * q)) : 1;
        const din = clamp(io * 1.8 - Math.hypot(t.x - W / 2, t.y - H / 2) / D * 1.2);
        if (din <= 0.01 || sy <= 0.02) continue;
        ctx.globalAlpha = io * (col === sc.accent || col === sc.accent2 ? 0.9 : 1);
        ctx.fillStyle = col;
        ctx.save(); ctx.translate(t.x, t.y); ctx.scale(din, sy * din);
        ctx.beginPath(); pathPoly(ctx, t.pts); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    plate(env, bb, io, { stroke: sc.fg, lw: Math.max(1, u * 3), r: u * 6, alpha: 0.95 });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_mark', {
  name: '線画エンブレム', tags: ['editorial', 'graphic', 'calm'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ frame: rng.pick(['rect', 'circle', 'hex', 'rect', 'oct', 'circle']), ticks: rng.pick([24, 36, 48]), spin: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4), m = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    let it = p.frame !== 'rect' ? lyricItem(env, cx, cy, m * 0.56, m * 0.34, { cap: m * 0.17, rows: cut.n > 10 ? 3 : cut.n > 6 ? 2 : 1 }) : null;
    let bb = it && L.itemBox(it);
    const want = bb ? Math.hypot(bb.w, bb.h) / 2 * 1.1 + m * 0.03 : 1e9;
    const rectMode = want > m * 0.37;                 // 円に収まらない長さは矩形の枠へ
    if (rectMode) { it = lyricItem(env, cx, cy, W * (portrait ? 0.72 : 0.62), H * (portrait ? 0.22 : 0.28), { cap: m * 0.17 }); bb = L.itemBox(it); }
    if (env.pass === 'main' && io > 0.002) {
      const pos = beatPos(env), st = stepped(env, 0.5, E.outBack);
      const phase = i => E.outCubic(clamp((pos - i) / 0.8));          // 拍ごとに1要素ずつ描き起こす
      const lw = Math.max(1.5, u * 4), a = io;
      const ctx = env.ctx;
      if (!rectMode) {
        const R = want, sides = p.frame === 'hex' ? 6 : p.frame === 'oct' ? 8 : 0;
        const outline = [];
        if (sides) { const v = polyPts(cx, cy, R / Math.cos(Math.PI / sides), sides, Math.PI / sides); for (let i = 0; i <= sides; i++) outline.push(v[i % sides]); }
        else for (let i = 0; i <= 96; i++) { const t = -Math.PI / 2 + i / 96 * TAU; outline.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R]); }
        env.polyPartial(outline, phase(0), sc.fg, lw, a);
        const T = p.ticks || 36, tk = Math.floor(T * phase(1)), rot = (p.spin || 1) * st * TAU / T;
        ctx.save(); ctx.strokeStyle = sc.sub; ctx.globalAlpha = a; ctx.lineWidth = Math.max(1, u * 2); ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < tk; i++) {
          const t = rot - Math.PI / 2 + i / T * TAU, r0 = R * 1.1, r1 = R * (i % 4 === 0 ? 1.2 : 1.15);
          ctx.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0); ctx.lineTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1);
        }
        ctx.stroke(); ctx.restore();
        if (phase(2) > 0) {
          ctx.save(); ctx.setLineDash([u * 6, u * 9]); ctx.lineDashOffset = -env.ltb * u * 30;
          env.arc(cx, cy, R * 0.9, -90, -90 + 360 * phase(2), sc.sub, Math.max(1, u * 1.6), a * 0.8);
          ctx.restore();
        }
        if (phase(3) > 0) {
          const e = phase(3), y = cy, L0 = R * 1.3, L1 = R * 1.3 + Math.min(W / 2 - R * 1.3 - W * 0.06, R * 0.5) * e;
          if (L1 > L0) { env.line([[cx - L0, y], [cx - L1, y]], sc.accent2, lw, a); env.line([[cx + L0, y], [cx + L1, y]], sc.accent2, lw, a); }
          for (const q of [0.125, 0.375, 0.625, 0.875]) {
            const t = q * TAU, x = cx + Math.cos(t) * R * 1.32, yy = cy + Math.sin(t) * R * 1.32, c = u * 8 * e;
            env.line([[x - c, yy], [x + c, yy]], sc.fg, Math.max(1, u * 2), a);
            env.line([[x, yy - c], [x, yy + c]], sc.fg, Math.max(1, u * 2), a);
          }
        }
        const ha = (p.spin || 1) * st * 45;
        env.arc(cx, cy, R, ha - 90, ha - 90 + 34, sc.accent, lw * 1.8, a * phase(1));
        label(env, `No.${M.pad2(cut.idx + 1)}`, cx, cy - R * 1.32, a * phase(1), { anchor: 'center', color: sc.fg });
      } else {
        const px = m * 0.05, x0 = bb.x0 - px, x1 = bb.x1 + px, y0 = bb.y0 - px * 0.8, y1 = bb.y1 + px * 0.8;
        const outline = [[cx, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [cx, y0]];
        env.polyPartial(outline, phase(0), sc.fg, lw, a);
        const T = 24, tk = Math.floor(T * phase(1));
        for (let i = 0; i < tk; i++) { const x = lerp(x0, x1, (i + 0.5) / T); env.line([[x, y0 - u * 10], [x, y0 - u * (i % 4 ? 18 : 26)]], sc.sub, Math.max(1, u * 2), a); env.line([[x, y1 + u * 10], [x, y1 + u * (i % 4 ? 18 : 26)]], sc.sub, Math.max(1, u * 2), a); }
        const per = 2 * ((x1 - x0) + (y1 - y0)), hp = frac(st / 8) * per, seg = [];
        const along = d => { d = ((d % per) + per) % per; const w = x1 - x0, h = y1 - y0; if (d < w) return [x0 + d, y0]; d -= w; if (d < h) return [x1, y0 + d]; d -= h; if (d < w) return [x1 - d, y1]; d -= w; return [x0, y1 - d]; };
        for (let i = 0; i <= 12; i++) seg.push(along(hp + i / 12 * per * 0.08));
        env.line(seg, sc.accent, lw * 1.8, a * phase(1));
        label(env, `No.${M.pad2(cut.idx + 1)}`, x0, y0 - u * 44, a * phase(1), { color: sc.fg });
      }
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_pendulum', {
  name: '振り子', tags: ['calm', 'editorial', 'graphic'], w: 0.9, emph: 0.8, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ amp: rng.range(0.5, 0.7), mode: rng.pick(['hang', 'hang', 'metro']), trail: rng.chance(0.75), flip: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45), m = Math.min(W, H);
    const s = split(env, 0.4, p.flip);
    const metro = p.mode === 'metro' && !s.stack;
    let px, py, len, up, it;
    if (metro) { px = s.g.x; py = H * 0.8; len = H * 0.6; up = -1; it = lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h); }
    else {
      px = W / 2; py = H * 0.06; len = H * (portrait ? 0.4 : W / H < 1.3 ? 0.36 : 0.46); up = 1;
      const top = py + len + m * 0.08;
      it = lyricItem(env, W / 2, (top + H * 0.94) / 2, W * 0.86, (H * 0.94 - top) * 0.92);
    }
    const amp = Math.min(p.amp || 0.6, Math.asin(Math.min(1, W * 0.4 / len)));
    const pos = beatPos(env);
    const ang = t => amp * Math.cos(Math.PI * t) * E.outCubic(io);       // 拍の頭で端に到達(チク・タク)
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, L2 = len * (0.3 + 0.7 * E.outBack(clamp(env.lt / 0.5), 1.2));
      const bobAt = t => { const th = ang(t); return [px + Math.sin(th) * L2, py + up * Math.cos(th) * L2]; };
      const arcR = L2 * (metro ? 0.98 : 1.1);
      ctx.save(); ctx.globalAlpha = io; ctx.strokeStyle = sc.sub; ctx.lineWidth = Math.max(1, u * 2);
      ctx.beginPath(); ctx.arc(px, py, arcR, (up > 0 ? Math.PI / 2 : -Math.PI / 2) - amp, (up > 0 ? Math.PI / 2 : -Math.PI / 2) + amp); ctx.stroke();
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) {
        const t = (up > 0 ? Math.PI / 2 : -Math.PI / 2) + i / 4 * amp, r1 = arcR + u * (i % 4 === 0 ? 22 : 12);
        ctx.moveTo(px + Math.cos(t) * arcR, py + Math.sin(t) * arcR); ctx.lineTo(px + Math.cos(t) * r1, py + Math.sin(t) * r1);
      }
      ctx.stroke(); ctx.restore();
      if (metro) {                                 // 台形のボディ
        const bw = len * 0.42, tw = len * 0.16, yb = H * 0.92, yt = H * 0.1;
        env.line([[px - tw, yt], [px + tw, yt], [px + bw, yb], [px - bw, yb], [px - tw, yt]], sc.fg, Math.max(1.5, u * 3), io * 0.8);
      }
      const K = kick(env) * io;
      const side = Math.cos(Math.PI * Math.round(pos)) > 0 ? 1 : -1;
      const ex = bobAt(Math.round(pos));
      if (K > 0.05) for (let i = 0; i < 5; i++) {         // 端に着いた拍で火花
        const t = (i - 2) * 0.45, dx = Math.cos(t) * side, dy = Math.sin(t), r0 = m * 0.055, r1 = r0 + m * 0.045 * K;
        env.line([[ex[0] + dx * r0, ex[1] + dy * r0], [ex[0] + dx * r1, ex[1] + dy * r1]], sc.accent, Math.max(1, u * 3), K);
      }
      if (p.trail) for (let i = 5; i >= 1; i--) { const b = bobAt(pos - i * 0.05); env.circle(b[0], b[1], m * 0.03, sc.sub, null, 1, io * 0.12 * (6 - i) / 5); }
      const b = bobAt(pos);
      env.line([[px, py], b], sc.fg, Math.max(1.5, u * 4), io);
      if (metro) { const w = [lerp(px, b[0], 0.62), lerp(py, b[1], 0.62)]; env.rrect(w[0] - m * 0.035, w[1] - m * 0.022, m * 0.07, m * 0.044, u * 4, sc.accent, io, false); }
      else env.circle(b[0], b[1], m * (0.04 + 0.006 * K), sc.accent, null, 1, io);
      env.circle(px, py, u * 8, sc.fg, null, 1, io);
    }
    label(env, env.bpm ? `♩= ${Math.round(env.bpm)}` : 'TEMPO', metro ? px - len * 0.4 : W * 0.06, metro ? H * 0.06 : H * 0.07, io * 0.8, { color: sc.fg });
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'g_shapeGrid', {
  name: '図形グリッド', tags: ['graphic', 'pop', 'editorial'], w: 1, emph: 1.2, busy: true, fits: n => n >= 1 && n <= 30,
  plan: rng => { const s0 = rng.int(0, M.SHAPES.length - 1); return { order: [0, 1, 2, 3].map(i => M.SHAPES[(s0 + i * 2 + (i > 2 ? 1 : 0)) % M.SHAPES.length]), wave: rng.pick(['diag', 'radial', 'row']), spin: rng.sign() }; },
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4);
    const sq = W / H > 0.8 && W / H < 1.25;
    const c = sq ? W / 5 : Math.max(W, H) / 7;
    const cols = Math.ceil(W / c), rows = Math.ceil(H / c);
    const gx = (W - cols * c) / 2, gy = (H - rows * c) / 2;
    const bandH = c * (portrait ? 1.9 : 1.45);
    const it = lyricItem(env, W / 2, H / 2, W * 0.86, bandH * 0.78);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, order = p.order || ['circle', 'square', 'triangle', 'star'], bl = M.beatLen(env);
      const fillP = new Path2D(), strokeP = new Path2D();
      const spin = (p.spin || 1) * stepped(env, 0.5, E.outBack) * Math.PI / 4;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = gx + (i + 0.5) * c, y = gy + (j + 0.5) * c;
        if (Math.abs(y - H / 2) < bandH / 2 + c * 0.1) continue;
        const d = p.wave === 'radial' ? Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W, H) * 2 : p.wave === 'row' ? j / rows : (i + j) / (cols + rows);
        const q = E.outBack(clamp((env.lt - d * 0.45) / 0.35), 1.4) * (1 - E.inCubic(clamp(env.pOut * 1.4 - d * 0.4)));
        if (q <= 0.01) continue;
        const mm = M.morphAt(env, order, Math.max(0, env.ltb - d * bl * 0.9));
        const R = c * 0.3 * q, rot = spin * ((i + j) % 2 ? 1 : -1);
        const cs = Math.cos(rot), sn = Math.sin(rot), path = (i + j * 2) % 3 === 0 ? fillP : strokeP;
        mm.pts.forEach(([px, py], k) => { const X = x + (px * cs - py * sn) * R, Y = y + (px * sn + py * cs) * R; if (k) path.lineTo(X, Y); else path.moveTo(X, Y); });
        path.closePath();
      }
      ctx.save(); ctx.globalAlpha = io;
      ctx.fillStyle = sc.accent; ctx.fill(fillP);
      ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1.5, u * 4); ctx.lineJoin = 'round'; ctx.stroke(strokeP);
      ctx.restore();
      const e = E.outCubic(io);
      env.line([[W / 2 - W / 2 * e, H / 2 - bandH / 2], [W / 2 + W / 2 * e, H / 2 - bandH / 2]], sc.accent, Math.max(1, u * 3), io);
      env.line([[W / 2 - W / 2 * e, H / 2 + bandH / 2], [W / 2 + W / 2 * e, H / 2 + bandH / 2]], sc.accent, Math.max(1, u * 3), io);
    }
    return L.mainDraw(env, it);
  },
}, P);
})();
