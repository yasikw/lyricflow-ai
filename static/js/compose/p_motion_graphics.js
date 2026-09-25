/* LyricFlow 演出パック: p_motion_graphics — 拍同期モーショングラフィックス(リール)
   粒子で文字を組む / 図形モーフ / 遠近トンネル / ワイヤー立方体 / イージンググラフ / リールHUD。
   全て計算(Canvas2D)で描き、拍(env.beat / env.bpm)に同期する。実装はLyricFlow独自。契約: docs/COMPOSE_PACKS.md */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E, clamp = L.clamp, lerp = L.lerp;
const P = 'p_motion_graphics';
const MONO = "'Space Mono', 'DotGothic16', monospace";

/* ---------------- helpers ---------------- */
const beatLen = env => (env.bpm ? 60 / env.bpm : 0.5);
const pad2 = n => String(Math.max(0, n | 0)).padStart(2, '0');
const tc60 = t => { t = Math.max(0, t); const f = Math.floor((t % 1) * 60); const s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600); return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(f)}`; };
const fitLines = (env, text, font, maxW, maxH, cap, rowsMax = 2) => {
  const n = L.glyphCount(text);
  let best = { text, size: 0 };
  for (let rows = 1; rows <= rowsMax; rows++) {
    const t = rows === 1 ? text : L.splitLines(text, Math.ceil(n / rows)).join('\n');
    const s = L.fitSize(t, font, maxW, maxH, { max: cap });
    if (s > best.size * 1.08) best = { text: t, size: s };
  }
  return best;
};

/* 文字の形の点(項目中心が原点、サイズ1あたり)。1テキスト1回だけラスタから拾ってキャッシュ */
const ptCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => ptCache.clear());
const glyphPoints = (it, count) => {
  const base = 160;
  const key = [it.text, it.font, it.weight == null ? 900 : it.weight, it.vertical ? 1 : 0, it.lead || 0, it.track || 0, count].join('|');
  let pts = ptCache.get(key);
  if (pts) return pts;
  const it0 = Object.assign({}, it, { size: base, sx: 1, sy: 1, rot: 0 });
  const m = L.measure(it0);
  const pad = base * 0.3;
  const cw = Math.max(2, Math.ceil(m.w + pad * 2)), ch = Math.max(2, Math.ceil(m.h + pad * 2));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = L.fontStr(it0); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  for (const gl of m.lay) {
    if (gl.space) continue;
    g.save(); g.translate(cw / 2 + gl.x, ch / 2 + gl.y);
    if (gl.vrot) g.rotate(Math.PI / 2);
    g.fillText(gl.ch, 0, 0); g.restore();
  }
  const data = g.getImageData(0, 0, cw, ch).data;
  const cand = [];
  const step = 2;
  for (let y = 0; y < ch; y += step) for (let x = 0; x < cw; x += step) if (data[(y * cw + x) * 4 + 3] > 128) cand.push([(x - cw / 2) / base, (y - ch / 2) / base]);
  pts = [];
  const n = Math.min(count, cand.length);
  for (let i = 0; i < n; i++) pts.push(cand[Math.min(cand.length - 1, Math.floor((i + L.r('gp', key, i) * 0.95) * cand.length / n))]);
  if (ptCache.size > 80) ptCache.clear();
  ptCache.set(key, pts);
  return pts;
};

/* 図形の輪郭を n 点に等間隔で(上端から時計回り)。モーフは同じ番号の点どうしを補間 */
const SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond'];
const SHAPE_JA = { circle: '円', square: '四角', triangle: '三角', star: '星', hexagon: '六角', diamond: 'ひし形' };
const shapeCache = new Map();
const shapePts = (kind, n = 240) => {
  const key = kind + n;
  if (shapeCache.has(key)) return shapeCache.get(key);
  let pts;
  if (kind === 'circle') {
    pts = [];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / n * L.TAU; pts.push([Math.cos(a), Math.sin(a)]); }
  } else {
    let v;
    const poly = (k, r = 1, rot = -Math.PI / 2) => Array.from({ length: k }, (_, i) => [Math.cos(rot + i / k * L.TAU) * r, Math.sin(rot + i / k * L.TAU) * r]);
    if (kind === 'square') v = [[0, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86], [-0.86, -0.86]];
    else if (kind === 'triangle') v = poly(3, 1.05);
    else if (kind === 'hexagon') v = poly(6, 1);
    else if (kind === 'diamond') v = poly(4, 1.08);
    else if (kind === 'star') v = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.46 : 1.05, a = -Math.PI / 2 + i / 10 * L.TAU; return [Math.cos(a) * r, Math.sin(a) * r]; });
    const loop = v.concat([v[0]]);
    const seg = []; let total = 0;
    for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]); seg.push(d); total += d; }
    pts = [];
    for (let i = 0; i < n; i++) {
      let s = total * i / n, j = 0;
      while (j < seg.length - 1 && s > seg[j]) { s -= seg[j]; j++; }
      const f = seg[j] ? s / seg[j] : 0;
      pts.push([lerp(loop[j][0], loop[j + 1][0], f), lerp(loop[j][1], loop[j + 1][1], f)]);
    }
  }
  shapeCache.set(key, pts);
  return pts;
};
const drawShape = (env, pts, cx, cy, R, rot, fill, stroke, lw, a) => {
  if (env.pass !== 'main' || a <= 0.002) return;
  const ctx = env.ctx, c = Math.cos(rot), s = Math.sin(rot);
  ctx.save(); ctx.globalAlpha = clamp(a);
  ctx.beginPath();
  pts.forEach(([x, y], i) => { const X = cx + (x * c - y * s) * R, Y = cy + (x * s + y * c) * R; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  ctx.restore();
};
/* 拍ごとに次の図形へ(拍の前半 60% でモーフ) */
const morphAt = (env, order, t) => {
  const bl = beatLen(env);
  const k = Math.floor(Math.max(0, t) / bl);
  const f = E.inOutCubic(clamp((Math.max(0, t) - k * bl) / (bl * 0.6)));
  const A = shapePts(order[k % order.length]), B = shapePts(order[(k + 1) % order.length]);
  return { pts: A.map((p, i) => [lerp(p[0], B[i][0], f), lerp(p[1], B[i][1], f)]), name: order[(k + (f > 0.5 ? 1 : 0)) % order.length], k, f };
};
/* 遠近法: 立方体の頂点と辺 */
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const projectCube = (cx, cy, R, ax, ay, az = 0, dist = 4.2) => CUBE_V.map(([x, y, z]) => {
  let X = x, Y = y, Z = z;
  let c = Math.cos(ay), s = Math.sin(ay); [X, Z] = [X * c + Z * s, -X * s + Z * c];
  c = Math.cos(ax); s = Math.sin(ax); [Y, Z] = [Y * c - Z * s, Y * s + Z * c];
  c = Math.cos(az); s = Math.sin(az); [X, Y] = [X * c - Y * s, X * s + Y * c];
  const k = dist / (dist + Z);
  return [cx + X * R * k, cy + Y * R * k, Z];
});
const beatKick = env => { const b = env.beat; if (!b) return 0; return Math.exp(-b.since / 0.12); };
/* 副テキストを左端/右端基準で置く(項目は中心基準なので幅の半分ずらす) */
const anchored = (env, it, anchor) => {
  const w = L.measure(it).w;
  return env.text(Object.assign({}, it, { x: it.x + (anchor === 'left' ? w / 2 : anchor === 'right' ? -w / 2 : 0) }));
};

/* ---------------- layouts ---------------- */
L.register('layout', 'm_particles', {
  name: '粒子で組む文字', tags: ['graphic', 'cyber', 'pop', 'emotional'], w: 1.1, emph: 1.8, fits: n => n >= 1 && n <= 14,
  enterBias: { fade: 4 },
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), from: rng.pick(['ring', 'scatter', 'spiral', 'rain']), n: rng.int(2200, 3000), accent: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc } = env;
    const p = cut.params || {};
    const font = L.roleFont(env, p.role || 'display');
    const fit = fitLines(env, cut.text, font, W * 0.84, H * (env.portrait ? 0.34 : 0.5), Math.min(W, H) * 0.34, cut.n > 6 ? 2 : 1);
    const it = { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2 };
    const N = env.allowFilter ? (p.n || 2600) : 900;
    const pts = glyphPoints(it, N);
    const gatherT = Math.max(0.35, Math.min(cut.dur * 0.55, beatLen(env) * 2.2));
    const g = clamp(env.lt / gatherT);
    const settle = L.smooth(0.78, 1, g);
    if (env.pass === 'main' && pts.length) {
      const ctx = env.ctx, seed = cut.seed, R = Math.hypot(W, H) * 0.46;   // 画面の縁の内側から集まる(冒頭が空にならない)
      const r = Math.max(0.8, fit.size * 0.016);
      ctx.save();
      for (let i = 0; i < pts.length; i++) {
        const d = L.r(seed, 'd', i), q = E.inOutCubic(clamp((g - 0.35 * d) / 0.65));
        const tx = W / 2 + pts[i][0] * fit.size, ty = H / 2 + pts[i][1] * fit.size;
        let sx, sy;
        const a0 = L.r(seed, 'a', i) * L.TAU;
        if (p.from === 'scatter') { sx = L.r(seed, 'x', i) * W; sy = L.r(seed, 'y', i) * H; }
        else if (p.from === 'rain') { sx = tx + L.rs(seed, 'x', i) * W * 0.05; sy = -H * (0.1 + L.r(seed, 'y', i) * 0.6); }
        else if (p.from === 'spiral') { const a = a0 * 3 + i * 0.013; sx = W / 2 + Math.cos(a) * R * (0.6 + d * 0.5); sy = H / 2 + Math.sin(a) * R * (0.6 + d * 0.5); }
        else { sx = W / 2 + Math.cos(a0) * R; sy = H / 2 + Math.sin(a0) * R; }
        const swirl = (1 - q) * Math.min(W, H) * 0.08;
        let x = lerp(sx, tx, q) + Math.cos(a0 + env.ltb * 2) * swirl, y = lerp(sy, ty, q) + Math.sin(a0 + env.ltb * 2) * swirl;
        if (env.pOut > 0) {                                   // 退場: 外へ爆散
          const e = E.inCubic(env.pOut), ang = Math.atan2(ty - H / 2, tx - W / 2) + L.rs(seed, 'e', i) * 0.8;
          x += Math.cos(ang) * e * R * (0.3 + L.r(seed, 'v', i)); y += Math.sin(ang) * e * R * (0.3 + L.r(seed, 'v', i)) + e * e * H * 0.2;
        }
        ctx.globalAlpha = clamp((0.3 + 0.7 * q) * (1 - settle * 0.6) * (1 - env.pOut));
        ctx.fillStyle = p.accent && i % 5 === 0 ? sc.accent : sc.fg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    const bb = L.mainDraw(env, Object.assign({}, it, { alpha: settle }));
    return bb || L.itemBox(it);
  },
}, P);

L.register('layout', 'm_morph', {
  name: '図形モーフ', tags: ['graphic', 'pop', 'editorial'], w: 1, emph: 1.2, treat: 'safe', fits: n => n >= 1 && n <= 12,
  plan: rng => {
    const s0 = rng.int(0, SHAPES.length - 1);
    return { order: [0, 1, 2, 3].map(i => SHAPES[(s0 + i) % SHAPES.length]), mode: rng.pick(['inside', 'inside', 'below']), spin: rng.sign() };
  },
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const order = p.order || ['circle', 'square', 'triangle', 'star'];
    const io = env.inOut(0.45);
    const inside = p.mode !== 'below';
    const R = Math.min(W, H) * (inside ? 0.34 : 0.24) * (0.4 + 0.6 * E.outBack(clamp(env.lt / 0.5), 1.4)) * (1 + beatKick(env) * 0.04);
    const cx = W / 2, cy = inside ? H / 2 : H * (env.portrait ? 0.4 : 0.38);
    const m = morphAt(env, order, env.ltb);
    const rot = (p.spin || 1) * env.ltb * 0.25;
    drawShape(env, m.pts, cx, cy, R, rot, inside ? sc.accent : null, inside ? null : sc.accent, Math.max(2, u * 6), io);
    if (!inside) drawShape(env, m.pts, cx, cy, R * 0.55, -rot * 1.6, sc.accent2, null, 0, io * 0.8);
    // 形の名前(小さなラベル)
    if (io > 0.02) env.text({ text: `SHAPE / ${m.name.toUpperCase()}`, font: MONO, weight: 700, size: Math.max(9, u * 20), x: cx, y: cy + R * 1.18 + u * 18, color: sc.sub, alpha: io * 0.85, ghost: false, track: 0.12 });
    const font = L.roleFont(env, 'display');
    if (inside) {
      // 星・三角でもはみ出さないよう、図形の内接円に収まる箱に(白字が地に出ると読めない)
      const fit = fitLines(env, cut.text, font, R * 0.98, R * 0.72, R * 0.55, 3);
      return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: cx, y: cy, color: sc.onInk });
    }
    const fit = fitLines(env, cut.text, font, W * 0.86, H * 0.22, Math.min(W, H) * 0.2, 2);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H * (env.portrait ? 0.74 : 0.8) });
  },
}, P);

L.register('layout', 'm_tunnel', {
  name: '遠近トンネル', tags: ['cyber', 'graphic', 'dark'], w: 0.9, emph: 1.4, busy: true, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ vx: rng.range(-0.08, 0.08), vy: rng.range(-0.06, 0.06), k: rng.int(12, 16), round: rng.chance(0.3) }),
  render(env) {
    const { W, H, cut, sc, u } = env;
    const p = cut.params || {};
    const io = env.inOut(0.4);
    const vx = W / 2 + (p.vx || 0) * W, vy = H / 2 + (p.vy || 0) * H;
    const K = p.k || 14;
    const bl = beatLen(env);
    // 拍の頭で少し加速する前進
    const beats = env.ltb / bl;
    const travel = beats * 0.5 + (Math.floor(beats) + E.outCubic(beats % 1)) * 0.25;
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      ctx.save();
      ctx.strokeStyle = sc.sub;
      for (const [x, y] of [[0, 0], [W, 0], [W, H], [0, H]]) { ctx.globalAlpha = 0.25 * io; ctx.lineWidth = Math.max(1, u * 1.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(vx, vy); ctx.stroke(); }
      for (let i = 0; i < K; i++) {
        const z = ((i / K + travel) % 1);                // 0=遠い 1=手前
        const s = Math.pow(z, 2.2);
        const w = W * 1.1 * s, h = H * 1.1 * s;
        const cx = lerp(vx, W / 2, s), cy = lerp(vy, H / 2, s);
        ctx.globalAlpha = io * clamp(z * 1.4) * (1 - L.smooth(0.85, 1, z));
        ctx.lineWidth = Math.max(1, u * 5 * s);
        ctx.strokeStyle = i % 4 === 0 ? sc.accent : sc.fg;
        ctx.beginPath();
        if (p.round) ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, L.TAU); else ctx.rect(cx - w / 2, cy - h / 2, w, h);
        ctx.stroke();
      }
      ctx.restore();
    }
    const font = L.roleFont(env, 'display');
    const fit = fitLines(env, cut.text, font, W * 0.62, H * 0.3, Math.min(W, H) * 0.24, 2);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: vx, y: vy, shadow: { color: L.rgba(sc.bg, 0.8), blur: fit.size * 0.25 } });
  },
}, P);

L.register('layout', 'm_cube', {
  name: 'ワイヤー立方体', tags: ['cyber', 'graphic', 'editorial'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ side: rng.pick(['left', 'right', 'behind']), inner: rng.chance(0.6), tilt: rng.range(0.3, 0.6) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45);
    const behind = p.side === 'behind';
    const stack = portrait || W / H < 1.3;            // 横長でなければ上に立方体・下に文字(横並びだと重なる)
    const R = Math.min(W, H) * (behind ? 0.3 : stack ? 0.15 : 0.18) * (0.3 + 0.7 * E.outBack(clamp(env.lt / 0.55), 1.3));
    let cx, cy, tx, ty, tw;
    if (behind) { cx = W / 2; cy = H / 2; tx = W / 2; ty = H / 2; tw = W * 0.8; }
    else if (stack) { cx = W / 2; cy = H * (portrait ? 0.34 : 0.32); tx = W / 2; ty = H * (portrait ? 0.7 : 0.74); tw = W * 0.86; }
    else { const left = p.side === 'left'; cx = W * (left ? 0.28 : 0.72); cy = H / 2; tx = W * (left ? 0.64 : 0.36); ty = H / 2; tw = W * 0.5; }
    const kick = beatKick(env);
    const ay = env.ltb * 0.9 + kick * 0.35, ax = (p.tilt || 0.45) + Math.sin(env.ltb * 0.6) * 0.2;
    const v = projectCube(cx, cy, R, ax, ay);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      ctx.save(); ctx.lineCap = 'round';
      for (const [a, b] of CUBE_E) {
        const back = (v[a][2] + v[b][2]) / 2 > 0;
        ctx.globalAlpha = io * (back ? 0.35 : 1) * (behind ? 0.55 : 1);
        ctx.strokeStyle = back ? sc.sub : sc.accent; ctx.lineWidth = Math.max(1.5, u * (back ? 2.5 : 5));
        ctx.beginPath(); ctx.moveTo(v[a][0], v[a][1]); ctx.lineTo(v[b][0], v[b][1]); ctx.stroke();
      }
      if (p.inner) {
        const w2 = projectCube(cx, cy, R * 0.45, -ax * 1.3, -ay * 1.4);
        ctx.strokeStyle = sc.accent2; ctx.lineWidth = Math.max(1, u * 3); ctx.globalAlpha = io * 0.8 * (behind ? 0.55 : 1);
        for (const [a, b] of CUBE_E) { ctx.beginPath(); ctx.moveTo(w2[a][0], w2[a][1]); ctx.lineTo(w2[b][0], w2[b][1]); ctx.stroke(); }
      }
      for (const q of v) { ctx.globalAlpha = io * 0.9; ctx.fillStyle = sc.fg; ctx.fillRect(q[0] - u * 3, q[1] - u * 3, u * 6, u * 6); }
      ctx.restore();
    }
    const font = L.roleFont(env, 'display');
    const fit = fitLines(env, cut.text, font, tw, H * (stack ? 0.24 : 0.42), Math.min(W, H) * 0.22, cut.n > 6 ? 3 : 2);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: tx, y: ty });
  },
}, P);

const EASES = [['outExpo', 'EASE OUT EXPO'], ['outBack', 'EASE OUT BACK'], ['outBounce', 'BOUNCE'], ['inOutCubic', 'EASE IN OUT'], ['outElastic', 'ELASTIC']];
L.register('layout', 'm_graph', {
  name: 'グラフエディタ', tags: ['editorial', 'cyber', 'graphic'], w: 0.9, fits: n => n >= 1 && n <= 16,
  enterBias: { fade: 4 },
  plan: rng => ({ ease: rng.int(0, EASES.length - 1) }),
  render(env) {
    const { W, H, cut, sc, u, portrait } = env;
    const p = cut.params || {};
    const [ek, label] = EASES[(p.ease || 0) % EASES.length];
    const ef = E[ek];
    const io = env.inOut(0.35);
    const gx = portrait ? W * 0.1 : W * 0.06, gy = portrait ? H * 0.12 : H * 0.18;
    const gw = portrait ? W * 0.8 : W * 0.36, gh = portrait ? H * 0.3 : H * 0.6;
    const T = Math.max(0.5, Math.min(cut.dur * 0.6, beatLen(env) * 2));
    const tt = clamp(env.lt / T);
    const val = ef(tt);
    // パネル
    env.rrect(gx, gy, gw, gh, u * 10, L.rgba(sc.fg, 0.04), io, false, L.rgba(sc.fg, 0.25), Math.max(1, u * 1.5));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, x0 = gx + gw * 0.1, y0 = gy + gh * 0.82, cw = gw * 0.82, chh = gh * 0.62;
      ctx.save(); ctx.globalAlpha = io;
      ctx.strokeStyle = L.rgba(sc.fg, 0.12); ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + cw * i / 4, y0); ctx.lineTo(x0 + cw * i / 4, y0 - chh); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0, y0 - chh * i / 4); ctx.lineTo(x0 + cw, y0 - chh * i / 4); ctx.stroke(); }
      ctx.strokeStyle = L.rgba(sc.fg, 0.5); ctx.lineWidth = Math.max(1, u * 2);
      ctx.beginPath(); ctx.moveTo(x0, y0 - chh); ctx.lineTo(x0, y0); ctx.lineTo(x0 + cw, y0); ctx.stroke();
      // 曲線(描き起こし)と、今の位置の点
      const draw = E.outCubic(clamp(env.lt / 0.5));
      ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(2, u * 4); ctx.lineJoin = 'round';
      ctx.beginPath();
      const steps = 80;
      for (let i = 0; i <= steps * draw; i++) { const x = i / steps, y = ef(x); const X = x0 + cw * x, Y = y0 - chh * y; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.stroke();
      const px = x0 + cw * tt, py = y0 - chh * val;
      ctx.setLineDash([u * 5, u * 5]); ctx.strokeStyle = L.rgba(sc.accent2, 0.7); ctx.lineWidth = Math.max(1, u * 1.5);
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, py); ctx.lineTo(x0, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = sc.accent2; ctx.beginPath(); ctx.arc(px, py, Math.max(3, u * 9), 0, L.TAU); ctx.fill();
      // ベジェ風ハンドル(装飾)
      ctx.strokeStyle = L.rgba(sc.fg, 0.45); ctx.lineWidth = Math.max(1, u * 1.2);
      const h1 = [x0 + cw * 0.18, y0 - chh * 0.9], h2 = [x0 + cw * 0.62, y0 - chh];
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(h1[0], h1[1]); ctx.moveTo(x0 + cw, y0 - chh); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
      ctx.fillStyle = sc.bg; for (const h of [h1, h2]) { ctx.beginPath(); ctx.arc(h[0], h[1], Math.max(2, u * 5), 0, L.TAU); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    const fs = Math.max(9, u * 20);
    anchored(env, { text: label, font: MONO, weight: 700, size: fs, x: gx + gw * 0.06, y: gy + gh * 0.09, color: sc.accent, alpha: io, ghost: false, track: 0.1 }, 'left');
    anchored(env, { text: `t ${tt.toFixed(2)}  v ${val.toFixed(2)}`, font: MONO, weight: 400, size: fs * 0.85, x: gx + gw * 0.94, y: gy + gh * 0.19, color: sc.sub, alpha: io, ghost: false }, 'right');
    // 歌詞は同じ曲線で滑り込む
    const font = L.roleFont(env, 'display');
    const area = portrait ? { x: W / 2, y: H * 0.7, w: W * 0.86, h: H * 0.22 } : { x: W * 0.72, y: H / 2, w: W * 0.46, h: H * 0.5 };
    const fit = fitLines(env, cut.text, font, area.w, area.h, Math.min(W, H) * 0.22, 3);
    const off = portrait ? { dx: 0, dy: H * 0.25 } : { dx: W * 0.35, dy: 0 };
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: area.x + off.dx * (1 - val), y: area.y + off.dy * (1 - val) });
  },
}, P);

/* ---------------- enter / exit: 粒子 ---------------- */
/* 字を隠しつつ(字ごとの a)、項目ローカル座標で粒子を描く。p=1 で粒子は無く字は完全表示 */
L.register('enter', 'particleIn', {
  name: '粒子集合', tags: ['graphic', 'cyber', 'pop', 'emotional'], w: 0.9, emph: 1.5, maxChars: 16,
  apply(env, it, p) {
    const ta = L.smooth(0.72, 1, p);
    it.charFns.push(() => ({ a: ta }));
    const prev = it.pre, seed = env.cut.seed, N = env.allowFilter ? 1800 : 700;
    let drawn = false;
    it.pre = (e2, it2, m) => {
      if (prev) prev(e2, it2, m);
      if (drawn || e2.pass !== 'main' || ta >= 0.999) return;
      drawn = true;
      const pts = glyphPoints(it2, N), s = it2.size, ctx = e2.ctx;
      const R = Math.max(e2.W, e2.H) * 0.55 / Math.max(0.2, Math.abs(it2.sx == null ? 1 : it2.sx));
      const r = Math.max(0.8, s * 0.02);
      ctx.save(); ctx.fillStyle = it2.color || e2.sc.fg;
      for (let i = 0; i < pts.length; i++) {
        const q = E.outCubic(clamp((p - 0.4 * L.r(seed, 'pd', i)) / 0.6));
        const ang = L.r(seed, 'pa', i) * L.TAU, rad = R * (0.4 + L.r(seed, 'pr', i) * 0.8);
        const x = lerp(Math.cos(ang) * rad, pts[i][0] * s, q), y = lerp(Math.sin(ang) * rad, pts[i][1] * s, q);
        ctx.globalAlpha = clamp((0.25 + 0.75 * q) * (1 - ta * 0.9));
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    };
  },
}, P);

L.register('exit', 'particleOut', {
  name: '粒子爆散', tags: ['graphic', 'cyber', 'pop', 'glitch'], w: 0.9, emph: 1.5, maxChars: 16,
  apply(env, it, p) {
    const ta = 1 - L.smooth(0, 0.3, p);
    it.charFns.push(() => ({ a: ta }));
    const prev = it.pre, seed = env.cut.seed, N = env.allowFilter ? 1800 : 700;
    let drawn = false;
    it.pre = (e2, it2, m) => {
      if (prev) prev(e2, it2, m);
      if (drawn || e2.pass !== 'main') return;
      drawn = true;
      const pts = glyphPoints(it2, N), s = it2.size, ctx = e2.ctx;
      const R = Math.max(e2.W, e2.H) * 0.6 / Math.max(0.2, Math.abs(it2.sx == null ? 1 : it2.sx));
      const r = Math.max(0.8, s * 0.02), e = E.outCubic(p);
      ctx.save(); ctx.fillStyle = it2.color || e2.sc.fg;
      for (let i = 0; i < pts.length; i++) {
        const tx = pts[i][0] * s, ty = pts[i][1] * s;
        const ang = Math.atan2(ty, tx) + L.rs(seed, 'xa', i) * 0.9, sp = R * (0.25 + L.r(seed, 'xs', i) * 0.9);
        const x = tx + Math.cos(ang) * sp * e, y = ty + Math.sin(ang) * sp * e + p * p * R * 0.35;
        ctx.globalAlpha = clamp((1 - p) * (0.4 + 0.6 * (1 - ta)));
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    };
  },
}, P);

/* ---------------- decor ---------------- */
/* リールHUD: 四隅の括弧・タイトル・タイムコード・場面の点・BPM/拍。差の絶対値合成でどんな背景でも読める */
L.register('decor', 'mgHud', {
  name: 'リールHUD', tags: ['editorial', 'cyber', 'graphic'], w: 0.8, layer: 'front', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const { ctx, W, H, u, cut } = env;
    const a = env.inOut(0.3);
    if (a <= 0.002) return;
    const m = Math.min(W, H), pad = m * 0.045, len = m * 0.035, lw = Math.max(1, u * 2.2);
    const fs = Math.max(8, u * 20);
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = lw;
    for (const [x, y, sx, sy] of [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [W - pad, H - pad, -1, -1], [pad, H - pad, 1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * len); ctx.lineTo(x, y); ctx.lineTo(x + sx * len, y); ctx.stroke();
    }
    ctx.font = `700 ${fs}px ${MONO}`; ctx.textBaseline = 'middle';
    const tx = pad + len * 0.9, ty = pad + len * 0.3;
    ctx.textAlign = 'left'; ctx.fillText(Pd.title || 'LYRICFLOW / MOTION REEL', tx, ty);
    ctx.textAlign = 'right'; ctx.fillText('TC ' + tc60(env.t), W - tx, ty);
    // 場面の進行ドット
    const dots = 4, ds = fs * 0.55, cur = cut.idx % dots;
    for (let i = 0; i < dots; i++) { ctx.globalAlpha = 0.9 * a * (i === cur ? 1 : 0.35); ctx.fillRect(W / 2 + (i - dots / 2) * ds * 2 + ds / 2, ty - ds / 2, ds, ds); }
    ctx.globalAlpha = 0.9 * a;
    const by = H - pad - len * 0.3;
    ctx.textAlign = 'left'; ctx.fillText(`${pad2(cut.idx + 1)} — ${Pd.scene || 'SCENE'}`, tx, by);
    ctx.fillRect(tx, by + fs * 0.75, fs * 3.2, Math.max(1, lw * 0.8));
    const beatTxt = env.bpm && env.beat ? ` · ${Math.round(env.bpm)}BPM · BEAT ${pad2(env.beat.index + 1)}/${pad2(env.totalBeats || 0)}` : '';
    ctx.textAlign = 'right'; ctx.fillText(`${W}×${H}${beatTxt}`, W - tx, by);
    ctx.restore();
  },
}, P);

L.register('decor', 'mgMorphCorner', {
  name: '隅の図形モーフ', tags: ['graphic', 'pop', 'editorial'], w: 0.7, layer: 'front',
  draw(env, bb, Pd) {
    const { W, H, u, sc } = env;
    const a = env.inOut(0.4);
    const m = Math.min(W, H), R = m * 0.05;
    const corner = Pd.corner || 0;
    const cx = corner % 2 ? W - m * 0.14 : m * 0.14, cy = corner > 1 ? H - m * 0.2 : m * 0.2;
    const mm = morphAt(env, SHAPES, env.ltb);
    drawShape(env, mm.pts, cx, cy, R * (0.6 + 0.4 * E.outBack(clamp(env.lt / 0.4))), env.ltb * 0.6, Pd.accent ? sc.accent : null, sc.fg, Math.max(1.5, u * 3), a);
  },
}, P);

L.register('decor', 'mgCubeCorner', {
  name: '隅のワイヤー立方体', tags: ['cyber', 'graphic'], w: 0.7, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, u, sc, ctx } = env;
    const a = env.inOut(0.4);
    if (a <= 0.002) return;
    const m = Math.min(W, H), corner = Pd.corner || 1;
    const cx = corner % 2 ? W - m * 0.15 : m * 0.15, cy = corner > 1 ? H - m * 0.2 : m * 0.2;
    const v = projectCube(cx, cy, m * 0.05, 0.5 + beatKick(env) * 0.3, env.ltb * 1.3);
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = Pd.accent ? sc.accent : sc.fg; ctx.lineWidth = Math.max(1, u * 2.5);
    for (const [p0, p1] of CUBE_E) { ctx.beginPath(); ctx.moveTo(v[p0][0], v[p0][1]); ctx.lineTo(v[p1][0], v[p1][1]); ctx.stroke(); }
    ctx.restore();
  },
}, P);

/* ---------------- styles: リール ---------------- */
L.registerStyle('reelPaper', {
  name: 'モーションリール(紙)', desc: '生成りの紙地にインク黒、朱と藍のアクセント。拍で動くモーショングラフィックス向け',
  moods: ['editorial', 'graphic', 'pop'],
  colors: { bg1: '#efe9df', bg2: '#d8cfc0', accent: '#e4572e', accent2: '#2e6f9e', text: '#161412' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Shippori Mincho', serif", body: "'BIZ UDPGothic', sans-serif", mono: MONO },
  ghost: 0.25,
  bias: { layout: { m_particles: 3, m_morph: 3, m_tunnel: 2, m_cube: 3, m_graph: 3 }, enter: { particleIn: 2 }, exit: { particleOut: 2 } },
  decor: { mgHud: 6, mgMorphCorner: 2, mgCubeCorner: 2 },
});
L.registerStyle('reelNight', {
  name: 'モーションリール(夜)', desc: '墨色の地に生成りの文字、赤とシアンの差し色。拍で動くモーショングラフィックス向け',
  moods: ['cyber', 'graphic', 'dark'],
  colors: { bg1: '#0f0f12', bg2: '#1c1b22', accent: '#ff4d2e', accent2: '#39c6f2', text: '#f4f0e8' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Shippori Mincho', serif", body: "'BIZ UDPGothic', sans-serif", mono: MONO },
  ghost: 0.45,
  bias: { layout: { m_particles: 3, m_morph: 3, m_tunnel: 3, m_cube: 3, m_graph: 3 }, enter: { particleIn: 2 }, exit: { particleOut: 2 } },
  decor: { mgHud: 6, mgMorphCorner: 2, mgCubeCorner: 2 },
});

/* 他モジュールから使えるように(リール生成・プレビュー) */
L.mg = { glyphPoints, shapePts, SHAPES, SHAPE_JA, EASES };
})();
