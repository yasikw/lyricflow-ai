/* LyricFlow 演出パック: p_layouts_c — 構図C（ステッカー/日用品/サイン/UI模倣）
   契約: docs/COMPOSE_PACKS.md  (group: layout)
   「歌詞が物に印刷されている／物の中に表示されている」構図。図形はすべてベクター描画。
   共通: 物体は frame() のローカル座標(原点=物体の基準点)で描き、mo() の出入り(スライド/拡縮/回転/フェード)で動かす。
   歌詞は必ず L.mainDraw。副テキストは汎用語か cut から生成した番号・時刻のみ。 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_layouts_c';
const clamp = L.clamp, TAU = L.TAU, DEG = L.DEG;
const LAB = "'Oswald', 'Noto Sans JP', sans-serif";
const UI = "'Noto Sans JP', sans-serif";
const DOT = "'DotGothic16', sans-serif";
const ROUND = "'M PLUS Rounded 1c', 'Zen Maru Gothic', sans-serif";

/* ================================================================ caches */
const FIT = new Map(), MEAS = new Map(), CHK = new Map(), TILE = new Map();
const cap = (m, n) => { if (m.size > n) m.clear(); };
const pad2 = n => String(Math.abs(n | 0)).padStart(2, '0');
const mmss = s => { s = Math.max(0, Math.floor(s)); return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); };
const fmtN = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const dly = (env, d) => Math.min(d, env.cut.dur * 0.2);
const wide = env => env.W > env.H * 1.25;
const hv = (env, ...a) => L.h(env.cut.seed, ...a);
const rv = (env, ...a) => L.r(env.cut.seed, ...a);

/* 行数 1..rows から一番大きく収まる改行を選ぶ(少ない行数を少し優先)。{text,size,rows,w,h} */
function fit(text, font, maxW, maxH, o = {}) {
  const wt = o.weight == null ? 900 : o.weight;
  const key = `${text}|${font}|${maxW | 0}|${maxH | 0}|${o.rows || 3}|${wt}|${o.track || 0}|${o.lead || 0}|${o.vertical ? 1 : 0}|${(o.max || 0) | 0}`;
  let r = FIT.get(key);
  if (r) return r;
  const src = String(text || '').trim();
  const len = L.glyphs(src).length;
  const maxRows = Math.max(1, Math.min(o.rows || 3, L.glyphCount(src) || 1));
  let prev = 0;
  for (let k = 1; k <= maxRows; k++) {
    const lines = k === 1 ? [src] : L.splitLines(src, Math.ceil(len / k));
    if (lines.length <= prev) continue;
    prev = lines.length;
    const t = lines.join('\n');
    let size = L.fitSize(t, font, maxW, maxH, { weight: wt, track: o.track, lead: o.lead, vertical: o.vertical });
    if (o.max) size = Math.min(size, o.max);
    const score = size * (1 - 0.09 * (lines.length - 1));
    if (!r || score > r.score) r = { text: t, size, rows: lines.length, score };
  }
  const m = L.measure({ text: r.text, font, size: r.size, weight: wt, track: o.track, lead: o.lead, vertical: o.vertical });
  r.w = m.w; r.h = m.h;
  cap(FIT, 800); FIT.set(key, r);
  return r;
}
/* 計測(キャッシュ) */
function meas(it) {
  const key = `${it.text}|${it.font}|${it.weight == null ? 900 : it.weight}|${(it.size || 10).toFixed(1)}|${it.track || 0}|${it.lead || 0}|${it.align || 'c'}|${it.vertical ? 1 : 0}`;
  let m = MEAS.get(key);
  if (!m) { m = L.measure(it); cap(MEAS, 800); MEAS.set(key, m); }
  return m;
}
/* 句分割(キャッシュ)し、max 個以下に結合 */
function chunksOf(text, max) {
  const key = text + '|' + max;
  let r = CHK.get(key);
  if (r) return r;
  r = L.chunks(text).slice();
  if (!r.length) r = [String(text || '')];
  const latin = L.hasLatinWords(text) && /\s/.test(text);
  while (r.length > max) {
    let bi = 0, bs = Infinity;
    for (let i = 0; i < r.length - 1; i++) { const s = L.glyphCount(r[i]) + L.glyphCount(r[i + 1]); if (s < bs) { bs = s; bi = i; } }
    r.splice(bi, 2, r[bi] + (latin ? ' ' : '') + r[bi + 1]);
  }
  cap(CHK, 300); CHK.set(key, r);
  return r;
}

/* ================================================================ colour */
const edgeOf = (sc, fill) => (L.contrast(fill, sc.bg) < 1.6 ? L.mix(fill, '#000', 0.3) : null);
const darkOf = sc => L.mix('#000', sc.bg, 0.14);
const panelOf = (sc, amt = 0.08) => (sc.dark ? L.mix(sc.bg, '#fff', amt) : L.mix(sc.bg, '#fff', 0.78));
const colOf = (sc, k) => (k === 'paper' ? sc.paper : k === 'dark' ? darkOf(sc) : k === 'white' ? L.mix(sc.paper, '#fff', 0.7) : sc[k] || sc.accent);
const other = k => (k === 'accent' ? 'accent2' : 'accent');

/* ================================================================ motion / frame / kit */
/* 物体の出入り。kind=登場の仕方, o.exit=退場の仕方。{a,dx,dy,s,r,sx,sy,x(登場進行),po(退場進行)} */
function mo(env, kind, o = {}) {
  const W = env.W, H = env.H;
  const dIn = Math.max(0.12, Math.min(o.dIn || 0.42, env.cut.dur * 0.35));
  const x = clamp((env.lt - (o.delay || 0)) / dIn);
  const e = E.outCubic(x), q = 1 - E.outQuart(x);
  const po = E.inCubic(env.pOut);
  const d = o.dist || 0.45;
  const m = { a: clamp(x * 3), dx: 0, dy: 0, s: 1, r: 0, sx: 1, sy: 1, x, po };
  switch (kind) {
    case 'pop': m.s = x >= 1 ? 1 : Math.max(0.02, 0.3 + 0.7 * E.outBack(x, 2.2)); m.a = clamp(x * 5); break;
    case 'slap': m.s = 1 + 0.5 * q; m.r = (o.r0 || 0.15) * q; m.a = clamp(x * 4); break;
    case 'up': m.dy = q * H * d; m.r = (o.r0 || 0) * q; break;
    case 'down': m.dy = -q * H * d; m.r = (o.r0 || 0) * q; break;
    case 'downBack': m.dy = -(1 - E.outBack(x, 1.4)) * H * d; break;
    case 'left': m.dx = -q * W * d; m.r = (o.r0 || 0) * q; break;
    case 'right': m.dx = q * W * d; m.r = (o.r0 || 0) * q; break;
    case 'drop': m.dy = -(1 - E.outBounce(x)) * H * d; m.a = clamp(x * 5); break;
    case 'toss': m.dy = -(1 - e) * H * d; m.dx = (1 - e) * W * 0.12 * (o.side || 1); m.r = (o.r0 || 0.4) * (1 - e); break;
    case 'spin': m.r = -(o.turns || 1) * TAU * (1 - e); m.s = Math.max(0.02, e); break;
    case 'flipX': m.sx = x >= 1 ? 1 : Math.max(0.02, E.outBack(x, 1.7)); break;
    case 'flipY': m.sy = x >= 1 ? 1 : Math.max(0.02, E.outBack(x, 1.7)); break;
    case 'zoom': m.s = 0.88 + 0.12 * E.outBack(x, 1.2); m.a = e; break;
    default: m.a = e;
  }
  if (po > 0) {
    m.a *= 1 - po;
    switch (o.exit) {
      case 'shrink': m.s *= 1 - 0.3 * po; break;
      case 'grow': m.s *= 1 + 0.1 * po; break;
      case 'up': m.dy -= H * 0.12 * po; break;
      case 'down': m.dy += H * 0.12 * po; break;
      case 'left': m.dx -= W * 0.1 * po; break;
      case 'right': m.dx += W * 0.1 * po; break;
      case 'fall': m.dy += H * 0.25 * po; m.r += 0.35 * po * (o.side || 1); break;
      default: m.s *= 1 - 0.06 * po;
    }
  }
  return m;
}
/* 物体座標系で fn を実行(ox,oy=ローカル原点のずらし)。fn が返す歌詞 bbox を画面座標へ戻す */
function frame(env, cx, cy, rot, m, fn, ox = 0, oy = 0) {
  const ctx = env.ctx;
  const X = cx + m.dx, Y = cy + m.dy, R = rot + m.r, SX = m.s * m.sx, SY = m.s * m.sy;
  ctx.save();
  ctx.translate(X, Y);
  if (R) ctx.rotate(R);
  if (SX !== 1 || SY !== 1) ctx.scale(SX || 1e-4, SY || 1e-4);
  if (ox || oy) ctx.translate(ox, oy);
  let bb = null;
  try { bb = fn(); } finally { ctx.restore(); }
  if (!bb) return null;
  const c = Math.cos(R), s = Math.sin(R);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]]) {
    const qx = (px + ox) * SX, qy = (py + oy) * SY;
    const rx = X + qx * c - qy * s, ry = Y + qx * s + qy * c;
    if (rx < x0) x0 = rx; if (ry < y0) y0 = ry; if (rx > x1) x1 = rx; if (ry > y1) y1 = ry;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
/* 図形ヘルパ(全 alpha に A を掛ける。既定は main パスのみ) */
function kit(env, A = 1) {
  const main = env.pass === 'main', ctx = env.ctx, u = env.u;
  const k = { env, main, A, ctx, u };
  k.rect = (x, y, w, h, c, a = 1, g = false) => env.rect(x, y, w, h, c, a * A, g);
  k.rr = (x, y, w, h, r, c, a = 1, g = false, st = null, lw = 2) => env.rrect(x, y, w, h, r, c, a * A, g, st, lw);
  k.circ = (x, y, r, c, st = null, lw = 2, a = 1, g = false) => env.circle(x, y, r, c, st, lw, a * A, g);
  k.line = (pts, c, lw = 2, a = 1, dash = null) => env.line(pts, c, lw, a * A, false, dash);
  k.arc = (x, y, r, d0, d1, c, lw = 2, a = 1) => env.arc(x, y, r, d0, d1, c, lw, a * A, false);
  k.poly = (pts, c, a = 1, g = false) => env.poly(pts, c, a * A, g);
  k.txt = it => env.text(Object.assign({ ghost: false }, it, { alpha: (it.alpha == null ? 1 : it.alpha) * A }));
  k.shadow = (x, y, w, h, r, a = 0.3) => { if (main) env.rrect(x + u * 5, y + u * 10, w, h, r, '#000', a * A, false); };
  k.path = (build, fill, stroke, lw = 2, a = 1, dash = null) => {
    if (!main || a * A <= 0.002) return;
    ctx.save(); ctx.globalAlpha = clamp(a * A); ctx.beginPath(); build(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash); ctx.stroke(); }
    ctx.restore();
  };
  k.clip = (build, fn) => { if (!main) return; ctx.save(); ctx.beginPath(); build(ctx); ctx.clip(); try { fn(); } finally { ctx.restore(); } };
  return k;
}
/* 副テキスト。anchor 'l'|'c'|'r' は x を左端/中央/右端として扱う */
function lab(k, text, x, y, size, color, o = {}) {
  if (!text || size < 1) return;
  const it = { text: String(text), x, y, size, color, font: o.font || LAB, weight: o.weight || 600, track: o.track == null ? 0.06 : o.track, rot: o.rot || 0, alpha: o.alpha == null ? 1 : o.alpha };
  if (o.anchor === 'l' || o.anchor === 'r') { const w = meas(it).w; it.x = o.anchor === 'l' ? x + w / 2 : x - w / 2; }
  k.txt(it);
}
const txtW = (text, font, size, weight = 600, track = 0.06) => meas({ text: String(text), font, size, weight, track }).w;

/* 形の補助 */
function perim(w, h, step, capN = 120) {
  const out = [], P2 = 2 * (w + h), n = Math.max(4, Math.min(capN, Math.round(P2 / Math.max(1, step))));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * P2;
    if (d < w) out.push([-w / 2 + d, -h / 2]);
    else if ((d -= w) < h) out.push([w / 2, -h / 2 + d]);
    else if ((d -= h) < w) out.push([w / 2 - d, h / 2]);
    else { d -= w; out.push([-w / 2, h / 2 - d]); }
  }
  return out;
}
function scallop(ctx, x, y, w, h, r) {                // 切手のミシン目(内向きの半円)
  const nx = Math.max(2, Math.min(40, Math.round(w / (r * 3.2)))), ny = Math.max(2, Math.min(40, Math.round(h / (r * 3.2))));
  const sx = w / nx, sy = h / ny;
  ctx.moveTo(x, y);
  for (let i = 0; i < nx; i++) { const cx = x + sx * (i + 0.5); ctx.lineTo(cx - r, y); ctx.arc(cx, y, r, Math.PI, 0, true); }
  ctx.lineTo(x + w, y);
  for (let i = 0; i < ny; i++) { const cy = y + sy * (i + 0.5); ctx.lineTo(x + w, cy - r); ctx.arc(x + w, cy, r, -Math.PI / 2, Math.PI / 2, true); }
  ctx.lineTo(x + w, y + h);
  for (let i = 0; i < nx; i++) { const cx = x + w - sx * (i + 0.5); ctx.lineTo(cx + r, y + h); ctx.arc(cx, y + h, r, 0, Math.PI, true); }
  ctx.lineTo(x, y + h);
  for (let i = 0; i < ny; i++) { const cy = y + h - sy * (i + 0.5); ctx.lineTo(x, cy + r); ctx.arc(x, cy, r, Math.PI / 2, -Math.PI / 2, true); }
  ctx.closePath();
}
const rrPath = (ctx, x, y, w, h, r) => { r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const polyPath = pts => ctx => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
const HEART = (() => { const a = []; for (let i = 0; i < 28; i++) { const t = i / 28 * TAU; a.push([16 * Math.pow(Math.sin(t), 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]); } return a; })();
const scalePts = (pts, s, x = 0, y = 0) => pts.map(p => [x + p[0] * s, y + p[1] * s]);
function star(n, r0, r1, rot = 0, jit = null) {
  const out = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU - Math.PI / 2; const r = (i % 2 ? r1 : r0) * (jit ? 1 + jit(i) : 1); out.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return out;
}
/* 再生・送り等のUIアイコン */
function icon(k, kind, x, y, s, c, a = 1) {
  if (kind === 'play') k.poly([[x - s * 0.35, y - s * 0.45], [x + s * 0.5, y], [x - s * 0.35, y + s * 0.45]], c, a);
  else if (kind === 'pause') { k.rect(x - s * 0.38, y - s * 0.42, s * 0.26, s * 0.84, c, a); k.rect(x + s * 0.12, y - s * 0.42, s * 0.26, s * 0.84, c, a); }
  else if (kind === 'next' || kind === 'prev') {
    const d = kind === 'next' ? 1 : -1;
    k.poly([[x - d * s * 0.45, y - s * 0.38], [x + d * s * 0.1, y], [x - d * s * 0.45, y + s * 0.38]], c, a);
    k.poly([[x - d * s * 0.05, y - s * 0.38], [x + d * s * 0.5, y], [x - d * s * 0.05, y + s * 0.38]], c, a);
    k.rect(x + d * s * 0.5 - (d > 0 ? 0 : s * 0.1), y - s * 0.38, s * 0.1, s * 0.76, c, a);
  } else if (kind === 'search') { k.circ(x - s * 0.1, y - s * 0.1, s * 0.3, null, c, s * 0.1, a); k.line([[x + s * 0.12, y + s * 0.12], [x + s * 0.42, y + s * 0.42]], c, s * 0.12, a); }
  else if (kind === 'speaker') {
    k.poly([[x - s * 0.45, y - s * 0.16], [x - s * 0.22, y - s * 0.16], [x + s * 0.05, y - s * 0.4], [x + s * 0.05, y + s * 0.4], [x - s * 0.22, y + s * 0.16], [x - s * 0.45, y + s * 0.16]], c, a);
    k.arc(x + s * 0.05, y, s * 0.28, -45, 45, c, s * 0.08, a); k.arc(x + s * 0.05, y, s * 0.46, -45, 45, c, s * 0.08, a);
  }
}

/* ================================================================ 1. ステッカー・吹き出し */

L.register('layout', 'c_sticker', {
  name: 'ステッカー', tags: ['pop', 'graphic'], w: 1.1, treat: 'safe', emph: 1.3,
  fits: n => n >= 1,
  plan: rng => ({ rot: rng.range(3, 7) * rng.sign(), col: rng.pick(['accent', 'accent2']), cloud: rng.chance(0.35), badge: rng.chance(0.7), bs: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.62 : 0.56), H * (env.portrait ? 0.24 : 0.32), { rows: 3, max: mn * 0.2 });
    const s = f.size, pw = f.w + s * 1.0, ph = f.h + s * 0.7, b = Math.max(u * 7, s * 0.12);
    const col = colOf(sc, Q.col), rot = (Q.rot || 5) * DEG;
    const m = mo(env, 'slap', { dIn: 0.3, r0: rot * 1.4, exit: 'grow' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, rot, m, () => {
      const lift = 1 + (m.s - 1) * 6, r = Math.min(ph / 2, s * 0.45);
      if (Q.cloud) {
        const rc = Math.min(ph * 0.28, s * 0.5), pts = perim(pw - rc * 0.6, ph - rc * 0.6, rc * 1.25, 80);
        const cloud = add => c => { c.rect(-pw / 2 - add, -ph / 2 - add, pw + add * 2, ph + add * 2); for (const [x, y] of pts) { c.moveTo(x + rc + add, y); c.arc(x, y, rc + add, 0, TAU); } };
        k.path(c => { c.translate(u * 6 * lift, u * 10 * lift); cloud(b)(c); }, '#000', null, 0, 0.3);
        k.path(cloud(b), '#fff');
        k.path(cloud(0), col);
      } else {
        if (k.main) env.rrect(-pw / 2 - b + u * 6 * lift, -ph / 2 - b + u * 10 * lift, pw + b * 2, ph + b * 2, r + b, '#000', 0.3 * m.a, false);
        k.rr(-pw / 2 - b, -ph / 2 - b, pw + b * 2, ph + b * 2, r + b, '#fff', 1, true);
        k.rr(-pw / 2, -ph / 2, pw, ph, r, col);
      }
      k.rr(-pw / 2 + s * 0.2, -ph / 2 + s * 0.14, pw * 0.3, Math.max(u * 3, s * 0.07), s * 0.05, '#fff', 0.35);
      const bb = L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: 0, color: L.onColor(col), delay: dly(env, 0.12) });
      if (Q.badge) {
        const bm = mo(env, 'pop', { delay: 0.22, dIn: 0.3 }), br = Math.max(u * 26, s * 0.42) * bm.s;
        const bx = (Q.bs || 1) * (pw / 2 + b * 0.3), by = -ph / 2 - b * 0.3, bc = colOf(sc, other(Q.col));
        const kb = kit(env, bm.a * m.a);
        kb.circ(bx, by, br + b * 0.8, '#fff');
        kb.circ(bx, by, br, bc);
        lab(kb, 'No.', bx, by - br * 0.44, br * 0.28, L.onColor(bc));
        lab(kb, pad2(cut.idx + 1), bx, by + br * 0.14, br * 0.64, L.onColor(bc), { weight: 700 });
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_pill', {
  name: 'カプセルラベル', tags: ['pop', 'cyber', 'graphic'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['accent', 'accent2', 'fg']), side: rng.sign(), second: rng.chance(0.75) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'body');
    const f = fit(cut.text, font, W * (env.portrait ? 0.58 : 0.54), H * (env.portrait ? 0.17 : 0.22), { rows: 2, max: mn * 0.13 });
    const s = f.size, ph = f.h + s * 0.62, ic = ph * 0.72, pw = f.w + ic + s * 1.2 + ph * 0.6;
    const col = colOf(sc, Q.col), txt = L.onColor(col);
    const m = mo(env, 'fade', { dIn: 0.2 });
    m.s *= Math.min(1, W * 0.9 / pw);
    const k = kit(env, m.a);
    const g = E.outExpo(clamp((env.lt - 0.04) / 0.5)) * (1 - E.inCubic(env.pOut) * 0.6);
    const cw = ph + (pw - ph) * g, x0 = -pw / 2;
    const cy = H / 2 - (Q.second ? ph * 0.3 : 0);
    return frame(env, W / 2, cy, 0, m, () => {
      k.shadow(x0, -ph / 2, cw, ph, ph / 2, 0.25);
      k.rr(x0, -ph / 2, cw, ph, ph / 2, col, 1, true, edgeOf(sc, col), u * 2);
      const icx = x0 + ph / 2;
      k.circ(icx, 0, ic / 2, txt);
      lab(k, pad2(cut.idx + 1), icx, 0, ic * 0.46, col, { weight: 700 });
      if (g > 0.95) {
        const ax = x0 + cw - ph * 0.4, as = ph * 0.13;
        k.line([[ax - as, -as], [ax, 0], [ax - as, as]], txt, Math.max(u * 2, s * 0.07), 0.8);
      }
      const bb = L.mainDraw(env, { text: f.text, font, size: s, align: 'left', x: icx + ic / 2 + s * 0.4 + f.w / 2, y: 0, color: txt, delay: dly(env, 0.24) });
      if (Q.second) {
        let t2 = L.romaji(cut.text);
        if (!t2 || t2.length > 26 || t2 === cut.text.toUpperCase()) t2 = `LYRIC · LINE ${pad2(cut.idx + 1)}`;
        const s2 = Math.max(u * 14, s * 0.34), w2 = txtW(t2, LAB, s2, 600) + s2 * 2, h2 = s2 * 1.9;
        const g2 = E.outExpo(clamp((env.lt - 0.3) / 0.5));
        if (g2 > 0.01) {
          const lx = (Q.side || 1) > 0 ? x0 + pw - w2 : x0, y2 = ph / 2 + s * 0.35;
          const fc = L.fitContrast(sc.fg, sc.bg, 3);
          k.rr(lx, y2, h2 + (w2 - h2) * g2, h2, h2 / 2, null, 1, false, fc, Math.max(u * 1.5, s2 * 0.08));
          lab(k, t2, lx + w2 / 2, y2 + h2 / 2, s2, fc, { alpha: clamp((g2 - 0.5) * 2) });
        }
      }
      return bb;
    });
  },
}, P);

/* 吹き出しのパス(本体+しっぽ)。shout=トゲ */
function drawBubble(k, kind, rx, ry, tail, fill, stroke, lw, seed) {
  const body = ctx => {
    if (kind === 'shout') polyPath(star(13, 1, 1.2, 0, i => (L.r(seed, 'sp', i) - 0.5) * 0.1).map(p => [p[0] * rx, p[1] * ry]))(ctx);
    else if (kind === 'rr') rrPath(ctx, -rx, -ry, rx * 2, ry * 2, ry * 0.9);
    else ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  };
  const tl = ctx => { ctx.moveTo(tail.bx - tail.w, tail.by); ctx.lineTo(tail.tx, tail.ty); ctx.lineTo(tail.bx + tail.w, tail.by); ctx.closePath(); };
  k.path(ctx => { ctx.translate(k.u * 5, k.u * 9); body(ctx); }, '#000', null, 0, 0.22);
  if (stroke) { k.path(body, null, stroke, lw * 2); if (tail) k.path(tl, null, stroke, lw * 2); }
  k.path(body, fill);
  if (tail) k.path(tl, fill);
}

L.register('layout', 'c_bubble', {
  name: '吹き出し', tags: ['pop', 'emotional'], w: 1.1, treat: 'safe', emph: 1.2,
  fits: n => n >= 1,
  plan: rng => ({ side: rng.sign(), kind: rng.pick(['round', 'round', 'shout']), col: rng.pick(['paper', 'paper', 'accent']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.6 : 0.52), H * (env.portrait ? 0.24 : 0.3), { rows: 3, max: mn * 0.16 });
    const s = f.size;
    let kind = Q.kind || 'round';
    let rx = f.w / 2 * 1.3 + s * 0.5, ry = f.h / 2 * 1.3 + s * 0.5;
    if (kind === 'shout') { rx *= 1.12; ry *= 1.15; }
    if (kind === 'round' && f.w / f.h > 3.4) { kind = 'rr'; rx = f.w / 2 + s * 0.7; ry = f.h / 2 + s * 0.5; }
    const side = Q.side || 1;
    const tx = side * rx * 0.5, ty = ry + s * 0.95;
    const tail = { bx: side * rx * 0.22, by: ry * 0.7, w: Math.max(s * 0.28, rx * 0.08), tx, ty };
    const fill = colOf(sc, Q.col), stroke = Q.col === 'paper' ? sc.onPaper : L.mix(fill, '#000', 0.55);
    const lw = Math.max(u * 2.5, s * 0.05);
    const cy = Math.min(H * 0.45, H * 0.94 - ty);
    const m = mo(env, 'pop', { dIn: 0.34, exit: 'shrink' });
    m.s *= Math.min(1, W * 0.44 / (rx * (kind === 'shout' ? 1.25 : 1)));
    const k = kit(env, m.a);
    return frame(env, W / 2 + tx, cy + ty, 0, m, () => {
      drawBubble(k, kind, rx, ry, tail, fill, stroke, lw, cut.seed);
      if (kind === 'shout') for (let i = 0; i < 3; i++) {
        const a = (-120 + i * 30) * DEG;
        k.line([[Math.cos(a) * rx * 1.25, Math.sin(a) * ry * 1.3], [Math.cos(a) * (rx * 1.25 + s * 0.5), Math.sin(a) * (ry * 1.3 + s * 0.5)]], L.fitContrast(sc.fg, sc.bg, 3), lw * 1.4, 0.9);
      }
      return L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: 0, color: L.onColor(fill), delay: dly(env, 0.1) });
    }, -tx, -ty);
  },
}, P);

L.register('layout', 'c_bubbles', {
  name: '吹き出しの群れ', tags: ['pop', 'emotional'], w: 0.9, treat: 'safe', busy: false,
  fits: n => n >= 4,
  plan: rng => ({ off: rng.int(0, 2), flip: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const chs = chunksOf(cut.text, env.portrait ? 5 : 6), n = chs.length;
    const cols = env.portrait ? 1 : (n <= 2 ? n : n <= 4 ? 2 : 3), rows = Math.ceil(n / cols);
    const AW = W * 0.9, AH = H * (env.portrait ? 0.76 : 0.84), cw = AW / cols, chh = AH / rows;
    let s = mn * 0.13;
    for (const c of chs) s = Math.min(s, L.fitSize(c, font, cw * 0.62, chh * 0.34, {}));
    const fills = ['paper', 'accent', 'accent2'];
    const gap = clamp(cut.dur * 0.45 / n, 0.08, 0.26);
    const stg = cut.enterDef && cut.enterDef.stagger != null ? cut.enterDef.stagger : 0.07;
    let bb = null;
    chs.forEach((c, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
      const cx0 = W / 2 + ((i - row * cols) - (inRow - 1) / 2) * cw, cy0 = H / 2 - AH / 2 + chh * (row + 0.5);
      const w = meas({ text: c, font, size: s }).w;
      const rx = w / 2 * 1.28 + s * 0.6, ry = s * 1.05;
      const side = ((i + (Q.flip > 0 ? 0 : 1)) % 2) ? 1 : -1;
      const jx = (cols === 1 ? side * Math.max(0, cw / 2 - rx) * 0.45 : L.rs(cut.seed, 'bx', i) * Math.max(0, cw / 2 - rx) * 0.6);
      const jy = L.rs(cut.seed, 'by', i) * Math.max(0, chh / 2 - ry - s * 0.7) * 0.5 - s * 0.2;
      const tx = side * rx * 0.45, ty = ry + s * 0.6;
      const tail = { bx: side * rx * 0.2, by: ry * 0.65, w: s * 0.24, tx, ty };
      const key = fills[(i + (Q.off || 0)) % 3], fill = colOf(sc, key);
      const stroke = key === 'paper' ? sc.onPaper : L.mix(fill, '#000', 0.55);
      const t0 = i * gap;
      const m = mo(env, 'pop', { delay: t0, dIn: 0.26, exit: 'shrink' });
      if (m.x <= 0) return;
      const k = kit(env, m.a);
      const b = frame(env, cx0 + jx + tx, cy0 + jy + ty, L.rs(cut.seed, 'br', i) * 3 * DEG, m, () => {
        drawBubble(k, 'round', rx, ry, tail, fill, stroke, Math.max(u * 2, s * 0.05), cut.seed + i);
        return L.mainDraw(env, { text: c, font, size: s, x: 0, y: 0, color: L.onColor(fill), mi: i, delay: Math.max(0, t0 + 0.06 - stg * i) });
      }, -tx, -ty);
      bb = L.unionBB(bb, b);
    });
    return bb;
  },
}, P);

L.register('layout', 'c_tag', {
  name: '荷札タグ', tags: ['calm', 'pop', 'emotional'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['paper', 'paper', 'accent', 'accent2']), sw: rng.range(0.2, 0.34) * rng.sign(), xo: rng.range(-0.05, 0.05) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.56 : 0.42), H * (env.portrait ? 0.24 : 0.3), { rows: 3, max: mn * 0.16 });
    const s = f.size, tw = Math.max(f.w + s * 1.2, s * 3.2), c = tw * 0.15;
    const th = c * 1.6 + f.h + s * 0.9;
    const px = W / 2 + (Q.xo || 0) * W, py = -H * 0.04;
    const top = H * 0.5 - th / 2 + c * 0.3 - py;
    const lt = Math.max(0, env.lt);
    const r = (Q.sw || 0.25) * Math.exp(-lt * 2.4) * Math.cos(lt * 5.2) + 0.012 * Math.sin(lt * 1.6);
    const col = colOf(sc, Q.col), txt = L.onColor(col);
    const m = mo(env, 'down', { dist: 0.55, dIn: 0.45, exit: 'fall', side: Q.sw > 0 ? 1 : -1 });
    const k = kit(env, m.a);
    return frame(env, px, py, r, m, () => {
      const pts = [[-tw / 2 + c, top], [tw / 2 - c, top], [tw / 2, top + c], [tw / 2, top + th], [-tw / 2, top + th], [-tw / 2, top + c]];
      const hy = top + c * 0.72;
      k.line([[0, hy], [0, -H * 0.2]], L.fitContrast(sc.sub, sc.bg, 2.2), Math.max(u * 2, s * 0.035), 0.9);
      k.path(ctx => { ctx.translate(u * 5, u * 10); polyPath(pts)(ctx); }, '#000', null, 0, 0.25);
      k.path(polyPath(pts), col, edgeOf(sc, col), u * 2);
      const ins = s * 0.2;
      k.path(polyPath([[-tw / 2 + c + ins * 0.4, top + ins], [tw / 2 - c - ins * 0.4, top + ins], [tw / 2 - ins, top + c + ins * 0.4], [tw / 2 - ins, top + th - ins], [-tw / 2 + ins, top + th - ins], [-tw / 2 + ins, top + c + ins * 0.4]]), null, txt, Math.max(u, s * 0.03), 0.3, [s * 0.12, s * 0.1]);
      k.circ(0, hy, c * 0.3, L.mix(col, sc.dark ? '#fff' : '#000', 0.25));
      k.circ(0, hy, c * 0.16, sc.bg);
      k.line([[0, hy], [0, hy - c * 0.2]], L.fitContrast(sc.sub, sc.bg, 2.2), Math.max(u * 2, s * 0.035), 0.9);
      lab(k, `No. ${String(1000 + (cut.idx * 37 + (cut.seed % 900)) % 9000)}`, tw / 2 - ins * 1.6, top + th - ins * 2.4, Math.max(u * 11, s * 0.22), txt, { anchor: 'r', alpha: 0.6 });
      return L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: top + c * 1.45 + (th - c * 1.45 - s * 0.3) / 2, color: txt, delay: dly(env, 0.2) });
    });
  },
}, P);

L.register('layout', 'c_tape', {
  name: 'マステ', tags: ['pop', 'calm', 'editorial'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ rots: [0, 1, 2, 3].map(i => rng.range(1.2, 3.5) * (i % 2 ? 1 : -1) * (rng.chance(0.2) ? -1 : 1)), col: rng.pick(['accent', 'accent2']), stripes: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.72 : 0.66), H * (env.portrait ? 0.34 : 0.46), { rows: env.portrait ? 4 : 3, max: mn * 0.15, lead: 1.6 });
    const lines = f.text.split('\n'), s = f.size, nL = lines.length, gapY = s * 1.6;
    const rots = Q.rots || [-2, 2, -2, 2];
    let bb = null;
    lines.forEach((line, i) => {
      const lw = meas({ text: line, font, size: s }).w, tw = lw + s * 1.4, th = s * 1.3;
      const cx = W / 2 + (nL > 1 ? (i % 2 ? 1 : -1) * s * 0.2 : 0), cy = H / 2 + (i - (nL - 1) / 2) * gapY;
      const ck = i % 2 ? other(Q.col || 'accent') : (Q.col || 'accent'), col = colOf(sc, ck);
      const d0 = i * 0.1;
      const e = E.outCubic(clamp((env.lt - d0) / 0.38));
      const m = mo(env, 'fade', { delay: d0, dIn: 0.12, exit: i % 2 ? 'right' : 'left' });
      if (e <= 0) return;
      const k = kit(env, m.a);
      const b = frame(env, cx, cy, (rots[i % 4] || 0) * DEG, m, () => {
        const x0 = -tw / 2, x1 = x0 + tw * e, j = th * 0.07;
        const pts = [];
        for (let q = 0; q <= 6; q++) pts.push([x0 + (q % 2 ? j : -j) * (0.5 + L.r(cut.seed, 'tl', i, q)), th / 2 - th * q / 6]);
        for (let q = 0; q <= 6; q++) pts.push([x1 + (q % 2 ? j : -j) * (0.5 + L.r(cut.seed, 'tr', i, q)), -th / 2 + th * q / 6]);
        k.path(ctx => { ctx.translate(u * 3, u * 6); polyPath(pts)(ctx); }, '#000', null, 0, 0.18);
        k.path(polyPath(pts), col, null, 0, 0.92);
        if (Q.stripes) k.clip(polyPath(pts), () => {
          const ctx = env.ctx; ctx.globalAlpha = 0.2 * m.a; ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.12; ctx.beginPath();
          for (let x = x0 - th; x < x1 + th; x += s * 0.42) { ctx.moveTo(x, th / 2); ctx.lineTo(x + th, -th / 2); }
          ctx.stroke();
        });
        return L.mainDraw(env, { text: line, font, size: s, x: 0, y: 0, color: L.onColor(col), mi: i, delay: d0 + dly(env, 0.16) });
      });
      bb = L.unionBB(bb, b);
    });
    return bb;
  },
}, P);

L.register('layout', 'c_badge', {
  name: '缶バッジ', tags: ['pop', 'graphic'], w: 0.9, treat: 'safe', emph: 1.2,
  fits: n => n >= 1 && n <= 18,
  plan: rng => ({ face: rng.pick(['accent', 'accent2']), rim: rng.pick(['paper', 'fg', 'other']), dir: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const R = mn * (env.portrait ? 0.4 : 0.38);
    const f = fit(cut.text, font, R * 1.28, R * 1.02, { rows: 3, max: R * 0.52 });
    const face = colOf(sc, Q.face || 'accent');
    let rim = Q.rim === 'other' ? colOf(sc, other(Q.face || 'accent')) : Q.rim === 'fg' ? sc.fg : sc.paper;
    if (L.contrast(rim, face) < 1.3) rim = L.mix(face, '#000', 0.4);
    const m = mo(env, 'spin', { turns: 0.55 * (Q.dir || 1), dIn: 0.5, exit: 'shrink' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, 0, m, () => {
      if (k.main) env.circle(u * 8, u * 14, R, '#000', null, 2, 0.3 * m.a, false);
      k.circ(0, 0, R, rim, edgeOf(sc, rim), u * 2, 1, true);
      k.circ(0, 0, R * 0.84, face, L.mix(face, '#000', 0.25), Math.max(u, R * 0.012));
      const rt = `LYRIC ★ No.${pad2(cut.idx + 1)} ★ SIDE A`, rs = R * 0.075, oc = L.onColor(rim);
      const gs = L.glyphs(rt), da = (rs * 0.78) / (R * 0.92);
      gs.forEach((ch, i) => {
        const a = Math.PI / 2 + (gs.length - 1) / 2 * da - i * da;
        if (ch !== ' ') lab(k, ch, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, rs, oc, { rot: a - Math.PI / 2, track: 0 });
      });
      for (let i = -1; i <= 1; i++) { const a = -Math.PI / 2 + i * 0.28; k.poly(scalePts(star(5, 1, 0.45), rs * 0.6, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92), oc, 0.8); }
      k.arc(0, 0, R * 0.7, 200, 245, '#fff', R * 0.05, 0.25);
      return L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: 0, color: L.onColor(face), delay: dly(env, 0.25) });
    });
  },
}, P);

/* ================================================================ 2. 身近な印刷物 */

L.register('layout', 'c_ticket', {
  name: 'チケット', tags: ['pop', 'editorial', 'emotional'], w: 1.1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['paper', 'accent', 'accent2']), rot: rng.range(-3, 3), serial: rng.int(100000, 999999), seat: rng.int(1, 40) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    let tw = env.portrait ? W * 0.9 : wide(env) ? W * 0.66 : W * 0.84, th = tw * (env.portrait ? 0.5 : 0.36);
    if (th > H * 0.52) { th = H * 0.52; tw = th / (env.portrait ? 0.5 : 0.36); }
    const stubW = tw * 0.24, mainW = tw - stubW, xs = -tw / 2 + mainW, x0 = -tw / 2, x1 = tw / 2, y0 = -th / 2, y1 = th / 2;
    const nr = th * 0.09, r = th * 0.05;
    const body = colOf(sc, Q.col), txt = L.onColor(body), stub = L.mix(body, Q.col === 'paper' ? (sc.accent) : '#000', Q.col === 'paper' ? 0.18 : 0.14);
    const f = fit(cut.text, font, mainW * 0.82, th * 0.46, { rows: 3, max: th * 0.3 });
    const m = mo(env, 'up', { dist: 0.5, r0: 0.12, dIn: 0.42, exit: 'fade' });
    const k = kit(env, m.a);
    const po = env.pOut;
    const mainP = ctx => {
      ctx.moveTo(x0 + r, y0); ctx.lineTo(xs - nr, y0); ctx.arc(xs, y0, nr, Math.PI, Math.PI / 2, true); ctx.lineTo(xs, y1 - nr);
      ctx.arc(xs, y1, nr, Math.PI * 1.5, Math.PI, true); ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.closePath();
    };
    const stubP = ctx => {
      ctx.moveTo(xs, y0 + nr); ctx.arc(xs, y0, nr, Math.PI / 2, 0, true); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r); ctx.lineTo(x1, y1 - r);
      ctx.arcTo(x1, y1, x1 - r, y1, r); ctx.lineTo(xs + nr, y1); ctx.arc(xs, y1, nr, 0, -Math.PI / 2, true); ctx.closePath();
    };
    return frame(env, W / 2, H / 2, (Q.rot || 0) * DEG, m, () => {
      const ctx = env.ctx, ed = edgeOf(sc, body);
      k.path(c => { c.translate(u * 6, u * 11); mainP(c); stubP(c); }, '#000', null, 0, 0.28);
      k.path(mainP, body, ed, u * 2);
      k.rr(x0 + th * 0.06, y0 + th * 0.06, mainW - th * 0.12 - nr * 0.6, th * 0.88, r * 0.6, null, 1, false, txt, Math.max(u, th * 0.006));
      const ls = Math.max(u * 10, th * 0.062), cxm = x0 + mainW / 2;
      lab(k, 'LYRIC', x0 + th * 0.12, y0 + th * 0.15, ls, txt, { anchor: 'l', weight: 700, track: 0.25 });
      lab(k, `ROW ${pad2(cut.idx + 1)} · SEAT ${pad2(Q.seat || 12)}`, xs - th * 0.12 - nr * 0.4, y0 + th * 0.15, ls, txt, { anchor: 'r', alpha: 0.7 });
      lab(k, `No. ${Q.serial || 123456}`, x0 + th * 0.12, y1 - th * 0.15, ls * 0.9, txt, { anchor: 'l', alpha: 0.7 });
      for (let i = 0; i < 16; i++) { const bw = th * (0.008 + 0.012 * L.r(cut.seed, 'bc', i)); k.rect(xs - th * 0.12 - nr * 0.4 - th * 0.36 + i * th * 0.024, y1 - th * 0.2, bw, th * 0.1, txt, 0.75); }
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: cxm, y: th * 0.01, color: txt, delay: dly(env, 0.18) });
      // 半券(退場でちぎれて落ちる)
      ctx.save();
      if (po > 0) { ctx.translate(xs, y1); ctx.rotate(E.inQuad(po) * 0.5); ctx.translate(-xs + po * stubW * 0.25, -y1 + E.inQuad(po) * th * 0.5); }
      k.path(stubP, stub, ed, u * 2);
      k.line([[xs, y0 + nr * 1.3], [xs, y1 - nr * 1.3]], L.onColor(stub), Math.max(u * 1.5, th * 0.008), 0.45, [th * 0.025, th * 0.025]);
      const sx = xs + stubW / 2, st = L.onColor(stub);
      lab(k, 'ADMIT ONE', sx - stubW * 0.12, 0, stubW * 0.19, st, { rot: -Math.PI / 2, weight: 700, track: 0.12 });
      lab(k, `No.${Q.serial || 123456}`, sx + stubW * 0.2, 0, stubW * 0.11, st, { rot: -Math.PI / 2, alpha: 0.75 });
      ctx.restore();
      return bb;
    });
  },
}, P);

L.register('layout', 'c_receipt', {
  name: 'レシート', tags: ['calm', 'editorial', 'emotional'], w: 1, treat: 'safe', portrait: 1.2,
  fits: n => n >= 1,
  plan: rng => ({ price: rng.pick([108, 220, 330, 480, 550, 760, 980]), tax: rng.pick([8, 10]) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'mono');
    const rw = env.portrait ? W * 0.64 : Math.min(W * 0.4, H * 0.6);
    const f = fit(cut.text, font, rw * 0.84, H * 0.3, { rows: 5, weight: 400, max: rw * 0.15 });
    const s0 = rw * 0.042, pad = rw * 0.08;
    // 縦の割付
    const Y = {};
    let y = pad * 0.9;
    Y.head = y + rw * 0.04; y += rw * 0.09;
    Y.sub = y + s0 * 0.6; y += s0 * 1.8;
    Y.d1 = y; y += s0 * 1.1;
    Y.ly = y + f.h / 2; y += f.h + s0 * 1.1;
    Y.d2 = y; y += s0 * 1.2;
    Y.i1 = y + s0 * 0.5; y += s0 * 1.6;
    Y.i2 = y + s0 * 0.5; y += s0 * 1.6;
    Y.d3 = y; y += s0 * 1.4;
    Y.tot = y + s0 * 0.7; y += s0 * 2.4;
    Y.bar = y; y += rw * 0.14;
    Y.ty = y + s0 * 0.7; y += s0 * 2.2;
    const rh = y, teeth = rw * 0.025;
    const fitS = Math.min(1, H * 0.88 / (rh + teeth));
    const slotY = H / 2 - (rh * fitS) / 2;
    const paper = L.mix(sc.paper, '#fff', 0.55), ink = sc.onPaper;
    const e = E.outCubic(clamp((env.lt - 0.04) / 0.7));
    const m = mo(env, 'fade', { dIn: 0.15, exit: 'down' });
    m.s *= fitS;
    const k = kit(env, m.a), ctx = env.ctx;
    // 排紙口
    const sa = env.inOut(0.2);
    const slotC = sc.dark ? L.mix('#000', sc.bg, 0.3) : L.mix(sc.bg, '#000', 0.55);
    env.rrect(W / 2 - rw * 0.6 * fitS, slotY - rw * 0.05 * fitS, rw * 1.2 * fitS, rw * 0.06 * fitS, rw * 0.03 * fitS, slotC, sa, false, L.mix(slotC, '#fff', 0.25), u * 1.5);
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, slotY, W * 3, H * 3); ctx.clip();
    const bb = frame(env, W / 2, slotY, 0, m, () => {
      const xL = -rw / 2, xR = rw / 2;
      const pts = [[xL, 0], [xR, 0]];
      const nT = Math.max(6, Math.round(rw / (teeth * 2.2)));
      for (let i = 0; i <= nT; i++) pts.push([xR - rw * i / nT, rh + (i % 2 ? teeth : 0)]);
      k.path(polyPath(pts), paper, edgeOf(sc, paper), u * 1.5);
      k.rect(xL, 0, rw, rw * 0.012, '#000', 0.12);
      lab(k, 'RECEIPT', 0, Y.head, rw * 0.072, ink, { weight: 700, track: 0.3 });
      lab(k, `No.${String(cut.idx + 1).padStart(4, '0')}`, xL + pad, Y.sub, s0, ink, { anchor: 'l', font, weight: 400, alpha: 0.75 });
      lab(k, mmss(cut.start), xR - pad, Y.sub, s0, ink, { anchor: 'r', font, weight: 400, alpha: 0.75 });
      for (const yy of [Y.d1, Y.d2, Y.d3]) k.line([[xL + pad, yy], [xR - pad, yy]], ink, Math.max(1, rw * 0.004), 0.5, [rw * 0.012, rw * 0.012]);
      const price = Q.price || 480, tax = Math.round(price * (Q.tax || 10) / 100);
      lab(k, `LINE ${pad2(cut.idx + 1)}  x1`, xL + pad, Y.i1, s0, ink, { anchor: 'l', font, weight: 400 });
      lab(k, `¥${fmtN(price)}`, xR - pad, Y.i1, s0, ink, { anchor: 'r', font, weight: 400 });
      lab(k, `TAX ${Q.tax || 10}%`, xL + pad, Y.i2, s0, ink, { anchor: 'l', font, weight: 400, alpha: 0.75 });
      lab(k, `¥${fmtN(tax)}`, xR - pad, Y.i2, s0, ink, { anchor: 'r', font, weight: 400, alpha: 0.75 });
      lab(k, 'TOTAL', xL + pad, Y.tot, s0 * 1.5, ink, { anchor: 'l', weight: 700 });
      lab(k, `¥${fmtN(price + tax)}`, xR - pad, Y.tot, s0 * 1.5, ink, { anchor: 'r', weight: 700 });
      let bx = xL + pad;
      for (let i = 0; i < 44 && bx < xR - pad; i++) { const bw = rw * (0.004 + 0.009 * L.r(cut.seed, 'rb', i)); if (i % 2 === 0) k.rect(bx, Y.bar, bw, rw * 0.1, ink, 0.85); bx += bw + rw * 0.004; }
      lab(k, 'THANK YOU', 0, Y.ty, s0, ink, { track: 0.35, alpha: 0.7 });
      return L.mainDraw(env, { text: f.text, font, weight: 400, size: f.size, x: 0, y: Y.ly, color: ink, delay: dly(env, 0.25) });
    }, 0, -(1 - e) * rh);
    ctx.restore();
    return bb;
  },
}, P);

L.register('layout', 'c_polaroid', {
  name: 'ポラロイド', tags: ['emotional', 'calm', 'pop'], w: 1.1, treat: 'safe', portrait: 1.2,
  fits: n => n >= 1,
  plan: rng => ({ rot: rng.range(2.5, 6) * rng.sign(), scene: rng.pick(['sun', 'waves', 'dots']), tape: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'hand');
    const fw = env.portrait ? W * 0.74 : Math.min(H * 0.64, W * 0.46), mg = fw * 0.06;
    const f = fit(cut.text, font, fw * 0.86, fw * 0.3, { rows: 3, weight: 700, max: fw * 0.13 });
    const capH = Math.max(fw * 0.2, f.h + fw * 0.07);
    let ps = fw - mg * 2;
    if (mg + ps + capH > H * 0.86) ps = Math.max(fw * 0.4, H * 0.86 - mg - capH);
    const fh = mg + ps + capH, x0 = -fw / 2, y0 = -fh / 2;
    const frameC = L.mix(sc.paper, '#fff', 0.6);
    const m = mo(env, 'toss', { dist: 0.6, r0: 0.45 * Math.sign(Q.rot || 1), side: -Math.sign(Q.rot || 1), dIn: 0.5, exit: 'down' });
    const k = kit(env, m.a);
    const dev = E.inOutSine(clamp((env.lt - 0.15) / 1.0));
    return frame(env, W / 2, H / 2, (Q.rot || 4) * DEG, m, () => {
      k.shadow(x0, y0, fw, fh, fw * 0.01, 0.32);
      k.rr(x0, y0, fw, fh, fw * 0.01, frameC, 1, false, edgeOf(sc, frameC), u * 1.5);
      const px = x0 + mg, py = y0 + mg, pw = fw - mg * 2;
      k.clip(c => c.rect(px, py, pw, ps), () => {
        const ctx = env.ctx;
        ctx.globalAlpha = m.a;
        const g = ctx.createLinearGradient(0, py, 0, py + ps);
        g.addColorStop(0, L.mix(sc.accent2, '#000', 0.15)); g.addColorStop(1, L.mix(sc.accent, '#fff', 0.1));
        ctx.fillStyle = g; ctx.fillRect(px, py, pw, ps);
        const t = env.lt;
        if (Q.scene === 'waves') {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = ps * 0.012;
          for (let i = 0; i < 5; i++) { ctx.globalAlpha = m.a * (0.2 + i * 0.1); ctx.beginPath(); const yy = py + ps * (0.55 + i * 0.09); for (let x = 0; x <= 24; x++) { const xx = px + pw * x / 24; const v = yy + Math.sin(x * 0.8 + t * 1.5 + i) * ps * 0.015; if (x) ctx.lineTo(xx, v); else ctx.moveTo(xx, v); } ctx.stroke(); }
          ctx.globalAlpha = m.a * 0.8; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + pw * 0.7, py + ps * 0.3, ps * 0.09, 0, TAU); ctx.fill();
        } else if (Q.scene === 'dots') {
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 9; i++) { ctx.globalAlpha = m.a * (0.12 + 0.2 * L.r(cut.seed, 'bk', i)); ctx.beginPath(); ctx.arc(px + pw * L.r(cut.seed, 'bx', i), py + ps * L.r(cut.seed, 'by', i) + Math.sin(t + i) * ps * 0.01, ps * (0.05 + 0.1 * L.r(cut.seed, 'bs', i)), 0, TAU); ctx.fill(); }
        } else {
          ctx.globalAlpha = m.a * 0.85; ctx.fillStyle = L.mix(sc.accent, '#fff', 0.6); ctx.beginPath(); ctx.arc(px + pw * 0.5, py + ps * 0.66, ps * 0.2, 0, TAU); ctx.fill();
          ctx.globalAlpha = m.a; ctx.fillStyle = L.mix(sc.accent2, '#000', 0.45); ctx.fillRect(px, py + ps * 0.7, pw, ps * 0.3);
        }
        ctx.globalAlpha = m.a * (1 - dev) * 0.95; ctx.fillStyle = L.mix('#000', sc.bg, 0.2); ctx.fillRect(px, py, pw, ps);
      });
      k.rect(px, py, pw, ps * 0.01, '#000', 0.15);
      if (Q.tape) k.path(c => { c.translate(0, y0); c.rotate(-(Q.rot || 4) * DEG * 1.5); c.rect(-fw * 0.17, -fw * 0.04, fw * 0.34, fw * 0.08); }, '#fff', null, 0, 0.5);
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: 0, y: py + ps + capH / 2, color: sc.onPaper, delay: dly(env, 0.3) });
    });
  },
}, P);

L.register('layout', 'c_stamps', {
  name: '切手シート', tags: ['pop', 'graphic', 'editorial'], w: 0.9, treat: 'safe',
  fits: n => n >= 2 && n <= 12,
  plan: rng => ({ off: rng.int(0, 2), val: rng.pick([63, 84, 94, 120, 140]) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    const gs = L.glyphs(cut.text).filter(c => !L.isSpace(c)), n = gs.length;
    const cols = env.portrait ? (n <= 3 ? n : n <= 6 ? 3 : 4) : (n <= 6 ? n : Math.ceil(n / 2)), rows = Math.ceil(n / cols);
    const cell = Math.min(W * 0.88 / cols, H * (env.portrait ? 0.62 : 0.72) / rows), st = cell * 0.88;
    const faces = [sc.accent, sc.accent2, L.mix(sc.accent2, '#000', 0.45)];
    const gap = clamp(cut.dur * 0.2 / n, 0.02, 0.05);
    const stg = cut.enterDef && cut.enterDef.stagger != null ? cut.enterDef.stagger : 0.07;
    let bb = null;
    gs.forEach((ch, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i - row * cols;
      const cx = W / 2 + (col - (inRow - 1) / 2) * cell, cy = H / 2 + (row - (rows - 1) / 2) * cell;
      const m = mo(env, 'slap', { delay: i * gap, dIn: 0.26, r0: 0.1, exit: 'shrink' });
      if (m.x <= 0) return;
      const k = kit(env, m.a);
      const fc = faces[(i + (Q.off || 0)) % 3], paper = L.mix(sc.paper, '#fff', 0.5);
      const b = frame(env, cx, cy, L.rs(cut.seed, 'sr', i) * 2.2 * DEG, m, () => {
        const br = st * 0.035;
        k.path(c => { c.translate(u * 3, u * 6); scallop(c, -st / 2, -st / 2, st, st, br); }, '#000', null, 0, 0.25);
        k.path(c => scallop(c, -st / 2, -st / 2, st, st, br), paper, edgeOf(sc, paper), u);
        const ins = st * 0.1;
        k.rect(-st / 2 + ins, -st / 2 + ins, st - ins * 2, st - ins * 2, fc);
        const oc = L.onColor(fc);
        lab(k, String(Q.val || 84), -st / 2 + ins * 1.5, -st / 2 + ins * 1.9, st * 0.1, oc, { anchor: 'l', weight: 700 });
        lab(k, 'LYRIC', st / 2 - ins * 1.5, st / 2 - ins * 1.7, st * 0.075, oc, { anchor: 'r', alpha: 0.75, track: 0.2 });
        return L.mainDraw(env, { text: ch, font, size: st * 0.5, x: 0, y: st * 0.02, color: oc, mi: i, delay: Math.max(0, i * gap + dly(env, 0.08) - stg * i) });
      });
      bb = L.unionBB(bb, b);
    });
    return bb;
  },
}, P);

L.register('layout', 'c_postcard', {
  name: 'ポストカード', tags: ['calm', 'emotional', 'editorial'], w: 1, treat: 'safe', portrait: 0.8,
  fits: n => n >= 1,
  plan: rng => ({ rot: rng.range(-4, 4), air: rng.chance(0.55), role: rng.pick(['hand', 'hand', 'serif']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, Q.role || 'hand');
    const pt = env.portrait;
    let cw = pt ? W * 0.84 : Math.min(W * 0.7, H * 0.8 * 1.48), ch = pt ? Math.min(cw * 1.3, H * 0.78) : cw / 1.48;
    const card = L.mix(sc.paper, '#fff', 0.35), ink = sc.onPaper;
    const f = pt ? fit(cut.text, font, cw * 0.82, ch * 0.3, { rows: 4, weight: 700, max: cw * 0.15 }) : fit(cut.text, font, cw * 0.42, ch * 0.66, { rows: 4, weight: 700, max: cw * 0.1 });
    const m = mo(env, 'right', { dist: 0.55, r0: -0.25, dIn: 0.45, exit: 'left' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, (Q.rot || 0) * DEG, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0, cw, ch, cw * 0.012, 0.3);
      k.rr(x0, y0, cw, ch, cw * 0.012, card, 1, false, edgeOf(sc, card), u * 1.5);
      if (Q.air) {
        const sz = Math.min(cw, ch) * 0.035, per = perim(cw - sz * 1.2, ch - sz * 1.2, sz * 2.4, 90);
        per.forEach(([x, y], i) => { k.poly([[x - sz * 0.6, y - sz * 0.6], [x + sz * 0.2, y - sz * 0.6], [x + sz * 0.6, y + sz * 0.6], [x - sz * 0.2, y + sz * 0.6]], i % 2 ? sc.accent : sc.accent2, 0.85); });
      }
      const lc = Math.max(u * 10, Math.min(cw, ch) * 0.03);
      lab(k, 'POST CARD', x0 + cw * 0.08, y0 + ch * 0.1, lc, ink, { anchor: 'l', weight: 500, track: 0.4, alpha: 0.6 });
      // 切手+消印
      const sw = Math.min(cw, ch) * (pt ? 0.16 : 0.2), sx = cw / 2 - cw * 0.06 - sw, sy = y0 + ch * 0.08;
      k.path(c => scallop(c, sx, sy, sw, sw * 1.2, sw * 0.04), L.mix(sc.paper, '#fff', 0.7), L.mix(ink, card, 0.7), u);
      k.rect(sx + sw * 0.1, sy + sw * 0.1, sw * 0.8, sw, sc.accent2, 0.85);
      k.circ(sx + sw * 0.5, sy + sw * 0.55, sw * 0.24, L.mix(sc.accent2, '#fff', 0.5), null, 2, 0.8);
      const pmx = sx - sw * 0.1, pmy = sy + sw * 0.75;
      k.circ(pmx, pmy, sw * 0.45, null, ink, Math.max(1, sw * 0.03), 0.5);
      k.circ(pmx, pmy, sw * 0.32, null, ink, Math.max(1, sw * 0.02), 0.5);
      lab(k, pad2(cut.idx + 1), pmx, pmy, sw * 0.22, ink, { alpha: 0.55 });
      for (let i = 0; i < 3; i++) { const yy = pmy - sw * 0.2 + i * sw * 0.2; k.line(Array.from({ length: 9 }, (_, j) => [pmx - sw * 0.5 - j * sw * 0.16, yy + Math.sin(j * 1.4) * sw * 0.05]), ink, Math.max(1, sw * 0.02), 0.45); }
      let lx, ly;
      if (pt) {
        const dy = y0 + ch * 0.62;
        k.line([[x0 + cw * 0.08, dy], [cw / 2 - cw * 0.08, dy]], ink, Math.max(1, u * 1.5), 0.35);
        for (let i = 0; i < 3; i++) { const yy = dy + ch * 0.09 * (i + 1); k.line([[x0 + cw * 0.3, yy], [cw / 2 - cw * 0.08, yy]], ink, Math.max(1, u * 1.5), 0.3); }
        lx = 0; ly = y0 + ch * 0.43;
      } else {
        k.line([[cw * 0.03, y0 + ch * 0.3], [cw * 0.03, ch / 2 - ch * 0.1]], ink, Math.max(1, u * 1.5), 0.35);
        for (let i = 0; i < 4; i++) { const yy = y0 + ch * (0.5 + i * 0.1); k.line([[cw * 0.1, yy], [cw / 2 - cw * 0.07, yy]], ink, Math.max(1, u * 1.5), 0.3); }
        lx = x0 + cw * 0.27; ly = y0 + ch * 0.55;
      }
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: lx, y: ly, color: ink, delay: dly(env, 0.25) });
    });
  },
}, P);

L.register('layout', 'c_calendar', {
  name: '日めくり', tags: ['calm', 'editorial', 'pop'], w: 1, treat: 'safe', portrait: 1.1,
  fits: n => n >= 1,
  plan: rng => ({ hdr: rng.pick(['accent', 'accent2']), role: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, Q.role || 'display');
    let pw = env.portrait ? W * 0.66 : Math.min(H * 0.62, W * 0.42), ph = pw * 1.32;
    if (ph > H * 0.86) { ph = H * 0.86; pw = ph / 1.32; }
    const x0 = -pw / 2, y0 = -ph / 2, hh = ph * 0.15;
    const hdr = colOf(sc, Q.hdr || 'accent'), paper = L.mix(sc.paper, '#fff', 0.5), ink = sc.onPaper;
    const day = ((cut.idx * 7 + 3) % 31) + 1, wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][cut.idx % 7];
    const dayC = cut.idx % 7 === 0 ? L.fitContrast(sc.accent, paper, 3) : ink;
    const f = fit(cut.text, font, pw * 0.84, ph * 0.28, { rows: 3, max: pw * 0.16 });
    const m = mo(env, 'fade', { dIn: 0.2, exit: 'shrink' });
    const k = kit(env, m.a);
    const tearX = clamp((env.lt - 0.12) / 0.42);
    const page = (kk, num, dim) => {
      kk.rr(x0, y0, pw, ph, pw * 0.02, paper, 1, false, edgeOf(sc, paper), u * 1.5);
      kk.rr(x0, y0, pw, hh, pw * 0.02, hdr);
      kk.rect(x0, y0 + hh * 0.6, pw, hh * 0.4, hdr);
      const oc = L.onColor(hdr);
      lab(kk, `MONTH ${pad2((cut.idx % 12) + 1)}`, x0 + pw * 0.07, y0 + hh * 0.58, hh * 0.3, oc, { anchor: 'l', weight: 600, track: 0.2 });
      lab(kk, wd, pw / 2 - pw * 0.07, y0 + hh * 0.58, hh * 0.3, oc, { anchor: 'r', weight: 700, track: 0.2 });
      lab(kk, String(num), 0, y0 + hh + ph * 0.22, ph * 0.32, dim ? L.mix(dayC, paper, 0.5) : dayC, { font: "'Bebas Neue', 'Oswald', sans-serif", weight: 400, track: 0 });
      kk.line([[x0 + pw * 0.12, y0 + hh + ph * 0.42], [pw / 2 - pw * 0.12, y0 + hh + ph * 0.42]], ink, Math.max(1, u * 1.5), 0.3);
    };
    return frame(env, W / 2, H / 2 + ph * 0.02, 0, m, () => {
      k.shadow(x0, y0, pw, ph, pw * 0.02, 0.3);
      page(k, day, false);
      for (let i = 0; i < 3; i++) { const rx = x0 + pw * (0.25 + i * 0.25); k.rr(rx - pw * 0.018, y0 - hh * 0.28, pw * 0.036, hh * 0.5, pw * 0.018, L.mix(sc.sub, '#000', 0.3), 1, false, L.mix(sc.sub, '#fff', 0.3), u); }
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: y0 + hh + ph * 0.42 + (ph - hh - ph * 0.42) / 2, color: ink, delay: dly(env, 0.34) });
      if (tearX < 1 && k.main) {
        const ctx = env.ctx, e = E.inCubic(tearX);
        ctx.save();
        ctx.translate(0, y0);
        ctx.rotate(-e * 0.35);
        ctx.scale(1, Math.max(0.02, 1 - e));
        ctx.translate(e * pw * 0.1, -y0 - e * ph * 0.2);
        page(kit(env, m.a * (1 - e)), ((day + 29) % 31) + 1, true);
        ctx.restore();
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_cassette', {
  name: 'カセット', tags: ['pop', 'emotional', 'dark'], w: 1, treat: 'safe', portrait: 0.8,
  fits: n => n >= 1,
  plan: rng => ({ body: rng.pick(['dark', 'accent2', 'accent']), side: rng.pick(['A', 'B']), role: rng.pick(['hand', 'display']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, Q.role || 'hand');
    let cw = env.portrait ? W * 0.9 : Math.min(W * 0.64, H * 0.82 * 1.58), ch = cw / 1.58;
    const body = colOf(sc, Q.body || 'dark'), bt = L.onColor(body);
    const label = L.mix(sc.paper, '#fff', 0.5), ink = sc.onPaper, stripe = colOf(sc, Q.body === 'accent' ? 'accent2' : 'accent');
    const f = fit(cut.text, font, cw * 0.72, ch * 0.2, { rows: 2, weight: 700, max: ch * 0.16 });
    const m = mo(env, 'left', { dist: 0.6, r0: -0.14, dIn: 0.45, exit: 'right' });
    const k = kit(env, m.a);
    const spin = env.lt * 2.6;
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0, cw, ch, ch * 0.06, 0.32);
      k.rr(x0, y0, cw, ch, ch * 0.06, body, 1, true, edgeOf(sc, body) || L.mix(body, '#fff', 0.18), u * 2);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = sx * cw * 0.46, y = sy * ch * 0.42; k.circ(x, y, ch * 0.028, L.mix(body, '#fff', 0.3)); k.line([[x - ch * 0.018, y], [x + ch * 0.018, y]], L.mix(body, '#000', 0.5), Math.max(1, ch * 0.008)); }
      const lx = -cw * 0.42, ly = -ch * 0.4, lw = cw * 0.84, lh = ch * 0.6;
      k.rr(lx, ly, lw, lh, ch * 0.025, label);
      k.rect(lx, ly + ch * 0.025, lw, ch * 0.07, stripe);
      const so = L.onColor(stripe);
      lab(k, Q.side || 'A', lx + ch * 0.06, ly + ch * 0.062, ch * 0.075, so, { weight: 700 });
      lab(k, `SIDE ${Q.side || 'A'}`, lx + ch * 0.12, ly + ch * 0.062, ch * 0.04, so, { anchor: 'l', weight: 600, track: 0.3 });
      lab(k, '90 MIN', lx + lw - ch * 0.04, ly + ch * 0.062, ch * 0.04, so, { anchor: 'r', weight: 600, track: 0.2 });
      // 窓とリール
      const wy = -ch * 0.04, wh = ch * 0.19, ww = cw * 0.5;
      k.rr(-ww / 2, wy, ww, wh, wh / 2, L.mix('#000', body, 0.25));
      for (const s of [-1, 1]) {
        const rx = s * cw * 0.16, ry = wy + wh / 2, rr = wh * 0.36;
        k.circ(rx, ry, rr * (s < 0 ? 1.25 : 0.95), L.mix(sc.sub, '#000', 0.55));
        k.circ(rx, ry, rr * 0.62, L.mix(sc.paper, '#fff', 0.4));
        for (let t = 0; t < 6; t++) { const a = spin + t * TAU / 6; k.line([[rx + Math.cos(a) * rr * 0.22, ry + Math.sin(a) * rr * 0.22], [rx + Math.cos(a) * rr * 0.5, ry + Math.sin(a) * rr * 0.5]], L.mix('#000', body, 0.3), Math.max(1, rr * 0.12)); }
      }
      k.rect(-cw * 0.1, wy + wh * 0.28, cw * 0.2, wh * 0.44, L.mix('#000', sc.bg, 0.05), 0.35);
      k.poly([[-cw * 0.3, ch / 2], [cw * 0.3, ch / 2], [cw * 0.25, ch * 0.3], [-cw * 0.25, ch * 0.3]], L.mix(body, bt, 0.12));
      for (const s of [-1, 1]) { k.circ(s * cw * 0.16, ch * 0.4, ch * 0.03, L.mix('#000', body, 0.2)); k.rect(s * cw * 0.06 - ch * 0.02, ch * 0.37, ch * 0.04, ch * 0.05, L.mix('#000', body, 0.2)); }
      const ty = ly + ch * 0.095 + (wy - ly - ch * 0.095) / 2;
      k.line([[lx + lw * 0.06, ty + f.h / 2 + ch * 0.012], [lx + lw * 0.94, ty + f.h / 2 + ch * 0.012]], ink, Math.max(1, u), 0.18);
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: 0, y: ty, color: ink, delay: dly(env, 0.3) });
    });
  },
}, P);

L.register('layout', 'c_vinyl', {
  name: 'レコード盤', tags: ['emotional', 'calm', 'dark'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 18,
  plan: rng => ({ label: rng.pick(['accent', 'accent2']), sleeve: rng.pick(['paper', 'accent', 'accent2']), pat: rng.pick(['rings', 'stripes']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    const pt = env.portrait;
    const R = pt ? Math.min(W * 0.38, H * 0.22) : Math.min(H * 0.43, W * 0.25);
    const off = R * 0.55;
    const sx = pt ? W / 2 : W / 2 - off, sy = pt ? H / 2 - off : H / 2;
    const dx = pt ? 0 : off * 2, dy = pt ? off * 2 : 0;
    const lab0 = colOf(sc, Q.label || 'accent'), disc = L.mix('#000', sc.bg, 0.12);
    let slv = colOf(sc, Q.sleeve || 'paper');
    if (L.contrast(slv, lab0) < 1.4) slv = sc.paper;
    const Rl = R * 0.5;
    const f = fit(cut.text, font, Rl * 1.28, Rl * 1.1, { rows: 3, max: Rl * 0.5 });
    const m = mo(env, 'fade', { dIn: 0.25, exit: 'shrink' });
    const k = kit(env, m.a);
    const e = E.outCubic(clamp((env.lt - 0.12) / 0.62));
    const ang = env.lt * 0.9;
    // ジャケット
    frame(env, sx, sy, 0, m, () => {
      const S = R * 2.1;
      k.shadow(-S / 2, -S / 2, S, S, R * 0.02, 0.3);
      k.rr(-S / 2, -S / 2, S, S, R * 0.02, slv, 1, false, edgeOf(sc, slv), u * 1.5);
      const sc2 = L.mix(slv, L.onColor(slv) === '#ffffff' ? '#fff' : '#000', 0.2);
      if (Q.pat === 'stripes') for (let i = 0; i < 5; i++) k.rect(-S / 2, -S / 2 + S * (0.55 + i * 0.07), S, S * 0.035, i % 2 ? sc.accent : sc.accent2, 0.8);
      else for (let i = 1; i <= 4; i++) k.circ(-S * 0.1, S * 0.05, S * 0.1 * i, null, sc2, Math.max(1, S * 0.012));
      lab(k, 'LYRIC', -S / 2 + S * 0.08, -S / 2 + S * 0.1, S * 0.06, L.onColor(slv), { anchor: 'l', weight: 700, track: 0.3 });
      lab(k, `SIDE A · ${pad2(cut.idx + 1)}`, -S / 2 + S * 0.08, -S / 2 + S * 0.17, S * 0.035, L.onColor(slv), { anchor: 'l', alpha: 0.7, track: 0.2 });
      return null;
    });
    return frame(env, sx + dx * e, sy + dy * e, 0, m, () => {
      if (k.main) env.circle(u * 6, u * 10, R, '#000', null, 2, 0.3 * m.a, false);
      k.circ(0, 0, R, disc, L.mix(disc, '#fff', 0.3), Math.max(1, u * 1.5));
      for (let i = 0; i < 7; i++) k.circ(0, 0, R * (0.58 + i * 0.058), null, L.mix(disc, '#fff', 0.14), Math.max(1, R * 0.006));
      k.arc(0, 0, R * 0.8, ang * 57.3, ang * 57.3 + 40, '#fff', R * 0.3, 0.06);
      k.arc(0, 0, R * 0.8, ang * 57.3 + 180, ang * 57.3 + 220, '#fff', R * 0.3, 0.06);
      k.circ(0, 0, Rl, lab0);
      const rt = 'SIDE A · 33 RPM · LYRIC · STEREO · ', gs = L.glyphs(rt), rs = Rl * 0.1, oc = L.onColor(lab0);
      gs.forEach((ch, i) => { const a = ang + i / gs.length * TAU; if (ch !== ' ') lab(k, ch, Math.cos(a) * Rl * 0.86, Math.sin(a) * Rl * 0.86, rs, oc, { rot: a + Math.PI / 2, track: 0, alpha: 0.8 }); });
      k.circ(0, 0, R * 0.03, sc.bg);
      return L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: 0, color: oc, delay: dly(env, 0.35) });
    });
  },
}, P);

L.register('layout', 'c_spine', {
  name: '本の背表紙', tags: ['calm', 'editorial', 'emotional'], w: 0.9, treat: 'safe', portrait: 0.8,
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), role: rng.pick(['serif', 'display']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, Q.role || 'serif');
    const latin = L.hasLatinWords(cut.text);
    const hs = H * (env.portrait ? 0.6 : 0.8);
    const f = latin ? fit(cut.text, font, hs * 0.7, mn * 0.14, { rows: 2, max: mn * 0.1 }) : fit(cut.text, font, mn * 0.22, hs * 0.7, { rows: 2, vertical: true, max: mn * 0.12 });
    const thick = latin ? f.h : f.w;
    const ws = Math.max(thick + f.size * 0.9, mn * 0.1);
    const baseY = H / 2 + hs / 2, lift = hs * 0.06;
    const col = colOf(sc, Q.col || 'accent'), oc = L.onColor(col);
    const muted = [L.mix(sc.accent2, sc.bg, 0.45), L.mix(sc.sub, sc.bg, 0.35), L.mix(sc.accent, sc.bg, 0.55), L.mix(sc.paper, sc.bg, 0.35), L.mix(sc.fg, sc.bg, 0.6)];
    const k0 = kit(env, env.inOut(0.3));
    // 棚板
    k0.rect(W * 0.04, baseY, W * 0.92, Math.max(u * 10, hs * 0.03), L.mix(sc.sub, sc.bg, 0.25));
    k0.rect(W * 0.04, baseY, W * 0.92, Math.max(u * 3, hs * 0.008), L.mix(sc.sub, '#fff', 0.3), 0.6);
    // 両脇の本
    for (const side of [-1, 1]) {
      let x = W / 2 + side * (ws / 2 + u * 4);
      for (let j = 0; j < 8; j++) {
        const bw = ws * L.rr(0.42, 0.85, cut.seed, 'bw', side, j), bh = hs * L.rr(0.7, 0.95, cut.seed, 'bh', side, j);
        const xl = side > 0 ? x : x - bw;
        if (xl < W * 0.05 || xl + bw > W * 0.95) break;
        const e = E.outCubic(clamp((env.lt - 0.04 * j) / 0.35));
        const kb = kit(env, e * (1 - E.inCubic(env.pOut)));
        const yy = baseY - bh + (1 - e) * hs * 0.12;
        const c = muted[(j * 2 + (side > 0 ? 1 : 0) + cut.idx) % muted.length];
        kb.rect(xl, yy, bw, bh + u, c);
        kb.rect(xl, yy + bh * 0.08, bw, bh * 0.025, L.mix(c, '#fff', 0.3), 0.7);
        kb.rect(xl, yy + bh * 0.88, bw, bh * 0.025, L.mix(c, '#fff', 0.3), 0.7);
        kb.rect(xl + bw * 0.25, yy + bh * 0.25, bw * 0.5, bh * 0.2, L.mix(c, '#000', 0.2), 0.5);
        x += side * (bw + u * 3);
      }
    }
    const m = mo(env, 'fade', { dIn: 0.25, exit: 'fade' });
    const pull = E.outBack(clamp((env.lt - 0.18) / 0.5), 1.6);
    const k = kit(env, m.a);
    return frame(env, W / 2, baseY - hs / 2 - lift * pull, 0, m, () => {
      k.shadow(-ws / 2, -hs / 2, ws, hs, u * 3, 0.25);
      k.rr(-ws / 2, -hs / 2, ws, hs, u * 3, col, 1, true, edgeOf(sc, col), u * 1.5);
      const band = L.mix(col, oc, 0.5);
      for (const yy of [-hs * 0.42, -hs * 0.4, hs * 0.38, hs * 0.4]) k.rect(-ws / 2, yy, ws, hs * 0.008, band, 0.9);
      k.poly(scalePts(star(4, 1, 0.4), ws * 0.13, 0, -hs * 0.455), band);
      lab(k, pad2(cut.idx + 1), 0, hs * 0.45, Math.min(ws * 0.3, hs * 0.035), oc, { weight: 700 });
      return L.mainDraw(env, latin
        ? { text: f.text, font, size: f.size, x: 0, y: -hs * 0.02, rot: Math.PI / 2, color: oc, delay: dly(env, 0.3) }
        : { text: f.text, font, size: f.size, x: 0, y: -hs * 0.02, vertical: true, color: oc, delay: dly(env, 0.3) });
    });
  },
}, P);

L.register('layout', 'c_news', {
  name: '新聞見出し', tags: ['editorial', 'graphic', 'dark'], w: 1, treat: 'safe', emph: 1.3,
  fits: n => n >= 1,
  plan: rng => ({ photo: rng.int(0, 2), no: rng.int(1000, 9999) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'serif');
    const pt = env.portrait;
    let pw = pt ? W * 0.9 : wide(env) ? Math.min(W * 0.62, H * 0.86 * 1.3) : W * 0.84, ph = pt ? Math.min(pw * 1.25, H * 0.8) : pw * 0.72;
    if (ph > H * 0.86) { ph = H * 0.86; }
    const paper = L.mix(sc.paper, '#000', 0.05), ink = sc.onPaper;
    const x0 = -pw / 2, y0 = -ph / 2, mg = pw * 0.05;
    const mh = ph * 0.1;
    const f = fit(cut.text, font, pw - mg * 2, ph * 0.3, { rows: 3, max: pw * 0.14 });
    const m = mo(env, 'spin', { turns: 1.5, dIn: 0.6, exit: 'shrink' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, -1.5 * DEG, m, () => {
      k.shadow(x0, y0, pw, ph, 0, 0.3);
      k.rect(x0, y0, pw, ph, paper);
      if (!sc.dark) k.rr(x0, y0, pw, ph, 0, null, 1, false, L.mix(paper, '#000', 0.3), u);
      lab(k, 'THE DAILY LYRIC', 0, y0 + mg * 0.6 + mh * 0.45, mh * 0.62, ink, { font: L.roleFont(env, 'serif'), weight: 900, track: 0.04 });
      const ry = y0 + mg * 0.6 + mh;
      k.rect(x0 + mg, ry, pw - mg * 2, Math.max(1, ph * 0.006), ink);
      k.rect(x0 + mg, ry + ph * 0.012, pw - mg * 2, Math.max(1, ph * 0.002), ink);
      const ds = Math.max(u * 9, ph * 0.022);
      lab(k, `VOL. ${pad2(cut.idx + 1)}`, x0 + mg, ry + ph * 0.035, ds, ink, { anchor: 'l', weight: 500 });
      lab(k, `No. ${Q.no || 1234}`, 0, ry + ph * 0.035, ds, ink, { weight: 500 });
      lab(k, 'EXTRA', pw / 2 - mg, ry + ph * 0.035, ds, ink, { anchor: 'r', weight: 700, track: 0.2 });
      k.rect(x0 + mg, ry + ph * 0.056, pw - mg * 2, Math.max(1, ph * 0.003), ink);
      const hy = ry + ph * 0.07 + f.h / 2 + ph * 0.02;
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: hy, color: ink, delay: dly(env, 0.45) });
      const by0 = hy + f.h / 2 + ph * 0.04, by1 = ph / 2 - mg * 0.8;
      k.rect(x0 + mg, by0 - ph * 0.02, pw - mg * 2, Math.max(1, ph * 0.002), ink, 0.6);
      const cg = pw * 0.03, cw = (pw - mg * 2 - cg * 2) / 3, lh = Math.max(u * 3, ph * 0.014), ls = ph * 0.034;
      const bar = L.mix(ink, paper, 0.72);
      for (let c = 0; c < 3; c++) {
        const cx = x0 + mg + c * (cw + cg);
        let y = by0;
        if (c === (Q.photo || 0) && by1 - by0 > ph * 0.2) {
          const phh = (by1 - by0) * 0.55;
          k.rect(cx, y, cw, phh, L.mix(ink, paper, 0.8));
          k.clip(cc => cc.rect(cx, y, cw, phh), () => { k.line([[cx, y + phh], [cx + cw, y]], L.mix(ink, paper, 0.6), Math.max(1, u * 2)); k.circ(cx + cw * 0.3, y + phh * 0.35, phh * 0.15, L.mix(ink, paper, 0.65)); });
          y += phh + ls * 0.6;
        }
        for (let i = 0; i < 14 && y + lh < by1; i++) { const w = (i % 5 === 4) ? cw * 0.55 : cw; k.rect(cx, y, w, lh, bar); y += ls; }
        if (c < 2) k.rect(cx + cw + cg / 2, by0, Math.max(1, u), by1 - by0, ink, 0.25);
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_price', {
  name: '値札POP', tags: ['pop', 'graphic'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ hdr: rng.pick(['accent', 'accent2']), base: rng.pick([198, 298, 480, 580, 980, 1280, 1480]), burst: rng.chance(0.7), rot: rng.range(-3, 3) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body');
    const pt = env.portrait;
    let cw = pt ? W * 0.86 : W * 0.62, ch = pt ? cw * 0.7 : cw * 0.46;
    if (ch > H * 0.6) { ch = H * 0.6; }
    const hh = ch * 0.19, paper = L.mix(sc.paper, '#fff', 0.5), ink = sc.onPaper, hdr = colOf(sc, Q.hdr || 'accent'), ho = L.onColor(hdr);
    const lw = cw * 0.56, rw = cw - lw;
    const f = fit(cut.text, font, lw * 0.84, (ch - hh) * 0.72, { rows: 3, max: ch * 0.2 });
    const base = Q.base || 480, pstr = '¥' + fmtN(base), old = '¥' + fmtN(Math.round(base * 1.6 / 10) * 10);
    const pfont = L.roleFont(env, 'display');
    const psz = L.fitSize(pstr, pfont, rw * 0.8, (ch - hh) * 0.3, {});
    const pc = L.fitContrast(sc.accent, paper, 3.2);
    const m = mo(env, 'drop', { dist: 0.5, dIn: 0.55, exit: 'down' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, (Q.rot || 0) * DEG, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0, cw, ch, ch * 0.03, 0.3);
      k.rr(x0, y0, cw, ch, ch * 0.03, paper, 1, false, edgeOf(sc, paper), u * 1.5);
      k.rr(x0, y0, cw, hh, ch * 0.03, hdr); k.rect(x0, y0 + hh * 0.5, cw, hh * 0.5, hdr);
      lab(k, 'PRICE', x0 + cw * 0.05, y0 + hh / 2, hh * 0.46, ho, { anchor: 'l', weight: 700, track: 0.3 });
      if (!Q.burst) lab(k, `No.${pad2(cut.idx + 1)}`, cw / 2 - cw * 0.05, y0 + hh / 2, hh * 0.36, ho, { anchor: 'r', weight: 500, track: 0.1 });
      k.rr(-ch * 0.1, y0 - ch * 0.06, ch * 0.2, ch * 0.1, ch * 0.02, L.mix(sc.sub, '#000', 0.35));
      k.line([[x0 + lw, y0 + hh + ch * 0.06], [x0 + lw, ch / 2 - ch * 0.06]], ink, Math.max(1, u * 1.5), 0.25, [u * 4, u * 4]);
      const rx = x0 + lw + rw / 2, cy = y0 + hh + (ch - hh) / 2;
      const ow = txtW(old, LAB, ch * 0.075, 500);
      const oy = cy - psz * 0.62 - ch * 0.05;
      lab(k, old, rx, oy, ch * 0.075, ink, { weight: 500, alpha: 0.6 });
      k.line([[rx - ow * 0.55, oy], [rx + ow * 0.55, oy]], pc, Math.max(1.5, ch * 0.01));
      lab(k, pstr, rx, cy, psz, pc, { font: pfont, weight: 900, track: 0 });
      lab(k, 'TAX IN', rx, cy + psz * 0.6 + ch * 0.045, ch * 0.055, ink, { weight: 600, alpha: 0.7, track: 0.3 });
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: x0 + lw / 2, y: cy, color: ink, delay: dly(env, 0.3) });
      if (Q.burst) {
        const bm = mo(env, 'pop', { delay: 0.4, dIn: 0.3 }), br = ch * 0.17 * bm.s;
        const bc = colOf(sc, other(Q.hdr || 'accent')), kb = kit(env, m.a * bm.a);
        const bx = cw / 2 - ch * 0.04, by = y0 + ch * 0.02;
        kb.poly(scalePts(star(12, 1, 0.8, env.lt * 0.4), br, bx, by), bc);
        lab(kb, 'SALE', bx, by, br * 0.46, L.onColor(bc), { weight: 700, rot: -0.2 });
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_nametag', {
  name: '名札HELLO', tags: ['pop', 'emotional'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), rot: rng.range(-5, 5) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'hand');
    let cw = env.portrait ? W * 0.84 : Math.min(W * 0.56, H * 0.82 * 1.4), ch = cw / 1.4;
    if (ch > H * 0.7) { ch = H * 0.7; cw = ch * 1.4; }
    const col = colOf(sc, Q.col || 'accent'), oc = L.onColor(col), white = L.mix(sc.paper, '#fff', 0.8);
    const px = cw * 0.05, py0 = -ch / 2 + ch * 0.34, ph = ch * 0.54;
    const f = fit(cut.text, font, (cw - px * 2) * 0.88, ph * 0.8, { rows: 3, weight: 700, max: ph * 0.6 });
    const m = mo(env, 'flipX', { dIn: 0.45, exit: 'shrink' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, (Q.rot || 0) * DEG, m, () => {
      k.shadow(-cw / 2, -ch / 2, cw, ch, ch * 0.08, 0.3);
      k.rr(-cw / 2, -ch / 2, cw, ch, ch * 0.08, col, 1, true, edgeOf(sc, col), u * 2);
      lab(k, 'HELLO', 0, -ch / 2 + ch * 0.13, ch * 0.16, oc, { font: "'Anton', 'Oswald', sans-serif", weight: 400, track: 0.12 });
      lab(k, 'my name is', 0, -ch / 2 + ch * 0.26, ch * 0.06, oc, { weight: 500, track: 0.1 });
      k.rr(-cw / 2 + px, py0, cw - px * 2, ph, ch * 0.03, white);
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: 0, y: py0 + ph / 2, color: sc.onPaper, delay: dly(env, 0.3) });
    });
  },
}, P);

L.register('layout', 'c_caution', {
  name: '警告ラベル', tags: ['graphic', 'dark', 'glitch', 'cyber'], w: 0.9, treat: 'safe', emph: 1.4,
  fits: n => n >= 1,
  plan: rng => ({ word: rng.pick(['CAUTION', 'WARNING', 'NOTICE']), dir: rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    const cw = env.portrait ? W * 0.88 : W * 0.66;
    const f = fit(cut.text, font, cw * 0.8, H * (env.portrait ? 0.26 : 0.32), { rows: 3, max: Math.min(W, H) * 0.15 });
    const t = Math.max(u * 12, cw * 0.035), hb = Math.max(u * 30, f.size * 0.75, cw * 0.06);
    const ch = t * 2 + hb + f.h + f.size * 0.9;
    const yel = sc.accent, paper = L.mix(sc.paper, '#fff', 0.4), ink = sc.onPaper;
    const m = mo(env, Q.dir > 0 ? 'right' : 'left', { dist: 0.6, dIn: 0.35, exit: 'shrink' });
    const dIn = Math.max(0.12, Math.min(0.35, cut.dur * 0.35));
    if (env.lt > dIn) m.dx += Math.sin((env.lt - dIn) * 60) * u * 9 * Math.exp(-(env.lt - dIn) * 8);
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2, r = t * 0.6;
      k.shadow(x0, y0, cw, ch, r, 0.3);
      k.rr(x0, y0, cw, ch, r, yel, 1, true);
      const sw = t * 1.6, off = (env.lt * sw * 1.2) % (sw * 2);
      k.clip(c => rrPath(c, x0, y0, cw, ch, r), () => {
        const ctx = env.ctx; ctx.globalAlpha = m.a; ctx.fillStyle = '#000'; ctx.beginPath();
        for (let x = x0 - ch - sw * 2 + off; x < cw / 2 + sw; x += sw * 2) { ctx.moveTo(x, y0 + ch); ctx.lineTo(x + sw, y0 + ch); ctx.lineTo(x + sw + ch, y0); ctx.lineTo(x + ch, y0); ctx.closePath(); }
        ctx.fill();
      });
      k.rr(x0 + t, y0 + t, cw - t * 2, ch - t * 2, r * 0.5, paper);
      k.rect(x0 + t, y0 + t, cw - t * 2, hb, '#000');
      const wc = L.fitContrast(yel, '#000', 4), ts = hb * 0.36;
      const word = Q.word || 'CAUTION', ww = txtW(word, LAB, hb * 0.52, 700, 0.18);
      const ix = -ww / 2 - hb * 0.45, iy = y0 + t + hb / 2;
      k.poly([[ix, iy - ts], [ix + ts * 1.1, iy + ts * 0.85], [ix - ts * 1.1, iy + ts * 0.85]], wc);
      k.rect(ix - ts * 0.1, iy - ts * 0.45, ts * 0.2, ts * 0.75, '#000');
      k.circ(ix, iy + ts * 0.55, ts * 0.12, '#000');
      lab(k, word, ix + ts * 1.5 + ww / 2, iy, hb * 0.52, wc, { weight: 700, track: 0.18 });
      return L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: y0 + t + hb + (ch - t * 2 - hb) / 2, color: ink, delay: dly(env, 0.25) });
    });
  },
}, P);

L.register('layout', 'c_sticky', {
  name: '付箋', tags: ['pop', 'calm', 'emotional'], w: 1.1, treat: 'safe', portrait: 1.1,
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), rot: rng.range(2, 6) * rng.sign(), back: rng.chance(0.7), rot2: rng.range(4, 9) * rng.sign() }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'hand');
    const s = env.portrait ? W * 0.7 : Math.min(H * 0.68, W * 0.42);
    const note = L.mix(colOf(sc, Q.col || 'accent'), '#fff', 0.55), note2 = L.mix(colOf(sc, other(Q.col || 'accent')), '#fff', 0.5);
    const oc = L.onColor(note);
    const f = fit(cut.text, font, s * 0.8, s * 0.7, { rows: 4, weight: 700, max: s * 0.24 });
    const fo = s * 0.14;
    const shape = [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2 - fo], [s / 2 - fo, s / 2], [-s / 2, s / 2]];
    if (Q.back) {
      const mb = mo(env, 'fade', { dIn: 0.25 });
      frame(env, W / 2 + s * 0.08, H / 2 + s * 0.04, (Q.rot2 || 6) * DEG, mb, () => {
        const kb = kit(env, mb.a);
        kb.path(c => { c.translate(u * 4, u * 8); polyPath(shape)(c); }, '#000', null, 0, 0.2);
        kb.path(polyPath([[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]]), note2, edgeOf(sc, note2), u);
        return null;
      });
    }
    const m = mo(env, 'flipY', { dIn: 0.45, delay: 0.08, exit: 'fall', side: Math.sign(Q.rot || 1) });
    if (m.x <= 0) return null;
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2 - s / 2, (Q.rot || 4) * DEG, m, () => {
      k.path(c => { c.translate(u * 5, u * 10); polyPath(shape)(c); }, '#000', null, 0, 0.25);
      k.path(polyPath(shape), note, edgeOf(sc, note), u);
      k.rect(-s / 2, -s / 2, s, s * 0.08, L.mix(note, '#000', 0.06));
      k.poly([[s / 2, s / 2 - fo], [s / 2 - fo * 0.92, s / 2 - fo * 0.92], [s / 2 - fo, s / 2]], L.mix(note, '#000', 0.2));
      k.path(c => { c.translate(0, -s / 2); c.rotate(-0.06); c.rect(-s * 0.17, -s * 0.05, s * 0.34, s * 0.1); }, '#fff', null, 0, 0.5);
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: 0, y: s * 0.03, color: oc, delay: dly(env, 0.3) });
    }, 0, s / 2);
  },
}, P);

L.register('layout', 'c_clapper', {
  name: 'カチンコ', tags: ['editorial', 'dark', 'graphic'], w: 0.9, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ stripe: rng.pick(['white', 'accent']), roll: rng.int(1, 9), take: rng.int(1, 12) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'hand');
    let cw = env.portrait ? W * 0.86 : Math.min(W * 0.58, H * 0.8 * 1.3), sh = cw * 0.11, ch = cw * 0.7;
    if (ch + sh * 2.1 > H * 0.84) { const s = H * 0.84 / (ch + sh * 2.1); cw *= s; ch *= s; sh *= s; }
    const body = L.mix('#000', sc.bg, 0.12), wc = '#fff';
    const stc = Q.stripe === 'accent' ? L.fitContrast(sc.accent, body, 3) : '#fff';
    const rA = ch * 0.2, rC = ch * 0.17, rB = ch - rA - rC;
    const f = fit(cut.text, font, cw * 0.86, rB * 0.66, { rows: 3, weight: 700, max: rB * 0.5 });
    const m = mo(env, 'up', { dist: 0.45, dIn: 0.35, exit: 'down' });
    const k = kit(env, m.a);
    const lt = env.lt;
    let ang = -0.3;
    if (lt > 0.38) ang = -0.3 * (1 - E.inQuad(clamp((lt - 0.38) / 0.1)));
    if (lt > 0.48) ang = -0.04 * Math.exp(-(lt - 0.48) * 12) * Math.abs(Math.sin((lt - 0.48) * 30));
    return frame(env, W / 2, H / 2 + sh * 1.03, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0 - sh, cw, ch + sh, u * 4, 0.3);
      k.rr(x0, y0, cw, ch, u * 4, body, 1, true, L.mix(body, '#fff', 0.25), u * 1.5);
      const stick = (yy) => {
        k.rect(x0, yy, cw, sh, body);
        k.clip(c => c.rect(x0, yy, cw, sh), () => {
          const ctx = env.ctx; ctx.globalAlpha = m.a; ctx.fillStyle = stc; ctx.beginPath();
          for (let x = x0 - sh; x < cw / 2 + sh; x += sh * 1.6) { ctx.moveTo(x, yy + sh); ctx.lineTo(x + sh * 0.8, yy + sh); ctx.lineTo(x + sh * 1.6, yy); ctx.lineTo(x + sh * 0.8, yy); ctx.closePath(); }
          ctx.fill();
        });
        k.rr(x0, yy, cw, sh, u * 2, null, 1, false, L.mix(body, '#fff', 0.25), u * 1.5);
      };
      stick(y0 - sh * 1.02);
      const ctx = env.ctx;
      ctx.save(); ctx.translate(x0, y0 - sh * 1.02); ctx.rotate(ang); ctx.translate(-x0, -(y0 - sh * 1.02));
      stick(y0 - sh * 2.06);
      ctx.restore();
      k.circ(x0 + sh * 0.5, y0 - sh * 1.02, sh * 0.2, L.mix(body, '#fff', 0.4));
      if (lt > 0.46 && lt < 0.7) {
        const fa = 1 - (lt - 0.46) / 0.24;
        for (let i = 0; i < 5; i++) { const a = (-30 - i * 30) * DEG; k.line([[cw / 2 + Math.cos(a) * sh * 0.6, y0 - sh + Math.sin(a) * sh * 0.6], [cw / 2 + Math.cos(a) * sh * 1.3, y0 - sh + Math.sin(a) * sh * 1.3]], L.fitContrast(sc.fg, sc.bg, 3), Math.max(u * 2, sh * 0.06), fa); }
      }
      const lw = Math.max(1, u * 1.5), ls = Math.max(u * 9, rA * 0.2);
      k.line([[x0, y0 + rA], [cw / 2, y0 + rA]], wc, lw, 0.7);
      k.line([[x0, y0 + rA + rB], [cw / 2, y0 + rA + rB]], wc, lw, 0.7);
      const fields = [['ROLL', pad2(Q.roll || 1)], ['SCENE', pad2(cut.idx + 1)], ['TAKE', String(Q.take || 1)]];
      fields.forEach(([a, b], i) => {
        const fx = x0 + cw * i / 3;
        if (i) k.line([[fx, y0], [fx, y0 + rA]], wc, lw, 0.7);
        lab(k, a, fx + cw * 0.02, y0 + rA * 0.22, ls, wc, { anchor: 'l', alpha: 0.7, track: 0.15 });
        lab(k, b, fx + cw / 6, y0 + rA * 0.62, rA * 0.46, wc, { font, weight: 700 });
      });
      lab(k, 'PROD.', x0 + cw * 0.02, y0 + rA + ls * 0.9, ls, wc, { anchor: 'l', alpha: 0.7, track: 0.15 });
      const yC = y0 + rA + rB;
      [['DATE', `DAY ${pad2(cut.idx + 1)}`], ['CAM', 'A'], ['SOUND', 'SYNC']].forEach(([a, b], i) => {
        const fx = x0 + cw * i / 3;
        if (i) k.line([[fx, yC], [fx, ch / 2]], wc, lw, 0.7);
        lab(k, a, fx + cw * 0.02, yC + rC * 0.24, ls, wc, { anchor: 'l', alpha: 0.7, track: 0.15 });
        lab(k, b, fx + cw / 6, yC + rC * 0.66, rC * 0.34, wc, { font, weight: 700 });
      });
      return L.mainDraw(env, { text: f.text, font, weight: 700, size: f.size, x: 0, y: y0 + rA + rB * 0.56, color: '#fff', delay: dly(env, 0.3) });
    });
  },
}, P);

/* ================================================================ 3. 光・サイン */

L.register('layout', 'c_neon', {
  name: 'ネオン管', tags: ['cyber', 'dark', 'emotional', 'pop'], w: 1.1, treat: false, emph: 1.3,
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), frame: rng.chance(0.7), tag: rng.pick(['ON AIR', 'OPEN', 'LIVE', '24H']), tr: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = ROUND;
    const f = fit(cut.text, font, W * (env.portrait ? 0.76 : 0.7), H * (env.portrait ? 0.3 : 0.38), { rows: 3, weight: 700, max: mn * 0.2 });
    const s = f.size;
    const panel = L.mix(sc.bg, '#000', sc.dark ? 0.45 : 0.82);
    const tc = L.mix(L.fitContrast(colOf(sc, Q.col || 'accent'), panel, 4), '#fff', 0.12);
    const tc2 = L.mix(L.fitContrast(colOf(sc, other(Q.col || 'accent')), panel, 4), '#fff', 0.12);
    const lt = env.lt;
    const st = env.step;
    let on = 1;
    if (lt < 0.6) on = L.r(cut.seed, 'ig', st) < clamp(lt / 0.5) ? 1 : 0.15;
    else if (L.r(cut.seed, 'bk', st) < 0.03) on = 0.35;
    const pw = f.w + s * 1.4, ph = f.h + s * 1.1;
    const m = mo(env, 'zoom', { dIn: 0.3, exit: 'fade' });
    const k = kit(env, m.a);
    const glow = Math.min(s * 0.4, u * 36);
    return frame(env, W / 2, H / 2, 0, m, () => {
      k.rr(-pw / 2, -ph / 2, pw, ph, s * 0.2, panel, 0.88, false, L.mix(panel, '#fff', 0.12), u * 1.5);
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.circ(x * (pw / 2 - s * 0.18), y * (ph / 2 - s * 0.18), Math.max(u * 3, s * 0.05), L.mix(panel, '#fff', 0.35));
      if (Q.frame && k.main) {
        const ctx = env.ctx, fo = lt < 0.7 ? (L.r(cut.seed, 'fg', st) < clamp((lt - 0.1) / 0.5) ? 1 : 0.1) : 1;
        ctx.save(); ctx.globalAlpha = m.a * fo; ctx.shadowColor = tc2; ctx.shadowBlur = glow * 0.8; ctx.strokeStyle = tc2; ctx.lineWidth = Math.max(u * 3, s * 0.07);
        ctx.beginPath(); rrPath(ctx, -pw / 2 + s * 0.35, -ph / 2 + s * 0.35, pw - s * 0.7, ph - s * 0.7, s * 0.3); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = L.mix(tc2, '#fff', 0.7); ctx.lineWidth = Math.max(1, s * 0.022); ctx.stroke(); ctx.restore();
      }
      const tagS = Math.max(u * 12, s * 0.26), tb = st % 24 < 16 || lt < 0.8;
      const tx = (Q.tr ? 1 : -1) * (pw / 2 - s * 0.2), ty = -ph / 2 - tagS * 0.9;
      lab(k, Q.tag || 'ON AIR', tx, ty, tagS, tc2, { anchor: Q.tr ? 'r' : 'l', weight: 500, alpha: tb ? 1 : 0.25, track: 0.2 });
      const base = { text: f.text, font, weight: 700, size: s, x: 0, y: 0, fill: false, plain: true, alpha: on, delay: dly(env, 0.05) };
      const bb = L.mainDraw(env, Object.assign({}, base, { color: tc, stroke: Math.max(u * 2, s * 0.075), strokeColor: tc, shadow: { color: tc, blur: glow } }));
      L.mainDraw(env, Object.assign({}, base, { color: L.mix(tc, '#fff', 0.75), stroke: Math.max(1, s * 0.026), strokeColor: L.mix(tc, '#fff', 0.75), ghost: false }));
      return bb;
    });
  },
}, P);

L.register('layout', 'c_marquee', {
  name: '電球看板', tags: ['pop', 'graphic', 'emotional'], w: 1, treat: 'safe', emph: 1.3,
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['accent2', 'dark', 'accent']), chase: rng.pick(['chase', 'alt', 'wave']), hdr: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = L.roleFont(env, 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.66 : 0.62), H * (env.portrait ? 0.26 : 0.32), { rows: 3, max: mn * 0.18 });
    const s = f.size, bw = f.w + s * 1.7, bh = f.h + s * 1.4;
    const board = colOf(sc, Q.col || 'accent2'), oc = L.onColor(board);
    const bulb = L.mix(sc.dark ? sc.accent : L.mix(sc.accent, '#fff', 0.3), '#fff', 0.55);
    const m = mo(env, 'pop', { dIn: 0.35, exit: 'shrink' });
    const k = kit(env, m.a);
    const lt = env.lt, e = clamp((lt - 0.12) / 0.55);
    const beat = env.beat && env.beat.since < 0.09;
    const sp = Math.max(u * 22, s * 0.4), br = sp * 0.2;
    const pts = perim(bw - s * 0.6, bh - s * 0.6, sp, 110);
    const lit = i => {
      if (i / pts.length > e) return false;
      if (beat) return true;
      if (Q.chase === 'alt') return (i + Math.floor(lt * 4)) % 2 === 0;
      if (Q.chase === 'wave') return Math.sin(i * 0.55 - lt * 7) > -0.2;
      return (i + Math.floor(lt * 12)) % 3 !== 0;
    };
    return frame(env, W / 2, H / 2 + (Q.hdr ? s * 0.25 : 0), 0, m, () => {
      k.shadow(-bw / 2, -bh / 2, bw, bh, s * 0.25, 0.35);
      k.rr(-bw / 2, -bh / 2, bw, bh, s * 0.25, board, 1, true, edgeOf(sc, board), u * 2);
      k.rr(-bw / 2 + s * 0.12, -bh / 2 + s * 0.12, bw - s * 0.24, bh - s * 0.24, s * 0.18, null, 1, false, L.mix(board, oc, 0.35), Math.max(u, s * 0.03));
      if (Q.hdr) {
        const hw = Math.max(s * 2.8, bw * 0.3), hh = s * 0.7;
        k.rr(-hw / 2, -bh / 2 - hh * 0.8, hw, hh, hh * 0.3, board, 1, false, L.mix(board, oc, 0.35), Math.max(u, s * 0.03));
        lab(k, 'LIVE', 0, -bh / 2 - hh * 0.8 + hh / 2, hh * 0.52, oc, { weight: 700, track: 0.3 });
      }
      const dim = L.mix(board, '#000', 0.35);
      pts.forEach(([x, y], i) => {
        if (lit(i)) { k.circ(x, y, br * 2.2, bulb, null, 2, 0.22); k.circ(x, y, br, L.mix(bulb, '#fff', 0.6)); }
        else k.circ(x, y, br * 0.85, dim, L.mix(board, '#fff', 0.2), Math.max(1, u));
      });
      return L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: 0, color: oc, delay: dly(env, 0.2) });
    });
  },
}, P);

function holeTile(p, col) {
  const key = p + '|' + col;
  let c = TILE.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = p;
    const g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, p, p);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(p / 2, p / 2, p * 0.42, 0, TAU); g.fill();
    cap(TILE, 60); TILE.set(key, c);
  }
  return c;
}
/* 画面(ix,iy,iw,ih)に LED の穴あきマスクを掛ける */
function ledMask(env, k, ix, iy, iw, ih, p, col) {
  if (!k.main) return;
  const ctx = env.ctx;
  ctx.save(); ctx.globalAlpha = k.A; ctx.translate(ix, iy);
  ctx.fillStyle = ctx.createPattern(holeTile(p, col), 'repeat');
  ctx.fillRect(0, 0, iw, ih);
  ctx.restore();
}

L.register('layout', 'c_led', {
  name: 'LED電光板', tags: ['cyber', 'dark', 'glitch'], w: 1.1, treat: false,
  fits: n => n >= 1,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), ticker: rng.chance(0.7) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const mn = Math.min(W, H), font = DOT;
    const f = fit(cut.text, font, W * (env.portrait ? 0.8 : 0.76), H * (env.portrait ? 0.24 : 0.32), { rows: 3, weight: 400, max: mn * 0.2 });
    const s = f.size, p = Math.max(2, Math.round(s / 8));
    const iw = Math.min(W * 0.88, Math.ceil((f.w + s * 0.8) / p) * p), ih = Math.ceil((f.h + s * 0.5) / p) * p;
    const tk = Q.ticker ? Math.ceil(s * 0.55 / p) * p : 0, gap = tk ? s * 0.22 : 0;
    const bz = s * 0.28, bw = iw + bz * 2, bh = ih + tk + gap + bz * 2;
    const casing = L.mix('#000', sc.bg, 0.1), screen = L.mix('#000', sc.bg, 0.04);
    const led = L.mix(L.fitContrast(colOf(sc, Q.col || 'accent'), casing, 5), '#fff', 0.22);
    const unlit = L.mix(screen, led, 0.13);
    const m = mo(env, 'down', { dist: 0.35, dIn: 0.35, exit: 'up' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -bw / 2, y0 = -bh / 2, ix = x0 + bz, iy = y0 + bz;
      k.shadow(x0, y0, bw, bh, bz * 0.5, 0.35);
      k.rr(x0, y0, bw, bh, bz * 0.5, casing, 1, false, L.mix(casing, '#fff', 0.2), u * 2);
      k.rect(ix, iy, iw, ih, unlit);
      if (tk) k.rect(ix, iy + ih + gap, iw, tk, unlit);
      const ctx = env.ctx;
      ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
      const bb = L.mainDraw(env, { text: f.text, font, weight: 400, size: s, x: 0, y: iy + ih / 2, color: led, shadow: { color: led, blur: s * 0.12 }, delay: dly(env, 0.15) });
      ctx.restore();
      if (tk) {
        const tt = `LINE ${pad2(cut.idx + 1)} ・ ${mmss(cut.start)} ・ LYRIC ・ `, ts = tk * 0.8, tw = txtW(tt, font, ts, 400, 0);
        const off = (env.lt * s * 1.6) % tw;
        k.clip(c => c.rect(ix, iy + ih + gap, iw, tk), () => { for (let x = ix - off; x < ix + iw; x += tw) lab(k, tt, x, iy + ih + gap + tk / 2, ts, L.mix(led, screen, 0.25), { anchor: 'l', font, weight: 400, track: 0 }); });
      }
      ledMask(env, k, ix, iy, iw, ih + gap + tk, p, casing);
      ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
      L.mainDraw(env, { text: f.text, font, weight: 400, size: s, x: 0, y: iy + ih / 2, color: led, alpha: 0.16, blend: 'lighter', ghost: false, plain: true, shadow: { color: led, blur: s * 0.35 }, delay: dly(env, 0.15) });
      ctx.restore();
      for (let i = 0; i < 3; i++) k.circ(bw / 2 - bz * (0.6 + i * 0.7), y0 + bz * 0.5, bz * 0.16, i === 0 ? led : L.mix(casing, '#fff', 0.2), null, 2, i === 0 ? (env.step % 12 < 7 ? 1 : 0.3) : 1);
      return bb;
    });
  },
}, P);

L.register('layout', 'c_billboard', {
  name: 'ビルボード', tags: ['graphic', 'editorial', 'pop'], w: 1, treat: 'safe', portrait: 0.8, emph: 1.2,
  fits: n => n >= 1,
  plan: rng => ({ frame: rng.pick(['accent2', 'accent']), face: rng.pick(['paper', 'paper', 'fg']), lamps: rng.int(2, 3) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    const pt = env.portrait;
    const bw = pt ? W * 0.88 : W * 0.72, bh = pt ? Math.min(bw * 0.62, H * 0.32) : Math.min(bw * 0.44, H * 0.5);
    const cy = H * (pt ? 0.42 : 0.42);
    const fc = colOf(sc, Q.frame || 'accent2'), face = Q.face === 'fg' ? sc.fg : L.mix(sc.paper, '#fff', 0.4);
    const oc = L.onColor(face), bd = Math.max(u * 6, bw * 0.018);
    const f = fit(cut.text, font, bw * 0.84, bh * 0.7, { rows: 3, max: bh * 0.5 });
    const m = mo(env, 'up', { dist: 0.7, dIn: 0.5, exit: 'down' });
    const k = kit(env, m.a);
    const lampOn = clamp((env.lt - 0.45) / 0.25) * (L.r(cut.seed, 'lf', env.step) < 0.97 ? 1 : 0.4);
    const post = L.mix(sc.sub, '#000', 0.4);
    return frame(env, W / 2, cy, 0, m, () => {
      const x0 = -bw / 2, y0 = -bh / 2;
      for (const s of [-1, 1]) k.rect(s * bw * 0.28 - bw * 0.018, bh / 2, bw * 0.036, H, post);
      k.rect(x0 - bw * 0.01, bh / 2 + bh * 0.06, bw * 1.02, Math.max(u * 3, bh * 0.025), post);
      k.line([[x0 - bw * 0.01, bh / 2 + bh * 0.02], [bw / 2 + bw * 0.01, bh / 2 + bh * 0.02]], post, Math.max(1, u * 2));
      for (let i = 0; i <= 12; i++) { const x = x0 + bw * i / 12; k.line([[x, bh / 2 + bh * 0.02], [x, bh / 2 + bh * 0.07]], post, Math.max(1, u * 1.5)); }
      k.shadow(x0, y0, bw, bh, 0, 0.3);
      k.rect(x0 - bd, y0 - bd, bw + bd * 2, bh + bd * 2, fc, 1, true);
      k.rect(x0, y0, bw, bh, face);
      const nl = Q.lamps || 3;
      for (let i = 0; i < nl; i++) {
        const lx = x0 + bw * (i + 0.5) / nl, ly = y0 - bh * 0.18;
        k.line([[lx, y0 - bd], [lx, ly]], post, Math.max(1, u * 2));
        k.rr(lx - bw * 0.03, ly - bh * 0.03, bw * 0.06, bh * 0.05, u * 2, post);
        if (lampOn > 0 && k.main) {
          const ctx = env.ctx, g = ctx.createLinearGradient(0, ly, 0, y0 + bh * 0.8);
          g.addColorStop(0, L.rgba('#fff', 0.38)); g.addColorStop(1, L.rgba('#fff', 0));
          ctx.save(); ctx.globalAlpha = m.a * lampOn; ctx.fillStyle = g; ctx.beginPath();
          ctx.moveTo(lx - bw * 0.02, ly); ctx.lineTo(lx + bw * 0.02, ly); ctx.lineTo(lx + bw * 0.5 / nl + bw * 0.04, y0 + bh * 0.8); ctx.lineTo(lx - bw * 0.5 / nl - bw * 0.04, y0 + bh * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      lab(k, `LYRIC ${pad2(cut.idx + 1)}`, bw / 2 - bd * 0.3, bh / 2 + bd * 0.5, bd * 0.8, L.onColor(fc), { anchor: 'r', weight: 700, track: 0.2 });
      return L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: 0, color: oc, delay: dly(env, 0.35) });
    });
  },
}, P);

L.register('layout', 'c_roadsign', {
  name: '道路標識', tags: ['graphic', 'calm', 'editorial'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ col: rng.pick(['accent2', 'accent']), arrow: rng.pick(['up', 'right', 'ur']), exit: rng.int(1, 40), km: rng.pick(['0.5', '1.2', '2', '3.5', '8']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body');
    const sw = env.portrait ? W * 0.86 : W * 0.6;
    const f = fit(cut.text, font, sw * 0.76, H * (env.portrait ? 0.24 : 0.3), { rows: 3, max: Math.min(W, H) * 0.13 });
    const s = f.size, top = Math.max(s * 1.3, sw * 0.1), bot = Math.max(s * 0.8, sw * 0.07);
    const sh = f.h + top + bot + s * 0.5;
    const col = colOf(sc, Q.col || 'accent2'), oc = L.onColor(col);
    const m = mo(env, 'flipX', { dIn: 0.45, exit: 'shrink' });
    const k = kit(env, m.a);
    const post = L.mix(sc.sub, '#000', 0.35);
    return frame(env, W / 2, H / 2 - sh * 0.05, 0, m, () => {
      const x0 = -sw / 2, y0 = -sh / 2;
      for (const s2 of [-1, 1]) k.rect(s2 * sw * 0.3 - sw * 0.013, sh / 2, sw * 0.026, H, post);
      k.shadow(x0, y0, sw, sh, s * 0.3, 0.3);
      const tw = Math.max(sw * 0.2, s * 2.4), th2 = top * 0.55;
      k.rr(sw / 2 - tw - sw * 0.06, y0 - th2 * 0.8, tw, th2, th2 * 0.2, col, 1, false, oc, Math.max(1, u * 2));
      lab(k, `EXIT ${Q.exit || 12}`, sw / 2 - tw / 2 - sw * 0.06, y0 - th2 * 0.8 + th2 / 2, th2 * 0.52, oc, { weight: 700, track: 0.12 });
      k.rr(x0, y0, sw, sh, s * 0.3, col, 1, true, edgeOf(sc, col), u * 1.5);
      const ins = Math.max(u * 4, s * 0.16);
      k.rr(x0 + ins, y0 + ins, sw - ins * 2, sh - ins * 2, s * 0.2, null, 1, false, oc, Math.max(u * 2, s * 0.05));
      const shs = top * 0.52, shx = x0 + ins * 2.2 + shs * 0.5, shy = y0 + top * 0.55;
      k.path(c => { c.moveTo(shx - shs * 0.5, shy - shs * 0.5); c.lineTo(shx + shs * 0.5, shy - shs * 0.5); c.lineTo(shx + shs * 0.5, shy + shs * 0.1); c.quadraticCurveTo(shx + shs * 0.45, shy + shs * 0.45, shx, shy + shs * 0.6); c.quadraticCurveTo(shx - shs * 0.45, shy + shs * 0.45, shx - shs * 0.5, shy + shs * 0.1); c.closePath(); }, oc);
      lab(k, String((cut.idx % 9) + 1), shx, shy, shs * 0.6, col, { weight: 700 });
      const ax = sw / 2 - ins * 2.2 - top * 0.3, ay = y0 + top * 0.55, as = top * 0.34;
      const arr = [[-0.18, 0.5], [-0.18, -0.05], [-0.5, -0.05], [0, -0.55], [0.5, -0.05], [0.18, -0.05], [0.18, 0.5]];
      const rot = Q.arrow === 'right' ? Math.PI / 2 : Q.arrow === 'ur' ? Math.PI / 4 : 0;
      k.poly(arr.map(([x, y]) => [ax + (x * Math.cos(rot) - y * Math.sin(rot)) * as * 2, ay + (x * Math.sin(rot) + y * Math.cos(rot)) * as * 2]), oc);
      lab(k, `${Q.km || '2'} km`, sw / 2 - ins * 2.2, sh / 2 - ins - bot * 0.5, bot * 0.5, oc, { anchor: 'r', weight: 600 });
      return L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: y0 + top + s * 0.1 + f.h / 2, color: oc, delay: dly(env, 0.3) });
    });
  },
}, P);

L.register('layout', 'c_station', {
  name: '駅名標', tags: ['calm', 'editorial', 'emotional'], w: 1, treat: 'safe',
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']), code: rng.pick(['A', 'B', 'C', 'K', 'M', 'T']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body');
    const bw = env.portrait ? W * 0.9 : W * 0.76;
    const f = fit(cut.text, font, bw * 0.6, H * (env.portrait ? 0.2 : 0.24), { rows: 2, max: Math.min(W, H) * 0.14 });
    const s = f.size;
    let rom = L.romaji(cut.text);
    if (!rom || rom.length > 34 || rom === String(cut.text).toUpperCase()) rom = L.hasLatinWords(cut.text) ? `STATION ${pad2(cut.idx + 1)}` : '— LYRIC STATION —';
    const rs = Math.max(u * 10, s * 0.26), sh = Math.max(s * 0.5, u * 26);
    const bh = s * 0.5 + f.h + rs * 2 + sh + s * 0.35;
    const board = L.mix(sc.paper, '#fff', 0.7), ink = sc.onPaper, lc = colOf(sc, Q.col || 'accent'), lo = L.onColor(lc);
    const m = mo(env, 'down', { dist: 0.4, dIn: 0.45, exit: 'up' });
    const k = kit(env, m.a);
    const g = E.outCubic(clamp((env.lt - 0.25) / 0.55));
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -bw / 2, y0 = -bh / 2;
      for (const s2 of [-1, 1]) k.line([[s2 * bw * 0.35, y0], [s2 * bw * 0.35, -H]], L.mix(sc.sub, '#000', 0.2), Math.max(u * 2, bw * 0.006));
      k.shadow(x0, y0, bw, bh, u * 4, 0.3);
      k.rr(x0, y0, bw, bh, u * 4, board, 1, false, edgeOf(sc, board) || L.mix(board, '#000', 0.15), u * 1.5);
      const ny = y0 + s * 0.45 + f.h / 2;
      const bs = Math.min(s * 1.1, bw * 0.12), bx = x0 + bw * 0.05;
      k.rr(bx, ny - bs / 2, bs, bs, bs * 0.18, '#fff', 1, false, lc, Math.max(u * 2, bs * 0.1));
      lab(k, Q.code || 'A', bx + bs / 2, ny - bs * 0.2, bs * 0.3, ink, { weight: 700 });
      lab(k, pad2(cut.idx + 1), bx + bs / 2, ny + bs * 0.18, bs * 0.38, ink, { weight: 700 });
      const bb = L.mainDraw(env, { text: f.text, font, size: s, x: 0, y: ny, color: ink, delay: dly(env, 0.3) });
      lab(k, rom, 0, ny + f.h / 2 + rs * 1.0, rs, ink, { weight: 500, alpha: 0.75, track: 0.2 });
      const sy = y0 + bh - sh - s * 0.3;
      if (g > 0) {
        k.rect(x0, sy, bw * g, sh, lc);
        k.circ(0, sy + sh / 2, sh * 0.62 * g, '#fff', lc, Math.max(u * 2, sh * 0.14));
        const pa = clamp((g - 0.6) / 0.4);
        const prv = pad2(cut.idx === 0 ? 1 : cut.idx), nxt = pad2(cut.idx + 2);
        k.poly([[x0 + bw * 0.03, sy + sh / 2], [x0 + bw * 0.03 + sh * 0.35, sy + sh * 0.2], [x0 + bw * 0.03 + sh * 0.35, sy + sh * 0.8]], lo, pa);
        lab(k, `${Q.code || 'A'} ${prv}`, x0 + bw * 0.03 + sh * 0.55, sy + sh / 2, sh * 0.5, lo, { anchor: 'l', weight: 700, alpha: pa });
        k.poly([[bw / 2 - bw * 0.03, sy + sh / 2], [bw / 2 - bw * 0.03 - sh * 0.35, sy + sh * 0.2], [bw / 2 - bw * 0.03 - sh * 0.35, sy + sh * 0.8]], lo, pa);
        lab(k, `${Q.code || 'A'} ${nxt}`, bw / 2 - bw * 0.03 - sh * 0.55, sy + sh / 2, sh * 0.5, lo, { anchor: 'r', weight: 700, alpha: pa });
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_flap', {
  name: 'フラップ案内板', tags: ['cyber', 'editorial', 'dark'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ col: rng.pick(['accent', 'accent2', 'white']), track: rng.int(1, 12), hh: rng.int(5, 23), mm: rng.int(0, 59) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body');
    const pw = env.portrait ? W * 0.92 : W * 0.8, tcw = pw * 0.18, trw = pw * 0.12, dw = pw - tcw - trw;
    const f = fit(cut.text, font, dw * 0.88, H * (env.portrait ? 0.2 : 0.24), { rows: 2, max: Math.min(W, H) * 0.12, track: 0.12 });
    const s = f.size, hr = Math.max(u * 22, s * 0.5), r1 = f.h + s * 0.55, r2 = Math.max(u * 30, s * 0.8);
    const ph = hr + r1 + r2 * 2 + s * 0.3;
    const panel = L.mix('#000', sc.bg, 0.1), tile = L.mix(panel, '#fff', 0.1);
    const amber = Q.col === 'white' ? '#fff' : L.mix(L.fitContrast(colOf(sc, Q.col || 'accent'), tile, 5), '#fff', 0.1);
    const lt = env.lt, latin = L.hasLatinWords(cut.text);
    const pool = latin ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ';
    const m = mo(env, 'zoom', { dIn: 0.3, exit: 'fade' });
    const k = kit(env, m.a);
    const x0 = -pw / 2, y0 = -ph / 2;
    const it = { text: f.text, font, size: s, track: 0.12, x: x0 + tcw + dw / 2, y: y0 + hr + r1 / 2 };
    const ms = meas(it), n = ms.lay.length;
    it.color = amber;
    it.delay = dly(env, 0.1);
    it.charFns = [(i, g) => {
      const ts = 0.18 + i * Math.min(0.05, 0.6 / Math.max(1, n));
      if (lt >= ts || g.space) return null;
      return { ch: pool[L.h(cut.seed, i, env.step) % pool.length], sy: 0.85 + 0.15 * Math.abs(Math.sin(env.step * 1.7 + i)) };
    }];
    const hh = ((Q.hh || 12) + cut.idx) % 24, mm = ((Q.mm || 0) + cut.idx * 7) % 60;
    return frame(env, W / 2, H / 2, 0, m, () => {
      k.shadow(x0, y0, pw, ph, u * 6, 0.35);
      k.rr(x0, y0, pw, ph, u * 6, panel, 1, false, L.mix(panel, '#fff', 0.2), u * 1.5);
      const hs = hr * 0.42, hc = L.mix(panel, '#fff', 0.55);
      lab(k, 'TIME', x0 + tcw / 2, y0 + hr * 0.55, hs, hc, { track: 0.3 });
      lab(k, 'FOR', x0 + tcw + dw / 2, y0 + hr * 0.55, hs, hc, { track: 0.3 });
      lab(k, 'TRACK', pw / 2 - trw / 2, y0 + hr * 0.55, hs, hc, { track: 0.3 });
      k.line([[x0 + pw * 0.02, y0 + hr], [pw / 2 - pw * 0.02, y0 + hr]], hc, Math.max(1, u), 0.4);
      for (const g of ms.lay) {
        if (g.space) continue;
        const gx = it.x + g.x, gy = it.y + g.y, tw2 = g.w + s * 0.1, th2 = s * 1.12;
        k.rr(gx - tw2 / 2, gy - th2 / 2, tw2, th2, s * 0.06, tile);
      }
      const bb = L.mainDraw(env, it);
      for (const g of ms.lay) { if (!g.space) k.rect(it.x + g.x - g.w / 2 - s * 0.05, it.y + g.y - Math.max(1, s * 0.012), g.w + s * 0.1, Math.max(1, s * 0.025), panel, 0.9); }
      const rowC = (y, h, a, b, c, al) => {
        const ta = Math.min(h * 0.5, r2 * 0.62, tcw * 0.78 * 100 / txtW(a, LAB, 100, 600, 0.08));
        const tc = Math.min(h * 0.5, r2 * 0.62, trw * 0.6 * 100 / txtW(c, LAB, 100, 600, 0.06));
        lab(k, a, x0 + tcw / 2, y + h / 2, ta, amber, { font: LAB, weight: 600, alpha: al, track: 0.08 });
        lab(k, b, x0 + tcw + dw * 0.04, y + h / 2, Math.min(h * 0.5, r2 * 0.5), amber, { anchor: 'l', font: LAB, weight: 500, alpha: al * 0.8, track: 0.15 });
        lab(k, c, pw / 2 - trw / 2, y + h / 2, tc, amber, { font: LAB, weight: 600, alpha: al });
      };
      rowC(y0 + hr, r1, `${pad2(hh)}:${pad2(mm)}`, '', String(Q.track || 3), 1);
      const ry = y0 + hr + r1;
      k.line([[x0 + pw * 0.02, ry], [pw / 2 - pw * 0.02, ry]], hc, Math.max(1, u), 0.25);
      rowC(ry + s * 0.1, r2, `${pad2(hh)}:${pad2((mm + 12) % 60)}`, 'LOCAL', String(((Q.track || 3) % 12) + 1), 0.45);
      rowC(ry + s * 0.1 + r2, r2, `${pad2((hh + 1) % 24)}:${pad2((mm + 3) % 60)}`, 'RAPID', String(((Q.track || 3) + 3) % 12 + 1), 0.3);
      return bb;
    });
  },
}, P);

/* ================================================================ 4. UI 模倣 */

L.register('layout', 'c_search', {
  name: '検索ボックス', tags: ['cyber', 'pop', 'calm'], w: 1, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ sug: rng.chance(0.8), mic: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = UI, mn = Math.min(W, H);
    const fw = env.portrait ? W * 0.9 : W * 0.7, ia = fw * 0.11, ma = Q.mic ? fw * 0.09 : fw * 0.04;
    const f = fit(cut.text, font, fw - ia - ma - fw * 0.02, H * 0.2, { rows: 2, weight: 700, max: mn * 0.09 });
    const s = f.size, fh = f.h + s * 1.0, fr = f.rows > 1 ? s * 0.7 : fh / 2;
    const field = '#fff', ink = L.onColor(field), grey = L.mix(ink, field, 0.55);
    const rowH = Math.max(u * 30, s * 1.1), nS = Q.sug ? 3 : 0;
    const totH = fh + (nS ? rowH * nS + s * 0.4 : 0);
    const m = mo(env, 'zoom', { dIn: 0.3, exit: 'up' });
    const k = kit(env, m.a);
    const lt = env.lt, it = { text: f.text, font, weight: 700, size: s, align: 'left' };
    const ms = meas(it), n = ms.lay.length;
    const t0 = 0.22, T = Math.min(0.75, 0.045 * n + 0.2);
    const typed = Math.floor(clamp((lt - t0) / T) * n + 1e-6);
    const x0 = -fw / 2, y0 = -totH / 2;
    return frame(env, W / 2, H * (env.portrait ? 0.44 : 0.45), 0, m, () => {
      k.shadow(x0, y0, fw, fh, fr, 0.28);
      k.rr(x0, y0, fw, fh, fr, field, 1, false, L.mix(ink, field, 0.82), u * 1.5);
      icon(k, 'search', x0 + ia * 0.5, y0 + fh / 2, Math.min(fh * 0.62, ia * 0.62), grey);
      if (Q.mic) { const mx = fw / 2 - ma * 0.5, my = y0 + fh / 2, ms2 = Math.min(fh * 0.3, ma * 0.4); k.rr(mx - ms2 * 0.25, my - ms2 * 0.6, ms2 * 0.5, ms2 * 0.8, ms2 * 0.25, sc.accent2 === field ? grey : L.fitContrast(sc.accent2, field, 3)); k.arc(mx, my - ms2 * 0.1, ms2 * 0.45, 20, 160, grey, Math.max(1, ms2 * 0.1)); k.line([[mx, my + ms2 * 0.35], [mx, my + ms2 * 0.55]], grey, Math.max(1, ms2 * 0.1)); }
      const tx = x0 + ia + ms.w / 2, ty = y0 + fh / 2;
      it.x = tx; it.y = ty; it.color = ink; it.delay = dly(env, 0.18);
      it.charFns = [i => (i >= typed ? { hide: true } : null)];
      const bb = L.mainDraw(env, it);
      const blink = typed < n || env.step % 14 < 8;
      if (blink && m.x >= 1) {
        const g = typed > 0 ? ms.lay[Math.min(typed, n) - 1] : null;
        const cx = tx + (g ? g.x + g.w / 2 + s * 0.06 : -ms.w / 2), cy = ty + (g ? g.y : ms.lay[0] ? ms.lay[0].y : 0);
        k.rect(cx, cy - s * 0.55, Math.max(u * 2, s * 0.06), s * 1.1, L.fitContrast(sc.accent, field, 3));
      }
      if (nS) {
        const e = E.outCubic(clamp((lt - t0 - T - 0.08) / 0.3));
        if (e > 0) {
          const dy = y0 + fh + s * 0.25, dh = rowH * nS * e;
          k.shadow(x0, dy, fw, dh, s * 0.3, 0.2);
          k.rr(x0, dy, fw, dh, s * 0.3, field, 1, false, L.mix(ink, field, 0.85), u);
          for (let i = 0; i < nS; i++) {
            const ry = dy + rowH * (i + 0.5);
            if (ry > dy + dh - rowH * 0.3) break;
            icon(k, 'search', x0 + ia * 0.5, ry, rowH * 0.42, grey, 0.8);
            k.rr(x0 + ia, ry - rowH * 0.12, fw * (0.28 + 0.4 * L.r(cut.seed, 'sg', i)), rowH * 0.24, rowH * 0.12, L.mix(ink, field, 0.82));
          }
        }
      }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_chat', {
  name: 'チャット', tags: ['pop', 'emotional', 'cyber'], w: 1, treat: 'safe', portrait: 1.3,
  fits: n => n >= 2,
  plan: rng => ({ col: rng.pick(['accent', 'accent2']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = UI, mn = Math.min(W, H);
    const pw = env.portrait ? W * 0.9 : Math.min(W * 0.8, H * 0.9 * 0.86), ph = env.portrait ? Math.min(H * 0.72, pw * 1.5) : H * 0.84;
    const panel = panelOf(sc, 0.07), pt = L.onColor(panel), psub = L.mix(pt, panel, 0.45);
    const hh = ph * 0.1, ib = ph * 0.09, aTop = -ph / 2 + hh, aBot = ph / 2 - ib;
    const chs = chunksOf(cut.text, 4), n = chs.length;
    let s = mn * 0.085;
    for (const c of chs) s = Math.min(s, L.fitSize(c, font, pw * 0.6, 1e6, { weight: 700 }));
    s = Math.min(s, (aBot - aTop) / (n + 1) / 2.3);
    const bh = s * 1.9, gy = s * 0.45;
    const bc = colOf(sc, Q.col || 'accent'), bo = L.onColor(bc), rc = L.mix(panel, pt, 0.12);
    const gap = clamp(cut.dur * 0.25 / n, 0.1, 0.3);
    const stg = cut.enterDef && cut.enterDef.stagger != null ? cut.enterDef.stagger : 0.07;
    const lt = env.lt;
    const items = [{ recv: true, t: 0.02 }].concat(chs.map((c, i) => ({ c, i, t: 0.15 + i * gap })));
    items.forEach(o => { o.e = E.outCubic(clamp((lt - o.t) / 0.28)); o.w = o.recv ? s * 3.4 : meas({ text: o.c, font, weight: 700, size: s }).w + s * 1.1; });
    let cur = aBot - s * 0.5;
    for (let j = items.length - 1; j >= 0; j--) { const o = items[j]; o.y = cur - bh / 2; cur -= (bh + gy) * o.e; }
    const m = mo(env, 'up', { dist: 0.25, dIn: 0.35, exit: 'down' });
    const k = kit(env, m.a);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -pw / 2, y0 = -ph / 2;
      k.shadow(x0, y0, pw, ph, pw * 0.04, 0.3);
      k.rr(x0, y0, pw, ph, pw * 0.04, panel, 1, false, L.mix(panel, pt, 0.15), u * 1.5);
      k.rect(x0, y0 + hh, pw, Math.max(1, u), pt, 0.12);
      k.line([[x0 + hh * 0.45, y0 + hh * 0.36], [x0 + hh * 0.3, y0 + hh * 0.5], [x0 + hh * 0.45, y0 + hh * 0.64]], pt, Math.max(1, hh * 0.05), 0.7);
      k.circ(x0 + hh * 0.95, y0 + hh / 2, hh * 0.3, colOf(sc, other(Q.col || 'accent')));
      lab(k, 'LYRIC', x0 + hh * 1.4, y0 + hh * 0.4, hh * 0.24, pt, { anchor: 'l', font: UI, weight: 700, track: 0.05 });
      lab(k, 'online', x0 + hh * 1.4, y0 + hh * 0.68, hh * 0.16, psub, { anchor: 'l', font: UI, weight: 500, track: 0 });
      k.rr(x0 + pw * 0.04, ph / 2 - ib * 0.78, pw * 0.76, ib * 0.56, ib * 0.28, null, 1, false, L.mix(panel, pt, 0.25), Math.max(1, u * 1.5));
      k.circ(pw / 2 - pw * 0.08, ph / 2 - ib * 0.5, ib * 0.28, bc);
      k.poly([[pw / 2 - pw * 0.08 - ib * 0.1, ph / 2 - ib * 0.62], [pw / 2 - pw * 0.08 + ib * 0.14, ph / 2 - ib * 0.5], [pw / 2 - pw * 0.08 - ib * 0.1, ph / 2 - ib * 0.38]], bo);
      let bb = null, last = null;
      for (const o of items) {
        const vis = clamp((o.y - aTop) / (bh * 0.8));
        if (o.e <= 0 || vis <= 0) continue;
        const pop = E.outBack(clamp((lt - o.t) / 0.28), 1.6);
        if (o.recv) {
          const bx = x0 + pw * 0.05;
          const kk = kit(env, m.a * clamp(o.e * 2) * vis);
          kk.rr(bx, o.y - bh / 2, o.w, bh, bh / 2, rc);
          for (let d = 0; d < 3; d++) kk.circ(bx + o.w * (0.3 + d * 0.2), o.y - Math.max(0, Math.sin(lt * 7 - d * 0.9)) * s * 0.2, s * 0.16, pt, null, 2, 0.55);
        } else {
          const bx = pw / 2 - pw * 0.05 - o.w;
          const kk = kit(env, m.a * clamp(o.e * 2));
          const w = o.w * Math.max(0.2, pop), xx = bx + o.w - w;
          kk.path(c => { const r = Math.min(bh / 2, w / 2); if (c.roundRect) c.roundRect(xx, o.y - bh / 2, w, bh, [r, r, r * 0.2, r]); else c.rect(xx, o.y - bh / 2, w, bh); }, bc);
          const b = L.mainDraw(env, { text: o.c, font, weight: 700, size: s, x: bx + o.w / 2, y: o.y, color: bo, mi: o.i, delay: Math.max(0, o.t + 0.06 - stg * o.i) });
          bb = L.unionBB(bb, b); last = o;
        }
      }
      if (last && lt > last.t + 0.35) lab(k, `Read ${mmss(cut.start + cut.idx)}`, pw / 2 - pw * 0.05 - last.w - s * 0.3, last.y + bh * 0.3, s * 0.42, psub, { anchor: 'r', font: UI, weight: 500, track: 0 });
      return bb;
    });
  },
}, P);

L.register('layout', 'c_notify', {
  name: '通知', tags: ['cyber', 'pop', 'calm'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ stack: rng.chance(0.7), col: rng.pick(['accent', 'accent2']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = UI, mn = Math.min(W, H);
    const cw = env.portrait ? W * 0.9 : wide(env) ? Math.min(W * 0.6, H * 1.15) : W * 0.84;
    const f = fit(cut.text, font, cw * 0.84, H * 0.26, { rows: 3, weight: 900, max: mn * 0.085 });
    const s = f.size, hs = Math.max(u * 12, cw * 0.028), pad = cw * 0.06;
    const ch = pad + hs * 2.2 + f.h + pad * 0.8, r = Math.min(cw * 0.05, ch * 0.3);
    const card = sc.dark ? L.mix(sc.bg, '#fff', 0.16) : L.mix(sc.bg, '#fff', 0.85), ct = L.onColor(card), csub = L.mix(ct, card, 0.45);
    const ic = colOf(sc, Q.col || 'accent');
    const m = mo(env, 'downBack', { dist: 0.5, dIn: 0.45, exit: 'up' });
    const k = kit(env, m.a);
    const cy = H * (env.portrait ? 0.34 : 0.38);
    return frame(env, W / 2, cy, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      if (Q.stack) {
        const sa = E.outCubic(clamp((env.lt - 0.3) / 0.3));
        for (let i = 2; i >= 1; i--) k.rr(x0 + cw * 0.04 * i, y0 + ch * 0.1 * i * sa, cw - cw * 0.08 * i, ch, r, card, (0.75 - i * 0.2) * sa, false, L.mix(card, ct, 0.1), u);
      }
      k.shadow(x0, y0, cw, ch, r, 0.3);
      k.rr(x0, y0, cw, ch, r, card, 0.97, false, L.mix(card, ct, 0.12), u);
      const iy = y0 + pad + hs * 0.5, isz = hs * 1.6;
      k.rr(x0 + pad, iy - isz / 2, isz, isz, isz * 0.24, ic);
      const io = L.onColor(ic);
      k.circ(x0 + pad + isz * 0.4, iy + isz * 0.18, isz * 0.14, io);
      k.rect(x0 + pad + isz * 0.5, iy - isz * 0.28, isz * 0.07, isz * 0.46, io);
      k.poly([[x0 + pad + isz * 0.53, iy - isz * 0.28], [x0 + pad + isz * 0.75, iy - isz * 0.18], [x0 + pad + isz * 0.53, iy - isz * 0.1]], io);
      lab(k, 'LYRIC', x0 + pad + isz * 1.35, iy, hs, csub, { anchor: 'l', font: UI, weight: 700, track: 0.08 });
      lab(k, 'now', cw / 2 - pad, iy, hs, csub, { anchor: 'r', font: UI, weight: 500, track: 0 });
      return L.mainDraw(env, { text: f.text, font, weight: 900, size: s, align: 'left', x: x0 + pad + f.w / 2, y: y0 + pad + hs * 2.2 + f.h / 2, color: ct, delay: dly(env, 0.25) });
    });
  },
}, P);

L.register('layout', 'c_player', {
  name: '音楽プレーヤー', tags: ['emotional', 'cyber', 'calm'], w: 1, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ art: rng.pick(['rings', 'bars', 'sun']), total: rng.int(150, 290) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body'), mn = Math.min(W, H), pt = env.portrait;
    const card = sc.dark ? L.mix(sc.bg, '#fff', 0.09) : L.mix(sc.bg, '#fff', 0.8), ct = L.onColor(card), csub = L.mix(ct, card, 0.45);
    let cw, ch, a, f, pad;
    if (pt || !wide(env)) {
      cw = pt ? W * 0.84 : Math.min(W * 0.84, H * 0.56); pad = cw * 0.07; a = cw - pad * 2;
      f = fit(cut.text, font, cw - pad * 2, H * 0.14, { rows: 2, max: mn * 0.1 });
      ch = pad + a + pad * 0.6 + f.h + pad * 3.6;
      if (ch > H * 0.88) { a = Math.max(cw * 0.4, a - (ch - H * 0.88)); ch = pad + a + pad * 0.6 + f.h + pad * 3.6; }
    } else {
      cw = Math.min(W * 0.72, H * 1.45); ch = cw * 0.38; pad = ch * 0.1; a = ch - pad * 2;
      f = fit(cut.text, font, cw - a - pad * 3, ch * 0.34, { rows: 2, max: mn * 0.1 });
    }
    const x0 = -cw / 2, y0 = -ch / 2;
    const m = mo(env, 'up', { dist: 0.3, dIn: 0.4, exit: 'down' });
    const k = kit(env, m.a);
    const prog = clamp(env.lt / Math.max(0.5, cut.dur));
    const total = Q.total || 215, now = (cut.start + env.lt) % total;
    return frame(env, W / 2, H / 2, 0, m, () => {
      k.shadow(x0, y0, cw, ch, pad * 0.6, 0.3);
      k.rr(x0, y0, cw, ch, pad * 0.6, card, 1, false, L.mix(card, ct, 0.12), u);
      const ax = x0 + pad, ay = y0 + pad;
      const ae = E.outBack(clamp((env.lt - 0.1) / 0.4), 1.4);
      k.clip(c => rrPath(c, ax + a * (1 - ae) / 2, ay + a * (1 - ae) / 2, a * ae, a * ae, pad * 0.4), () => {
        const ctx = env.ctx; ctx.globalAlpha = m.a;
        const g = ctx.createLinearGradient(ax, ay, ax + a, ay + a); g.addColorStop(0, sc.accent2); g.addColorStop(1, sc.accent);
        ctx.fillStyle = g; ctx.fillRect(ax, ay, a, a);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        if (Q.art === 'bars') { for (let i = 0; i < 9; i++) { const h = a * (0.15 + 0.6 * L.noise1(env.lt * 3 + i * 1.3, cut.seed) * (0.5 + env.energy)); ctx.globalAlpha = m.a * 0.7; ctx.fillRect(ax + a * (0.1 + i * 0.09), ay + a * 0.85 - h, a * 0.06, h); } }
        else if (Q.art === 'sun') { ctx.globalAlpha = m.a * 0.8; ctx.beginPath(); ctx.arc(ax + a / 2, ay + a * 0.62, a * 0.22, 0, TAU); ctx.fill(); ctx.globalAlpha = m.a * 0.35; ctx.fillRect(ax, ay + a * 0.7, a, a * 0.3); }
        else { ctx.lineWidth = a * 0.02; for (let i = 1; i <= 5; i++) { ctx.globalAlpha = m.a * (0.55 - i * 0.08); ctx.beginPath(); ctx.arc(ax + a / 2, ay + a / 2, a * 0.08 * i + (env.lt * a * 0.03) % (a * 0.08), 0, TAU); ctx.stroke(); } }
      });
      let ix, iw, ly0;
      if (pt || !wide(env)) { ix = x0 + pad; iw = cw - pad * 2; ly0 = ay + a + pad * 0.6; }
      else { ix = ax + a + pad; iw = cw - a - pad * 3; ly0 = y0 + pad * 1.9; }
      const vert = pt || !wide(env), ls = Math.max(u * 9, vert ? cw * 0.03 : ch * 0.055);
      if (!vert) lab(k, 'NOW PLAYING', ix, y0 + pad * 1.2, ls, csub, { anchor: 'l', weight: 600, track: 0.25 });
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, align: 'left', x: ix + f.w / 2, y: ly0 + f.h / 2, color: ct, delay: dly(env, 0.25) });
      let yy = ly0 + f.h + ls * 1.2;
      lab(k, `TRACK ${pad2(cut.idx + 1)} · SIDE A`, ix, yy, ls, csub, { anchor: 'l', weight: 500, track: 0.12 });
      yy += ls * 1.6;
      const bw = iw, bht = Math.max(u * 3, ls * 0.32);
      k.rr(ix, yy - bht / 2, bw, bht, bht / 2, L.mix(card, ct, 0.18));
      k.rr(ix, yy - bht / 2, bw * prog, bht, bht / 2, L.fitContrast(sc.accent, card, 2.5));
      k.circ(ix + bw * prog, yy, bht * 1.4, ct);
      yy += ls * 1.2;
      lab(k, mmss(now), ix, yy, ls * 0.85, csub, { anchor: 'l', weight: 500, track: 0.05 });
      lab(k, '-' + mmss(total - now), ix + bw, yy, ls * 0.85, csub, { anchor: 'r', weight: 500, track: 0.05 });
      const cs = ls * 1.6, ccx = ix + bw / 2, ccy = yy + cs * 0.9;
      icon(k, 'prev', ccx - cs * 2.2, ccy, cs * 0.8, ct);
      icon(k, 'pause', ccx, ccy, cs, ct);
      icon(k, 'next', ccx + cs * 2.2, ccy, cs * 0.8, ct);
      return bb;
    });
  },
}, P);

L.register('layout', 'c_loading', {
  name: 'ローディング', tags: ['cyber', 'glitch', 'pop'], w: 0.9,
  fits: n => n >= 1,
  plan: rng => ({ style: rng.pick(['blocks', 'bar']), word: rng.pick(['LOADING', 'NOW LOADING', 'BUFFERING']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display'), mn = Math.min(W, H);
    const f = fit(cut.text, font, W * 0.8, H * (env.portrait ? 0.3 : 0.36), { rows: 3, max: mn * 0.17 });
    const s = f.size, lt = env.lt;
    const T = Math.max(0.3, Math.min(0.8, cut.dur * 0.35));
    const prog = E.inOutSine(clamp((lt - 0.1) / T));
    const fg = L.fitContrast(sc.fg, sc.bg, 4.5), ac = L.fitContrast(sc.accent, sc.bg, 3);
    const bw = Math.max(Math.min(W * 0.62, Math.max(f.w, W * 0.36)), W * 0.3), bh = Math.max(u * 12, s * 0.14);
    const ly = H / 2 - bh * 2;
    const by = ly + f.h / 2 + s * 0.45;
    const ms = meas({ text: f.text, font, size: s }), n = ms.lay.length;
    const a = env.inOut(0.3);
    const k = kit(env, a);
    const bb = L.mainDraw(env, { text: f.text, font, size: s, x: W / 2, y: ly, color: fg, charFns: [i => { const q = (i + 0.5) / n; return q > prog ? { a: 0.14 } : (q > prog - 0.06 && prog < 1 ? { color: ac } : null); }] });
    const x0 = W / 2 - bw / 2;
    if (Q.style === 'blocks') {
      const nb = 20, gw = bw / nb;
      k.rr(x0 - bh * 0.3, by - bh * 0.3, bw + bh * 0.6, bh * 1.6, bh * 0.2, null, 1, false, fg, Math.max(1, u * 1.5));
      for (let i = 0; i < nb; i++) if ((i + 1) / nb <= prog + 0.001) k.rect(x0 + i * gw + gw * 0.12, by + bh * 0.05, gw * 0.76, bh * 0.9, ac);
    } else {
      k.rr(x0, by, bw, bh, bh / 2, L.mix(sc.bg, fg, 0.18));
      k.rr(x0, by, bw * prog, bh, bh / 2, ac);
      if (prog < 1 && k.main) { const sx = x0 + ((lt * 0.9) % 1) * bw * prog; k.rect(Math.max(x0, sx - bh), by, Math.min(bh * 2, x0 + bw * prog - Math.max(x0, sx - bh)), bh, '#fff', 0.3); }
    }
    const ls = Math.max(u * 11, bh * 1.1), ty = by + bh * 2.6;
    const done = prog >= 1;
    lab(k, done ? 'COMPLETE' : `${Q.word || 'LOADING'}${'...'.slice(0, 1 + (env.step >> 3) % 3)}`, x0 + ls * 1.4, ty, ls, fg, { anchor: 'l', weight: 500, track: 0.2 });
    lab(k, `${Math.round(prog * 100)}%`, x0 + bw, ty, ls, fg, { anchor: 'r', weight: 700, track: 0.05 });
    if (done) k.line([[x0 + ls * 0.1, ty], [x0 + ls * 0.4, ty + ls * 0.3], [x0 + ls * 0.9, ty - ls * 0.35]], ac, Math.max(u * 2, ls * 0.15));
    else k.arc(x0 + ls * 0.5, ty, ls * 0.38, lt * 400, lt * 400 + 270, ac, Math.max(u * 2, ls * 0.13));
    return bb;
  },
}, P);

L.register('layout', 'c_terminal', {
  name: 'ターミナル', tags: ['cyber', 'dark', 'glitch'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ cmd: rng.pick(['cat', 'echo', 'print', 'play']), pr: rng.pick(['$', '>', '%']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'mono'), mn = Math.min(W, H);
    const tw = env.portrait ? W * 0.9 : wide(env) ? W * 0.72 : W * 0.86;
    const f = fit(cut.text, font, tw * 0.78, H * (env.portrait ? 0.34 : 0.38), { rows: 4, weight: 400, max: mn * 0.1 });
    const s = f.size, ss = Math.max(u * 13, Math.min(s * 0.42, tw * 0.028)), tb = ss * 2.1, pad = ss * 1.4;
    const th = tb + pad + ss * 1.8 + f.h + ss * 0.8 + ss * 1.8 + pad * 0.7;
    const win = L.mix('#000', sc.bg, 0.12), bar = L.mix(win, '#fff', 0.09), tcol = L.mix('#fff', win, 0.15), dim = L.mix('#fff', win, 0.6);
    const lc = L.mix(L.fitContrast(sc.accent, win, 5), '#fff', 0.08);
    const m = mo(env, 'zoom', { dIn: 0.3, exit: 'shrink' });
    const k = kit(env, m.a);
    const lt = env.lt;
    const cmd = `${Q.pr || '$'} ${Q.cmd || 'cat'} line_${pad2(cut.idx + 1)}.txt`;
    const ct = Math.floor(clamp((lt - 0.12) / 0.35) * cmd.length);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -tw / 2, y0 = -th / 2;
      k.shadow(x0, y0, tw, th, ss * 0.6, 0.4);
      k.rr(x0, y0, tw, th, ss * 0.6, win, 1, false, L.mix(win, '#fff', 0.18), u * 1.5);
      k.rr(x0, y0, tw, tb, ss * 0.6, bar); k.rect(x0, y0 + tb * 0.5, tw, tb * 0.5, bar);
      [sc.accent, sc.accent2, sc.sub].forEach((c, i) => k.circ(x0 + ss * (1.1 + i * 1.3), y0 + tb / 2, ss * 0.42, c));
      lab(k, '~/lyric — sh', 0, y0 + tb / 2, ss * 0.8, dim, { font, weight: 400, track: 0 });
      const gx = x0 + pad, cx = gx + ss * 2.4;
      let y = y0 + tb + pad + ss * 0.6;
      lab(k, '1', gx, y, ss * 0.8, dim, { anchor: 'l', font, weight: 400, track: 0 });
      lab(k, cmd.slice(0, ct), cx, y, ss, tcol, { anchor: 'l', font, weight: 400, track: 0 });
      y += ss * 1.2;
      const lines = f.text.split('\n');
      const lh = f.h / lines.length;
      lines.forEach((_, i) => lab(k, String(i + 2), gx, y + lh * (i + 0.5), ss * 0.8, dim, { anchor: 'l', font, weight: 400, track: 0, alpha: lt > 0.5 ? 1 : 0 }));
      const bb = L.mainDraw(env, { text: f.text, font, weight: 400, size: s, align: 'left', x: cx + f.w / 2, y: y + f.h / 2, color: lc, delay: dly(env, 0.5) });
      y += f.h + ss * 1.2;
      const py = y;
      lab(k, String(lines.length + 2), gx, py, ss * 0.8, dim, { anchor: 'l', font, weight: 400, track: 0 });
      const pw2 = txtW((Q.pr || '$') + ' ', font, ss, 400, 0);
      lab(k, (Q.pr || '$') + ' ', cx, py, ss, tcol, { anchor: 'l', font, weight: 400, track: 0 });
      const caretOn = ct < cmd.length ? (lt > 0.12) : env.step % 14 < 8;
      if (caretOn) { const cxx = ct < cmd.length ? cx + txtW(cmd.slice(0, ct) || ' ', font, ss, 400, 0) : cx + pw2; k.rect(cxx, (ct < cmd.length ? y0 + tb + pad + ss * 0.6 : py) - ss * 0.55, ss * 0.6, ss * 1.1, tcol, 0.85); }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_post', {
  name: 'SNS投稿', tags: ['pop', 'emotional', 'cyber'], w: 1, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ likes: rng.int(12, 980), rp: rng.int(2, 120), rep: rng.int(0, 40) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body'), mn = Math.min(W, H);
    const cw = env.portrait ? W * 0.9 : wide(env) ? Math.min(W * 0.6, H * 1.25) : W * 0.8;
    const pad = cw * 0.06;
    const f = fit(cut.text, font, cw - pad * 2, H * (env.portrait ? 0.3 : 0.36), { rows: 4, max: mn * 0.09 });
    const hh = Math.max(u * 40, cw * 0.1), fh = Math.max(u * 30, cw * 0.075);
    const ch = pad + hh + pad * 0.5 + f.h + pad * 0.6 + fh + pad * 0.4;
    const card = sc.dark ? L.mix(sc.bg, '#fff', 0.07) : L.mix(sc.bg, '#fff', 0.85), ct = L.onColor(card), csub = L.mix(ct, card, 0.45);
    const m = mo(env, 'up', { dist: 0.3, dIn: 0.4, exit: 'up' });
    const k = kit(env, m.a);
    const lt = env.lt, likeT = Math.min(0.95, cut.dur * 0.4);
    const liked = lt > likeT, lp = E.outBack(clamp((lt - likeT) / 0.3), 3);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0, cw, ch, pad * 0.5, 0.28);
      k.rr(x0, y0, cw, ch, pad * 0.5, card, 1, false, L.mix(card, ct, 0.12), u);
      const ar = hh * 0.42, ax = x0 + pad + ar, ay = y0 + pad + hh / 2;
      if (k.main) { const ctx = env.ctx, g = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar); g.addColorStop(0, sc.accent); g.addColorStop(1, sc.accent2); ctx.save(); ctx.globalAlpha = m.a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ax, ay, ar, 0, TAU); ctx.fill(); ctx.restore(); }
      k.circ(ax, ay - ar * 0.2, ar * 0.32, '#fff', null, 2, 0.8);
      k.path(c => { c.arc(ax, ay + ar * 0.75, ar * 0.55, Math.PI, 0); c.closePath(); }, '#fff', null, 0, 0.8);
      lab(k, `USER ${pad2(cut.idx + 1)}`, ax + ar * 1.5, ay - hh * 0.16, hh * 0.3, ct, { anchor: 'l', font: UI, weight: 700, track: 0.02 });
      lab(k, `@user${pad2(cut.idx + 1)} · ${1 + (cut.idx % 9)}m`, ax + ar * 1.5, ay + hh * 0.2, hh * 0.24, csub, { anchor: 'l', font: UI, weight: 500, track: 0 });
      for (let d = 0; d < 3; d++) k.circ(cw / 2 - pad - d * hh * 0.16, ay, hh * 0.04, csub);
      const ty = y0 + pad + hh + pad * 0.5;
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, align: 'left', x: x0 + pad + f.w / 2, y: ty + f.h / 2, color: ct, delay: dly(env, 0.25) });
      const fy = ty + f.h + pad * 0.6 + fh / 2, is = fh * 0.5, sw2 = (cw - pad * 2) / 4;
      k.rect(x0 + pad, fy - fh * 0.75, cw - pad * 2, Math.max(1, u), ct, 0.1);
      const lw = Math.max(1, is * 0.1);
      const ix = i => x0 + pad + sw2 * i + is * 0.6;
      k.rr(ix(0) - is * 0.5, fy - is * 0.4, is, is * 0.75, is * 0.3, null, 1, false, csub, lw);
      k.line([[ix(1) - is * 0.45, fy - is * 0.1], [ix(1) - is * 0.45, fy - is * 0.35], [ix(1) + is * 0.35, fy - is * 0.35]], csub, lw);
      k.line([[ix(1) + is * 0.45, fy + is * 0.1], [ix(1) + is * 0.45, fy + is * 0.35], [ix(1) - is * 0.35, fy + is * 0.35]], csub, lw);
      const hc = L.fitContrast(sc.accent2, card, 3);
      const hp = scalePts(HEART, is * 0.55 * (liked ? Math.max(0.3, lp) : 1), ix(2), fy);
      if (liked) { k.poly(hp, hc); if (lt - likeT < 0.35) for (let r2 = 0; r2 < 6; r2++) { const a = r2 / 6 * TAU, q = (lt - likeT) / 0.35; k.circ(ix(2) + Math.cos(a) * is * (0.6 + q * 0.6), fy + Math.sin(a) * is * (0.6 + q * 0.6), is * 0.07 * (1 - q), hc); } }
      else k.path(polyPath(hp), null, csub, lw);
      k.line([[ix(3), fy + is * 0.15], [ix(3), fy - is * 0.45]], csub, lw);
      k.line([[ix(3) - is * 0.25, fy - is * 0.2], [ix(3), fy - is * 0.45], [ix(3) + is * 0.25, fy - is * 0.2]], csub, lw);
      k.line([[ix(3) - is * 0.4, fy], [ix(3) - is * 0.4, fy + is * 0.4], [ix(3) + is * 0.4, fy + is * 0.4], [ix(3) + is * 0.4, fy]], csub, lw);
      const cs = fh * 0.34;
      lab(k, String(Q.rep || 3), ix(0) + is * 0.8, fy, cs, csub, { anchor: 'l', font: UI, weight: 500, track: 0 });
      lab(k, String(Q.rp || 12), ix(1) + is * 0.8, fy, cs, csub, { anchor: 'l', font: UI, weight: 500, track: 0 });
      lab(k, fmtN((Q.likes || 99) + (liked ? 1 : 0)), ix(2) + is * 0.8, fy, cs, liked ? hc : csub, { anchor: 'l', font: UI, weight: 700, track: 0 });
      return bb;
    });
  },
}, P);

L.register('layout', 'c_video', {
  name: '動画プレーヤー', tags: ['cyber', 'emotional', 'dark'], w: 1, treat: 'safe', portrait: 0.7,
  fits: n => n >= 1,
  plan: rng => ({ total: rng.int(150, 290), hd: rng.pick(['HD', '4K', 'HQ']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'display');
    const vw = env.portrait ? W * 0.94 : Math.min(W * 0.8, H * 0.86 * 16 / 9), vh = vw * 9 / 16;
    const f = fit(cut.text, font, vw * 0.8, vh * 0.46, { rows: 3, max: vh * 0.26 });
    const v1 = L.mix(sc.accent2, '#000', 0.62), v2 = L.mix(sc.accent, '#000', 0.72);
    const m = mo(env, 'zoom', { dIn: 0.35, exit: 'shrink' });
    const k = kit(env, m.a);
    const lt = env.lt, total = Q.total || 225, now = (cut.start + lt) % total, prog = now / total;
    const cs = Math.max(u * 11, vh * 0.045);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -vw / 2, y0 = -vh / 2;
      k.shadow(x0, y0, vw, vh, vw * 0.012, 0.4);
      k.clip(c => rrPath(c, x0, y0, vw, vh, vw * 0.012), () => {
        const ctx = env.ctx; ctx.globalAlpha = m.a;
        const g = ctx.createLinearGradient(x0, y0, x0 + vw, y0 + vh); g.addColorStop(0, v1); g.addColorStop(1, v2);
        ctx.fillStyle = g; ctx.fillRect(x0, y0, vw, vh);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 7; i++) { ctx.globalAlpha = m.a * (0.05 + 0.08 * L.r(cut.seed, 'vb', i)); ctx.beginPath(); ctx.arc(x0 + vw * ((L.r(cut.seed, 'vx', i) + lt * 0.02 * (i % 3 + 1)) % 1), y0 + vh * L.r(cut.seed, 'vy', i), vh * (0.06 + 0.14 * L.r(cut.seed, 'vs', i)), 0, TAU); ctx.fill(); }
        const gg = ctx.createLinearGradient(0, vh / 2 - vh * 0.3, 0, vh / 2);
        gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.globalAlpha = m.a; ctx.fillStyle = gg; ctx.fillRect(x0, vh / 2 - vh * 0.3, vw, vh * 0.3);
      });
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: -vh * 0.06, color: '#fff', delay: dly(env, 0.3) });
      const tly = vh / 2 - cs * 2.9, tx0 = x0 + cs * 1.2, tw = vw - cs * 2.4, th = Math.max(u * 2, cs * 0.22);
      k.rect(tx0, tly - th / 2, tw, th, '#fff', 0.3);
      k.rect(tx0, tly - th / 2, tw * Math.min(1, prog + 0.18), th, '#fff', 0.35);
      k.rect(tx0, tly - th / 2, tw * prog, th, L.mix(sc.accent, '#fff', 0.1));
      k.circ(tx0 + tw * prog, tly, th * 2.2, L.mix(sc.accent, '#fff', 0.1));
      const iy = vh / 2 - cs * 1.35;
      icon(k, 'pause', tx0 + cs * 0.5, iy, cs * 1.1, '#fff');
      icon(k, 'next', tx0 + cs * 2.1, iy, cs, '#fff');
      icon(k, 'speaker', tx0 + cs * 3.7, iy, cs, '#fff');
      lab(k, `${mmss(now)} / ${mmss(total)}`, tx0 + cs * 4.8, iy, cs * 0.9, '#fff', { anchor: 'l', weight: 500, track: 0.05 });
      const fx = tx0 + tw - cs * 0.5, fs = cs * 0.45, lw = Math.max(1, cs * 0.12);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cy2 = iy + sy * fs; k.line([[fx + sx * fs, cy2 - sy * fs * 0.6], [fx + sx * fs, cy2], [fx + sx * fs - sx * fs * 0.6, cy2]], '#fff', lw); }
      const hw = txtW(Q.hd || 'HD', LAB, cs * 0.7, 700) + cs * 0.5;
      k.rr(fx - fs * 2.2 - hw, iy - cs * 0.45, hw, cs * 0.9, cs * 0.15, null, 1, false, '#fff', lw * 0.8);
      lab(k, Q.hd || 'HD', fx - fs * 2.2 - hw / 2, iy, cs * 0.7, '#fff', { weight: 700 });
      const pe = clamp(lt / 0.5);
      if (pe < 1) { const kp = kit(env, m.a * (1 - pe)), pr = vh * 0.12 * (1 + pe * 0.6); kp.circ(0, 0, pr, '#000', null, 2, 0.45); icon(kp, 'play', pr * 0.08, 0, pr * 0.9, '#fff'); }
      return bb;
    });
  },
}, P);

L.register('layout', 'c_lcd', {
  name: '電卓LCD', tags: ['cyber', 'pop', 'glitch'], w: 0.8, treat: 'safe',
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ body: rng.pick(['dark', 'accent2']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = DOT, pt = env.portrait;
    let bw, bh, lcdH, rowsK, colsK, keys;
    if (pt) {
      bw = W * 0.8; bh = Math.min(H * 0.8, bw * 1.5); lcdH = bh * 0.26; rowsK = 5; colsK = 4;
      keys = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '00', '.', '='];
    } else {
      bh = Math.min(H * 0.84, W * 0.56); bw = Math.min(W * 0.66, bh * 1.35); lcdH = bh * 0.36; rowsK = 4; colsK = 6;
      keys = ['MC', '7', '8', '9', '÷', 'AC', 'MR', '4', '5', '6', '×', '%', 'M−', '1', '2', '3', '−', '√', 'M+', '0', '.', '=', '+', '±'];
    }
    const body = Q.body === 'accent2' ? L.mix(sc.accent2, '#000', 0.5) : L.mix('#000', sc.bg, 0.2);
    const pad = bw * 0.06, sol = bh * 0.06;
    const lcdW = bw - pad * 2, lcd = L.mix(sc.paper, sc.accent, 0.12), lt2 = L.fitContrast(L.mix(sc.onPaper, sc.accent, 0.1), lcd, 6);
    const f = fit(cut.text, font, lcdW * 0.9, lcdH * 0.6, { rows: 2, weight: 400, max: lcdH * 0.5 });
    const m = mo(env, 'up', { dist: 0.35, dIn: 0.4, exit: 'down' });
    const k = kit(env, m.a);
    const it = { text: f.text, font, weight: 400, size: f.size, align: 'right' };
    const ms = meas(it), n = ms.lay.length;
    const T = Math.min(0.8, 0.05 * n + 0.2), typed = Math.floor(clamp((env.lt - 0.25) / T) * n + 1e-6);
    const typing = typed < n && env.lt > 0.25;
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -bw / 2, y0 = -bh / 2;
      k.shadow(x0, y0, bw, bh, bw * 0.05, 0.35);
      k.rr(x0, y0, bw, bh, bw * 0.05, body, 1, true, L.mix(body, '#fff', 0.2), u * 1.5);
      const sx0 = bw / 2 - pad - bw * 0.3;
      k.rect(sx0, y0 + pad * 0.5, bw * 0.3, sol, L.mix('#000', body, 0.4));
      for (let i = 1; i < 4; i++) k.rect(sx0 + bw * 0.075 * i, y0 + pad * 0.5, Math.max(1, u), sol, L.mix(body, '#fff', 0.15));
      lab(k, 'LYRIC', x0 + pad, y0 + pad * 0.5 + sol / 2, sol * 0.55, L.mix(body, '#fff', 0.55), { anchor: 'l', weight: 700, track: 0.3 });
      const ly = y0 + pad + sol;
      k.rr(x0 + pad, ly, lcdW, lcdH, pad * 0.3, L.mix(body, '#000', 0.3));
      k.rr(x0 + pad * 1.25, ly + pad * 0.25, lcdW - pad * 0.5, lcdH - pad * 0.5, pad * 0.2, lcd);
      lab(k, 'M', x0 + pad * 1.6, ly + pad * 0.5 + lcdH * 0.06, lcdH * 0.1, lt2, { anchor: 'l', font, weight: 400, alpha: 0.7, track: 0 });
      it.x = bw / 2 - pad * 1.6 - ms.w / 2; it.y = ly + lcdH / 2 + lcdH * 0.05; it.color = lt2; it.delay = dly(env, 0.2);
      it.charFns = [i => (i >= typed ? { hide: true } : null)];
      const bb = L.mainDraw(env, it);
      const ky0 = ly + lcdH + pad * 0.8, kh = (bh / 2 - pad - ky0) / rowsK, kw = lcdW / colsK;
      const hot = typing ? L.h(cut.seed, env.step >> 1) % keys.length : -1;
      keys.forEach((lb, i) => {
        const r = Math.floor(i / colsK), c = i % colsK;
        const kx = x0 + pad + c * kw + kw * 0.08, kyy = ky0 + r * kh + kh * 0.1;
        const isEq = lb === '=', kc = isEq ? sc.accent : L.mix(body, '#fff', i === hot ? 0.4 : 0.14);
        k.rr(kx, kyy, kw * 0.84, kh * 0.8, kh * 0.18, kc);
        lab(k, lb, kx + kw * 0.42, kyy + kh * 0.4, kh * 0.34, L.onColor(kc), { weight: 500, track: 0 });
      });
      return bb;
    });
  },
}, P);

L.register('layout', 'c_dialog', {
  name: 'ダイアログ', tags: ['cyber', 'glitch', 'calm'], w: 0.9, treat: 'safe',
  fits: n => n >= 1,
  plan: rng => ({ title: rng.pick(['MESSAGE', 'NOTICE', 'CONFIRM']), ic: rng.pick(['!', 'i', '?']) }),
  render(env) {
    const { W, H, cut, sc, u } = env, Q = cut.params || {};
    const font = L.roleFont(env, 'body'), mn = Math.min(W, H);
    const cw = env.portrait ? W * 0.84 : wide(env) ? Math.min(W * 0.5, H * 1.05) : W * 0.72;
    const pad = cw * 0.07;
    const f = fit(cut.text, font, cw - pad * 2, H * 0.3, { rows: 4, max: mn * 0.09 });
    const ir = Math.max(u * 18, cw * 0.06), ts = Math.max(u * 12, cw * 0.036), bh = Math.max(u * 40, cw * 0.12);
    const ch = pad + ir * 2 + ts * 2 + f.h + pad * 0.8 + bh;
    const card = sc.dark ? L.mix(sc.bg, '#fff', 0.12) : L.mix(sc.bg, '#fff', 0.88), ct = L.onColor(card), csub = L.mix(ct, card, 0.45);
    const ac = L.fitContrast(sc.accent, card, 3);
    const m = mo(env, 'zoom', { dIn: 0.28, exit: 'shrink' });
    const k = kit(env, m.a);
    const lt = env.lt;
    const scrim = env.inOut(0.25);
    if (env.pass === 'main') env.rect(0, 0, W, H, '#000', 0.2 * scrim, false);
    return frame(env, W / 2, H / 2, 0, m, () => {
      const x0 = -cw / 2, y0 = -ch / 2;
      k.shadow(x0, y0, cw, ch, pad * 0.5, 0.35);
      k.rr(x0, y0, cw, ch, pad * 0.5, card, 1, false, L.mix(card, ct, 0.12), u);
      const iy = y0 + pad + ir;
      k.circ(0, iy, ir, ac);
      lab(k, Q.ic || '!', 0, iy, ir * 1.1, L.onColor(ac), { font: UI, weight: 900, track: 0 });
      lab(k, Q.title || 'MESSAGE', 0, iy + ir + ts * 1.0, ts, csub, { font: UI, weight: 700, track: 0.25 });
      const ty = iy + ir + ts * 2 + f.h / 2;
      const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: 0, y: ty, color: ct, delay: dly(env, 0.2) });
      const by = ch / 2 - bh;
      k.rect(x0, by, cw, Math.max(1, u), ct, 0.15);
      k.rect(0, by, Math.max(1, u), bh, ct, 0.15);
      const cT = Math.min(1.5, cut.dur * 0.55), press = lt > cT && lt < cT + 0.2;
      if (press) k.rect(0, by, cw / 2, bh, ac, 0.25);
      lab(k, 'CANCEL', -cw / 4, by + bh / 2, bh * 0.3, csub, { font: UI, weight: 500, track: 0.1 });
      lab(k, 'OK', cw / 4, by + bh / 2, bh * 0.34, ac, { font: UI, weight: 900, track: 0.1 });
      const ce = E.inOutCubic(clamp((lt - (cT - 0.55)) / 0.5));
      if (ce > 0) {
        const px = L.lerp(cw * 0.55, cw / 4 + bh * 0.2, ce), py = L.lerp(ch * 0.62, by + bh * 0.55, ce), ps = bh * 0.55 * (press ? 0.88 : 1);
        const cur = [[0, 0], [0, 1], [0.28, 0.76], [0.46, 1.12], [0.6, 1.05], [0.42, 0.7], [0.78, 0.7]].map(([x, y]) => [px + x * ps, py + y * ps]);
        k.path(polyPath(cur), '#fff', '#000', Math.max(1, ps * 0.06), clamp(ce * 3));
      }
      return bb;
    });
  },
}, P);

})();
