/* LyricFlow 演出パック: p_layouts_b — 構図B（曲線/散らし/升目/縦組/巨大文字/テクスチャ/残像/分割）
   契約: docs/COMPOSE_PACKS.md  (group: layout) */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_layouts_b';
// L.register('<group>', '<key>', { name: '日本語名', tags: [...], w: 1, ... }, P);

/* ================================================================ 共通ヘルパ */
const TAU = Math.PI * 2;
const clamp = L.clamp;
const mn = env => Math.min(env.W, env.H);
const par = env => (env.cut && env.cut.params) || {};
const fontOf = (env, role) => L.roleFont(env, role || 'display');
const emOf = (font, ch) => (L.isSpace(ch) ? 0.34 : L.adv(font, 900, ch));
const acc = env => L.fitContrast(env.sc.accent, env.sc.bg, 3);
const acc2 = env => L.fitContrast(env.sc.accent2, env.sc.bg, 3);
const miOf = (k, n, span = 9) => (n <= span ? k : Math.floor(k * span / n));
const isLat = s => L.hasLatinWords(s);
const lw = (env, k = 2) => Math.max(1, env.u * k);
const emW = (text, font) => memo('emW|' + font + '|' + text, () => L.measure({ text, font, size: 100 }).w / 100);
const reg = (key, def) => L.register('layout', 'b_' + key, def, P);
const posMod = (a, b) => ((a % b) + b) % b;
/* 計算結果のメモ(描画は毎フレーム×3パス呼ばれるので、サイズ探索などは1回だけ) */
const MEMO = new Map();
const memo = (key, fn) => {
  let v = MEMO.get(key);
  if (v === undefined) { v = fn(); if (MEMO.size > 1500) MEMO.clear(); MEMO.set(key, v); }
  return v;
};
const CACHES = [MEMO];
// フォントが読み込まれたら字幅が変わるので、寸法のメモを捨てる
if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => CACHES.forEach(c => c.clear()));

/* 非空白字の通し番号 → 元の添字(強調 emphIdx は空白込みの添字) */
function nsIndex(text) { const out = []; L.glyphs(text).forEach((c, i) => { if (!L.isSpace(c)) out.push(i); }); return out; }
/* 1行分の字リスト {ch, space, em, i(元の添字)} */
function glist(text, font) { return memo('gl|' + font + '|' + text, () => glist0(text, font)); }
function glist0(text, font) {
  return L.glyphs(text).map((ch, i) => ({ ch, i, space: L.isSpace(ch), em: emOf(font, ch) }));
}
/* バランス改行した各行の字リスト(元の添字つき) */
function rowsOf(text, per, font) { return memo('ro|' + per + '|' + font + '|' + text, () => rowsOf0(text, per, font)); }
function rowsOf0(text, per, font) {
  const lines = L.splitLines(text, per);
  const ns = nsIndex(text);
  let k = 0;
  return lines.map(line => L.glyphs(line).map(ch => {
    const sp = L.isSpace(ch);
    const o = { ch, space: sp, em: emOf(font, ch), i: sp ? -1 : ns[k] };
    if (!sp) k++;
    return o;
  }));
}
/* 行数 1..maxRows を試して一番大きく収まる組み方 */
function fitLines(text, font, maxW, maxH, maxRows, max, o = {}) {
  return memo('fl|' + font + '|' + text + '|' + Math.round(maxW) + '|' + Math.round(maxH) + '|' + maxRows + '|' + Math.round(max) + '|' + (o.lead || 0) + '|' + (o.track || 0), () => fitLines0(text, font, maxW, maxH, maxRows, max, o));
}
function fitLines0(text, font, maxW, maxH, maxRows, max, o) {
  const n = Math.max(1, L.glyphCount(text));
  let best = null;
  for (let r = 1; r <= maxRows && r <= n; r++) {
    const lines = r === 1 ? [text] : L.splitLines(text, Math.ceil(n / r));
    const t = lines.join('\n');
    const size = L.fitSize(t, font, maxW, maxH, { lead: o.lead, track: o.track, max });
    if (!best || size > best.size * 1.1) best = { text: t, size, lines };
  }
  return best;
}
/* 字を個別の歌詞項目として描く(ずれ登場 mi つき) */
function drawGlyphs(env, arr, base) {
  let bb = null;
  const em = new Set(env.cut.emphIdx || []);
  const ac = base.color == null ? acc(env) : null;
  for (const g of arr) {
    if (g.space || !g.ch) continue;
    const it = Object.assign({}, base, { text: g.ch, x: g.x, y: g.y, mi: g.mi || 0 });
    if (g.a) it.rot = (base.rot || 0) + g.a;
    if (g.size) it.size = g.size;
    if (g.color) it.color = g.color;
    else if (ac && em.has(g.i)) it.color = ac;
    bb = L.unionBB(bb, L.mainDraw(env, it));
  }
  return bb;
}

/* ---- 曲線パス(折れ線近似) ---- */
function mkPath(fn, N = 80) {
  const pts = [], cum = [0];
  let len = 0;
  for (let i = 0; i <= N; i++) {
    const p = fn(i / N);
    pts.push(p);
    if (i) { len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); cum.push(len); }
  }
  return { pts, cum, len };
}
function pathAt(pa, s) {
  s = clamp(s, 0, pa.len);
  let lo = 0, hi = pa.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pa.cum[m] <= s) lo = m; else hi = m; }
  const a = pa.pts[lo], b = pa.pts[hi], d = (pa.cum[hi] - pa.cum[lo]) || 1e-6, f = (s - pa.cum[lo]) / d;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
const pathEm = (gl, track = 0.04) => gl.reduce((s, g) => s + g.em, 0) + track * Math.max(0, gl.length - 1);
/* 曲率(接線角の変化率) */
function kappaAt(pa, s, d) {
  let da = pathAt(pa, s + d).a - pathAt(pa, s - d).a;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  return da / (2 * d);
}
/* 字を順に進める。曲がりの内側で字が重ならないよう送りを曲率で広げる。out があれば位置を詰める */
function walk(pa, gl, size, track, s0, out) {
  let s = s0;
  const d = Math.max(1, size * 0.5);
  for (const g of gl) {
    const w = g.em * size;
    const k = Math.abs(kappaAt(pa, s + w / 2, d));
    const ww = w * clamp(1 / Math.max(0.38, 1 - k * size * 0.55), 1, 2.6);
    if (out) { const q = pathAt(pa, s + ww / 2); out.push(Object.assign({}, g, { x: q.x, y: q.y, a: q.a })); }
    s += ww + track * size;
  }
  return s - s0 - track * size;
}
/* パス上に字を並べる。fill=0.5 で中央寄せ、0 で始点から */
function layOnPath(pa, gl, size, track = 0.04, fill = 0.5) {
  const tot = walk(pa, gl, size, track, 0, null);
  const out = [];
  walk(pa, gl, size, track, Math.max(0, (pa.len - tot) * fill), out);
  return out;
}
/* パスに収まるまでサイズを縮める */
function fitPathSize(pa, gl, size, track = 0.04, room = 0.95) {
  for (let i = 0; i < 6; i++) {
    const t = walk(pa, gl, size, track, 0, null);
    if (t <= pa.len * room) break;
    size *= pa.len * room / t * 0.99;
  }
  return size;
}
/* 進行方向の右側(字の下側)へ d ずらした折れ線 */
function offsetPts(pa, d) {
  const P0 = pa.pts, n = P0.length;
  return P0.map((p, i) => {
    const a = P0[Math.max(0, i - 1)], b = P0[Math.min(n - 1, i + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return [p[0] - Math.sin(ang) * d, p[1] + Math.cos(ang) * d];
  });
}
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

/* 縦書き項目(欧文は横組みを90°回して縦に流す) */
function vItem(lines, font, maxW, maxH, o) {
  const text = lines.join('\n');
  if (!isLat(text)) {
    const size = L.fitSize(text, font, maxW, maxH, { vertical: true, lead: o.lead, max: o.max });
    return { text, font, size, vertical: true, valign: 'top', lead: o.lead };
  }
  const size = L.fitSize(text, font, maxH, maxW, { lead: o.lead, max: o.max });
  return { text, font, size, rot: Math.PI / 2, lead: o.lead, align: 'left' };
}
/* vItem の見た目の幅/高さ */
function vDims(it) { const m = L.measure(it); return it.rot ? { w: m.h, h: m.w, m } : { w: m.w, h: m.h, m }; }

const KANA_POOL = L.glyphs('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん');
const LAT_POOL = L.glyphs('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

/* ================================================================ 1. 曲線に乗る字 */
reg('wave', {
  name: '波乗り', tags: ['pop', 'emotional', 'graphic'], w: 1, fits: n => n >= 2 && n <= 30, portrait: 0.9,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), cyc: rng.pick([1, 1.25, 1.5]), ph: rng.range(0, TAU), amp: rng.range(0.65, 1), guide: rng.chance(0.75) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = rowsOf(cut.text, env.portrait ? 7 : 13, font);
    const nr = rows.length, bandH = H * 0.86 / nr;
    const x0 = W * 0.08, x1 = W * 0.92, cyc = p.cyc || 1;
    const A = Math.min(bandH * 0.2 * (p.amp || 0.8), 0.5 * (x1 - x0) / (TAU * cyc));   // 傾きは約27°まで
    const paths = rows.map((r, ri) => {
      const yc = H / 2 + (ri - (nr - 1) / 2) * bandH;
      return mkPath(t => [x0 + (x1 - x0) * t, yc + A * Math.sin(TAU * cyc * t + (p.ph || 0) + ri * 1.3)], 72);
    });
    const size = memo('wave|' + cut.text + '|' + W + '|' + H + '|' + font + '|' + A.toFixed(2) + '|' + (p.ph || 0).toFixed(3), () => {
      let sz = Math.min(mn(env) * 0.2, bandH * 0.4);
      rows.forEach((r, ri) => { sz = Math.min(sz, paths[ri].len * 0.94 / pathEm(r)); });
      rows.forEach((r, ri) => { sz = fitPathSize(paths[ri], r, sz); });
      return sz;
    });
    const e = env.inOut(0.6);
    if (p.guide) paths.forEach(pa => env.polyPartial(offsetPts(pa, size * 0.7), e, env.sc.sub, lw(env, 2), 0.5));
    let bb = null, k = 0;
    rows.forEach((r, ri) => {
      const g = layOnPath(paths[ri], r, size);
      g.forEach(q => { if (!q.space) q.mi = miOf(k++, cut.n); });
      bb = L.unionBB(bb, drawGlyphs(env, g, { font, size }));
    });
    return bb;
  },
});

const spiralCache = new Map();
CACHES.push(spiralCache);
reg('spiral', {
  name: '渦巻き', tags: ['pop', 'graphic', 'glitch'], w: 0.7, fits: n => n >= 8 && n <= 30, emph: 1.2,
  plan: rng => ({ role: rng.pick(['display', 'body']), st: rng.range(-0.4, 0.4), guide: rng.chance(0.7) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const gl = glist(cut.text, font);
    const M = mn(env), cx = W / 2, cy = H / 2, R = M * 0.45;
    const th0 = -Math.PI * 0.8 + (p.st || 0);
    const mk = (s, T) => {
      const g = s * 1.34, ro = R - s * 0.62;
      return mkPath(t => { const th = th0 + TAU * T * t, r = ro - g * T * t; return [cx + r * Math.cos(th), cy + r * Math.sin(th)]; }, Math.min(260, Math.ceil(48 * T) + 16));
    };
    const key = cut.text + '|' + W + '|' + H + '|' + font + '|' + th0.toFixed(3);
    let sol = spiralCache.get(key);
    if (!sol) {
      sol = { s: M * 0.04, T: 2 };
      for (let k = 0; k < 28; k++) {
        const s = M * (0.15 - k * 0.004);
        const ro = R - s * 0.62, ri = Math.max(s * 1.7, M * 0.08);
        const T = (ro - ri) / (s * 1.34);
        if (T < 0.6) continue;
        const pa = mk(s, T);
        const used = walk(pa, gl, s, 0.04, 0, null);
        if (used <= pa.len * 0.98 || k === 27) { sol = { s, T: Math.max(0.6, T * Math.min(1, used / pa.len + 0.02)) }; break; }
      }
      if (spiralCache.size > 120) spiralCache.clear();
      spiralCache.set(key, sol);
    }
    const size = sol.s;
    const pa = mk(size, sol.T);
    const e = env.inOut(0.7);
    if (p.guide) env.polyPartial(offsetPts(pa, size * 0.68), e, env.sc.sub, lw(env, 1.6), 0.45);
    env.circle(cx, cy, size * 0.16 * E.outBack(clamp(e)), acc(env), null, 0, e);
    const g = [];
    walk(pa, gl, size, 0.04, 0, g);
    let k = 0;
    g.forEach(q => { if (!q.space) q.mi = miOf(k++, cut.n); });
    return drawGlyphs(env, g, { font, size });
  },
});

reg('rainbow', {
  name: '虹アーチ', tags: ['pop', 'emotional', 'calm'], w: 0.9, fits: n => n >= 2 && n <= 18, portrait: 0.7,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), span: rng.range(125, 155), bands: rng.int(3, 5) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = rowsOf(cut.text, Math.max(env.portrait ? 6 : 10, Math.ceil(cut.n / 2)), font);
    const nr = rows.length, tr = 0.1;
    const spanDeg = p.span || 140, half = spanDeg * L.DEG / 2, sp = half * 2;
    // 横長は正円、縦長は縦に伸ばした楕円のアーチ(縦の余白を使う)
    const kY = env.portrait ? Math.min(1.8, H / W * 0.95) : 1;
    let rx = W * 0.42 / Math.sin(half);
    rx = Math.min(rx, H * 0.68 / ((1 - Math.cos(half) + 0.3) * kY));
    const ell = (r, cx, cy) => t => { const th = -Math.PI / 2 - half + sp * t; return [cx + r * Math.cos(th), cy + r * kY * Math.sin(th)]; };
    const step = s => s * 1.4;                             // 行間(弧の端=横方向で 1.4 字)
    const ok = s => rows.every((r, ri) => {
      const Ri = rx - ri * step(s);
      if (Ri < s * 1.6) return false;
      return mkPath(ell(Ri, 0, 0), 24).len * 0.92 >= pathEm(r, tr) * s / Math.max(0.4, 1 - s * 0.55 / Ri);
    });
    const size = memo('rb|' + cut.text + '|' + W + '|' + H + '|' + font + '|' + spanDeg.toFixed(2), () => {
      let sz = mn(env) * 0.14;
      for (let i = 0; i < 24 && !ok(sz); i++) sz *= 0.92;
      return sz;
    });
    const Rlast = rx - (nr - 1) * step(size);
    const topOff = rx * kY + size * 0.62, botOff = size * 0.62 - Rlast * kY * Math.cos(half);
    const cx = W / 2, cy = H / 2 + (topOff - botOff) / 2;
    // 虹の帯(文字の内側)。弧が伸びながら出る
    const nb = p.bands || 4, bw = size * 0.3;
    const cols = [sc.accent, sc.accent2, L.mix(sc.accent, sc.accent2, 0.5), sc.sub, sc.accent];
    for (let k = 0; k < nb; k++) {
      const r = Rlast - (size * 0.9 + bw * (k + 0.5));
      if (r < bw * 1.5) break;
      const ek = env.inOut(0.6, 0.06 * k);
      if (ek > 0.005) env.polyPartial(mkPath(ell(r, cx, cy), 48).pts, ek, cols[k % cols.length], bw * 0.86, 0.55);
    }
    let bb = null, k = 0;
    rows.forEach((r, ri) => {
      const pa = mkPath(ell(rx - ri * step(size), cx, cy), 64);
      const sz = memo('rbr|' + cut.text + '|' + W + '|' + H + '|' + font + '|' + spanDeg.toFixed(2) + '|' + ri, () => fitPathSize(pa, r, size, tr, 0.94));
      const g = layOnPath(pa, r, sz, tr);
      g.forEach(q => { if (!q.space) q.mi = miOf(k++, cut.n); });
      bb = L.unionBB(bb, drawGlyphs(env, g, { font, size: sz }));
    });
    return bb;
  },
});

reg('ribbon', {
  name: 'リボン帯', tags: ['pop', 'graphic', 'emotional'], w: 0.9, fits: n => n >= 2 && n <= 14, portrait: 0.6, treat: 'safe',
  plan: rng => ({ role: rng.pick(['display', 'body']), flip: rng.chance(0.5), stitch: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const gl = glist(cut.text, font);
    const c = env.portrait ? [[0.1, 0.6], [0.42, 0.24], [0.58, 0.76], [0.9, 0.4]] : [[0.09, 0.66], [0.38, 0.04], [0.62, 0.96], [0.91, 0.34]];
    const fy = y => (p.flip ? 1 - y : y);
    const pa = mkPath(t => [W * bez(c[0][0], c[1][0], c[2][0], c[3][0], t), H * fy(bez(c[0][1], c[1][1], c[2][1], c[3][1], t))], 90);
    const size = memo('rib|' + cut.text + '|' + W + '|' + H + '|' + font + '|' + !!p.flip, () => fitPathSize(pa, gl, Math.min(mn(env) * 0.12, pa.len * 0.84 / pathEm(gl)), 0.04, 0.86));
    const e = env.inOut(0.55);
    env.polyPartial(pa.pts, e, sc.accent, size * 1.5, 1);
    if (p.stitch && e > 0.01) {
      const d = [size * 0.16, size * 0.13];
      env.line(offsetPts(pa, size * 0.6), sc.onInk, lw(env, 1.4), 0.5 * e, false, d);
      env.line(offsetPts(pa, -size * 0.6), sc.onInk, lw(env, 1.4), 0.5 * e, false, d);
    }
    const g = layOnPath(pa, gl, size);
    let k = 0;
    g.forEach(q => { if (!q.space) q.mi = miOf(k++, cut.n); });
    return drawGlyphs(env, g, { font, size, color: sc.onInk });
  },
});

reg('smile', {
  name: '円弧スマイル', tags: ['pop', 'calm', 'emotional'], w: 0.8, fits: n => n >= 2 && n <= 12,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), span: rng.range(110, 150), face: rng.chance(0.35) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const gl = glist(cut.text, font);
    const half = (p.span || 130) * L.DEG / 2, sp = half * 2;
    const R = Math.min(W * 0.42 / Math.sin(half), H * 0.34, W * 0.4);
    const cx = W / 2, cy = H / 2 - mn(env) * 0.025;
    const pa = mkPath(t => { const th = Math.PI / 2 + half - sp * t; return [cx + R * Math.cos(th), cy + R * Math.sin(th)]; }, 64);
    const size = memo('sm|' + cut.text + '|' + W + '|' + H + '|' + font + '|' + sp.toFixed(3), () => fitPathSize(pa, gl, Math.min(mn(env) * 0.12, R * 0.3, R * sp * 0.88 / pathEm(gl)), 0.04, 0.9));
    const e = env.inOut(0.6);
    const ac = acc(env);
    const Rd = R + size * 0.8;
    env.circle(cx, cy, Rd * (0.9 + 0.1 * e), ac, null, 0, 0.1 * e);
    env.arc(cx, cy, Rd, 90, 90 + 360 * e, ac, lw(env, 2), 0.55);
    if (p.face) {
      const er = R * 0.045 * E.outBack(clamp(env.inOut(0.4, 0.2)));
      env.circle(cx - R * 0.32, cy - R * 0.2, er, ac, null, 0, e);
      env.circle(cx + R * 0.32, cy - R * 0.2, er, ac, null, 0, e);
    }
    const g = layOnPath(pa, gl, size);
    let k = 0;
    g.forEach(q => { if (!q.space) q.mi = miOf(k++, cut.n); });
    return drawGlyphs(env, g, { font, size });
  },
});

/* ================================================================ 2. 字ごとの散らし・大小 */
reg('mixSize', {
  name: '大小ミックス', tags: ['pop', 'editorial', 'graphic'], w: 1.1, fits: n => n >= 2 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif', 'body']), accentKana: rng.chance(0.45), align: rng.pick(['center', 'center', 'left']) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const gs = L.glyphs(cut.text);
    const lat = isLat(cut.text);
    const scl = gs.map((ch, i) => (L.isKanji(ch) ? 1 : L.isSmallKana(ch) ? 0.44 : L.isKata(ch) ? 0.8 : L.isHira(ch) ? 0.56
      : L.isLatin(ch) ? ((i === 0 || L.isSpace(gs[i - 1])) ? 1 : 0.62) : L.isPunct(ch) ? 0.46 : 0.7));
    if (!lat && !gs.some(ch => L.isKanji(ch) || L.isKata(ch))) {           // かなだけ → 句の頭を大きく
      const starts = new Set(); let k = 0;
      for (const c of L.chunks(cut.text)) { starts.add(k); k += L.glyphCount(c); }
      const ns = nsIndex(cut.text);
      ns.forEach((gi, ord) => { scl[gi] = starts.has(ord) ? 1 : 0.58; });
    }
    const rows = rowsOf(cut.text, env.portrait ? 6 : 11, font);
    const tr = 0.03;
    const rowEm = rows.map(r => r.reduce((s, g) => s + (g.space ? 0.3 : g.em * scl[g.i]), 0) + tr * Math.max(0, r.length - 1));
    const rowMax = rows.map(r => r.reduce((m, g) => Math.max(m, g.space ? 0 : scl[g.i]), 0.3));
    const totH = rowMax.reduce((s, v) => s + v * 1.08, 0);
    const S = Math.min(W * 0.88 / Math.max(...rowEm), H * 0.82 / totH, mn(env) * 0.34);
    const ac = acc(env);
    const blockW = Math.max(...rowEm) * S;
    let y = H / 2 - totH * S / 2, k = 0, bb = null;
    rows.forEach((r, ri) => {
      const rh = rowMax[ri] * 1.08 * S, bottom = y + rh - rh * 0.05;
      let x = p.align === 'left' ? W / 2 - blockW / 2 : W / 2 - rowEm[ri] * S / 2;
      const arr = r.map(g => {
        const s = g.space ? 0 : scl[g.i];
        const w = g.space ? 0.3 * S : g.em * s * S;
        const o = Object.assign({}, g, { x: x + w / 2, y: bottom - s * S * 0.5, size: Math.max(2, s * S) });
        if (!g.space) { o.mi = miOf(k++, cut.n); if (p.accentKana && (L.isHira(g.ch) || L.isSmallKana(g.ch))) o.color = ac; }
        x += w + tr * S;
        return o;
      });
      bb = L.unionBB(bb, drawGlyphs(env, arr, { font, size: S, color: undefined }));
      y += rh;
    });
    return bb;
  },
});

const scatterCache = new Map();
CACHES.push(scatterCache);
reg('scatter', {
  name: '散らし', tags: ['pop', 'graphic', 'glitch'], w: 0.9, fits: n => n >= 2 && n <= 20, portrait: 1.1,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body', 'serif']), rot: rng.range(0.6, 1), acc: rng.range(0.15, 0.3) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lat = isLat(cut.text);
    const ns = nsIndex(cut.text);
    const units = lat ? cut.text.split(/\s+/).filter(Boolean).map(t => ({ t, i: -1 })) : L.glyphs(cut.text).filter(c => !L.isSpace(c)).map((t, k) => ({ t, i: ns[k] }));
    const m = units.length;
    const nc = clamp(Math.round(Math.sqrt(m * W / H * 0.9)), 1, m), nr = Math.ceil(m / nc);
    const cw = W * 0.86 / nc, ch = H * 0.84 / nr;
    const ems = units.map(u => (lat ? emW(u.t, font) : emOf(font, u.t)));
    const base = lat ? Math.min(ch * 0.5, cw * 0.86 / Math.max(...ems)) : Math.min(cw, ch) * 0.6;
    const key = cut.text + '|' + W + '|' + H + '|' + cut.seed + '|' + font;
    let pl = scatterCache.get(key);
    if (!pl) {
      pl = [];
      const sd = cut.seed;
      for (let i = 0; i < m; i++) {
        const r = Math.floor(i / nc), c = i % nc, rowN = Math.min(nc, m - r * nc);
        const cx = W / 2 + (c - (rowN - 1) / 2) * cw, cy = H / 2 + (r - (nr - 1) / 2) * ch;
        let s = lat ? 0.85 + 0.3 * L.r(sd, 's', i) : 0.74 + 0.52 * L.r(sd, 's', i);
        let best = null;
        for (let t = 0; t < 12 && !best; t++) {
          const j = 0.26 * (1 - t / 12);
          const x = cx + L.rs(sd, 'x', i, t) * cw * j, y = cy + L.rs(sd, 'y', i, t) * ch * j;
          const hw = ems[i] * base * s * 0.55, hh = base * s * 0.58;
          const X = clamp(x, W * 0.06 + hw, W * 0.94 - hw), Y = clamp(y, H * 0.06 + hh, H * 0.94 - hh);
          if (pl.every(q => Math.abs(q.x - X) > q.hw + hw || Math.abs(q.y - Y) > q.hh + hh)) best = { x: X, y: Y, hw, hh };
        }
        if (!best) { s *= 0.8; best = { x: cx, y: cy, hw: ems[i] * base * s * 0.55, hh: base * s * 0.58 }; }
        best.s = s;
        best.rot = L.rs(sd, 'r', i) * (lat ? 0.1 : 0.3);
        best.ac = L.r(sd, 'c', i);
        pl.push(best);
      }
      if (scatterCache.size > 160) scatterCache.clear();
      scatterCache.set(key, pl);
    }
    const ac = acc(env);
    const arr = units.map((u, i) => ({ ch: u.t, i: u.i, x: pl[i].x, y: pl[i].y, a: pl[i].rot * (p.rot || 1), size: base * pl[i].s, mi: miOf(i, m), color: pl[i].ac < (p.acc || 0.2) ? ac : undefined }));
    return drawGlyphs(env, arr, { font, size: base });
  },
});

function mergeSteps(steps, maxN) {
  steps = steps.slice();
  while (steps.length > maxN) {
    let bi = 0, bs = 1e9;
    for (let i = 0; i < steps.length - 1; i++) { const s = L.glyphCount(steps[i]) + L.glyphCount(steps[i + 1]); if (s < bs) { bs = s; bi = i; } }
    const sep = isLat(steps[bi]) ? ' ' : '';
    steps.splice(bi, 2, steps[bi] + sep + steps[bi + 1]);
  }
  return steps;
}
reg('stairs', {
  name: '階段', tags: ['pop', 'graphic', 'editorial'], w: 0.9, fits: n => n >= 2 && n <= 20,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), up: rng.chance(0.4) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lat = isLat(cut.text);
    let steps;
    if (!lat && cut.n <= 7) steps = L.glyphs(cut.text).filter(c => !L.isSpace(c));
    else steps = mergeSteps(lat ? cut.text.split(/\s+/).filter(Boolean) : L.chunks(cut.text), env.portrait ? 7 : 6);
    const ns = steps.length, rise = 1.08;
    const w = steps.map(s => emW(s, font));
    const tryOv = ov => {
      const tw = w.reduce((s, v, j) => s + (j < ns - 1 ? v * ov : v), 0);
      const th = (ns - 1) * rise + 1.1;
      return { ov, tw, th, S: Math.min(W * 0.86 / tw, H * 0.82 / th, mn(env) * 0.26) };
    };
    const a = tryOv(1), b = tryOv(0.5);
    const g = a.S >= b.S * 0.78 ? a : b;
    const S = g.S;
    const x0 = W / 2 - g.tw * S / 2, y0 = H / 2 - g.th * S / 2;
    let xl = x0, bb = null;
    const line = lw(env, 2.4);
    steps.forEach((st, j) => {
      const y = y0 + (p.up ? ns - 1 - j : j) * rise * S + S * 0.55;
      const yb = y + S * 0.62;
      const ej = env.inOut(0.4, 0.06 * j);
      env.line([[xl, yb], [xl + w[j] * S * ej, yb]], sc.sub, line, 0.7);
      if (j < ns - 1) {
        const xn = xl + w[j] * S * g.ov;
        const yn = y0 + (p.up ? ns - 2 - j : j + 1) * rise * S + S * 0.55 + S * 0.62;
        const er = env.inOut(0.4, 0.06 * j + 0.08);
        env.line([[xn, yb], [xn, yb + (yn - yb) * er]], sc.sub, line, 0.7);
      }
      bb = L.unionBB(bb, L.mainDraw(env, { text: st, font, size: S, x: xl + w[j] * S / 2, y, mi: miOf(j, ns, 8) }));
      xl += w[j] * S * g.ov;
    });
    return bb;
  },
});

reg('zigzag', {
  name: 'ジグザグ', tags: ['pop', 'glitch', 'graphic'], w: 0.8, fits: n => n >= 3 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), amp: rng.range(0.28, 0.42), first: rng.sign(), tilt: rng.range(0.7, 1) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = rowsOf(cut.text, env.portrait ? 6 : 12, font);
    const amp = p.amp || 0.35, tr = 0.08;
    const rowUnit = 2 * (2 * amp + 0.62) + 0.3;
    const rowEm = rows.map(r => pathEm(r, tr));
    const S = Math.min(W * 0.86 / Math.max(...rowEm), H * 0.86 / (rows.length * rowUnit), mn(env) * 0.2);
    const e = env.inOut(0.5);
    const ac = acc(env);
    let bb = null, k = 0;
    rows.forEach((r, ri) => {
      const rowY = H / 2 + (ri - (rows.length - 1) / 2) * rowUnit * S;
      let x = W / 2 - rowEm[ri] * S / 2, sg = p.first || 1;
      const arr = [], top = [], bot = [];
      const c = (0.62 + amp) * S;
      r.forEach(g => {
        const w = g.em * S;
        if (!g.space) {
          const y = rowY + sg * amp * S;
          arr.push(Object.assign({}, g, { x: x + w / 2, y, a: sg * 0.13 * (p.tilt || 1), mi: miOf(k++, cut.n) }));
          top.push([x + w / 2, y - c]); bot.push([x + w / 2, y + c]);
          sg = -sg;
        }
        x += w + tr * S;
      });
      if (top.length > 1) {
        env.polyPartial(top, e, ac, lw(env, 2.4), 0.75);
        env.polyPartial(bot.slice().reverse(), e, ac, lw(env, 2.4), 0.75);
      }
      bb = L.unionBB(bb, drawGlyphs(env, arr, { font, size: S }));
    });
    return bb;
  },
});

reg('diagonal', {
  name: '斜め一列', tags: ['editorial', 'graphic', 'calm'], w: 0.9, fits: n => n >= 2 && n <= 14,
  plan: rng => ({ role: rng.pick(['display', 'serif', 'body']), rise: rng.chance(0.4), rule: rng.sign() }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const gl = glist(cut.text, font);
    const aw = W * 0.86, ah = H * 0.84;
    const ang = Math.atan2(ah, aw);
    const mx = Math.max(Math.cos(ang), Math.sin(ang));
    const ux = Math.cos(ang) / mx, uy = Math.sin(ang) / mx, K = 1.04;
    let steps = 0;
    gl.forEach((g, i) => { if (i) steps += (g.space || gl[i - 1].space) ? 0.5 : 1; });
    const size = Math.min(aw / (1 + steps * K * ux), ah / (1 + steps * K * uy), mn(env) * 0.24);
    const dx = ux * K * size, dy = uy * K * size * (p.rise ? -1 : 1);
    const sx = W / 2 - dx * steps / 2, sy = H / 2 - dy * steps / 2;
    let t = 0, k = 0;
    const arr = gl.map((g, i) => {
      if (i) t += (g.space || gl[i - 1].space) ? 0.5 : 1;
      const o = Object.assign({}, g, { x: sx + dx * t, y: sy + dy * t });
      if (!g.space) o.mi = miOf(k++, cut.n);
      return o;
    });
    // 平行な細い罫
    const e = env.inOut(0.6);
    const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, off = size * 0.78 * (p.rule || 1);
    const ex = dx / len * size * 0.2, ey = dy / len * size * 0.2;
    const a0 = [sx - ex + nx * off, sy - ey + ny * off], a1 = [sx + dx * steps + ex + nx * off, sy + dy * steps + ey + ny * off];
    env.polyPartial([a0, a1], e, acc(env), lw(env, 2.5), 0.8);
    return drawGlyphs(env, arr, { font, size });
  },
});

reg('bigFirst', {
  name: '頭文字特大', tags: ['editorial', 'graphic', 'calm'], w: 1, fits: n => n >= 2 && n <= 24, emph: 1.2,
  plan: rng => ({ role: rng.pick(['serif', 'display', 'serif']), acc: rng.chance(0.7), rows: rng.int(1, 3) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const src = cut.text.trim();
    let first, rest;
    if (isLat(src) && /\s/.test(src)) { const ws = src.split(/\s+/); first = ws[0]; rest = ws.slice(1).join(' '); }   // 欧文は頭の1語
    else { const gs = L.glyphs(src); first = gs[0]; rest = gs.slice(1).join('').trim(); }
    const big = { text: first, font, size: 10, color: p.acc ? acc(env) : sc.fg, mi: 0 };
    const e = env.inOut(0.5, 0.15);
    const fe = emW(first, font);
    if (!rest) { big.size = Math.min(H * 0.7, W * 0.8 / fe); big.x = W / 2; big.y = H / 2; return L.mainDraw(env, big); }
    const nRest = L.glyphCount(rest);
    let best = null;
    if (!env.portrait) {
      const B = Math.min(H * 0.62, W * 0.34 / fe);
      const gap = B * 0.14;
      const availW = W * 0.88 - B * fe - gap;
      for (let r = 1; r <= 3; r++) {
        const t = (r === 1 ? [rest] : L.splitLines(rest, Math.ceil(nRest / r))).join('\n');
        const s = L.fitSize(t, font, availW, B * 0.85, { max: B * 0.4 });
        if (!best || s > best.s * 1.06) best = { t, s };
      }
      const rm = L.measure({ text: best.t, font, size: best.s, align: 'left' });
      const totW = B * fe + gap + rm.w, x0 = W / 2 - totW / 2;
      big.size = B; big.x = x0 + B * fe / 2; big.y = H / 2;
      const rx = x0 + B * fe + gap;
      const ry = H / 2 + B * 0.44 - rm.h / 2;
      env.line([[rx - gap / 2, H / 2 - B * 0.42], [rx - gap / 2, H / 2 - B * 0.42 + B * 0.84 * e]], sc.sub, lw(env, 2), 0.6);
      return L.unionBB(L.mainDraw(env, big), L.mainDraw(env, { text: best.t, font, size: best.s, align: 'left', x: rx + rm.w / 2, y: ry, mi: 1 }));
    }
    const B = Math.min(W * 0.6 / fe, H * 0.34);
    for (let r = 1; r <= 3; r++) {
      const t = (r === 1 ? [rest] : L.splitLines(rest, Math.ceil(nRest / r))).join('\n');
      const s = L.fitSize(t, font, W * 0.86, H * 0.3, { max: B * 0.34 });
      if (!best || s > best.s * 1.06) best = { t, s };
    }
    const rm = L.measure({ text: best.t, font, size: best.s });
    const gap = B * 0.16, totH = B + gap + rm.h, y0 = H / 2 - totH / 2;
    big.size = B; big.x = W / 2; big.y = y0 + B / 2;
    const ly = y0 + B + gap / 2;
    env.line([[W / 2 - W * 0.3 * e, ly], [W / 2 + W * 0.3 * e, ly]], sc.sub, lw(env, 2), 0.6);
    return L.unionBB(L.mainDraw(env, big), L.mainDraw(env, { text: best.t, font, size: best.s, x: W / 2, y: y0 + B + gap + rm.h / 2, mi: 1 }));
  },
});

/* ================================================================ 3. 1マス1字 */
const perRow = (env, port, sq, land) => (env.portrait ? port : env.W / env.H < 1.35 ? sq : land);
/* マス目用の行: 欧文は語で折り、日本語はバランス改行。{ch, space, i} の配列の配列 */
function cellRows(text, per) { return memo('cr|' + per + '|' + text, () => cellRows0(text, per)); }
function cellRows0(text, per) {
  const src = String(text).trim();
  const ns = nsIndex(src);
  let k = 0;
  return L.splitLines(src, per).map(line => L.glyphs(line).map(ch => {
    const sp = L.isSpace(ch);
    const o = { ch, space: sp, i: sp ? -1 : ns[k] };
    if (!sp) k++;
    return o;
  }));
}

reg('masu', {
  name: '原稿用紙', tags: ['editorial', 'calm', 'wa'], w: 1, fits: n => n >= 1 && n <= 28,
  plan: (rng, cut) => ({ role: rng.pick(['serif', 'serif', 'body', 'display']), vert: cut.n <= 20 && !isLat(cut.text) && rng.chance(0.45) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = cellRows(cut.text, p.vert ? perRow(env, 10, 7, 6) : perRow(env, 6, 8, 12));
    const L0 = Math.max(...rows.map(r => r.length));
    const C = p.vert ? rows.length : L0, R = p.vert ? L0 : rows.length;
    const cs = Math.min(W * 0.88 / C, H * 0.8 / R, mn(env) * 0.24);
    const x0 = W / 2 - C * cs / 2, y0 = H / 2 - R * cs / 2;
    const col = acc(env), thin = lw(env, 1.6);
    for (let j = 0; j <= R; j++) {
      const ej = env.inOut(0.45, 0.03 * j);
      env.line([[x0, y0 + j * cs], [x0 + C * cs * ej, y0 + j * cs]], col, j === 0 || j === R ? thin * 1.8 : thin, 0.6);
    }
    for (let j = 0; j <= C; j++) {
      const ej = env.inOut(0.45, 0.03 * j + 0.05);
      env.line([[x0 + j * cs, y0], [x0 + j * cs, y0 + R * cs * ej]], col, j === 0 || j === C ? thin * 1.8 : thin, 0.6);
    }
    const arr = [];
    let k = 0;
    rows.forEach((row, ri) => row.forEach((g, gi) => {
      if (g.space) return;
      const c = p.vert ? C - 1 - ri : gi, r = p.vert ? gi : ri;
      arr.push(Object.assign({}, g, { x: x0 + (c + 0.5) * cs, y: y0 + (r + 0.5) * cs, mi: miOf(k++, cut.n) }));
    }));
    const lab = 'No.' + String((cut.idx || 0) + 1).padStart(2, '0');
    const ly = y0 + R * cs + cs * 0.22;
    if (ly < H * 0.965) env.text({ text: lab, font: fontOf(env, 'mono'), size: Math.max(6, cs * 0.18), x: x0 + C * cs - cs * 0.4, y: ly, color: sc.sub, alpha: env.inOut(0.5, 0.2), ghost: false });
    return drawGlyphs(env, arr, { font, size: cs * 0.66, vertical: !!p.vert });
  },
});

reg('tiles', {
  name: 'タイル', tags: ['pop', 'graphic', 'cyber'], w: 1, fits: n => n >= 1 && n <= 24, treat: 'safe',
  plan: rng => ({ role: rng.pick(['display', 'body', 'display']), mode: rng.pick(['ink', 'alt', 'paper']), loose: rng.chance(0.4) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = cellRows(cut.text, perRow(env, 5, 6, 10));
    const C = Math.max(...rows.map(r => r.length)), R = rows.length;
    const cs = Math.min(W * 0.88 / C, H * 0.84 / R, mn(env) * 0.26);
    const y0 = H / 2 - R * cs / 2;
    const tile = cs * 0.86, rr = tile * 0.16;
    let bb = null, k = 0;
    rows.forEach((row, ri) => row.forEach((g, gi) => {
      if (g.space) return;
      const cx = W / 2 + (gi - (row.length - 1) / 2) * cs;
      const cy = y0 + (ri + 0.5) * cs + (p.loose ? L.rs(cut.seed, 'ty', k) * cs * 0.07 : 0);
      const mode = p.mode === 'paper' && !sc.dark ? 'alt' : p.mode;      // 明るい地では紙タイルが地に溶けるので色タイルに
      const alt = mode === 'alt' && k % 2 === 1;
      const fill = mode === 'paper' ? sc.paper : alt ? sc.accent2 : sc.accent;
      const ink = mode === 'paper' ? sc.onPaper : alt ? sc.onAccent2 : sc.onInk;
      const ek = env.inOut(0.4, 0.035 * miOf(k, cut.n, 12));
      const s = E.outBack(clamp(ek)) * tile;
      if (s > 0.5) env.rrect(cx - s / 2, cy - s / 2, s, s, rr * s / tile, fill, clamp(ek * 1.5), false);
      bb = L.unionBB(bb, L.mainDraw(env, { text: g.ch, font, size: tile * 0.66, x: cx, y: cy, color: ink, mi: miOf(k, cut.n), rot: p.loose ? L.rs(cut.seed, 'tr', k) * 0.06 : 0 }));
      k++;
    }));
    return bb;
  },
});

reg('crossword', {
  name: 'クロスワード', tags: ['editorial', 'pop', 'graphic'], w: 0.7, fits: n => n >= 2 && n <= 24, treat: 'safe', busy: true,
  plan: rng => ({ role: rng.pick(['body', 'display', 'serif']), dens: rng.range(0.4, 0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = cellRows(cut.text, perRow(env, 6, 7, 10));
    const maxLen = Math.max(...rows.map(r => r.length));
    const C = maxLen + 2, R = rows.length * 2 + 1;
    const grid = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) {
        if (r % 2 === 1) {
          const g = rows[(r - 1) / 2][c - 1];
          row.push(!g || g.space ? { t: 'B' } : { t: 'L', g });
        } else {
          const k1 = r * C + c, k2 = (R - 1 - r) * C + (C - 1 - c);
          row.push({ t: L.r(cut.seed, 'cw', Math.min(k1, k2)) < (p.dens || 0.5) ? 'W' : 'B' });
        }
      }
      grid.push(row);
    }
    const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 'B' : grid[r][c].t);
    let num = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (at(r, c) === 'B') continue;
      const sa = at(r, c - 1) === 'B' && at(r, c + 1) !== 'B', sd = at(r - 1, c) === 'B' && at(r + 1, c) !== 'B';
      if (sa || sd) grid[r][c].n = ++num;
    }
    const cs = Math.min(W * 0.9 / C, H * 0.86 / R, mn(env) * 0.2);
    const x0 = W / 2 - C * cs / 2, y0 = H / 2 - R * cs / 2, gp = Math.max(1, cs * 0.035);
    const e0 = env.inOut(0.3);
    env.rect(x0 - gp, y0 - gp, C * cs + gp * 2, R * cs + gp * 2, sc.onPaper, e0, false);
    const nf = fontOf(env, 'body');
    const arr = [];
    let k = 0;
    for (let r = 0; r < R; r++) {
      const er = env.inOut(0.35, 0.04 * r);
      for (let c = 0; c < C; c++) {
        const cell = grid[r][c];
        if (cell.t === 'B') continue;
        const x = x0 + c * cs, y = y0 + r * cs;
        env.rect(x + gp, y + gp, cs - gp * 2, cs - gp * 2, sc.paper, er, false);
        if (cell.n) env.text({ text: String(cell.n), font: nf, weight: 700, size: cs * 0.2, x: x + cs * 0.17, y: y + cs * 0.17, color: sc.onPaper, alpha: er * 0.85, ghost: false });
        if (cell.t === 'L') arr.push(Object.assign({}, cell.g, { x: x + cs * 0.53, y: y + cs * 0.55, mi: miOf(k++, cut.n) }));
      }
    }
    return drawGlyphs(env, arr, { font, size: cs * 0.6, color: sc.onPaper });
  },
});

reg('wordSearch', {
  name: '文字探し', tags: ['pop', 'editorial', 'cyber'], w: 0.7, fits: n => n >= 2 && n <= 24, busy: true,
  plan: rng => ({ role: rng.pick(['body', 'display']), diag: rng.chance(0.5), off: rng.range(0, 1) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lat = isLat(cut.text);
    const segs0 = cellRows(cut.text, perRow(env, 7, 8, 11)).map(r => r.filter(g => !g.space));
    const nseg = segs0.length, segLen = Math.max(...segs0.map(s => s.length));
    const GC = Math.max(segLen + 2, perRow(env, 7, 9, 11));
    const GR = Math.max(nseg * 2 + 1, Math.round(GC * H / W * 0.92));
    const diag = p.diag && nseg === 1 && segLen >= 3 && segLen <= Math.min(GC, GR) - 1;
    const cs = Math.min(W * 0.9 / GC, H * 0.88 / GR);
    const x0 = W / 2 - GC * cs / 2, y0 = H / 2 - GR * cs / 2;
    const used = new Set(), place = [];
    const segs = segs0.map((sg, s) => {
      let r0, c0, dr = 0;
      if (diag) { dr = 1; r0 = Math.floor((GR - sg.length) / 2); c0 = Math.floor((GC - sg.length) * (0.25 + 0.5 * (p.off || 0))); }
      else { r0 = Math.min(GR - 1, Math.round((s + 1) * GR / (nseg + 1) - 0.5)); c0 = Math.floor(L.r(cut.seed, 'ws', s) * (GC - sg.length + 1)); }
      sg.forEach((g, j) => { const r = r0 + dr * j, c = c0 + j; used.add(r * GC + c); place.push(Object.assign({}, g, { x: x0 + (c + 0.5) * cs, y: y0 + (r + 0.5) * cs })); });
      return { r0, c0, dr, n: sg.length };
    });
    const e = env.inOut(0.45);
    if (env.pass === 'main' && e > 0.01) {
      const ctx = env.ctx, pool = lat ? LAT_POOL : KANA_POOL;
      ctx.save();
      ctx.font = L.fontStr({ font: fontOf(env, 'body'), weight: 500, size: cs * 0.5 });
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = sc.sub;
      for (let r = 0; r < GR; r++) {
        ctx.globalAlpha = 0.42 * env.inOut(0.45, 0.02 * r);
        for (let c = 0; c < GC; c++) {
          if (used.has(r * GC + c)) continue;
          ctx.fillText(pool[L.h(cut.seed, 'f', r, c) % pool.length], x0 + (c + 0.5) * cs, y0 + (r + 0.5) * cs);
        }
      }
      ctx.restore();
      // 囲みカプセル(伸びながら出る)
      const ac = acc(env);
      segs.forEach((sg, s) => {
        const es = env.inOut(0.5, 0.25 + 0.1 * s);
        if (es <= 0.01) return;
        const ax = x0 + (sg.c0 + 0.5) * cs, ay = y0 + (sg.r0 + 0.5) * cs;
        const bx = ax + (sg.n - 1) * cs, by = ay + sg.dr * (sg.n - 1) * cs;
        const L0 = Math.hypot(bx - ax, by - ay) + cs * 0.86, hh = cs * 0.84;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(by - ay, bx - ax));
        ctx.globalAlpha = 0.9 * es;
        ctx.strokeStyle = ac; ctx.lineWidth = Math.max(1, cs * 0.07);
        ctx.beginPath();
        const w = Math.max(hh, L0 * es), x = -cs * 0.43, y = -hh / 2;
        if (ctx.roundRect) ctx.roundRect(x, y, w, hh, hh / 2); else ctx.rect(x, y, w, hh);
        ctx.stroke();
        ctx.restore();
      });
    }
    let k = 0;
    place.forEach(q => { q.mi = miOf(k++, place.length); });
    return drawGlyphs(env, place, { font, size: cs * 0.58 });
  },
});

reg('checker', {
  name: '市松', tags: ['graphic', 'pop', 'wa'], w: 0.8, fits: n => n >= 2 && n <= 24, treat: false,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), ph: rng.int(0, 1) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rows = cellRows(cut.text, perRow(env, 4, 6, 8));
    const C = Math.max(...rows.map(r => r.length)), R = rows.length;
    const cs = Math.min(W * 0.88 / C, H * 0.84 / R, mn(env) * 0.24);
    const x0 = W / 2 - C * cs / 2, y0 = H / 2 - R * cs / 2;
    const e = env.inOut(0.4);
    env.rrect(x0, y0, C * cs, R * cs, 0, null, e * 0.8, false, acc(env), lw(env, 2));
    const arr = [];
    let k = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const cx = x0 + (c + 0.5) * cs, cy = y0 + (r + 0.5) * cs;
      const filled = (r + c + (p.ph || 0)) % 2 === 0;
      if (filled) {
        const s = cs * env.inOut(0.35, 0.03 * (r * C + c));
        env.rect(cx - s / 2, cy - s / 2, s, s, sc.accent, 1, false);
      }
      const g = rows[r][c];
      if (g && !g.space) arr.push(Object.assign({}, g, { x: cx, y: cy, color: filled ? sc.onInk : sc.fg, mi: miOf(k++, cut.n) }));
    }
    return drawGlyphs(env, arr, { font, size: cs * 0.62 });
  },
});

/* ================================================================ 4. 縦組み */
reg('tateCols', {
  name: '縦組み多段', tags: ['editorial', 'calm', 'wa', 'emotional'], w: 1, fits: n => n >= 4 && n <= 30, portrait: 1.2,
  plan: rng => ({ role: rng.pick(['serif', 'serif', 'display', 'body']), frame: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lines = L.splitLines(cut.text, env.portrait ? 9 : 6);
    const lead = 1.8;
    const it = vItem(lines, font, W * 0.84, H * 0.8, { lead, max: mn(env) * 0.2 });
    it.x = W / 2; it.y = H / 2;
    const d = vDims(it);
    const pitch = it.size * lead, nc = lines.length;
    const yt = H / 2 - d.h / 2 - it.size * 0.35, yb = H / 2 + d.h / 2 + it.size * 0.35;
    for (let j = 0; j <= nc; j++) {
      const edge = j === 0 || j === nc;
      if (edge && !p.frame) continue;
      const x = W / 2 + d.w / 2 - pitch * j;
      const ej = env.inOut(0.5, 0.05 * j);
      env.line([[x, yt], [x, yt + (yb - yt) * ej]], edge ? acc(env) : sc.sub, lw(env, edge ? 2.4 : 1.4), edge ? 0.8 : 0.5);
    }
    return L.mainDraw(env, it);
  },
});

reg('tateYoko', {
  name: '縦横混植', tags: ['editorial', 'wa', 'calm'], w: 0.9, fits: n => n >= 1 && n <= 20,
  plan: rng => ({ role: rng.pick(['serif', 'display', 'serif']), side: rng.sign() }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const side = p.side || 1;
    const lines = L.splitLines(cut.text, env.portrait ? 9 : 7);
    const it = vItem(lines, font, env.portrait ? W * 0.6 : W * 0.34, env.portrait ? H * 0.6 : H * 0.8, { lead: 1.3, max: mn(env) * 0.22 });
    const d = vDims(it);
    const rom = L.romaji(cut.text);
    const useRom = !!(rom && rom.length <= 32 && !isLat(cut.text));
    const s1 = useRom ? rom : cut.text;                                     // 横組みの小さな副行(ローマ字 or 歌詞の横組み)
    const f1 = useRom ? fontOf(env, 'mono') : fontOf(env, 'body'), tr1 = useRom ? 0.12 : 0.28;
    const s2 = 'No.' + String((cut.idx || 0) + 1).padStart(2, '0') + '  ' + L.fmtTime(cut.start);
    const sf = fontOf(env, 'mono');
    const e = env.inOut(0.5, 0.2);
    const w1at = sz => L.measure({ text: s1, font: f1, size: sz, weight: 700, track: tr1 }).w;
    let ss = mn(env) * 0.042;
    if (!env.portrait) {
      it.x = W / 2 + side * W * 0.14; it.y = H / 2;
      const inner = it.x - side * (d.w / 2 + it.size * 0.45);
      const room = side > 0 ? inner - W * 0.07 : W * 0.93 - inner;
      ss = Math.min(ss, ss * room / Math.max(1, w1at(ss)));
      const w1 = w1at(ss), w2 = emW(s2, sf) * ss * 0.7;
      const y1 = H / 2 + d.h / 2 - ss * 1.9, y2 = y1 + ss * 1.3;
      env.text({ text: s1, font: f1, size: ss, track: tr1, x: inner - side * w1 / 2, y: y1, color: sc.fg, alpha: e * 0.85, ghost: false });
      env.text({ text: s2, font: sf, size: ss * 0.7, x: inner - side * w2 / 2, y: y2, color: sc.sub, alpha: e, ghost: false });
      const ly = y1 - ss * 0.9;
      env.line([[inner, ly], [inner - side * Math.max(w1, w2) * e, ly]], acc(env), lw(env, 2), 0.8);
    } else {
      it.x = W / 2; it.y = H * 0.45;
      ss = Math.min(ss, ss * W * 0.84 / Math.max(1, w1at(ss)));
      const y1 = it.y + d.h / 2 + ss * 1.8;
      env.line([[W / 2 - W * 0.25 * e, y1 - ss * 1.0], [W / 2 + W * 0.25 * e, y1 - ss * 1.0]], acc(env), lw(env, 2), 0.8);
      env.text({ text: s1, font: f1, size: ss, track: tr1, x: W / 2, y: y1, color: sc.fg, alpha: e * 0.85, ghost: false });
      env.text({ text: s2, font: sf, size: ss * 0.7, x: W / 2, y: y1 + ss * 1.3, color: sc.sub, alpha: e, ghost: false });
    }
    return L.mainDraw(env, it);
  },
});

reg('sideColumn', {
  name: '端の大縦列', tags: ['editorial', 'calm', 'wa', 'dark'], w: 0.9, fits: n => n >= 1 && n <= 24, portrait: 1.1,
  plan: rng => ({ role: rng.pick(['display', 'serif']), right: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lines = L.splitLines(cut.text, env.portrait ? 11 : 8);
    const it = vItem(lines, font, env.portrait ? W * 0.5 : W * 0.3, H * 0.86, { lead: 1.12, max: H * 0.2 });
    const d = vDims(it);
    const side = p.right ? 1 : -1;
    it.x = p.right ? W * 0.94 - d.w / 2 : W * 0.06 + d.w / 2;
    it.y = H / 2;
    const xr = it.x - side * (d.w / 2 + it.size * 0.4);
    const e = env.inOut(0.7);
    env.line([[xr, H * 0.06], [xr, H * 0.06 + H * 0.88 * e]], sc.sub, lw(env, 1.6), 0.6);
    const sf = fontOf(env, 'mono'), ss = mn(env) * 0.028;
    const lab = 'No.' + String((cut.idx || 0) + 1).padStart(2, '0') + '  ' + L.fmtTime(cut.start);
    const wl = emW(lab, sf) * ss;
    env.text({ text: lab, font: sf, size: ss, x: xr - side * (ss * 0.8 + wl / 2), y: H * 0.92, color: sc.sub, alpha: env.inOut(0.5, 0.3), ghost: false });
    return L.mainDraw(env, it);
  },
});

reg('tateDots', {
  name: '縦書き傍点', tags: ['wa', 'calm', 'emotional', 'editorial'], w: 0.8, fits: n => n >= 2 && n <= 18,
  plan: rng => ({ role: rng.pick(['serif', 'serif', 'display']), all: rng.chance(0.4) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lines = L.splitLines(cut.text, env.portrait ? 10 : 7);
    const it = vItem(lines, font, W * 0.5, H * 0.74, { lead: 1.9, max: mn(env) * 0.17 });
    const d = vDims(it);
    it.x = W / 2 + (env.portrait ? 0 : W * 0.03); it.y = H / 2;
    const ac = acc(env);
    const xr = it.x - d.w / 2 - it.size * 0.5;
    const e = env.inOut(0.6);
    const yt = H / 2 - d.h / 2 - it.size * 0.4, yb = H / 2 + d.h / 2 + it.size * 0.4;
    env.line([[xr, yt], [xr, yt + (yb - yt) * e]], sc.sub, lw(env, 1.6), 0.7);
    env.circle(xr, yt, it.size * 0.09 * E.outBack(clamp(e)), ac, null, 0, e);
    if (!it.rot) {
      const ns = nsIndex(cut.text);
      const emS = new Set(cut.emphIdx || []);
      const hasK = L.glyphs(cut.text).some(c => L.isKanji(c));
      let k = 0;
      for (const g of d.m.lay) {
        if (g.space) continue;
        const gi = ns[k], kk = k++;
        const on = emS.size ? emS.has(gi) : p.all || !hasK ? !L.isPunct(g.ch) && !L.isSmallKana(g.ch) : L.isKanji(g.ch);
        if (!on) continue;
        const ek = env.inOut(0.3, 0.25 + 0.04 * kk);
        env.circle(it.x + g.x + it.size * 0.64, it.y + g.y - it.size * 0.1, it.size * 0.075 * ek, ac, null, 0, ek);
      }
    }
    return L.mainDraw(env, it);
  },
});

reg('halfL', {
  name: 'L字組み', tags: ['editorial', 'graphic', 'pop'], w: 0.8, fits: n => n >= 3 && n <= 20,
  plan: rng => ({ role: rng.pick(['display', 'serif', 'body']), bracket: rng.chance(0.7) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const lat = isLat(cut.text);
    const frac = env.portrait ? 0.4 : 0.6;
    let hT, vT;
    if (lat) {
      const ws = cut.text.split(/\s+/).filter(Boolean);
      if (ws.length < 2) { const g = L.glyphs(ws[0] || cut.text); const k = Math.ceil(g.length * frac); hT = g.slice(0, k).join(''); vT = g.slice(k).join(''); }
      else { const k = Math.max(1, Math.min(ws.length - 1, Math.round(ws.length * frac))); hT = ws.slice(0, k).join(' '); vT = ws.slice(k).join(' '); }
    } else {
      const ch = L.chunks(cut.text), tgt = cut.n * frac;
      hT = ''; let i = 0;
      while (i < ch.length - 1 && (L.glyphCount(hT) < tgt * 0.7 || !hT)) { if (L.glyphCount(hT + ch[i]) > tgt * 1.25 && hT) break; hT += ch[i]; i++; }
      vT = ch.slice(i).join('');
      if (!vT || !hT) { const g = L.glyphs(cut.text.replace(/\s+/g, '')); const k = Math.max(1, Math.min(g.length - 1, Math.round(g.length * frac))); hT = g.slice(0, k).join(''); vT = g.slice(k).join(''); }
    }
    const eh = emW(hT, font);
    const lastEm = emOf(font, L.glyphs(hT).slice(-1)[0] || '字');
    const ev = lat ? emW(vT, font) : L.glyphCount(vT) + 0.02;
    const S = Math.min(W * 0.86 / eh, H * 0.84 / (1.12 + ev), mn(env) * 0.24);
    const x0 = W / 2 - eh * S / 2, y0 = H / 2 - (1.12 + ev) * S / 2;
    const hy = y0 + S * 0.55;
    const vx = x0 + (eh - lastEm / 2) * S;
    const vtop = y0 + S * 1.12;
    const e = env.inOut(0.55, 0.1);
    if (p.bracket) {
      const cx = vx - lastEm * S * 0.62, cy = hy + S * 0.66;
      const pts = [[x0, cy], [cx, cy], [cx, vtop + ev * S]];
      env.polyPartial(pts, e, acc(env), lw(env, 2.2), 0.75);
    }
    const hi = { text: hT, font, size: S, x: x0 + eh * S / 2, y: hy, mi: 0 };
    const vi = lat ? { text: vT, font, size: S, rot: Math.PI / 2, x: vx, y: vtop + ev * S / 2, mi: 1 }
      : { text: vT, font, size: S, vertical: true, lead: 1, x: vx, y: vtop + ev * S / 2, mi: 1 };
    return L.unionBB(L.mainDraw(env, hi), L.mainDraw(env, vi));
  },
});

/* ================================================================ 5. 巨大文字 */
reg('hugePan', {
  name: '巨大パン', tags: ['graphic', 'dark', 'pop'], w: 0.8, fits: n => n >= 1 && n <= 16, busy: true, treat: false, emph: 1.5,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif']), dir: rng.sign(), low: rng.chance(0.65), plate: rng.pick(['ink', 'paper']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const text = cut.text.replace(/\s+/g, ' ');
    const em = emW(text, font);
    let G = W * 1.35 / em;
    G = Math.min(G, H * (env.portrait ? 0.5 : 0.95));
    G = Math.max(G, Math.min(H * 0.42, W * 0.5));
    const tw = em * G;
    const drift = tw > W ? Math.min((tw - W) / 2 + W * 0.04, W * 0.12) : W * 0.02;
    const ph = E.inOutSine(clamp(env.ltb / Math.max(0.5, cut.dur)));
    const gx = W / 2 + (p.dir || 1) * (0.5 - ph) * 2 * drift;
    const cropped = tw > W * 0.9;
    const bb0 = L.mainDraw(env, { text, font, size: G, x: gx, y: cropped ? H * (p.low ? 0.44 : 0.56) : H / 2, mi: 0, plain: true });
    if (!cropped) return bb0;
    // 読める小さいコピー(プレート上)。巨大文字が枠で切れる時だけ
    const fit = fitLines(cut.text, font, W * 0.56, H * 0.12, 2, mn(env) * 0.075);
    const m = L.measure({ text: fit.text, font, size: fit.size, align: 'left' });
    const pad = fit.size * 0.4;
    const bx = W * 0.07, by = p.low ? H * 0.93 - m.h - pad * 2 : H * 0.07;
    const e = env.inOut(0.45, 0.1);
    const paper = p.plate === 'paper' && sc.dark;
    const fill = paper ? sc.paper : sc.accent, ink = paper ? sc.onPaper : sc.onInk;
    env.rrect(bx, by, (m.w + pad * 2) * e, m.h + pad * 2, pad * 0.4, fill, 1, false);
    const bb1 = L.mainDraw(env, { text: fit.text, font, size: fit.size, align: 'left', x: bx + pad + m.w / 2, y: by + pad + m.h / 2, color: ink, mi: 1 });
    return L.unionBB(bb1, bb0 && { x0: Math.max(0, bb0.x0), y0: Math.max(0, bb0.y0), x1: Math.min(W, bb0.x1), y1: Math.min(H, bb0.y1), w: 0, h: 0, cx: W / 2, cy: H / 2 });
  },
});

reg('giantBack', {
  name: '巨大一字背景', tags: ['graphic', 'emotional', 'dark', 'editorial'], w: 1, fits: n => n >= 2 && n <= 24, emph: 1.3,
  plan: rng => ({ role: rng.pick(['display', 'serif']), side: rng.pick([-1, 1]), mode: rng.pick(['outline', 'tint']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const all = L.glyphs(cut.text);
    const gs = all.filter(c => !L.isSpace(c) && !L.isPunct(c));
    const SIMPLE = '一二三人入八十了丁七力口';
    const emk = (cut.emphIdx || []).map(i => all[i]).find(c => c && L.isKanji(c));
    const ch = emk || gs.find(c => L.isKanji(c) && !SIMPLE.includes(c)) || gs.find(c => L.isKanji(c)) || gs[0] || all[0];
    const G = Math.min(H * 1.05, W * (env.portrait ? 0.95 : 0.7));
    const side = env.portrait ? 0 : (p.side || 1);
    const e = env.inOut(0.8);
    const ac = acc(env);
    const gx = W / 2 + side * W * 0.2, gy = H / 2 + (env.portrait ? -H * 0.05 : 0);
    if (p.mode === 'outline') env.text({ text: ch, font, weight: 900, size: G, sx: 1.08 - 0.08 * e, sy: 1.08 - 0.08 * e, x: gx, y: gy, color: ac, fill: false, stroke: Math.max(1.5, G * 0.008), strokeColor: ac, alpha: 0.7 * e, ghost: false });
    else env.text({ text: ch, font, weight: 900, size: G, sx: 1.08 - 0.08 * e, sy: 1.08 - 0.08 * e, x: gx, y: gy, color: ac, alpha: 0.22 * e, ghost: false });
    const fit = fitLines(cut.text, font, W * 0.8, H * (env.portrait ? 0.3 : 0.36), 2, mn(env) * 0.16);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2 - side * W * 0.06, y: H / 2 + (env.portrait ? H * 0.14 : 0), color: sc.fg });
  },
});

const texCache = new Map();
CACHES.push(texCache);
reg('texture', {
  name: '全面リピート', tags: ['graphic', 'cyber', 'dark', 'glitch'], w: 0.8, fits: n => n >= 1 && n <= 20, busy: true, treat: 'safe',
  plan: rng => ({ role: rng.pick(['display', 'body']), sep: rng.pick(['　', ' / ', '・']), alt: rng.chance(0.6), band: rng.pick(['bg', 'ink']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const rs = mn(env) * (env.portrait ? 0.075 : 0.085), rh = rs * 1.2;
    const nRows = Math.min(40, Math.ceil(H / rh) + 1);
    const e = env.inOut(0.6);
    if (env.pass === 'main' && e > 0.01) {
      const ctx = env.ctx;
      ctx.save();
      ctx.font = L.fontStr({ font, weight: 900, size: rs });
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const key = ctx.font + '|' + cut.text + '|' + p.sep + '|' + W;
      let tx = texCache.get(key);
      if (!tx) {
        const unit = cut.text + (p.sep || '　');
        const uw = Math.max(1, ctx.measureText(unit).width);
        const reps = Math.min(60, Math.ceil(W * 2 / uw) + 2);
        tx = { str: unit.repeat(reps), uw };
        if (texCache.size > 60) texCache.clear();
        texCache.set(key, tx);
      }
      const y0 = (H - nRows * rh) / 2 + rh / 2;
      ctx.lineWidth = Math.max(1, rs * 0.03);
      ctx.fillStyle = sc.sub; ctx.strokeStyle = sc.sub;
      for (let r = 0; r < nRows; r++) {
        const dir = r % 2 ? 1 : -1;
        const x = -posMod(r * tx.uw * 0.37 + dir * env.ltb * rs * 0.8, tx.uw) - tx.uw;
        const er = env.inOut(0.5, 0.02 * Math.abs(r - nRows / 2));
        const outline = p.alt && r % 2 === 1;
        ctx.globalAlpha = (outline ? 0.32 : 0.16) * er;
        if (outline) ctx.strokeText(tx.str, x, y0 + r * rh); else ctx.fillText(tx.str, x, y0 + r * rh);
      }
      ctx.restore();
    }
    const fit = fitLines(cut.text, font, W * 0.84, H * (env.portrait ? 0.26 : 0.3), 2, mn(env) * 0.15);
    const m = L.measure({ text: fit.text, font, size: fit.size });
    const bh = m.h + fit.size * 0.7;
    const ink = p.band === 'ink';
    env.rect(W / 2 * (1 - e), H / 2 - bh / 2, W * e, bh, ink ? sc.accent : sc.bg, 0.94, false);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, color: ink ? sc.onInk : sc.fg });
  },
});

reg('justify', {
  name: '全面ジャスティファイ', tags: ['graphic', 'editorial', 'pop'], w: 1, fits: n => n >= 1 && n <= 24, busy: true, emph: 1.3,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body', 'serif']), alt: rng.chance(0.5), rules: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const n = Math.max(1, cut.n);
    const nr = clamp(env.portrait ? Math.ceil(n / 4) : Math.ceil(n / 8), 1, 5);
    const lines = nr === 1 ? [cut.text] : L.splitLines(cut.text, Math.ceil(n / nr));
    const aw = W * 0.88, ah = H * 0.86, lh = ah / lines.length;
    const ac = acc(env);
    let bb = null;
    lines.forEach((ln, i) => {
      const em = emW(ln, font);
      let size = Math.min(lh / 1.1, mn(env) * 0.8);
      let sx = clamp(aw / (em * size), 0.6, 1.45);
      if (em * size * sx > aw) size = aw / (em * sx);
      const y = H / 2 + (i - (lines.length - 1) / 2) * lh;
      if (p.rules && i > 0) {
        const ei = env.inOut(0.5, 0.06 * i);
        env.line([[W / 2 - aw / 2 * ei, y - lh / 2], [W / 2 + aw / 2 * ei, y - lh / 2]], sc.sub, lw(env, 1.6), 0.6);
      }
      bb = L.unionBB(bb, L.mainDraw(env, { text: ln, font, size, sx, x: W / 2, y, color: p.alt && i % 2 ? ac : sc.fg, mi: i }));
    });
    return bb;
  },
});

/* ================================================================ 6. 柄で塗る文字 */
reg('patternFill', {
  name: 'ストライプ文字', tags: ['graphic', 'pop', 'cyber'], w: 0.9, fits: n => n >= 1 && n <= 14, treat: false, emph: 1.2,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), pat: rng.pick(['stripes', 'stripes', 'lines', 'grid']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.88, H * (env.portrait ? 0.44 : 0.62), 3, mn(env) * 0.34);
    const ac = acc(env);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, color: ac, pattern: p.pat || 'stripes', patternColor: ac,
      stroke: Math.max(1.5, fit.size * 0.028), strokeColor: sc.fg, strokeUnder: false });
  },
});

reg('halftone', {
  name: '網点ポスター', tags: ['graphic', 'pop', 'editorial'], w: 0.8, fits: n => n >= 1 && n <= 18, treat: false, busy: true,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif']), right: rng.chance(0.4) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const big = fitLines(cut.text, font, W * 0.94, H * 0.9, 3, mn(env) * 0.9);
    const e = env.inOut(0.8);
    const ac = acc(env);
    env.text({ text: big.text, font, weight: 900, size: big.size, sx: 1.05 - 0.05 * e, sy: 1.05 - 0.05 * e, x: W / 2, y: H / 2, color: ac, pattern: 'dots', patternColor: ac, alpha: 0.6 * e, ghost: false });
    const fit = fitLines(cut.text, font, W * 0.62, H * 0.16, 2, mn(env) * 0.1);
    const m = L.measure({ text: fit.text, font, size: fit.size, align: p.right ? 'right' : 'left' });
    const x = p.right ? W * 0.93 - m.w / 2 : W * 0.07 + m.w / 2;
    const y = H * 0.9 - m.h / 2 - fit.size * 0.3;
    const eb = env.inOut(0.45, 0.2);
    const bx = p.right ? W * 0.93 - m.w * eb : W * 0.07;
    env.rect(bx, y + m.h / 2 + fit.size * 0.12, m.w * eb, fit.size * 0.14, ac, 1, false);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, align: p.right ? 'right' : 'left', x, y, color: sc.fg, stroke: fit.size * 0.18, strokeColor: sc.bg });
  },
});

reg('duotone', {
  name: '上下二色', tags: ['graphic', 'pop', 'editorial'], w: 1, fits: n => n >= 1 && n <= 18,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif', 'body']), flip: rng.chance(0.5), line: rng.chance(0.7) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.86, H * 0.5, 2, mn(env) * 0.3);
    const ac = acc(env);
    const top = p.flip ? ac : sc.fg, bot = p.flip ? sc.fg : ac;
    if (p.line) {                                   // 境目の高さに、文字の外側だけ細い線
      const e = env.inOut(0.6);
      const mm = L.measure({ text: fit.text, font, size: fit.size });
      const nl = fit.text.split('\n').length, lh = fit.size * 1.18;
      const xa = W / 2 - mm.w / 2 - fit.size * 0.25, xb = W / 2 + mm.w / 2 + fit.size * 0.25;
      for (let i = 0; i < nl; i++) {
        const y = H / 2 + (i - (nl - 1) / 2) * lh;
        if (xa > W * 0.08) {
          env.line([[xa, y], [xa - (xa - W * 0.05) * e, y]], top, lw(env, 2), 0.8);
          env.line([[xb, y], [xb + (W * 0.95 - xb) * e, y]], bot, lw(env, 2), 0.8);
        }
      }
    }
    const base = { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, mi: 0 };
    const a = L.mainDraw(env, Object.assign({}, base, { color: top, charFns: [() => ({ clipY: [-0.9, 0] })] }));
    const b = L.mainDraw(env, Object.assign({}, base, { color: bot, charFns: [() => ({ clipY: [0, 0.9] })] }));
    return L.unionBB(a, b);
  },
});

reg('hatchShadow', {
  name: 'ハッチ影', tags: ['graphic', 'pop', 'editorial'], w: 1, fits: n => n >= 1 && n <= 20,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), dir: rng.sign(), pat: rng.pick(['hatch', 'stripes', 'dots']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.82, H * 0.46, 2, mn(env) * 0.26);
    const ac = acc(env);
    const e = env.inOut(0.5, 0.15);
    const d = fit.size * 0.14 * E.outCubic(clamp(e));
    env.text({ text: fit.text, font, weight: 900, size: fit.size, x: W / 2 + (p.dir || 1) * d, y: H / 2 + d, color: ac, pattern: p.pat || 'hatch', patternColor: ac, alpha: e, ghost: false });
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, color: sc.fg, stroke: fit.size * 0.05, strokeColor: sc.bg });
  },
});

/* ================================================================ 7. 残像・奥行きのコピー */
reg('afterimage', {
  name: '残像スタック', tags: ['emotional', 'glitch', 'graphic', 'cyber'], w: 1, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), dir: rng.pick(['up', 'down', 'left']), n: rng.int(4, 6) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const k = p.n || 5, st = 0.26;
    const hz = p.dir === 'left' || cut.n > 9;          // 縦の残像は1行のときだけ(2行だと下の行に被る)
    // 縦長画面では行数を増やして字を大きく保つ(横の残像ぶん幅が狭いため)
    const fit = fitLines(cut.text, font, W * (hz ? 0.84 / (1 + k * st * 0.35) : 0.84), H * (hz ? 0.4 : 0.8), hz ? (env.portrait ? 4 : 2) : 1, mn(env) * 0.2);
    let size = fit.size;
    const m0 = L.measure({ text: fit.text, font, size: 100 });
    if (!hz) size = Math.min(size, H * 0.8 / (m0.h / 100 + k * st));
    else size = Math.min(size, W * 0.84 / (m0.w / 100 + k * st));
    const off = size * st * k / 2;
    const dx = hz ? -size * st : 0, dy = hz ? 0 : (p.dir === 'up' ? -size * st : size * st);
    const x = W / 2 + (hz ? off : 0), y = H / 2 + (hz ? 0 : (p.dir === 'up' ? off : -off));
    const bb = L.mainDraw(env, { text: fit.text, font, size, x, y, echo: { n: k, dx, dy, a: 0.5, decay: 0.7, color: acc(env) } });
    if (!bb) return null;
    return L.unionBB(bb, { x0: bb.x0 + Math.min(0, dx * k), x1: bb.x1 + Math.max(0, dx * k), y0: bb.y0 + Math.min(0, dy * k), y1: bb.y1 + Math.max(0, dy * k), w: 0, h: 0, cx: bb.cx, cy: bb.cy });
  },
});

reg('tunnel', {
  name: '奥行きトンネル', tags: ['cyber', 'dark', 'emotional', 'graphic'], w: 0.8, fits: n => n >= 1 && n <= 14,
  plan: rng => ({ role: rng.pick(['display', 'body']), vp: rng.int(0, 3), k: rng.int(5, 7), outline: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const VPS = [[0, -1], [1, -1], [-1, -1], [0, 1]];
    const v = VPS[p.vp || 0];
    const fit = fitLines(cut.text, font, W * 0.74, H * 0.3, 2, mn(env) * 0.15);
    const px = W / 2 - v[0] * W * 0.06, py = H / 2 - v[1] * H * 0.13;
    const vx = W / 2 + v[0] * W * 0.36, vy = H / 2 + v[1] * H * 0.42;
    const m = L.measure({ text: fit.text, font, size: fit.size });
    const e = env.inOut(0.6);
    const ac = acc(env);
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) env.line([[px + cx * m.w / 2, py + cy * m.h / 2], [L.lerp(px + cx * m.w / 2, vx, e), L.lerp(py + cy * m.h / 2, vy, e)]], sc.sub, lw(env, 1.2), 0.3);
    const K = p.k || 6;
    for (let k = K; k >= 1; k--) {
      const s = Math.pow(0.74, k);
      const ek = env.inOut(0.4, 0.04 * k);
      const it = { text: fit.text, font, weight: 900, size: fit.size * s, x: vx + (px - vx) * s, y: vy + (py - vy) * s, color: k % 2 ? ac : sc.sub, alpha: 0.6 * Math.pow(0.8, k) * ek, ghost: false };
      if (p.outline && k % 2 === 0) { it.fill = false; it.stroke = Math.max(1, fit.size * s * 0.025); it.strokeColor = it.color; }
      env.text(it);
    }
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: px, y: py, color: sc.fg });
  },
});

reg('zoomRepeat', {
  name: '連続拡大', tags: ['cyber', 'glitch', 'dark', 'graphic'], w: 0.7, fits: n => n >= 1 && n <= 12, emph: 1.3, busy: true,
  plan: rng => ({ role: rng.pick(['display', 'body']), sp: rng.range(0.16, 0.28), col: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.62, H * 0.28, 2, mn(env) * 0.13);
    const m = L.measure({ text: fit.text, font, size: fit.size });
    const e = env.inOut(0.6);
    const f = posMod(env.ltb * (p.sp || 0.22), 1);
    const ac = acc(env), ac2 = acc2(env);
    for (let k = 4; k >= 0; k--) {
      const s = Math.pow(1.5, k + f);
      if (m.w * s > W * 3.2 && m.h * s > H * 1.6) continue;
      const a = e * 0.42 * (1 - (k + f) / 5) * L.smooth(1.02, 1.3, s);
      if (a <= 0.01) continue;
      const col = p.col ? (k % 2 ? ac2 : ac) : ac;
      env.text({ text: fit.text, font, weight: 900, size: fit.size, sx: s, sy: s, x: W / 2, y: H / 2, color: col, fill: false, stroke: Math.max(1, lw(env, 1.6) * Math.sqrt(s)) / s, strokeColor: col, alpha: a, ghost: false });   // 字サイズ固定+拡大変換(グリフキャッシュが効く)
    }
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, color: sc.fg });
  },
});

reg('outlineBack', {
  name: '輪郭の重ね', tags: ['pop', 'graphic', 'emotional'], w: 1, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), mode: rng.pick(['offset', 'fan']), sg: rng.sign() }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.78, H * 0.42, 2, mn(env) * 0.24);
    const e = E.outCubic(clamp(env.inOut(0.55, 0.1)));
    const ac = acc(env), ac2 = acc2(env);
    const sg = p.sg || 1;
    for (let k = 3; k >= 1; k--) {
      const col = k % 2 ? ac : ac2;
      const it = { text: fit.text, font, weight: 900, size: fit.size, x: W / 2, y: H / 2, color: col, fill: false, stroke: Math.max(1.2, fit.size * 0.024), strokeColor: col, alpha: 0.9 * clamp(e * 1.5), ghost: false };
      if (p.mode === 'fan') it.rot = sg * (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.055 * e * (k === 3 ? 1.6 : 1);
      else { it.x += sg * k * fit.size * 0.075 * e; it.y += k * fit.size * 0.075 * e; }
      env.text(it);
    }
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, color: sc.fg });
  },
});

reg('reflect', {
  name: '水面反射', tags: ['calm', 'emotional', 'dark'], w: 1, fits: n => n >= 1 && n <= 18,
  plan: rng => ({ role: rng.pick(['serif', 'display', 'body']), rip: rng.range(0.5, 1) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.84, H * 0.3, 2, mn(env) * 0.18);
    const m = L.measure({ text: fit.text, font, size: fit.size });
    const hy = H * 0.56, gap = fit.size * 0.1;
    const y = hy - m.h / 2 - gap;
    const e = env.inOut(0.7);
    env.line([[W / 2 - W * 0.44 * e, hy], [W / 2 + W * 0.44 * e, hy]], sc.sub, lw(env, 1.4), 0.6);
    const r = { text: fit.text, font, weight: 900, size: fit.size, x: W / 2, y: hy + m.h / 2 + gap, sy: -1, color: sc.fg, alpha: 0.26 * e, ghost: false };
    L.itemBands(env, r, 8, i => Math.sin(env.ltb * 2.2 + i * 0.9) * fit.size * 0.05 * (p.rip || 0.8) * (0.3 + i / 8));
    env.text(r);
    return L.mainDraw(env, { text: fit.text, font, size: fit.size, x: W / 2, y, color: sc.fg });
  },
});

/* ================================================================ 8. 分割・ずらし(静止構図) */
reg('splitTB', {
  name: '上下割り', tags: ['graphic', 'glitch', 'editorial'], w: 1, fits: n => n >= 1 && n <= 18,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif']), d: rng.range(0.12, 0.2), dir: rng.sign() }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.78, H * 0.46, 2, mn(env) * 0.28);
    const d = fit.size * (p.d || 0.16) * (p.dir || 1);
    const m = L.measure({ text: fit.text, font, size: fit.size });
    const e = env.inOut(0.5);
    const nl = fit.text.split('\n').length, lh = fit.size * 1.18;
    for (let i = 0; i < nl; i++) {
      const y = H / 2 + (i - (nl - 1) / 2) * lh;
      const x0 = W / 2 - m.w / 2 - Math.abs(d) - fit.size * 0.35, x1 = W / 2 + m.w / 2 + Math.abs(d) + fit.size * 0.35;
      env.line([[x0, y], [x0 + (x1 - x0) * e, y]], acc(env), lw(env, 1.6), 0.6);
    }
    const base = { text: fit.text, font, size: fit.size, y: H / 2, color: sc.fg };
    const a = L.mainDraw(env, Object.assign({}, base, { x: W / 2 - d, mi: 0, charFns: [() => ({ clipY: [-0.9, -0.03] })] }));
    const b = L.mainDraw(env, Object.assign({}, base, { x: W / 2 + d, mi: 1, charFns: [() => ({ clipY: [0.03, 0.9] })] }));
    return L.unionBB(a, b);
  },
});

reg('splitInvert', {
  name: '二分割反転', tags: ['graphic', 'pop', 'editorial'], w: 0.9, fits: n => n >= 1 && n <= 20, busy: true, treat: false,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), side: rng.sign() }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const side = p.side || 1;
    const vert = !env.portrait;                // true: 左右に割る
    const e = E.inOutCubic(clamp(env.inOut(0.55)));
    const fit = fitLines(cut.text, font, W * 0.84, H * (env.portrait ? 0.5 : 0.5), env.portrait ? 3 : 2, mn(env) * 0.26);
    let b;                                       // 画面上の境界座標
    if (vert) {
      b = side < 0 ? W / 2 * e : W - W / 2 * e;
      env.rect(side < 0 ? 0 : b, 0, side < 0 ? b : W - b, H, sc.accent, 1, false);
    } else {
      b = side < 0 ? H / 2 * e : H - H / 2 * e;
      env.rect(0, side < 0 ? 0 : b, W, side < 0 ? b : H - b, sc.accent, 1, false);
    }
    const BIG = 1e5;
    const clipPanel = inPanel => (ctx, en, it) => {
      if (vert) {
        const lx = (b - it.x) / (it.sx || 1);
        const onLeft = (side < 0) === inPanel;
        if (onLeft) ctx.rect(-BIG, -BIG, lx + BIG, BIG * 2); else ctx.rect(lx, -BIG, BIG, BIG * 2);
      } else {
        const ly = (b - it.y) / (it.sy || 1);
        const onTop = (side < 0) === inPanel;
        if (onTop) ctx.rect(-BIG, -BIG, BIG * 2, ly + BIG); else ctx.rect(-BIG, ly, BIG * 2, BIG);
      }
    };
    const base = { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2, mi: 0 };
    const a = L.mainDraw(env, Object.assign({}, base, { color: sc.fg, clipFn: clipPanel(false) }));
    const c = L.mainDraw(env, Object.assign({}, base, { color: sc.onInk, clipFn: clipPanel(true) }));
    return L.unionBB(a, c);
  },
});

reg('threeStrips', {
  name: '三段ずらし', tags: ['glitch', 'graphic', 'cyber'], w: 0.9, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), d: rng.range(0.1, 0.17), pat: rng.int(0, 2) }),
  render(env) {
    const { W, H, cut } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.76, H * 0.46, 2, mn(env) * 0.28);
    const PATS = [[-1, 1, -0.5], [1, -1, 1], [-0.7, 0, 0.7]];
    const pat = PATS[p.pat || 0];
    const it = { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2 };
    const m = L.measure(it);
    const pad = fit.size * 0.6, bh = m.h + pad * 2, lh = fit.size * 1.18;
    const nl = fit.text.split('\n').length;
    const d = fit.size * (p.d || 0.13);
    it.bands = [];
    const seams = [];
    for (let li = 0; li < nl; li++) {
      for (let b = 0; b < 3; b++) {
        let y0 = pad + li * lh + lh * b / 3, y1 = pad + li * lh + lh * (b + 1) / 3;
        if (li === 0 && b === 0) y0 = 0;
        if (li === nl - 1 && b === 2) y1 = bh;
        it.bands.push([y0 / bh, y1 / bh, pat[b] * d * (li % 2 ? -1 : 1)]);
        if (b > 0) seams.push(H / 2 - m.h / 2 + li * lh + lh * b / 3);
      }
    }
    const e = env.inOut(0.5, 0.1);
    const ac = acc(env), tk = fit.size * 0.45;
    const xl = W / 2 - m.w / 2 - d - fit.size * 0.2, xr = W / 2 + m.w / 2 + d + fit.size * 0.2;
    seams.forEach(y => {
      env.line([[xl, y], [xl - tk * e, y]], ac, lw(env, 2), 0.85);
      env.line([[xr, y], [xr + tk * e, y]], ac, lw(env, 2), 0.85);
    });
    return L.mainDraw(env, it);
  },
});

reg('vSlices', {
  name: '縦スライス', tags: ['glitch', 'cyber', 'graphic'], w: 0.8, fits: n => n >= 1 && n <= 14,
  plan: rng => ({ role: rng.pick(['display', 'body']), amp: rng.range(0.06, 0.11) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.82, H * 0.4, 2, mn(env) * 0.28);
    const it = { text: fit.text, font, size: fit.size, x: W / 2, y: H / 2 };
    const m = L.measure(it);
    const nb = clamp(Math.round(cut.n * 1.5) + 5, 8, 14);          // 帯ごとに全字を描くので本数は控えめに
    const off = [];
    for (let i = 0; i < nb; i++) off.push((i % 2 ? 1 : -1) * (p.amp || 0.08) * fit.size * (0.55 + 0.45 * L.r(cut.seed, 'vs', i)));
    L.itemVBands(env, it, nb, i => off[i]);
    const pad = fit.size * 0.6, bw = m.w + pad * 2, bx0 = W / 2 - bw / 2;
    const e = env.inOut(0.6, 0.1);
    const yt = H / 2 - m.h / 2 - fit.size * 0.22, yb = H / 2 + m.h / 2 + fit.size * 0.22;
    for (let i = 0; i < nb; i++) {
      const ei = clamp(e * nb - i * 0.6);
      if (ei <= 0) continue;
      const xa = bx0 + bw * i / nb, xb = bx0 + bw * (i + 1) / nb - lw(env, 1);
      env.line([[xa, yt + off[i]], [xb, yt + off[i]]], sc.sub, lw(env, 2), 0.7 * ei);
      env.line([[xa, yb + off[i]], [xb, yb + off[i]]], sc.sub, lw(env, 2), 0.7 * ei);
    }
    return L.mainDraw(env, it);
  },
});

reg('diagSplit', {
  name: '斜め割り', tags: ['graphic', 'glitch', 'pop'], w: 0.9, fits: n => n >= 1 && n <= 16,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif']), ang: rng.sign() * rng.range(12, 26), d: rng.range(0.12, 0.2), acc: rng.chance(0.4) }),
  render(env) {
    const { W, H, cut, sc } = env, p = par(env);
    const font = fontOf(env, p.role);
    const fit = fitLines(cut.text, font, W * 0.76, H * 0.44, 2, mn(env) * 0.28);
    const a = (p.ang || -18) * L.DEG, ca = Math.cos(a), sa = Math.sin(a);
    const d = fit.size * (p.d || 0.16);
    const e = env.inOut(0.55);
    const Lh = Math.hypot(W, H) * 0.42;
    env.line([[W / 2 - ca * Lh * e, H / 2 - sa * Lh * e], [W / 2 + ca * Lh * e, H / 2 + sa * Lh * e]], acc(env), lw(env, 2), 0.85);
    const BIG = 1e5;
    const half = upper => ctx => {
      const nx = sa, ny = -ca;                       // 上側の法線
      const s = upper ? 1 : -1;
      ctx.moveTo(-ca * BIG, -sa * BIG);
      ctx.lineTo(ca * BIG, sa * BIG);
      ctx.lineTo(ca * BIG + s * nx * BIG, sa * BIG + s * ny * BIG);
      ctx.lineTo(-ca * BIG + s * nx * BIG, -sa * BIG + s * ny * BIG);
      ctx.closePath();
    };
    const base = { text: fit.text, font, size: fit.size };
    const A = L.mainDraw(env, Object.assign({}, base, { x: W / 2 - ca * d, y: H / 2 - sa * d, color: sc.fg, mi: 0, clipFn: half(true) }));
    const B = L.mainDraw(env, Object.assign({}, base, { x: W / 2 + ca * d, y: H / 2 + sa * d, color: p.acc ? acc(env) : sc.fg, mi: 1, clipFn: half(false) }));
    return L.unionBB(A, B);
  },
});

})();
