/* LyricFlow 演出パック: p_layouts_d — 構図D（和風/物理/疑似3D/ボカロMV系）
   契約: docs/COMPOSE_PACKS.md  (group: layout) */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_layouts_d';
// L.register('<group>', '<key>', { name: '日本語名', tags: [...], w: 1, ... }, P);

/* ================================================================ helpers */
const clamp = L.clamp, TAU = Math.PI * 2, DEG = Math.PI / 180;
const FONT = {
  brush: ["'Yuji Syuku', serif", 400],
  mai: ["'Yuji Mai', serif", 400],
  tokumin: ["'Kaisei Tokumin', serif", 800],
  antique: ["'Zen Antique', serif", 400],
  round: ["'M PLUS Rounded 1c', sans-serif", 800],
  pop: ["'Mochiy Pop One', sans-serif", 400],
  dela: ["'Dela Gothic One', sans-serif", 400],
  rock: ["'RocknRoll One', sans-serif", 400],
  reggae: ["'Reggae One', sans-serif", 400],
};
const ROLE_W = { display: 900, serif: 800, body: 700, mono: 400, hand: 400 };
const F = (env, k) => {
  if (ROLE_W[k] != null) return { font: L.roleFont(env, k), weight: ROLE_W[k] };
  const f = FONT[k] || FONT.dela;
  return { font: f[0], weight: f[1] };
};
const isLat = s => L.hasLatinWords(s || '');
const firstGlyph = s => { const g = L.glyphs(s); return g.find(c => !L.isSpace(c) && !L.isPunct(c)) || g.find(c => !L.isSpace(c)) || ''; };
const warm = sc => { const a = L.rgb(sc.accent), b = L.rgb(sc.accent2); return (a[0] - a[2]) >= (b[0] - b[2]) ? sc.accent : sc.accent2; };
const ink = c => (L.contrast(c, '#ffffff') >= L.contrast(c, '#0b0d12') ? '#ffffff' : '#0b0d12');   // 塗りの上で最もコントラストの高い文字色
const cool = sc => (warm(sc) === sc.accent ? sc.accent2 : sc.accent);
const Tset = cut => clamp(cut.dur * 0.32, 0.3, 1.0);                 // 物理系の収束時間
const dly = (env, k = 0.25) => Math.min(k, env.cut.dur * 0.12);       // 物体の後に文字を出す遅延
const bbOf = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
const edgeOf = sc => (L.contrast(sc.paper, sc.bg) < 1.35 ? L.mix(sc.onPaper, sc.paper, 0.72) : null);   // 紙が背景に溶ける時の縁

/* 行の長さが極端に不揃いな改行は選ばれにくくする(サイズは返す前に戻す) */
const balance = t => {
  const ls = t.split('\n');
  if (ls.length < 2) return 1;
  const c = ls.map(l => L.glyphCount(l));
  const r = Math.min(...c) / Math.max(1, Math.max(...c));
  return r < 0.45 ? 0.8 : 1;
};
/* 横書き: 1..maxLines 行で最大サイズになる改行 */
function bestH(text, font, weight, maxW, maxH, maxLines = 3, maxSize = 1e9, o = {}) {
  const N = L.glyphs(text).length;
  if (isLat(text) && !/\s/.test(String(text).trim())) maxLines = 1;       // 欧文の単語は途中で折らない
  let best = null;
  for (let k = 1; k <= maxLines; k++) {
    if (k > 1 && N < k * 2) break;
    const t = k === 1 ? text : L.splitLines(text, Math.ceil(N / k)).join('\n');
    const s = Math.min(maxSize, L.fitSize(t, font, maxW, maxH, Object.assign({ weight }, o))), sc = s * balance(t);
    if (!best || sc > best.sc * 1.06) best = { text: t, size: s, sc, k: t.split('\n').length };
  }
  return best;
}
/* 縦書き: 1..maxCols 列 */
function bestV(text, font, weight, maxW, maxH, maxCols = 3, maxSize = 1e9, lead = 1.22) {
  const N = L.glyphs(text).length;
  let best = null;
  for (let c = 1; c <= maxCols; c++) {
    if (c > 1 && N < c * 2) break;
    const t = c === 1 ? text : L.splitLines(text, Math.ceil(N / c)).join('\n');
    const s = Math.min(maxSize, L.fitSize(t, font, maxW, maxH, { weight, vertical: true, lead })), sc = s * balance(t);
    if (!best || sc > best.sc * 1.06) best = { text: t, size: s, sc, cols: t.split('\n').length, lead };
  }
  return best;
}
/* 縦(和文)/横(欧文)の自動 */
function fitVH(text, f, maxW, maxH, vert, maxN = 3, maxSize = 1e9, rotLat = false) {
  if (vert) { const v = bestV(text, f.font, f.weight, maxW, maxH, maxN, maxSize); return { text: v.text, size: v.size, vertical: true, lead: v.lead, rot: 0 }; }
  if (rotLat && maxH > maxW * 1.6) {           // 細長い縦の物体には欧文を90°寝かせて置く
    const h = bestH(text, f.font, f.weight, maxH, maxW, 2, maxSize);
    return { text: h.text, size: h.size, vertical: false, rot: Math.PI / 2 };
  }
  const h = bestH(text, f.font, f.weight, maxW, maxH, maxN + 1, maxSize);
  return { text: h.text, size: h.size, vertical: false, rot: 0 };
}
/* 複数の物体に分けた歌詞は同じ字サイズに揃える */
function fitParts(parts, f, maxW, maxH, vert, maxN = 2, maxSize = 1e9, rotLat = false) {
  const fs = parts.map(p => fitVH(p, f, maxW, maxH, vert, maxN, maxSize, rotLat));
  const s = Math.min(...fs.map(x => x.size));
  fs.forEach(x => { x.size = s; });
  return fs;
}
function partsOf(text, K) {
  if (K <= 1) return [text];
  const N = L.glyphs(text).length;
  const p = L.splitLines(text, Math.ceil(N / K)).filter(Boolean);
  return p.length ? p : [text];
}
function halves(text) {
  const t = String(text || '').trim();
  if (isLat(t) && /\s/.test(t)) {
    const w = t.split(/\s+/);
    let best = 1, bd = 1e9;
    for (let k = 1; k < w.length; k++) { const d = Math.abs(w.slice(0, k).join(' ').length - w.slice(k).join(' ').length); if (d < bd) { bd = d; best = k; } }
    return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
  }
  const gs = L.glyphs(t);
  if (gs.length < 2) return [t, ''];
  const p = L.splitLines(t, Math.ceil(gs.length / 2));
  if (p.length >= 2) return [p[0], p.slice(1).join('')];
  const k = Math.ceil(gs.length / 2);
  return [gs.slice(0, k).join('').trim(), gs.slice(k).join('').trim()];
}
const KNUM = '〇一二三四五六七八九';
const kanjiNum = n => (n < 10 ? KNUM[n] : n < 20 ? '十' + (n % 10 ? KNUM[n % 10] : '') : KNUM[Math.floor(n / 10)] + '十' + (n % 10 ? KNUM[n % 10] : ''));

/* 行列(2x3) */
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const Tm = (x, y) => [1, 0, 0, 1, x, y];
const RSm = (x, y, rot, k = 1) => { const c = Math.cos(rot) * k, s = Math.sin(rot) * k; return [c, s, -s, c, x, y]; };
const rotAbout = (px, py, a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]; };
function mapBB(bb, M) {
  if (!bb) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]]) {
    const X = M[0] * x + M[2] * y + M[4], Y = M[1] * x + M[3] * y + M[5];
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  return bbOf(x0, y0, x1, y1);
}
function withM(env, M, fn) {
  const c = env.ctx;
  c.save();
  c.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
  let r;
  try { r = fn(); } finally { c.restore(); }
  return r;
}
const affMain = (env, M, item) => mapBB(withM(env, M, () => L.mainDraw(env, item)), M);
function raw(env, fn) {                 // ctx 直描き(main パスのみ)
  if (env.pass !== 'main') return;
  const c = env.ctx;
  c.save();
  try { fn(c); } finally { c.restore(); }
}
/* 折れ線の一括描画(main のみ) segs = [[x0,y0,x1,y1,…],…] */
function strokeSegs(env, segs, color, lw, a) {
  if (env.pass !== 'main' || a <= 0.003 || !segs.length) return;
  raw(env, c => {
    c.globalAlpha = clamp(a); c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (const s of segs) { c.moveTo(s[0], s[1]); for (let k = 2; k < s.length; k += 2) c.lineTo(s[k], s[k + 1]); }
    c.stroke();
  });
}
function ellipse(env, x, y, rx, ry, rot, fill, a, stroke, lw) {
  if (env.pass !== 'main' || a <= 0.003) return;
  raw(env, c => {
    c.globalAlpha = clamp(a); c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  });
}
function polyStroke(env, pts, color, lw, a) {
  if (!pts || pts.length < 2) return;
  env.line(pts.concat([pts[0]]), color, lw, a, false);
}

/* 1字ずつ任意位置へ: テキスト行を measure し、各字にスロット(セル中心)を割り当てる */
function makeSlots(item, cellW, rowH, cx, cy, spaceW = 0.5, prop = false) {
  const m = L.measure(item);
  const wOf = g => (g.space ? spaceW * cellW : prop ? g.w + cellW * 0.14 : cellW);   // prop: 欧文は字幅で詰める
  const rows = [];
  for (const g of m.lay) (rows[g.line] = rows[g.line] || []).push(g);
  const R = rows.length;
  const s = new Array(m.lay.length);
  let ord = 0, x0 = 1e9, x1 = -1e9;
  rows.forEach((row, li) => {
    if (!row) return;
    const wsum = row.reduce((a, g) => a + wOf(g), 0);
    let x = cx - wsum / 2;
    const y = cy + (li - (R - 1) / 2) * rowH;
    let col = 0;
    for (const g of row) {
      const w = wOf(g);
      if (!g.space) s[g.i] = { x: x + w / 2, y, line: li, col: col++, k: ord++ };
      x += w;
    }
    x0 = Math.min(x0, cx - wsum / 2); x1 = Math.max(x1, cx + wsum / 2);
  });
  return { m, s, R, N: ord, bb: bbOf(x0, cy - R * rowH / 2, x1, cy + R * rowH / 2) };
}
const rowCells = lines => Math.max(1, ...lines.map(l => L.glyphs(l).reduce((a, c) => a + (L.isSpace(c) ? 0.5 : L.isLatin(c) ? 0.72 : 1), 0)));
const rowCellsFull = (lines, spaceW = 0.5) => Math.max(1, ...lines.map(l => L.glyphs(l).reduce((a, c) => a + (L.isSpace(c) ? spaceW : 1), 0)));   // 1字=1枠(タイル類)
function rowsOf(text, maxPer) {
  const N = L.glyphs(text).length;
  const k = Math.max(1, Math.ceil(L.glyphCount(text) / maxPer));
  return k === 1 ? [text] : L.splitLines(text, Math.ceil(N / k));
}

/* ================================================================ 1. 和風 */

/* 落款: 縦書き一行 + 朱の印 */
L.register('layout', 'd_hanko', {
  name: '落款', tags: ['wa', 'calm', 'editorial'], w: 1, wa: true,
  fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'tokumin', 'serif']), round: rng.chance(0.35), shu: rng.chance(0.4), tilt: rng.range(-7, 7), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt;
    let item, sx, sy, ss;
    if (!pr.lat) {
      const v = bestV(cut.text, f.font, f.weight, W * (env.portrait ? 0.6 : 0.4), H * 0.8, 3, S * 0.3);
      const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: true, lead: v.lead });
      ss = clamp(v.size * 0.95, S * 0.1, S * 0.19);
      const gap = ss * 0.4, tot = m.w + gap + ss;
      const tx = W / 2 + tot / 2 - m.w / 2;
      item = { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: true, lead: v.lead, x: tx, y: H / 2 };
      sx = tx - m.w / 2 - gap - ss / 2; sy = H / 2 + m.h / 2 - ss / 2;
    } else {
      const v = bestH(cut.text, f.font, f.weight, W * 0.64, H * 0.5, 3, S * 0.2);
      const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
      ss = clamp(v.size * 0.9, S * 0.1, S * 0.17);
      const gap = ss * 0.4, tot = m.w + gap + ss;
      const tx = W / 2 - tot / 2 + m.w / 2;
      item = { text: v.text, font: f.font, weight: f.weight, size: v.size, x: tx, y: H / 2 };
      sx = tx + m.w / 2 + gap + ss / 2; sy = H / 2 + m.h / 2 - ss / 2;
    }
    const bb = L.mainDraw(env, item);
    const d0 = Math.min(0.5, cut.dur * 0.22);
    const ts = clamp((lt - d0) / 0.2);
    if (ts <= 0) return bb;
    const out = 1 - E.inCubic(env.pOut);
    const k = ts < 1 ? 1.55 - 0.59 * E.inQuad(ts) : 0.96 + 0.04 * E.outCubic(clamp((lt - d0 - 0.2) / 0.16));
    const a = Math.min(1, ts * 1.8) * out;
    const red = warm(sc), h = ss / 2;
    const inkC = pr.shu ? red : ink(red);
    withM(env, RSm(sx, sy, (pr.tilt || 0) * DEG, k), () => {
      if (pr.shu) {
        if (pr.round) env.circle(0, 0, h * 0.93, null, red, ss * 0.09, a);
        else env.rrect(-h * 0.91, -h * 0.91, h * 1.82, h * 1.82, ss * 0.05, null, a, false, red, ss * 0.09);
      } else {
        if (pr.round) { env.circle(0, 0, h, red, null, 2, a); env.circle(0, 0, h * 0.83, null, inkC, ss * 0.03, a * 0.9); }
        else { env.rrect(-h, -h, ss, ss, ss * 0.07, red, a, false); env.rrect(-h * 0.8, -h * 0.8, h * 1.6, h * 1.6, ss * 0.02, null, a * 0.9, false, inkC, ss * 0.03); }
      }
      env.text({ text: pr.lat ? firstGlyph(cut.text).toUpperCase() : firstGlyph(cut.text), font: FONT.brush[0], weight: 400, size: ss * 0.58, x: 0, y: 0, color: inkC, alpha: a, ghost: false });
      for (let i = 0; i < 7; i++) env.circle(L.rs(cut.seed, 'sp', i) * h * 0.8, L.rs(cut.seed, 'sp', i, 1) * h * 0.8, ss * (0.012 + 0.022 * L.r(cut.seed, 'sp', i, 2)), sc.bg, null, 1, a * 0.5);
    });
    const rr = clamp((lt - d0 - 0.2) / 0.45);
    if (rr > 0 && rr < 1) {
      const R = h * (1.05 + 0.7 * E.outCubic(rr));
      if (pr.round) env.circle(sx, sy, R, null, red, ss * 0.025, (1 - rr) * 0.45 * out);
      else env.rrect(sx - R, sy - R, R * 2, R * 2, ss * 0.1, null, (1 - rr) * 0.45 * out, false, red, ss * 0.025);
    }
    return L.unionBB(bb, bbOf(sx - h, sy - h, sx + h, sy + h));
  },
}, P);

/* 原稿用紙: 升目に一字ずつ(縦書き) */
L.register('layout', 'd_genkou', {
  name: '原稿用紙', tags: ['wa', 'calm', 'editorial'], w: 0.9, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'body', 'hand', 'serif']), line: rng.pick(['warm', 'cool']), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'serif');
    const io = env.inOut(0.45);
    const paper = sc.paper, ink = sc.onPaper;
    const lineC = L.mix(pr.line === 'cool' ? cool(sc) : warm(sc), paper, 0.3);
    const e = E.outCubic(clamp(env.lt / 0.45));
    const oy = (1 - e) * H * 0.05;
    const ge = clamp((env.lt - 0.08) / 0.5);
    const edge = edgeOf(sc);
    if (!pr.lat) {
      const N = L.glyphs(cut.text).length;
      const maxPer = env.portrait ? 12 : 8;
      const lines = N <= maxPer ? [cut.text] : L.splitLines(cut.text, Math.ceil(N / Math.ceil(N / maxPer)));
      const per = Math.max(...lines.map(l => L.glyphs(l).length));
      const nc = lines.length;
      const R = Math.max(per + 2, env.portrait ? 9 : 6);
      const cell = Math.min(H * 0.8 / (R + 1), W * 0.84 / (nc + 3));
      const C = clamp(Math.floor(W * 0.78 / cell), nc + 2, nc + 10);
      const gw = C * cell, gh = R * cell, mg = cell * 0.5;
      const gx = W / 2 - gw / 2, gy = H / 2 - gh / 2 + oy;
      env.rect(gx - mg + u * 8, gy - mg + u * 8, gw + mg * 2, gh + mg * 2, '#000', 0.22 * io, false);
      env.rect(gx - mg, gy - mg, gw + mg * 2, gh + mg * 2, paper, io, false);
      if (edge) env.rrect(gx - mg, gy - mg, gw + mg * 2, gh + mg * 2, 0, null, io, false, edge, 1.5 * u);
      const segs = [];
      for (let k = 0; k <= C; k++) { const x = gx + k * cell; segs.push([x, gy, x, gy + gh * ge]); }
      for (let j = 0; j <= R; j++) { const y = gy + j * cell; const xr = gx + gw; segs.push([xr, y, xr - gw * ge, y]); }
      strokeSegs(env, segs, lineC, Math.max(1, 1.6 * u), 0.85 * io);
      env.rrect(gx, gy, gw, gh, 0, null, io * ge, false, lineC, Math.max(1.5, 4 * u));
      const size = cell * 0.74;
      const startCol = Math.floor((C - nc) / 2);
      const right = gx + gw - startCol * cell;
      const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size, vertical: true, valign: 'top', lead: cell / size, track: cell / size - 1, color: ink,
        x: right - nc * cell / 2, y: gy + cell + per * cell / 2, delay: dly(env, 0.2) };
      env.text({ text: 'No.' + String(cut.idx + 1).padStart(2, '0') + '　20×20', font: L.roleFont(env, 'body'), weight: 500, size: mg * 0.5, x: gx + gw * 0.2, y: gy + gh + mg * 0.5, color: L.mix(ink, paper, 0.45), alpha: io, ghost: false });
      const bb = L.mainDraw(env, item);
      return bb ? bbOf(gx - mg, gy - mg, gx + gw + mg, gy + gh + mg) : null;
    }
    // 欧文: 罫線ノート
    const v = bestH(cut.text, f.font, f.weight, W * 0.66, H * 0.5, 3, Math.min(W, H) * 0.14);
    const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
    const lh = v.size * 1.18, pw = Math.max(m.w + v.size * 2, W * 0.6), ph = m.h + v.size * 2.4;
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2 + oy;
    env.rect(px + u * 8, py + u * 8, pw, ph, '#000', 0.22 * io, false);
    env.rect(px, py, pw, ph, paper, io, false);
    if (edge) env.rrect(px, py, pw, ph, 0, null, io, false, edge, 1.5 * u);
    const segs = [];
    for (let j = 0; j <= v.k + 1; j++) { const y = H / 2 + oy - m.h / 2 + lh * j + v.size * 0.02; segs.push([px + pw * 0.06, y, px + pw * (0.06 + 0.88 * ge), y]); }
    strokeSegs(env, segs, lineC, Math.max(1, 2 * u), 0.8 * io);
    env.line([[px + pw * 0.1, py], [px + pw * 0.1, py + ph * ge]], lineC, 2 * u, io, false);
    const bb = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, color: ink, x: W / 2, y: H / 2 + oy, delay: dly(env, 0.2) });
    return bb ? bbOf(px, py, px + pw, py + ph) : null;
  },
}, P);

/* 絵馬: 五角形の板が紐で揺れる */
L.register('layout', 'd_ema', {
  name: '絵馬', tags: ['wa', 'emotional', 'calm'], w: 0.9, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['brush', 'serif', 'hand', 'brush']), swing: rng.range(0.7, 1) * rng.sign(), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'brush');
    const lt = env.lt, io = env.inOut(0.3);
    const peg = [W / 2, H * 0.05];
    const top = H * 0.12, ph = H * 0.82, pw = Math.min(W * 0.84, ph * (env.portrait ? 0.95 : 1.3)), roof = ph * 0.2;
    const cx = W / 2, x0 = cx - pw / 2, x1 = cx + pw / 2, yb = top + ph;
    const th = (pr.swing || 1) * 0.2 * Math.exp(-lt / 0.55) * Math.cos(lt * 7.5) + 0.012 * Math.sin(lt * 1.3);
    const drop = -(1 - E.outBack(clamp(lt / 0.5), 1.2)) * H * 0.2;
    const M = mul(rotAbout(peg[0], peg[1], th), Tm(0, drop));
    const wood = L.mix(sc.paper, warm(sc), 0.1), dark = L.mix(wood, '#000', 0.28), edge = L.mix(sc.onPaper, wood, 0.55);
    const v = fitVH(cut.text, f, pw * 0.8, (ph - roof) * 0.72, !pr.lat, 3, S * 0.26);
    const bb = withM(env, M, () => {
      const body = [[x0, top + roof], [cx, top], [x1, top + roof], [x1, yb], [x0, yb]];
      env.poly(body.map(p => [p[0] + u * 7, p[1] + u * 9]), '#000', 0.25 * io, false);
      env.poly(body, wood, io, false);
      const rb = ph * 0.045;
      env.poly([[x0, top + roof], [cx, top], [x1, top + roof], [x1, top + roof + rb], [cx, top + rb], [x0, top + roof + rb]], dark, io, false);
      polyStroke(env, body, edge, 2.5 * u, io);
      const hole = [cx, top + roof * 0.62];
      env.circle(hole[0], hole[1], S * 0.012, L.mix(dark, '#000', 0.3), null, 1, io);
      env.line([[peg[0], peg[1]], [hole[0] - pw * 0.012, hole[1]]], warm(sc), 3 * u, io, false);
      env.line([[peg[0], peg[1]], [hole[0] + pw * 0.012, hole[1]]], warm(sc), 3 * u, io, false);
      env.text({ text: 'No.' + String(cut.idx + 1).padStart(2, '0'), font: L.roleFont(env, 'body'), weight: 500, size: S * 0.026, x: x0 + pw * 0.1, y: yb - ph * 0.05, color: L.mix(sc.onPaper, wood, 0.45), alpha: io, align: 'left', ghost: false });
      return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: cx, y: top + roof + (ph - roof) * 0.48, delay: dly(env, 0.25) });
    });
    env.circle(peg[0], peg[1], S * 0.014, sc.sub, null, 1, io);
    return bb ? mapBB(bbOf(x0, top, x1, yb), M) : null;
  },
}, P);

/* 提灯: 光る提灯に縦書き */
L.register('layout', 'd_chochin', {
  name: '提灯', tags: ['wa', 'emotional', 'dark'], w: 1, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 18,
  plan: (rng, cut) => ({ font: rng.pick(['brush', 'serif', 'tokumin']), K: isLat(cut.text) || cut.n <= 7 ? 1 : cut.n <= 13 ? 2 : 3, lat: isLat(cut.text), glow: rng.range(0.6, 1) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'brush');
    const lt = env.lt, io = env.inOut(0.4);
    const vert = env.portrait;                       // 縦長は上下に吊る
    const parts = partsOf(cut.text, vert ? (cut.n <= 10 || pr.lat ? 1 : 2) : (pr.K || 1)), K = parts.length;
    let lh = vert ? H * (K === 1 ? 0.62 : 0.4) : H * 0.66, lw = lh * 0.62;
    if (vert && lw > W * 0.8) { lw = W * 0.8; lh = lw / 0.62; }
    if (!vert && K * lw * 1.28 > W * 0.9) { lw = W * 0.9 / (K * 1.28); lh = Math.min(lh, lw / 0.62); }
    const warmC = warm(sc);
    const fits = fitParts(parts, f, lw * 0.6, lh * 0.66, !pr.lat, 2, lw * 0.5);
    const inner = L.mix(sc.paper, '#ffffff', 0.25), outer = L.mix(sc.paper, warmC, 0.62);
    const txtC = L.fitContrast(L.mix(warmC, '#000000', 0.35), sc.paper, 4.5);
    const capC = L.mix(sc.onPaper, '#000000', 0.35);
    let bb = null;
    parts.forEach((part, i) => {
      const slot = pr.lat || vert ? i : K - 1 - i;
      const cx = vert ? W / 2 : W / 2 + (slot - (K - 1) / 2) * lw * 1.28;
      const cy = vert ? H * (K === 1 ? 0.54 : 0.29 + 0.46 * i) : H * 0.53;
      const e = E.outCubic(clamp((lt - i * 0.08) / 0.6));
      const th = 0.045 * Math.sin(lt * 1.7 + i * 1.3) * (0.4 + 0.6 * Math.exp(-lt));
      const M = mul(rotAbout(cx, 0, th), Tm(0, -(1 - e) * H * 0.45));
      const fl = 0.85 + 0.15 * L.noise1(env.t * 4 + i * 7, cut.seed);
      const capH = lh * 0.07, rx = lw / 2, ry = lh / 2;
      withM(env, M, () => {
        env.line([[cx, vert && i ? H * 0.29 + lh / 2 : 0], [cx, cy - ry - capH * 0.6]], capC, 2 * u, io, false);
        raw(env, c => {
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, lw * 1.25);
          g.addColorStop(0, L.rgba(warmC, 0.45 * (pr.glow || 0.8) * fl * io));
          g.addColorStop(1, L.rgba(warmC, 0));
          c.fillStyle = g; c.fillRect(cx - lw * 1.3, cy - lw * 1.3, lw * 2.6, lw * 2.6);
          const b = c.createRadialGradient(cx - rx * 0.2, cy - ry * 0.1, 0, cx, cy, Math.max(rx, ry));
          b.addColorStop(0, inner); b.addColorStop(0.55, L.mix(inner, outer, 0.45)); b.addColorStop(1, outer);
          c.globalAlpha = io; c.fillStyle = b; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fill();
          c.strokeStyle = L.mix(outer, '#000000', 0.35); c.lineWidth = Math.max(1, 1.4 * u); c.globalAlpha = io * 0.45;
          c.beginPath();
          for (let j = 1; j < 11; j++) {
            const y = cy - ry + j * lh / 11, hw = rx * Math.sqrt(Math.max(0, 1 - Math.pow((y - cy) / ry, 2)));
            c.moveTo(cx - hw, y); c.quadraticCurveTo(cx, y + lh * 0.02, cx + hw, y);
          }
          c.stroke();
        });
        env.rrect(cx - rx * 0.56, cy - ry - capH * 0.65, rx * 1.12, capH, capH * 0.2, capC, io, false);
        env.rrect(cx - rx * 0.56, cy + ry - capH * 0.35, rx * 1.12, capH, capH * 0.2, capC, io, false);
        const v = fits[i];
        const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: txtC, x: cx, y: cy, mi: i, delay: dly(env, 0.25) });
        if (b) bb = L.unionBB(bb, mapBB(bbOf(cx - rx, cy - ry, cx + rx, cy + ry), M));
      });
    });
    return bb;
  },
}, P);

/* 暖簾: 竿から下がる布が風に揺れる */
L.register('layout', 'd_noren', {
  name: '暖簾', tags: ['wa', 'calm', 'graphic'], w: 1, wa: true, treat: 'safe', busy: true,
  fits: n => n >= 1 && n <= 20,
  plan: (rng, cut) => ({ font: rng.pick(['dela', 'serif', 'brush', 'display']), col: rng.pick(['ink', 'a2', 'fg', 'warm']), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'dela');
    const lt = env.lt, io = env.inOut(0.35);
    const gl = L.glyphs(cut.text).filter(c => !L.isSpace(c));
    const glyphMode = !pr.lat && gl.length <= 5;
    let parts;
    if (glyphMode) parts = gl;
    else parts = partsOf(cut.text, clamp(Math.ceil(cut.n / (pr.lat ? 6 : 4)), 2, 5));
    const K = parts.length;
    const fill0 = pr.col === 'a2' ? sc.accent2 : pr.col === 'fg' ? sc.fg : pr.col === 'warm' ? warm(sc) : L.mix(sc.accent, '#000000', 0.5);
    const fill = fill0;
    const txt = ink(fill);
    const edge = L.contrast(fill, sc.bg) < 1.6 ? sc.sub : null;
    const rodY = H * 0.07, x0 = W * 0.05, x1 = W * 0.95, bandH = H * 0.09, y1 = H * (env.portrait ? 0.74 : 0.88);
    const gap = (x1 - x0) * 0.014, pw = (x1 - x0 - gap * (K - 1)) / K, yb = rodY + bandH;
    const fits = glyphMode ? null : fitParts(parts, f, pw * 0.78, (y1 - yb) * 0.78, !pr.lat, 2, pw * 0.7);
    const rodC = L.mix(sc.fg, sc.bg, 0.35);
    env.line([[x0 - W * 0.02, rodY], [x1 + W * 0.02, rodY]], rodC, 7 * u, io, false);
    env.circle(x0 - W * 0.02, rodY, 7 * u, rodC, null, 1, io); env.circle(x1 + W * 0.02, rodY, 7 * u, rodC, null, 1, io);
    const gb = E.outCubic(clamp(lt / 0.35));
    env.rect(x0, rodY, x1 - x0, bandH * gb, fill, io, false);
    if (edge) env.rrect(x0, rodY, x1 - x0, bandH * gb, 0, null, io, false, edge, 1.5 * u);
    let bb = null;
    parts.forEach((part, i) => {
      const slot = glyphMode || pr.lat ? i : K - 1 - i;
      const xl = x0 + slot * (pw + gap), xr = xl + pw, cxp = (xl + xr) / 2;
      const grow = E.outCubic(clamp((lt - 0.1 - slot * 0.06) / 0.5));
      const h = (y1 - yb) * grow;
      if (h <= 1) return;
      const a = 0.26 * Math.exp(-lt / 0.45) * Math.sin(lt * 9 + slot) + 0.05 * Math.sin(lt * 1.6 + slot * 0.9);
      const t = Math.tan(a);
      const M = [1, 0, t, 1, -t * yb, 0];
      withM(env, M, () => {
        env.rect(xl, yb - 1, pw, h + 1, fill, io, false);
        env.rect(xl, yb + h - H * 0.012, pw, H * 0.012, L.mix(fill, '#000000', 0.25), io, false);
        if (edge) env.rrect(xl, yb, pw, h, 0, null, io, false, edge, 1.5 * u);
        const ty = yb + (y1 - yb) * 0.42;
        if (glyphMode) {
          const size = Math.min(pw * 0.66, (y1 - yb) * 0.42);
          env.circle(cxp, ty, size * 0.72, null, txt, Math.max(1, size * 0.04), 0.3 * io);
          const b = L.mainDraw(env, { text: part, font: f.font, weight: f.weight, size, color: txt, x: cxp, y: ty, mi: i, delay: dly(env, 0.3) });
          if (b) bb = L.unionBB(bb, mapBB(b, M));
        } else {
          const v = fits[i];
          const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: txt, x: cxp, y: yb + (y1 - yb) * 0.46, mi: i, delay: dly(env, 0.3) });
          if (b) bb = L.unionBB(bb, mapBB(b, M));
        }
      });
    });
    return bb;
  },
}, P);

/* 短冊: 竹竿に吊られた短冊が揺れる */
L.register('layout', 'd_tanzaku', {
  name: '短冊', tags: ['wa', 'emotional', 'calm', 'pop'], w: 1, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['brush', 'serif', 'hand', 'mai']), K: isLat(cut.text) ? (cut.n > 12 ? 2 : 1) : cut.n <= 6 ? 1 : cut.n <= 14 ? 2 : 3,
    hang: [rng(), rng(), rng()], col: rng.int(0, 3), swing: rng.sign(), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'brush');
    const lt = env.lt, io = env.inOut(0.35);
    const parts = partsOf(cut.text, pr.K || 1), K = parts.length;
    const poleY = H * 0.08;
    const pal = [sc.paper, L.mix(sc.accent, '#ffffff', 0.55), L.mix(sc.accent2, '#ffffff', 0.5), L.mix(warm(sc), '#ffffff', 0.62)];
    const poleC = L.mix(sc.fg, sc.bg, 0.4);
    const pe = E.outCubic(clamp(lt / 0.4));
    env.line([[W * 0.04, poleY], [W * 0.04 + W * 0.92 * pe, poleY]], poleC, 8 * u, io, false);
    const ticks = [];
    for (let x = W * 0.12; x < W * 0.04 + W * 0.92 * pe; x += W * 0.16) ticks.push([x, poleY - 6 * u, x, poleY + 6 * u]);
    strokeSegs(env, ticks, L.mix(poleC, sc.bg, 0.4), 3 * u, io);
    const sw = Math.min(W * 0.84 / K * 0.62, H * 0.24);
    const shMax = H * 0.95 - (poleY + H * 0.1) - H * 0.02;
    const fits = fitParts(parts, f, sw * 0.72, shMax * 0.78, !pr.lat, 2, sw * 0.62, true);
    let bb = null;
    parts.forEach((part, i) => {
      const slot = pr.lat ? i : K - 1 - i;
      const ax = W / 2 + (slot - (K - 1) / 2) * (W * 0.84 / K);
      const str = H * 0.03 + ((pr.hang && pr.hang[i]) || 0.5) * H * 0.07;
      const top = poleY + str, sh = H * 0.95 - top - H * 0.02;
      const tau = clamp((lt - i * 0.12) / 0.7);
      const th = -(1 - E.outCubic(tau)) * 1.25 * (pr.swing || 1) + (pr.swing || 1) * 0.14 * Math.exp(-lt / 0.7) * Math.sin(lt * 6 + i) * tau + 0.02 * Math.sin(lt * 1.4 + i);
      const M = rotAbout(ax, poleY, th);
      const fill = pal[((pr.col || 0) + i) % 4];
      const txt = ink(fill);
      const a = io * clamp(tau * 4);
      withM(env, M, () => {
        env.line([[ax, poleY], [ax, top + sw * 0.12]], L.mix(sc.fg, sc.bg, 0.3), 2 * u, a, false);
        env.rect(ax - sw / 2 + u * 6, top + u * 8, sw, sh, '#000', 0.22 * a, false);
        env.rect(ax - sw / 2, top, sw, sh, fill, a, false);
        if (L.contrast(fill, sc.bg) < 1.35) env.rrect(ax - sw / 2, top, sw, sh, 0, null, a, false, L.mix(txt, fill, 0.7), 1.5 * u);
        env.circle(ax, top + sw * 0.12, sw * 0.05, null, L.mix(txt, fill, 0.5), 1.5 * u, a);
        const v = fits[i];
        const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, rot: v.rot, color: txt, x: ax, y: top + sh * 0.53, mi: i, delay: dly(env, 0.3) });
        if (b) bb = L.unionBB(bb, mapBB(bbOf(ax - sw / 2, top, ax + sw / 2, top + sh), M));
      });
    });
    return bb;
  },
}, P);

/* おみくじ: 折り畳まれた紙が開く */
L.register('layout', 'd_omikuji', {
  name: 'おみくじ', tags: ['wa', 'pop', 'calm'], w: 0.8, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'tokumin']), fortune: rng.pick(['大吉', '中吉', '小吉', '吉', '末吉', '大吉']), num: rng.int(1, 99), tilt: rng.range(-3, 3), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.3);
    const pw = env.portrait ? W * 0.72 : Math.min(W * 0.44, H * 0.64), ph = H * 0.86;
    const cx = W / 2, cy = H / 2;
    const e = E.inOutCubic(clamp(lt / 0.6));
    const cw = pw * (0.1 + 0.9 * e);
    const M = rotAbout(cx, cy, (pr.tilt || 0) * DEG);
    const red = warm(sc), redT = L.fitContrast(red, sc.paper, 3.5);
    const edge = edgeOf(sc) || L.mix(sc.onPaper, sc.paper, 0.8);
    let bb = null;
    withM(env, M, () => {
      const x0 = cx - cw / 2, y0 = cy - ph / 2;
      env.rect(x0 + u * 7, y0 + u * 9, cw, ph, '#000', 0.22 * io, false);
      env.rect(x0, y0, cw, ph, sc.paper, io, false);
      env.rrect(x0, y0, cw, ph, 0, null, io, false, edge, 1.5 * u);
      const segs = [];
      for (let k = 1; k < 4; k++) segs.push([x0 + cw * k / 4, y0, x0 + cw * k / 4, y0 + ph]);
      for (let k = 0; k < 4; k += 2) env.rect(x0 + cw * (k + 1) / 4, y0, cw / 4, ph, sc.onPaper, (1 - e) * 0.18 * io + 0.025 * io, false);
      strokeSegs(env, segs, sc.onPaper, Math.max(1, 1.2 * u), (0.08 + (1 - e) * 0.25) * io);
      const ha = io * clamp((lt - 0.45) / 0.3);
      const hy0 = y0 + ph * 0.05, hh = ph * 0.2;
      env.rrect(cx - pw * 0.36, hy0, pw * 0.72, hh, 0, null, ha, false, redT, 2.5 * u);
      env.rrect(cx - pw * 0.34, hy0 + ph * 0.008, pw * 0.68, hh - ph * 0.016, 0, null, ha, false, redT, 1 * u);
      env.text({ text: '第' + kanjiNum(pr.num || 7) + '番', font: L.roleFont(env, 'serif'), weight: 700, size: ph * 0.034, x: cx, y: hy0 + hh * 0.24, color: redT, alpha: ha, ghost: false });
      env.text({ text: pr.fortune || '吉', font: FONT.tokumin[0], weight: 800, size: Math.min(ph * 0.085, pw * 0.26), x: cx, y: hy0 + hh * 0.64, color: redT, alpha: ha, ghost: false, track: 0.3 });
      env.line([[cx - pw * 0.36, hy0 + hh + ph * 0.03], [cx + pw * 0.36, hy0 + hh + ph * 0.03]], redT, 1.5 * u, ha, false);
      const by0 = hy0 + hh + ph * 0.06, bh = y0 + ph * 0.95 - by0;
      const v = fitVH(cut.text, f, pw * 0.76, bh * 0.9, !pr.lat, 3, S * 0.18);
      const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: cx, y: by0 + bh / 2, delay: dly(env, 0.45) });
      if (b) bb = mapBB(bbOf(cx - pw / 2, y0, cx + pw / 2, y0 + ph), M);
    });
    return bb;
  },
}, P);

/* 掛け軸: 上から巻き下ろされる掛け軸 */
L.register('layout', 'd_kakejiku', {
  name: '掛け軸', tags: ['wa', 'calm', 'editorial'], w: 1, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['brush', 'serif', 'mai', 'tokumin']), mount: rng.pick(['a', 'a2', 'warm']), seal: rng.chance(0.75), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'brush');
    const lt = env.lt, io = env.inOut(0.3);
    const sw = env.portrait ? W * 0.62 : Math.min(W * 0.36, H * 0.52);
    const top = H * 0.09, SH = H * 0.84, cx = W / 2;
    const e = E.outCubic(clamp(lt / 0.75));
    const cur = SH * e;
    const base = pr.mount === 'a2' ? sc.accent2 : pr.mount === 'warm' ? warm(sc) : sc.accent;
    const mountC = L.mix(base, '#000000', 0.42), rodC = L.mix(sc.onPaper, '#000000', 0.3);
    const rodH = S * 0.022;
    env.line([[cx, H * 0.015], [cx - sw * 0.34, top]], rodC, 2 * u, io, false);
    env.line([[cx, H * 0.015], [cx + sw * 0.34, top]], rodC, 2 * u, io, false);
    env.rect(cx - sw / 2 + u * 8, top + u * 8, sw, cur, '#000', 0.22 * io, false);
    env.rect(cx - sw / 2, top, sw, cur, mountC, io, false);
    const pT = top + SH * 0.1, pB = top + SH * 0.88, px0 = cx - sw * 0.4;
    const pv = clamp(top + cur - pT, 0, pB - pT);
    if (pv > 0) {
      env.rect(px0, pT, sw * 0.8, pv, sc.paper, io, false);
      env.rect(px0, pT, sw * 0.8, Math.min(pv, SH * 0.018), L.mix(base, sc.paper, 0.45), io, false);
      if (pv >= pB - pT - 1) env.rect(px0, pB - SH * 0.018, sw * 0.8, SH * 0.018, L.mix(base, sc.paper, 0.45), io, false);
    }
    env.rrect(cx - sw * 0.56, top - rodH * 0.6, sw * 1.12, rodH, rodH * 0.4, rodC, io, false);
    const ry = top + cur;
    env.rrect(cx - sw * 0.54, ry - rodH * 0.4, sw * 1.08, rodH * 1.3, rodH * 0.5, rodC, io, false);
    env.circle(cx - sw * 0.6, ry + rodH * 0.25, rodH * 0.75, L.mix(rodC, sc.paper, 0.25), null, 1, io);
    env.circle(cx + sw * 0.6, ry + rodH * 0.25, rodH * 0.75, L.mix(rodC, sc.paper, 0.25), null, 1, io);
    const v = fitVH(cut.text, f, sw * 0.64, (pB - pT) * 0.8, !pr.lat, 3, S * 0.2);
    const item = { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: cx, y: (pT + pB) / 2 - (pB - pT) * 0.03, delay: Math.min(0.55, cut.dur * 0.2) };
    const bb = L.mainDraw(env, item);
    if (pr.seal && bb) {
      const m = L.measure(item);
      const ss = clamp(v.size * 0.5, S * 0.035, S * 0.06);
      const sa = io * clamp((lt - item.delay - 0.35) / 0.2);
      const sx = v.vertical ? cx - m.w / 2 - ss * 0.7 : cx + m.w / 2 - ss / 2, sy = v.vertical ? item.y + m.h / 2 - ss / 2 : item.y + m.h / 2 + ss * 0.8;
      if (sa > 0) {
        env.rrect(sx - ss / 2, sy - ss / 2, ss, ss, ss * 0.08, warm(sc), sa, false);
        env.text({ text: firstGlyph(cut.text), font: FONT.brush[0], weight: 400, size: ss * 0.62, x: sx, y: sy, color: ink(warm(sc)), alpha: sa, ghost: false });
      }
    }
    return bb ? bbOf(cx - sw / 2, top, cx + sw / 2, top + SH) : null;
  },
}, P);

/* 障子: 背後から照らされた影文字、手前に格子 */
L.register('layout', 'd_shoji', {
  name: '障子', tags: ['wa', 'calm', 'emotional'], w: 0.9, wa: true, treat: false, busy: true,
  fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'tokumin']), doors: 3, vert: !isLat(cut.text) && rng.chance(0.55), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.5);
    const x0 = W * 0.03, y0 = H * 0.04, w = W * 0.94, h = H * 0.92;
    const warmC = warm(sc);
    env.rect(x0, y0, w, h, sc.paper, io * 0.97, false);
    raw(env, c => {
      const lit = E.outCubic(clamp(lt / 0.8));
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, L.rgba(L.mix(warmC, '#ffffff', 0.5), 0.5 * lit * io));
      g.addColorStop(1, L.rgba(warmC, 0.08 * lit * io));
      c.fillStyle = g; c.fillRect(x0, y0, w, h);
    });
    const v = fitVH(cut.text, f, w * 0.78, h * 0.74, !!pr.vert, 3, S * 0.3);
    const sil = L.mix(sc.onPaper, sc.paper, 0.1);
    const blur = S * 0.0014 + S * 0.007 * (1 - E.outCubic(clamp(lt / 0.9)));
    const bb = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sil, blur, x: W / 2, y: H / 2, alpha: 0.92 });
    const wood = L.mix(L.mix(warmC, '#000000', 0.6), sc.onPaper, 0.35);
    const ge = E.outCubic(clamp((lt - 0.05) / 0.6));
    const D = pr.doors || 3, dw = w / D;
    const cols = 3, rows = env.portrait ? 9 : 5;
    const thin = [];
    for (let d = 0; d < D; d++) {
      const dx0 = x0 + d * dw;
      for (let k = 1; k < cols; k++) { const x = dx0 + dw * k / cols; thin.push([x, y0, x, y0 + h * ge]); }
      for (let j = 1; j < rows; j++) { const y = y0 + h * j / rows; thin.push([dx0, y, dx0 + dw * ge, y]); }
    }
    strokeSegs(env, thin, wood, Math.max(1, 2.4 * u), io * 0.9);
    const thick = [[x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h, x0, y0]];
    for (let d = 1; d < D; d++) thick.push([x0 + d * dw, y0, x0 + d * dw, y0 + h * ge]);
    strokeSegs(env, thick, wood, Math.max(2, 6 * u), io);
    return bb;
  },
}, P);

/* かるた札: 札が叩きつけられる */
L.register('layout', 'd_karuta', {
  name: 'かるた札', tags: ['wa', 'pop', 'graphic'], w: 0.9, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'dela', 'tokumin']), K: isLat(cut.text) ? 1 : cut.n <= 5 ? 1 : cut.n <= 12 ? 2 : 3, rots: [rng.range(-7, 7), rng.range(-7, 7), rng.range(-7, 7)], frame: rng.pick(['warm', 'a', 'a2']), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.2);
    const sq = !env.portrait && W / H < 1.3;
    const parts = partsOf(cut.text, env.portrait || sq ? Math.min(2, pr.K || 1) : (pr.K || 1)), K = parts.length;
    const cols = env.portrait ? 1 : K, rows = env.portrait ? K : 1;
    const cellW = W * 0.9 / cols, cellH = H * 0.86 / rows;
    const ch = Math.min(cellH * 0.9, cellW * 0.86 / 0.72), cw = ch * 0.72;
    const frameC = pr.frame === 'a' ? sc.accent : pr.frame === 'a2' ? sc.accent2 : warm(sc);
    const red = warm(sc);
    const fits = fitParts(parts, f, cw * 0.64, ch * 0.62, !pr.lat, 2, cw * 0.42);
    let bb = null;
    parts.forEach((part, j) => {
      const slot = pr.lat ? j : (env.portrait ? j : K - 1 - j);
      const cx = env.portrait ? W / 2 : W / 2 + (slot - (K - 1) / 2) * cellW;
      const cy = env.portrait ? H / 2 + (slot - (K - 1) / 2) * cellH : H / 2;
      const t0 = j * 0.14, tau = clamp((lt - t0) / 0.26);
      if (tau <= 0) return;
      const k = 1 + 0.6 * (1 - E.inQuad(tau)) - 0.03 * Math.sin(Math.PI * clamp((lt - t0 - 0.26) / 0.18));
      const a = clamp(tau * 3) * io;
      const rot = ((pr.rots && pr.rots[j]) || 0) * DEG;
      const M = RSm(cx, cy, rot, k);
      withM(env, M, () => {
        env.rrect(-cw / 2 + u * 6, -ch / 2 + u * 9, cw, ch, cw * 0.05, '#000', 0.3 * a, false);
        env.rrect(-cw / 2, -ch / 2, cw, ch, cw * 0.05, frameC, a, false);
        env.rrect(-cw / 2 + cw * 0.06, -ch / 2 + cw * 0.06, cw * 0.88, ch - cw * 0.12, cw * 0.02, sc.paper, a, false);
        const r = cw * 0.15, mx = cw / 2 - cw * 0.24, my = -ch / 2 + cw * 0.24;
        env.circle(mx, my, r, null, red, Math.max(1.5, cw * 0.018), a);
        env.text({ text: firstGlyph(part), font: FONT.brush[0], weight: 400, size: r * 1.2, x: mx, y: my, color: L.fitContrast(red, sc.paper, 3), alpha: a, ghost: false });
        const v = fits[j];
        const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: -cw * 0.04, y: ch * 0.1, mi: j, delay: dly(env, 0.18) });
        if (b) bb = L.unionBB(bb, mapBB(bbOf(-cw / 2, -ch / 2, cw / 2, ch / 2), M));
      });
      const ip = clamp((lt - t0 - 0.26) / 0.3);
      if (ip > 0 && ip < 1) {
        const segs = [];
        const R0 = Math.hypot(cw, ch) * 0.52, R1 = R0 + S * 0.07 * E.outCubic(ip);
        for (let q = 0; q < 10; q++) {
          const ang = q / 10 * TAU + 0.3;
          const ex = Math.cos(ang), ey = Math.sin(ang);
          segs.push([cx + ex * R0 * 0.95, cy + ey * R0 * 0.95 * (ch / Math.hypot(cw, ch) * 1.4), cx + ex * R1, cy + ey * R1 * (ch / Math.hypot(cw, ch) * 1.4)]);
        }
        strokeSegs(env, segs, sc.fg, 3 * u, (1 - ip) * 0.8 * io);
      }
    });
    return bb;
  },
}, P);

/* 扇: 開く扇の弧に沿って文字 */
L.register('layout', 'd_sensu', {
  name: '扇', tags: ['wa', 'calm', 'emotional', 'graphic'], w: 1, wa: true, treat: 'safe',
  fits: n => n >= 1 && n <= 20,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'dela', 'tokumin']), col: rng.pick(['paper', 'a2', 'warm', 'paper']), span: rng.range(140, 160), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.3);
    const A = (env.portrait ? Math.min(pr.span || 150, 124) : (pr.span || 150)) * DEG, half = A / 2;
    const R1 = Math.min(H * 0.78, W * 0.46 / Math.sin(half)), R0 = R1 * 0.4;
    const px = W / 2, py = H / 2 + R1 / 2 - R1 * 0.02;
    const ho = half * E.outCubic(clamp(lt / 0.6));
    const fill = pr.col === 'a2' ? sc.accent2 : pr.col === 'warm' ? warm(sc) : sc.paper;
    const fill2 = L.mix(fill, '#000000', 0.1);
    const txt = ink(fill) === '#ffffff' && pr.col !== 'paper' ? '#ffffff' : (pr.col === 'paper' ? sc.onPaper : ink(fill));
    const rib = L.mix(warm(sc), '#000000', 0.55);
    const m = 16;
    raw(env, c => {
      c.globalAlpha = io;
      for (const par of [0, 1]) {
        c.beginPath();
        for (let k = par; k < m; k += 2) {
          const a0 = -Math.PI / 2 - ho + 2 * ho * k / m, a1 = -Math.PI / 2 - ho + 2 * ho * (k + 1) / m;
          c.moveTo(px + Math.cos(a0) * R0, py + Math.sin(a0) * R0);
          c.arc(px, py, R1, a0, a1);
          c.arc(px, py, R0, a1, a0, true);
          c.closePath();
        }
        c.fillStyle = par ? fill2 : fill; c.fill();
      }
      if (L.contrast(fill, sc.bg) < 1.4) { c.strokeStyle = L.mix(sc.onPaper, fill, 0.6); c.lineWidth = 1.5 * u; c.beginPath(); c.arc(px, py, R1, -Math.PI / 2 - ho, -Math.PI / 2 + ho); c.arc(px, py, R0, -Math.PI / 2 + ho, -Math.PI / 2 - ho, true); c.closePath(); c.stroke(); }
    });
    const segs = [];
    for (let k = 0; k <= m; k++) {
      const a = -Math.PI / 2 - ho + 2 * ho * k / m;
      segs.push([px + Math.cos(a) * R0 * 0.12, py + Math.sin(a) * R0 * 0.12, px + Math.cos(a) * R0, py + Math.sin(a) * R0]);
    }
    strokeSegs(env, segs, rib, Math.max(1.5, 4 * u), io);
    const ga = [-Math.PI / 2 - ho, -Math.PI / 2 + ho].map(a => [px + Math.cos(a) * R0 * 0.1, py + Math.sin(a) * R0 * 0.1, px + Math.cos(a) * R1 * 1.02, py + Math.sin(a) * R1 * 1.02]);
    strokeSegs(env, ga, rib, Math.max(2, 7 * u), io);
    env.circle(px, py, S * 0.014, L.mix(rib, '#ffffff', 0.3), null, 1, io);
    // 文字: 弧に沿わせる
    const lines = pr.lat ? rowsOf(cut.text, 9) : rowsOf(cut.text, 10);
    const rowsN = Math.min(2, lines.length);
    const useLines = rowsN === 1 ? [lines.join('')] : [lines[0], lines.slice(1).join('')];
    const radii = rowsN === 1 ? [R0 + (R1 - R0) * 0.55] : [R0 + (R1 - R0) * 0.72, R0 + (R1 - R0) * 0.34];
    const thick = (R1 - R0) / rowsN * 0.66;
    let size = thick;
    useLines.forEach((ln, r) => {
      const w100 = L.measure({ text: ln, font: f.font, weight: f.weight, size: 100 }).w / 100;
      size = Math.min(size, radii[r] * A * 0.86 / Math.max(0.5, w100));
    });
    let bb = null;
    useLines.forEach((ln, r) => {
      const rr = radii[r];
      const item = { text: ln, font: f.font, weight: f.weight, size, color: txt, x: px, y: py - rr, mi: r, delay: dly(env, 0.3) };
      item.charFns = [(i, g) => {
        const ang = g.x / rr;
        const vis = clamp((ho - Math.abs(ang)) / 0.1);
        if (vis <= 0) return { hide: true };
        return { dx: px + rr * Math.sin(ang) - (px + g.x), dy: py - rr * Math.cos(ang) - (py - rr + g.y), rot: ang, a: vis };
      }];
      const b = L.mainDraw(env, item);
      if (b) bb = bbOf(px - R1 * Math.sin(Math.min(ho, Math.PI / 2)), py - R1, px + R1 * Math.sin(Math.min(ho, Math.PI / 2)), py);
    });
    return bb;
  },
}, P);

/* 家紋: 紋の丸と縦書き / 紋を囲む輪の文字 */
function drawCrest(env, cx, cy, R, rot, e, e2, motif, pet, color, a) {
  env.arc(cx, cy, R, -90, -90 + 360 * e, color, R * 0.075, a);
  env.arc(cx, cy, R * 0.86, 90, 90 + 360 * e, color, R * 0.022, a);
  if (e2 <= 0) return;
  if (motif === 0) {
    for (let k = 0; k < pet; k++) {
      const an = rot + k * TAU / pet;
      env.circle(cx + Math.cos(an) * R * 0.34 * e2, cy + Math.sin(an) * R * 0.34 * e2, R * 0.3 * e2, null, color, R * 0.05, a);
    }
    env.circle(cx, cy, R * 0.1 * e2, color, null, 1, a);
  } else if (motif === 1) {                        // 亀甲: 入れ子の六角形 + 花
    const hex = (r, ph) => { const pts = []; for (let k = 0; k < 6; k++) { const an = rot + ph + k * Math.PI / 3; pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]); } return pts; };
    polyStroke(env, hex(R * 0.64 * e2, Math.PI / 6), color, R * 0.07, a);
    polyStroke(env, hex(R * 0.5 * e2, Math.PI / 6), color, R * 0.025, a);
    for (let k = 0; k < pet; k++) {
      const an = rot + k * TAU / pet;
      env.circle(cx + Math.cos(an) * R * 0.17 * e2, cy + Math.sin(an) * R * 0.17 * e2, R * 0.1 * e2, color, null, 1, a);
    }
  } else {
    for (let k = 0; k < pet; k++) {
      const an = rot + k * TAU / pet;
      const qx = cx + Math.cos(an) * R * 0.4 * e2, qy = cy + Math.sin(an) * R * 0.4 * e2, d = R * 0.2 * e2;
      const ca = Math.cos(an), sa = Math.sin(an);
      env.poly([[qx + ca * d, qy + sa * d], [qx - sa * d * 0.62, qy + ca * d * 0.62], [qx - ca * d, qy - sa * d], [qx + sa * d * 0.62, qy - ca * d * 0.62]], color, a, false);
    }
    env.circle(cx, cy, R * 0.12 * e2, null, color, R * 0.04, a);
  }
}
L.register('layout', 'd_kamon', {
  name: '家紋', tags: ['wa', 'graphic', 'calm'], w: 0.9, wa: true,
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'dela']), motif: rng.int(0, 2), pet: rng.pick([3, 4, 5, 6]), ring: !isLat(cut.text) && cut.n >= 2 && cut.n <= 10 && rng.chance(0.5), side: rng.sign(), useWarm: rng.chance(0.6), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.4);
    const e = E.outCubic(clamp(lt / 0.7)), e2 = E.outBack(clamp((lt - 0.15) / 0.5), 1.3);
    const col = pr.useWarm ? L.fitContrast(warm(sc), sc.bg, 2.2) : sc.fg;
    const rot = (1 - e) * -Math.PI / 2 + lt * 0.05;
    if (pr.ring) {
      const Rr = S * 0.42, cx = W / 2, cy = H / 2;
      drawCrest(env, cx, cy, Rr * 0.52, rot, e, e2, pr.motif, pr.pet, col, io);
      env.arc(cx, cy, Rr * 0.66, 0, 360 * e, col, S * 0.004, io * 0.6);
      env.arc(cx, cy, Rr, 180, 180 + 360 * e, col, S * 0.004, io * 0.6);
      const rt = Rr * 0.83, size = Rr * 0.24;
      const gl = L.glyphs(cut.text);
      const step = Math.min(TAU / gl.length, size * 1.12 / rt);
      const item = { text: cut.text, font: f.font, weight: f.weight, size, x: cx, y: cy, color: sc.fg };
      item.charFns = [(i, g, n) => {
        const an = -Math.PI / 2 + (i - (n - 1) / 2) * step;
        return { dx: cx + Math.cos(an) * rt - (cx + g.x), dy: cy + Math.sin(an) * rt - (cy + g.y), rot: an + Math.PI / 2 };
      }];
      const b = L.mainDraw(env, item);
      return b ? bbOf(cx - Rr, cy - Rr, cx + Rr, cy + Rr) : null;
    }
    let ccx, ccy, R, tx, ty, v;
    if (env.portrait) {
      R = W * 0.3; ccx = W / 2; ccy = H * 0.28;
      v = fitVH(cut.text, f, W * 0.88, H * 0.36, false, 3, S * 0.24);
      tx = W / 2; ty = H * 0.72;
    } else {
      R = Math.min(H * 0.34, W * 0.19);
      const gap = S * 0.07;
      v = fitVH(cut.text, f, W * 0.9 - 2 * R - gap, H * 0.84, !pr.lat, 3, S * 0.26);
      const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead });
      const tot = 2 * R + gap + m.w, sd = pr.side || 1, xs = W / 2 - tot / 2;
      ccx = sd > 0 ? xs + R : xs + tot - R; tx = sd > 0 ? xs + 2 * R + gap + m.w / 2 : xs + m.w / 2;
      ccy = H / 2; ty = H / 2;
    }
    drawCrest(env, ccx, ccy, R, rot, e, e2, pr.motif, pr.pet, col, io);
    const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, x: tx, y: ty, delay: dly(env, 0.2) });
    return b ? L.unionBB(b, bbOf(ccx - R, ccy - R, ccx + R, ccy + R)) : null;
  },
}, P);

/* 青海波: 波文様の板 + 中央のカルトゥーシュ */
L.register('layout', 'd_seigaiha', {
  name: '青海波', tags: ['wa', 'calm', 'graphic'], w: 0.9, wa: true, treat: 'safe', busy: true,
  fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ font: rng.pick(['serif', 'brush', 'display']), vert: !isLat(cut.text) && rng.chance(0.5), cart: cut.n <= 8 && rng.chance(0.6) ? 'circle' : 'rect', colA: rng.pick(['a', 'a2']), lat: isLat(cut.text) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif');
    const lt = env.lt, io = env.inOut(0.45);
    const base = pr.colA === 'a2' ? sc.accent2 : sc.accent;
    const plateC = L.mix(sc.bg, base, 0.32), arcC = L.mix(plateC, sc.fg, 0.4);
    const x0 = W * 0.04, pw = W * 0.92, ph = H * (env.portrait ? 0.62 : 0.8), y0 = (H - ph) / 2;
    const e = E.outCubic(clamp(lt / 0.55));
    const r = S * 0.075;
    raw(env, c => {
      c.globalAlpha = io;
      c.beginPath(); c.rect(x0, y0, pw, ph); c.clip();
      c.fillStyle = plateC; c.fillRect(x0, y0, pw, ph);
      const drift = (lt * S * 0.03) % (2 * r);
      const rows = Math.ceil(ph / (r * 0.5)) + 2;
      const cols = Math.ceil(pw / (2 * r)) + 2;
      c.lineWidth = Math.max(1, r * 0.06);
      c.strokeStyle = arcC;
      for (let j = 0; j < rows; j++) {
        const rv = clamp(e * 1.6 - (1 - j / rows) * 0.6);
        if (rv <= 0) continue;
        const yc = y0 + j * r * 0.5 + (1 - rv) * r * 0.5;
        const off = (j % 2) * r - drift;
        c.globalAlpha = io * rv;
        c.beginPath();
        for (let k = -1; k < cols; k++) { const x = x0 + k * 2 * r + off; c.moveTo(x - r, yc); c.arc(x, yc, r, Math.PI, TAU); c.closePath(); }
        c.fillStyle = plateC; c.fill();
        c.beginPath();
        for (let k = -1; k < cols; k++) {
          const x = x0 + k * 2 * r + off;
          for (const q of [0.95, 0.72, 0.49, 0.26]) { c.moveTo(x - r * q, yc); c.arc(x, yc, r * q, Math.PI, TAU); }
        }
        c.stroke();
      }
    });
    const v = fitVH(cut.text, f, pw * (pr.cart === 'circle' ? 0.42 : 0.66), ph * (pr.cart === 'circle' ? 0.5 : 0.62), !!pr.vert, 3, S * 0.22);
    const item = { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: W / 2, y: H / 2, delay: dly(env, 0.25) };
    const m = L.measure(item);
    const ce = E.outBack(clamp((lt - 0.1) / 0.45), 1.4);
    const edgeC = L.mix(base, '#000000', 0.2);
    if (ce > 0) {
      if (pr.cart === 'circle') {
        const R = Math.min(Math.hypot(m.w, m.h) / 2 + v.size * 0.4, ph * 0.48) * ce;
        env.circle(W / 2, H / 2, R, sc.paper, edgeC, Math.max(2, 6 * u), io);
        env.circle(W / 2, H / 2, R * 0.93, null, edgeC, Math.max(1, 1.5 * u), io);
      } else {
        const bw = (m.w + v.size * 1.2) * ce, bh = (m.h + v.size * 1.0) * ce;
        env.rrect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh, v.size * 0.2, sc.paper, io, false, edgeC, Math.max(2, 6 * u));
        env.rrect(W / 2 - bw / 2 + v.size * 0.15, H / 2 - bh / 2 + v.size * 0.15, bw - v.size * 0.3, bh - v.size * 0.3, v.size * 0.12, null, io, false, edgeC, Math.max(1, 1.5 * u));
      }
    }
    return L.mainDraw(env, item);
  },
}, P);

/* ================================================================ 2. 物理おもちゃ */

/* 落ちて積もる: 字が上から落ち、弾んで床に並ぶ(下の行から積もる) */
L.register('layout', 'd_pile', {
  name: '落ちて積もる', tags: ['pop', 'emotional', 'graphic'], w: 1, enterBias: { fade: 1.5 },
  fits: n => n >= 1 && n <= 24,
  plan: rng => ({ font: rng.pick(['display', 'round', 'pop']), seed: rng.int(1, 1e6), spin: rng.range(0.6, 1.4) * rng.sign() }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 6 : 10);
    const R = lines.length, cells = rowCells(lines);
    const cell = Math.min(W * 0.88 / cells, H * 0.52 / R, Math.min(W, H) * 0.24);
    const floorY = H * (env.portrait ? 0.66 : 0.74);
    const X0 = W / 2, Y0 = floorY - R * cell / 2;
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: cell * 0.86, x: X0, y: Y0 };
    const sl = makeSlots(item, cell, cell, X0, Y0, 0.5, isLat(cut.text));
    const N = Math.max(1, sl.N);
    const ord = new Array(sl.m.lay.length);
    const perm = sl.s.filter(Boolean).map(s => ({ s, key: (R - 1 - s.line) * 1000 + L.r(pr.seed, s.k) * 999 })).sort((a, b) => a.key - b.key);
    perm.forEach((p, k) => { ord[p.s.k] = k / Math.max(1, N - 1); });
    const fd = T * 0.42, dropH = H * 1.1;
    const motion = (g) => {
      const s = sl.s[g.i];
      if (!s) return null;
      const o = ord[s.k] || 0, st = o * T * 0.55;
      const tau = clamp((lt - st) / fd);
      if (tau <= 0) return { hide: true };
      let dy = -dropH * (1 - tau * tau), sy = 1, sx = 1;
      const tp = lt - st - fd;
      if (tp > 0) {
        dy += -cell * 0.3 * Math.exp(-tp * 7) * Math.abs(Math.sin(tp * 16));
        const q = Math.exp(-tp * 16);
        sy = 1 - 0.28 * q; sx = 1 + 0.22 * q;
        dy += cell * 0.43 * (1 - sy);
      }
      const rot = (1 - tau) * (pr.spin || 1) * 3 * L.rs(pr.seed, g.i) + L.rs(pr.seed, g.i, 'r') * 0.06;
      return { dx: s.x - (X0 + g.x), dy: s.y - (Y0 + g.y) + dy, rot, sx, sy, tp };
    };
    item.charFns = [(i, g) => motion(g)];
    env.line([[W * 0.05, floorY], [W * 0.95, floorY]], sc.sub, Math.max(1, 3 * u), 0.7 * io, false);
    const bb = L.mainDraw(env, item);
    if (env.pass === 'main') {
      const segs = [];
      for (const g of sl.m.lay) {
        const r = motion(g); const s = sl.s[g.i];
        if (!r || r.hide || r.tp == null || r.tp <= 0 || r.tp > 0.4 || !s) continue;
        const p = r.tp / 0.4, by = s.y + cell / 2;
        for (const d of [-1, 1]) { const x = s.x + d * cell * (0.35 + 0.45 * p); segs.push([x, by - cell * 0.05 * p, x + d * cell * 0.12 * p, by - cell * 0.18 * p]); }
      }
      strokeSegs(env, segs, sc.sub, Math.max(1, 2.5 * u), 0.6 * io);
    }
    return bb ? sl.bb : null;
  },
}, P);

/* 積み木: 一字ずつ木のブロックに載って積み上がる */
L.register('layout', 'd_blocks', {
  name: '積み木', tags: ['pop', 'graphic'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ font: rng.pick(['display', 'round', 'dela', 'pop']), shift: rng.int(0, 3), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 4 : 7);
    const R = lines.length, cells = rowCellsFull(lines, 0.4);
    const b = Math.min(W * 0.86 / cells, H * 0.72 / R, Math.min(W, H) * 0.3);
    const bs = b * 0.94;
    const X0 = W / 2, Y0 = H / 2 + b * 0.05;
    const floorY = Y0 + R * b / 2;
    const pal = [sc.accent, sc.accent2, sc.paper, L.mix(sc.accent, sc.accent2, 0.5)];
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: b * 0.6, x: X0, y: Y0 };
    const sl = makeSlots(item, b, b, X0, Y0, 0.4);
    const N = Math.max(1, sl.N);
    const orderOf = s => ((R - 1 - s.line) * 100 + s.col);
    const sorted = sl.s.filter(Boolean).sort((a, c) => orderOf(a) - orderOf(c));
    const ord = {}; sorted.forEach((s, k) => { ord[s.k] = k / Math.max(1, N - 1); });
    const fd = T * 0.32;
    const colOf = s => pal[(s.k + (pr.shift || 0)) % 4];
    const motion = g => {
      const s = sl.s[g.i];
      if (!s) return null;
      const st = ord[s.k] * T * 0.6, tau = clamp((lt - st) / fd);
      if (tau <= 0) return { hide: true };
      let dy = -(s.y + b) * (1 - tau * tau);
      const tp = lt - st - fd;
      if (tp > 0) dy += -b * 0.14 * Math.exp(-tp * 9) * Math.abs(Math.sin(tp * 15));
      const rot = L.rs(pr.seed, s.k) * 0.05 + (1 - tau) * L.rs(pr.seed, s.k, 2) * 0.7;
      const jx = L.rs(pr.seed, s.k, 3) * b * 0.03;
      return { dx: s.x + jx - (X0 + g.x), dy: s.y - (Y0 + g.y) + dy, rot, color: ink(colOf(s)) };
    };
    item.charFns = [(i, g) => motion(g)];
    item.pre = (env2, it, m) => {
      const c = env2.ctx, a = it.alpha == null ? 1 : it.alpha;
      for (const g of m.lay) {
        const r = motion(g);
        if (!r || r.hide) continue;
        const col = colOf(sl.s[g.i]);
        c.save(); c.translate(g.x + r.dx, g.y + r.dy); c.rotate(r.rot);
        env2.rrect(-bs / 2 + bs * 0.06, -bs / 2 + bs * 0.08, bs, bs, bs * 0.1, '#000', 0.25 * a, false);
        env2.rrect(-bs / 2, -bs / 2, bs, bs, bs * 0.1, col, a, false, L.mix(col, '#000000', 0.35), Math.max(1, bs * 0.03));
        env2.rect(-bs / 2 + bs * 0.08, -bs / 2 + bs * 0.07, bs * 0.84, bs * 0.1, '#ffffff', 0.25 * a, false);
        c.restore();
      }
    };
    env.line([[W * 0.06, floorY], [W * 0.94, floorY]], sc.sub, Math.max(1, 3 * u), 0.7 * io, false);
    const bb = L.mainDraw(env, item);
    return bb ? sl.bb : null;
  },
}, P);

/* 振り子: 各字が棒から吊られて振れる(振り子の波) */
L.register('layout', 'd_pendulum', {
  name: '振り子', tags: ['calm', 'pop', 'emotional'], w: 0.9,
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'round', 'serif', 'body', 'pop']), amp: rng.range(0.4, 0.62) * rng.sign(), spread: rng.range(0.035, 0.07) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.35);
    const lines = rowsOf(cut.text, env.portrait ? 6 : 12);
    const R = lines.length, cells = rowCells(lines);
    const rowH = H * 0.88 / R;
    const cell = Math.min(W * 0.88 / cells, rowH * 0.32, Math.min(W, H) * 0.2);
    const Ls = rowH * 0.5;
    const X0 = W / 2, Y0 = H / 2;
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: cell * 0.82, x: X0, y: Y0 };
    const sl = makeSlots(item, cell, rowH, X0, Y0, 0.5, isLat(cut.text));
    const barY = li => H * 0.06 + (R === 1 ? H * 0.06 : 0) + li * rowH;
    const theta = s => {
      const Ti = 0.95 * (1 + (pr.spread || 0.05) * s.col);
      return (pr.amp || 0.5) * Math.exp(-lt / 0.42) * Math.cos(TAU * lt / Ti) + 0.035 * Math.sin(TAU * lt / (Ti * 1.9) + s.col * 0.4);
    };
    const pos = s => { const th = theta(s), L2 = Ls + cell * 0.5; return { th, x: s.x + L2 * Math.sin(th), y: barY(s.line) + L2 * Math.cos(th) }; };
    item.charFns = [(i, g) => {
      const s = sl.s[i]; if (!s) return null;
      const p = pos(s);
      return { dx: p.x - (X0 + g.x), dy: p.y - (Y0 + g.y), rot: -p.th };
    }];
    const be = E.outCubic(clamp(lt / 0.4));
    const bars = [], strings = [];
    for (let li = 0; li < R; li++) {
      const row = sl.s.filter(s => s && s.line === li);
      if (!row.length) continue;
      const xa = Math.min(...row.map(s => s.x)) - cell * 0.6, xb = Math.max(...row.map(s => s.x)) + cell * 0.6, cx = (xa + xb) / 2;
      bars.push([cx - (cx - xa) * be, barY(li), cx + (xb - cx) * be, barY(li)]);
      for (const s of row) {
        const p = pos(s);
        strings.push([s.x, barY(li), p.x - Math.sin(p.th) * cell * 0.5, p.y - Math.cos(p.th) * cell * 0.5]);
      }
    }
    strokeSegs(env, strings, sc.sub, Math.max(1, 1.6 * u), 0.7 * io * be);
    strokeSegs(env, bars, sc.fg, Math.max(2, 6 * u), 0.85 * io);
    const bb = L.mainDraw(env, item);
    return bb ? bbOf(sl.bb.x0 - cell * 0.3, H * 0.06, sl.bb.x1 + cell * 0.3, barY(R - 1) + Ls + cell) : null;
  },
}, P);

/* 洗濯ばさみ: たるんだロープに字が留められ、くるっと回って吊り下がる */
L.register('layout', 'd_clothesline', {
  name: '洗濯ばさみ', tags: ['pop', 'emotional', 'calm'], w: 0.9,
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'round', 'hand', 'pop', 'body']), sag: rng.range(0.05, 0.11), seed: rng.int(1, 1e6), dir: rng.sign() }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.35), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 5 : 10);
    const R = lines.length, cells = rowCells(lines);
    const cell = Math.min(W * 0.86 / cells, H * 0.86 / R * 0.5, Math.min(W, H) * 0.22);
    const sag = Math.min(cell * 0.6, H * (pr.sag || 0.08));
    const rowH = cell * 1.75 + sag;
    const top = (H - R * rowH) / 2 + cell * 0.1;
    const ropeY0 = li => top + li * rowH;
    const ropeY = (li, x) => ropeY0(li) + sag * (1 - Math.pow((x - W / 2) / (W * 0.48), 2));
    const X0 = W / 2, Y0 = H / 2;
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: cell * 0.8, x: X0, y: Y0 };
    const sl = makeSlots(item, cell * 1.02, rowH, X0, Y0, 0.5, isLat(cut.text));
    const N = Math.max(1, sl.N);
    const hang = cell * 0.72;
    const st = s => (s.k / Math.max(1, N - 1)) * T * 0.55;
    const pose = s => {
      const t = lt - st(s);
      if (t <= 0) return null;
      const th = (pr.dir || 1) * 1.35 * Math.exp(-t / 0.3) * Math.cos(t * 11) + 0.04 * Math.sin(lt * 2.1 + s.k * 0.8);
      const px = s.x, py = ropeY(s.line, s.x);
      return { th, px, py, x: px - Math.sin(th) * hang, y: py + Math.cos(th) * hang, a: clamp(t / 0.08) };
    };
    item.charFns = [(i, g) => {
      const s = sl.s[i]; if (!s) return null;
      const p = pose(s);
      if (!p) return { hide: true };
      return { dx: p.x - (X0 + g.x), dy: p.y - (Y0 + g.y), rot: p.th, a: p.a };
    }];
    const re = clamp(lt / 0.45);
    for (let li = 0; li < R; li++) {
      const pts = [];
      for (let k = 0; k <= 24; k++) { const x = W * 0.02 + W * 0.96 * k / 24; pts.push([x, ropeY(li, x)]); }
      env.polyPartial(pts, re, sc.sub, Math.max(1, 2.2 * u), io, false);
    }
    const bb = L.mainDraw(env, item);
    const pinC = L.mix(sc.paper, sc.accent, 0.25), pinE = L.mix(pinC, '#000000', 0.4);
    for (const s of sl.s) {
      if (!s) continue;
      const p = pose(s); if (!p) continue;
      withM(env, RSm(p.px, p.py, p.th), () => {
        env.rrect(-cell * 0.07, -cell * 0.1, cell * 0.14, cell * 0.36, cell * 0.03, pinC, io * p.a, false, pinE, Math.max(1, 1.2 * u));
      });
    }
    return bb ? bbOf(W * 0.03, ropeY0(0), W * 0.97, ropeY0(R - 1) + sag + hang + cell * 0.6) : null;
  },
}, P);

/* 文字風船: 一字(一句)ずつ風船に入って浮かび上がる */
L.register('layout', 'd_balloons', {
  name: '文字風船', tags: ['pop', 'emotional', 'calm'], w: 0.9, treat: 'safe',
  fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ font: rng.pick(['round', 'pop', 'round']), bundle: rng.chance(0.55), shift: rng.int(0, 3), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'round');
    const lt = env.lt, io = env.inOut(0.3), T = Tset(cut);
    const gl = L.glyphs(cut.text).filter(c => !L.isSpace(c));
    let parts;
    if (!isLat(cut.text) && gl.length <= 8) parts = gl;
    else {
      parts = L.chunks(cut.text);
      while (parts.length > 6) {                  // 短い隣同士を結合
        let bi = 0, bl = 1e9;
        for (let i = 0; i + 1 < parts.length; i++) { const l = L.glyphCount(parts[i] + parts[i + 1]); if (l < bl) { bl = l; bi = i; } }
        parts.splice(bi, 2, parts[bi] + (isLat(cut.text) ? ' ' : '') + parts[bi + 1]);
      }
    }
    const K = parts.length;
    const rows = K > (env.portrait ? 3 : 6) ? 2 : 1, per = Math.ceil(K / rows);
    const glyphMode = parts.every(p => L.glyphCount(p) <= 1);
    const Rb = Math.min(W * 0.92 / (per * (glyphMode ? 2.2 : 2.1)), H * (rows === 1 ? 0.2 : 0.15));
    const ry = Rb * 1.16;
    const pal = [sc.accent, sc.accent2, L.mix(warm(sc), '#ffffff', 0.2), L.mix(sc.accent, '#ffffff', 0.4)];
    const fits = glyphMode ? null : fitParts(parts, f, Rb * 1.5, ry * 1.2, false, 1, Rb * 0.7);
    let bb = null;
    parts.forEach((part, i) => {
      const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, K - r * per);
      const bx = W / 2 + (c - (inRow - 1) / 2) * (W * 0.92 / per);
      const by = rows === 1 ? H * 0.42 : H * (0.3 + 0.3 * r);
      const o = L.r(pr.seed, i) * 0.6 + i / Math.max(1, K) * 0.4;
      const tau = clamp((lt - o * T * 0.5) / (T * 0.6));
      if (tau <= 0) return;
      const rise = (1 - E.outCubic(tau)) * H * 0.95;
      const bob = Math.sin(lt * 1.8 + i * 1.3) * Rb * 0.07;
      const rot = Math.sin(lt * 1.3 + i * 2.1) * 0.05 + (1 - tau) * 0.2 * L.rs(pr.seed, i, 'r');
      const x = bx, y = by + rise + bob;
      const col = pal[(i + (pr.shift || 0)) % 4], txt = ink(col);
      const ax = pr.bundle ? W / 2 : bx + L.rs(pr.seed, i, 's') * W * 0.05, ay = H * 1.02;
      raw(env, cx => {
        cx.globalAlpha = io * 0.75; cx.strokeStyle = sc.sub; cx.lineWidth = Math.max(1, 1.5 * u);
        cx.beginPath(); cx.moveTo(x, y + ry);
        const mx = (x + ax) / 2 + Math.sin(lt * 2 + i) * Rb * 0.3, my = (y + ry + ay) / 2;
        cx.quadraticCurveTo(mx, my, ax, ay); cx.stroke();
      });
      withM(env, RSm(x, y, rot), () => {
        ellipse(env, 0, 0, Rb, ry, 0, col, io);
        ellipse(env, -Rb * 0.38, -ry * 0.42, Rb * 0.2, ry * 0.12, -0.6, '#ffffff', io * 0.4);
        env.poly([[0, ry * 0.96], [-Rb * 0.12, ry * 1.12], [Rb * 0.12, ry * 1.12]], L.mix(col, '#000000', 0.2), io, false);
        const v = glyphMode ? { text: part, size: Rb * 1.05, rot: 0 } : fits[i];
        const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, color: txt, x: 0, y: 0, mi: i, delay: dly(env, 0.2) });
        if (b) bb = L.unionBB(bb, bbOf(x - Rb, by - ry, x + Rb, by + ry));
      });
    });
    return bb;
  },
}, P);

/* 跳ねて整列: 字が横からぴょんぴょん跳ねて定位置へ */
L.register('layout', 'd_hop', {
  name: '跳ねて整列', tags: ['pop', 'graphic'], w: 0.9,
  fits: n => n >= 1 && n <= 18,
  plan: rng => ({ font: rng.pick(['display', 'round', 'pop']), dir: rng.sign(), hops: rng.int(2, 3) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 6 : 10);
    const R = lines.length, cells = rowCells(lines);
    const rowH = Math.min(H * 0.7 / R, Math.min(W, H) * 0.3);
    const cell = Math.min(W * 0.86 / cells, rowH * 0.72);
    const X0 = W / 2, Y0 = H / 2 + rowH * 0.1;
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: cell * 0.84, x: X0, y: Y0 };
    const sl = makeSlots(item, cell, rowH, X0, Y0, 0.5, isLat(cut.text));
    const N = Math.max(1, sl.N);
    const dir = pr.dir || 1;
    const fr = pr.hops === 2 ? [0.62, 0.38] : [0.5, 0.3, 0.2];
    const dur = T * 0.62;
    const pose = s => {
      const rank = dir > 0 ? (N - 1 - s.k) : s.k;
      const st = rank / Math.max(1, N - 1) * T * 0.4;
      const tau = clamp((lt - st) / dur);
      const sx0 = dir > 0 ? -cell : W + cell, D = s.x - sx0;
      if (tau <= 0) return null;
      let acc = 0, k = 0;
      while (k < fr.length - 1 && tau > acc + fr[k]) { acc += fr[k]; k++; }
      const uu = clamp((tau - acc) / fr[k]);
      const covered = fr.slice(0, k).reduce((a, b) => a + b, 0) + fr[k] * uu;
      const hgt = Math.min(H * 0.28, Math.abs(D) * fr[k] * 0.45);
      const y = tau < 1 ? -4 * hgt * uu * (1 - uu) : 0;
      let q = tau < 1 ? Math.max(0, 1 - Math.min(uu, 1 - uu) * 9) : Math.exp(-(lt - st - dur) * 14);
      if (tau < 1 && k === 0 && uu < 0.5) q = 0;
      return { x: sx0 + D * covered, y: s.y + y, h: -y, q, rot: tau < 1 ? dir * Math.sin(Math.PI * uu) * 0.35 : 0 };
    };
    item.charFns = [(i, g) => {
      const s = sl.s[i]; if (!s) return null;
      const p = pose(s);
      if (!p) return { hide: true };
      const sy = 1 - 0.24 * p.q, sx = 1 + 0.2 * p.q;
      return { dx: p.x - (X0 + g.x), dy: p.y - (Y0 + g.y) + cell * 0.42 * (1 - sy), rot: p.rot, sx, sy };
    }];
    raw(env, c => {
      c.fillStyle = L.mix(sc.bg, sc.fg, 0.28); c.globalAlpha = 0.5 * io; c.beginPath();
      for (const s of sl.s) {
        if (!s) continue;
        const p = pose(s); if (!p) continue;
        const k = 1 / (1 + p.h / (cell * 1.5));
        c.moveTo(p.x + cell * 0.36 * k, s.y + cell * 0.5); c.ellipse(p.x, s.y + cell * 0.5, cell * 0.36 * k, cell * 0.07 * k, 0, 0, TAU);
      }
      c.fill();
    });
    const bb = L.mainDraw(env, item);
    return bb ? sl.bb : null;
  },
}, P);

/* ドミノ: 倒れていた牌が波のように起き上がる */
L.register('layout', 'd_domino', {
  name: 'ドミノ', tags: ['pop', 'graphic'], w: 0.8, treat: 'safe', portrait: 0.8,
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ font: rng.pick(['display', 'round', 'body']), pips: rng.chance(0.7) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 5 : 10);
    const R = lines.length, cells = rowCellsFull(lines, 0.6);
    const rowH = H * 0.86 / R;
    const cell = Math.min(W * 0.88 / cells, rowH / 1.75 / 0.86 * 0.9, Math.min(W, H) * 0.32);
    const tw = cell * 0.84, th = tw * 1.75;
    const X0 = W / 2, Y0 = H / 2;
    const tileC = sc.dark ? sc.paper : sc.fg, txtC = ink(tileC);
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: tw * 0.7, x: X0, y: Y0, color: txtC };
    const sl = makeSlots(item, cell, Math.max(th * 1.12, rowH * 0.9), X0, Y0, 0.6);
    const N = Math.max(1, sl.N);
    const off = -th * 0.16;                                   // 牌の中心から字の中心へ
    const pose = s => {
      const st = s.k / Math.max(1, N - 1) * T * 0.5;
      const tau = clamp((lt - st) / (T * 0.32));
      const lean = s.col === Math.max(...sl.s.filter(q => q && q.line === s.line).map(q => q.col)) ? 1.45 : 0.78;
      const a = lean * (1 - E.outBack(tau, 1.8));
      const px = s.x + tw / 2, py = s.y - off + th / 2;       // 回転の支点 = 右下の角
      return { a, px, py };
    };
    const place = (s, lx, ly) => {                            // 牌ローカル(中心原点) → 画面
      const p = pose(s), c = Math.cos(p.a), si = Math.sin(p.a);
      const x0 = s.x + lx - p.px, y0 = s.y - off + ly - p.py;
      return [p.px + c * x0 - si * y0, p.py + si * x0 + c * y0, p.a];
    };
    item.charFns = [(i, g) => {
      const s = sl.s[i]; if (!s) return null;
      const [x, y, a] = place(s, 0, off);
      return { dx: x - (X0 + g.x), dy: y - (Y0 + g.y), rot: a };
    }];
    item.pre = (env2, it, m) => {
      const c = env2.ctx, al = it.alpha == null ? 1 : it.alpha;
      for (const g of m.lay) {
        const s = sl.s[g.i]; if (!s) continue;
        const [x, y, a] = place(s, 0, 0);
        c.save(); c.translate(x - X0, y - Y0); c.rotate(a);
        env2.rrect(-tw / 2 + tw * 0.06, -th / 2 + tw * 0.08, tw, th, tw * 0.12, '#000', 0.28 * al, false);
        env2.rrect(-tw / 2, -th / 2, tw, th, tw * 0.12, tileC, al, false, L.mix(tileC, '#000000', 0.3), Math.max(1, tw * 0.025));
        env2.line([[-tw * 0.34, th * 0.14], [tw * 0.34, th * 0.14]], txtC, Math.max(1, tw * 0.03), 0.45 * al, false);
        if (pr.pips) { env2.circle(-tw * 0.18, th * 0.3, tw * 0.07, txtC, null, 1, 0.55 * al); env2.circle(tw * 0.18, th * 0.3, tw * 0.07, txtC, null, 1, 0.55 * al); }
        c.restore();
      }
    };
    const floorY = sl.s.filter(Boolean).reduce((m, s) => Math.max(m, s.y - off + th / 2), 0);
    env.line([[W * 0.06, floorY], [W * 0.94, floorY]], sc.sub, Math.max(1, 2.5 * u), 0.6 * io, false);
    const bb = L.mainDraw(env, item);
    return bb ? bbOf(sl.bb.x0, sl.bb.y0 - th * 0.2, sl.bb.x1 + th * 0.4, floorY) : null;
  },
}, P);

/* 冷蔵庫マグネット: 散らばった磁石文字がパチッと並ぶ */
L.register('layout', 'd_magnets', {
  name: 'マグネット', tags: ['pop', 'graphic'], w: 0.8, treat: false, busy: true,
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ font: rng.pick(['round', 'pop']), seed: rng.int(1, 1e6), memo: rng.chance(0.65), shift: rng.int(0, 3) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'round');
    const lt = env.lt, io = env.inOut(0.35), T = Tset(cut);
    const e = E.outCubic(clamp(lt / 0.4));
    const bx = W * 0.04, by = H * 0.05 + (1 - e) * H * 0.04, bw = W * 0.92, bh = H * 0.9;
    const board = sc.paper, edge = L.mix(sc.onPaper, board, 0.78);
    env.rrect(bx + u * 6, by + u * 8, bw, bh, S * 0.03, '#000', 0.25 * io, false);
    env.rrect(bx, by, bw, bh, S * 0.03, board, io, false, edge, Math.max(1, 2 * u));
    env.line([[bx, by + bh * 0.13], [bx + bw, by + bh * 0.13]], edge, Math.max(1, 2.5 * u), io, false);
    env.rrect(bx + bw - Math.max(W * 0.05, S * 0.06), by + bh * 0.24, S * 0.022, bh * 0.36, S * 0.011, L.mix(sc.onPaper, board, 0.7), io, false);
    const lines = rowsOf(cut.text, env.portrait ? 5 : 9);
    const R = lines.length, cells = rowCells(lines);
    const cell = Math.min(bw * 0.76 / (cells * 1.16), bh * 0.62 / (R * 1.2), S * 0.26);
    const X0 = W / 2, Y0 = by + bh * 0.56;
    const pal = [sc.accent, sc.accent2, warm(sc), L.mix(sc.accent, sc.accent2, 0.5)].map(c => L.fitContrast(c, board, 3));
    const item = { text: lines.join('\n'), font: f.font, weight: f.weight, size: cell * 0.9, x: X0, y: Y0,
      shadow: { color: 'rgba(0,0,0,0.35)', blur: 3 * u, dx: 1.5 * u, dy: 3 * u } };
    const sl = makeSlots(item, cell * 1.16, cell * 1.2, X0, Y0, 0.5, isLat(cut.text));
    const N = Math.max(1, sl.N);
    item.charFns = [(i, g) => {
      const s = sl.s[i]; if (!s) return null;
      const st = L.r(pr.seed, s.k) * T * 0.5, tau = clamp((lt - st) / (T * 0.4));
      const scx = bx + bw * (0.1 + 0.8 * L.r(pr.seed, s.k, 'x')), scy = by + bh * (0.22 + 0.7 * L.r(pr.seed, s.k, 'y'));
      const k = E.outBack(tau, 1.5);
      const tx = s.x + L.rs(pr.seed, s.k, 'dx') * cell * 0.05, ty = s.y + L.rs(pr.seed, s.k, 'dy') * cell * 0.12;
      return { dx: scx + (tx - scx) * k - (X0 + g.x), dy: scy + (ty - scy) * k - (Y0 + g.y),
        rot: L.rs(pr.seed, s.k, 'r') * 0.2 + (1 - tau) * L.rs(pr.seed, s.k, 'r2') * 0.8, s: 1 + 0.16 * Math.sin(Math.PI * tau), color: pal[(s.k + (pr.shift || 0)) % 4] };
    }];
    const ma = io * clamp((lt - 0.15) / 0.3);
    const mag = (x, y, r, c) => { env.circle(x + r * 0.12, y + r * 0.18, r, '#000', null, 1, 0.22 * ma); env.circle(x, y, r, c, null, 1, ma); env.circle(x - r * 0.3, y - r * 0.3, r * 0.3, '#ffffff', null, 1, 0.45 * ma); };
    mag(bx + bw * 0.08, by + bh * 0.06, S * 0.028, sc.accent2);
    mag(bx + bw * 0.9, by + bh * 0.92, S * 0.03, sc.accent);
    if (pr.memo && !env.portrait) {
      const mx = bx + bw * 0.13, my = by + bh * 0.24, mw = S * 0.22, mh = S * 0.16;
      withM(env, RSm(mx, my, -0.08), () => {
        env.rect(-mw / 2, -mh / 2, mw, mh, L.mix(board, warm(sc), 0.18), ma, false);
        const segs = []; for (let k = 1; k < 4; k++) segs.push([-mw * 0.4, -mh / 2 + mh * k / 4.2 + mh * 0.1, mw * 0.4, -mh / 2 + mh * k / 4.2 + mh * 0.1]);
        strokeSegs(env, segs, L.mix(sc.onPaper, board, 0.6), Math.max(1, 1.2 * u), ma);
        env.text({ text: 'MEMO', font: "'Oswald', sans-serif", weight: 700, size: mh * 0.16, x: -mw * 0.25, y: -mh * 0.34, color: L.mix(sc.onPaper, board, 0.35), alpha: ma, ghost: false });
      });
      mag(mx, my - mh * 0.46, S * 0.02, warm(sc));
    }
    const bb = L.mainDraw(env, item);
    return bb ? sl.bb : null;
  },
}, P);

/* ================================================================ 3. 疑似3D */

/* 回転キューブ: 正投影の箱がゆっくり回り、正面に歌詞 */
L.register('layout', 'd_cube', {
  name: '回転キューブ', tags: ['graphic', 'pop', 'cyber'], w: 0.9, treat: 'safe', emph: 1.2,
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ col: rng.pick(['a', 'a2', 'paper', 'fg']), font: rng.pick(['display', 'body', 'display']), yaw0: rng.range(58, 72), yaw1: rng.range(22, 30) * rng.sign(), pitch: rng.range(14, 24) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.4), T = Tset(cut);
    const v = bestH(cut.text, f.font, f.weight, W * (env.portrait ? 0.62 : 0.5), H * 0.3, 3, S * 0.2);
    const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
    let FW = m.w + v.size * 0.9, FH = m.h + v.size * 0.8, D = Math.min(FH * 1.05, FW);
    const sgn = Math.sign(pr.yaw1 || 25);
    const a = sgn * ((Math.abs(pr.yaw1 || 25)) + ((pr.yaw0 || 65) - Math.abs(pr.yaw1 || 25)) * (1 - E.outCubic(clamp(lt / (T * 1.3))))) * DEG + 0.05 * Math.sin(lt * 0.45);
    const p = (pr.pitch || 18) * DEG;
    const kin = (0.85 + 0.15 * E.outBack(clamp(lt / 0.5), 1.4));
    const projW = FW * Math.cos(a) + D * Math.abs(Math.sin(a)), fitK = Math.min(1, W * 0.86 / projW, H * 0.8 / (FH + D * Math.sin(p)));
    const K = fitK * kin, fs = v.size * fitK;
    FW *= fitK; FH *= fitK; D *= fitK;
    const cx = W / 2, cy = H / 2 + D * Math.sin(p) * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    const rotv = (X, Y, Z) => { const x1 = X * ca + Z * sa, z1 = -X * sa + Z * ca; return [x1, Y * cp - z1 * sp, Y * sp + z1 * cp]; };
    const proj = (X, Y, Z) => { const r = rotv(X * kin, Y * kin, Z * kin); return [cx + r[0], cy - r[1], r[2]]; };
    const base = pr.col === 'a2' ? sc.accent2 : pr.col === 'paper' ? sc.paper : pr.col === 'fg' ? sc.fg : sc.accent;
    const Ld = [-0.35, 0.75, 0.56];
    const faces = [
      { c: [0, 0, D / 2], u: [1, 0, 0], v: [0, -1, 0], w: FW, h: FH, n: [0, 0, 1], front: true },
      { c: [FW / 2, 0, 0], u: [0, 0, -1], v: [0, -1, 0], w: D, h: FH, n: [1, 0, 0] },
      { c: [-FW / 2, 0, 0], u: [0, 0, 1], v: [0, -1, 0], w: D, h: FH, n: [-1, 0, 0] },
      { c: [0, FH / 2, 0], u: [1, 0, 0], v: [0, 0, 1], w: FW, h: D, n: [0, 1, 0] },
    ];
    const sh = proj(0, -FH / 2, 0);
    ellipse(env, sh[0], sh[1] + FH * 0.06, (FW + D) * 0.5 * K / fitK * fitK, D * 0.22, 0, '#000', 0.25 * io);
    let frontM = null, frontCol = base;
    for (const fc of faces) {
      const nr = rotv(fc.n[0], fc.n[1], fc.n[2]);
      if (nr[2] <= 0.02) continue;
      const b = clamp(nr[0] * Ld[0] + nr[1] * Ld[1] + nr[2] * Ld[2]);
      const col = fc.n[1] > 0 ? L.mix(base, '#ffffff', 0.18) : L.mix(base, '#000000', (1 - b) * (fc.front ? 0.22 : 0.5));
      const P0 = proj(fc.c[0], fc.c[1], fc.c[2]);
      const Pu = proj(fc.c[0] + fc.u[0], fc.c[1] + fc.u[1], fc.c[2] + fc.u[2]);
      const Pv = proj(fc.c[0] + fc.v[0], fc.c[1] + fc.v[1], fc.c[2] + fc.v[2]);
      const M = [Pu[0] - P0[0], Pu[1] - P0[1], Pv[0] - P0[0], Pv[1] - P0[1], P0[0], P0[1]];
      withM(env, M, () => {
        env.rect(-fc.w / 2, -fc.h / 2, fc.w, fc.h, col, io, false);
        env.rrect(-fc.w / 2, -fc.h / 2, fc.w, fc.h, 0, null, io * 0.6, false, L.mix(col, '#000000', 0.4), Math.max(1, 2 * u / Math.max(0.3, kin)));
        if (!fc.front && fc.n[1] === 0) env.text({ text: String(cut.idx + 1).padStart(2, '0'), font: "'Bebas Neue', sans-serif", weight: 400, size: Math.min(fc.w, fc.h) * 0.5, x: 0, y: 0, fill: false, stroke: Math.max(1, 2 * u), strokeColor: ink(col), color: ink(col), alpha: 0.5 * io, ghost: false });
      });
      if (fc.front) { frontM = M; frontCol = col; }
    }
    if (!frontM) return null;
    return affMain(env, frontM, { text: v.text, font: f.font, weight: f.weight, size: fs, color: ink(frontCol), x: 0, y: 0, delay: dly(env, 0.15) });
  },
}, P);

/* 円柱巻き: 回る円柱の表面に文字が巻き付く */
L.register('layout', 'd_cylinder', {
  name: '円柱巻き', tags: ['graphic', 'calm', 'cyber'], w: 0.9, portrait: 0.7,
  fits: n => n >= 2 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'body', 'serif']), dir: rng.sign(), band: rng.chance(0.65) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.4), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 7 : 12);
    const R = lines.length;
    const txt = lines.join('\n');
    const size = Math.min(L.fitSize(txt, f.font, W * 0.88 * 0.7, H * 0.56, { weight: f.weight, lead: 1.5 }), S * 0.2);
    const item = { text: txt, font: f.font, weight: f.weight, size, lead: 1.5, x: W / 2, y: H / 2 };
    const m = L.measure(item);
    const Rc = Math.max(m.w / 1.4, size * 1.2);
    const cx = W / 2, cyTop = H / 2 - m.h / 2 - size * 0.35, cyBot = H / 2 + m.h / 2 + size * 0.35, ry = Rc * 0.14;
    const phi = r => (pr.dir || 1) * (r % 2 ? -1 : 1) * (1 - E.outCubic(clamp(lt / (T * 1.4)))) * 2.4 + 0.1 * Math.sin(lt * 0.8 + r);
    const fg = item.color || sc.fg;
    item.charFns = [(i, g) => {
      const a = phi(g.line) + g.x / Rc, c = Math.cos(a);
      if (c < 0.04) return { hide: true };
      return { dx: Rc * Math.sin(a) - g.x, sx: c, a: L.smooth(0.04, 0.4, c), color: L.mix(fg, sc.bg, (1 - c) * 0.55) };
    }];
    const lc = L.mix(sc.fg, sc.bg, 0.55);
    raw(env, c => {
      c.globalAlpha = 0.5 * io; c.strokeStyle = lc; c.lineWidth = Math.max(1, 1.6 * u);
      c.beginPath(); c.ellipse(cx, cyTop, Rc, ry, 0, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(cx, cyBot, Rc, ry, 0, 0, Math.PI); c.stroke();
      c.setLineDash([4 * u, 5 * u]); c.beginPath(); c.ellipse(cx, cyBot, Rc, ry, 0, Math.PI, TAU); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(cx - Rc, cyTop); c.lineTo(cx - Rc, cyBot); c.moveTo(cx + Rc, cyTop); c.lineTo(cx + Rc, cyBot); c.stroke();
      if (pr.band) {
        c.globalAlpha = 0.75 * io; c.strokeStyle = sc.accent; c.lineWidth = Math.max(1.5, 3.5 * u);
        for (const yy of [cyTop, cyBot]) { c.beginPath(); c.ellipse(cx, yy, Rc, ry, 0, 0.15, Math.PI - 0.15); c.stroke(); }
      }
      c.globalAlpha = 0.6 * io; c.strokeStyle = sc.accent2; c.lineWidth = Math.max(1, 2 * u); c.beginPath();
      const ph0 = phi(0);
      for (let k = 0; k < 24; k++) {
        const a = ph0 + k * TAU / 24, co = Math.cos(a);
        if (co < 0.05) continue;
        const x = cx + Rc * Math.sin(a);
        for (const yy of [cyTop, cyBot]) { const y = yy + ry * co; c.moveTo(x, y - size * 0.06); c.lineTo(x, y + size * 0.06); }
      }
      c.stroke();
    });
    const bb = L.mainDraw(env, item);
    return bb ? bbOf(cx - Rc, cyTop - ry, cx + Rc, cyBot + ry) : null;
  },
}, P);

/* カード反転: 裏向きのカードが順にめくれて歌詞が現れる */
L.register('layout', 'd_cardflip', {
  name: 'カード反転', tags: ['pop', 'graphic', 'editorial'], w: 1, treat: 'safe',
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['display', 'body', 'serif']), back: rng.pick(['a', 'a2']), axis: rng.chance(0.3) ? 'x' : 'y' }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3);
    const K = clamp(Math.ceil(cut.n / 6), 1, 4);
    let parts = K === 1 ? [cut.text] : L.chunks(cut.text);
    while (parts.length > K) {
      let bi = 0, bl = 1e9;
      for (let i = 0; i + 1 < parts.length; i++) { const l = L.glyphCount(parts[i] + parts[i + 1]); if (l < bl) { bl = l; bi = i; } }
      parts.splice(bi, 2, parts[bi] + (isLat(cut.text) ? ' ' : '') + parts[bi + 1]);
    }
    const Kn = parts.length;
    const cols = env.portrait ? 1 : (W / H < 1.3 ? Math.min(2, Kn) : (Kn === 4 ? 2 : Kn)), rows = Math.ceil(Kn / cols);
    const cw = Math.min(W * 0.9 / cols * 0.9, env.portrait ? W * 0.84 : W * 0.6), ch = Math.min(H * 0.86 / rows * 0.86, cw * (env.portrait || cols === 1 ? 0.62 : 0.8), H * 0.6);
    const fits = fitParts(parts, f, cw * 0.84, ch * 0.72, false, 2, S * 0.2);
    const backC = pr.back === 'a2' ? sc.accent2 : sc.accent;
    const edge = edgeOf(sc);
    let bb = null;
    parts.forEach((part, j) => {
      const r = Math.floor(j / cols), c = j % cols, inRow = Math.min(cols, Kn - r * cols);
      const x = W / 2 + (c - (inRow - 1) / 2) * (W * 0.9 / cols);
      const y = H / 2 + (r - (rows - 1) / 2) * (H * 0.86 / rows);
      const tau = clamp((lt - 0.05 - j * 0.14) / 0.55);
      const th = Math.PI * (1 - E.outBack(tau, 1.1));
      const co = Math.cos(th), k = Math.sin(th) * 0.14;
      const M = pr.axis === 'x' ? [1, 0, k, co, x, y] : [co, k, 0, 1, x, y];
      const a = io * clamp(lt / 0.15);
      env.rrect(x - cw / 2 + u * 6, y - ch / 2 + u * 9, cw, ch, S * 0.02, '#000', 0.22 * a * Math.abs(co), false);
      if (co < 0) {
        withM(env, M, () => {
          env.rrect(-cw / 2, -ch / 2, cw, ch, S * 0.02, backC, a, false);
          raw(env, cx => {
            cx.globalAlpha = a * 0.35; cx.beginPath(); cx.rect(-cw / 2 + cw * 0.06, -ch / 2 + cw * 0.06, cw - cw * 0.12, ch - cw * 0.12); cx.clip();
            cx.strokeStyle = ink(backC); cx.lineWidth = Math.max(1, 3 * u); cx.beginPath();
            for (let q = -ch; q < cw + ch; q += S * 0.03) { cx.moveTo(-cw / 2 + q, -ch / 2); cx.lineTo(-cw / 2 + q - ch, ch / 2); }
            cx.stroke();
          });
          env.circle(0, 0, Math.min(cw, ch) * 0.16, backC, ink(backC), Math.max(1, 3 * u), a);
        });
        return;
      }
      withM(env, M, () => {
        env.rrect(-cw / 2, -ch / 2, cw, ch, S * 0.02, sc.paper, a, false, edge, 1.5 * u);
        env.rect(-cw / 2 + cw * 0.05, ch / 2 - ch * 0.12, cw * 0.1, ch * 0.03, backC, a, false);
      });
      const v = fits[j];
      const b = affMain(env, M, { text: v.text, font: f.font, weight: f.weight, size: v.size, color: sc.onPaper, x: 0, y: -ch * 0.02, mi: j, delay: dly(env, 0.2) });
      if (b) bb = L.unionBB(bb, bbOf(x - cw / 2, y - ch / 2, x + cw / 2, y + ch / 2));
    });
    return bb;
  },
}, P);

/* 壁面パース: 角で出会う二枚の壁に歌詞を書く */
L.register('layout', 'd_wall', {
  name: '壁面パース', tags: ['graphic', 'editorial', 'emotional'], w: 0.8, portrait: 0.6,
  fits: n => n >= 2 && n <= 24,
  plan: rng => ({ beta: rng.range(34, 42), shift: rng.range(-0.05, 0.05), font: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.45), T = Tset(cut);
    const [A, B] = halves(cut.text);
    const cX = W * (0.5 + (pr.shift || 0)), hy = H * 0.5, Fo = W * 1.1;
    const brest = (pr.beta || 45) * DEG;
    const beta = brest + (1 - E.outCubic(clamp(lt / (T * 1.2)))) * 0.55 + 0.04 * Math.sin(lt * 0.5);
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const proj = (X, Y, side) => { const z = Fo + X * sb, s = Fo / z; return [cX + side * X * cb * s, hy + Y * s, s, cb * Fo * Fo / (z * z)]; };
    const gap = S * 0.04;
    const avail = side => (side < 0 ? cX : W - cX) - W * 0.05;
    const Xmax = side => { const Av = avail(side), cr = Math.cos(brest), sr = Math.sin(brest); return cr * Fo > Av * sr ? Av * Fo / (cr * Fo - Av * sr) : 1e5; };
    const wA = L.measure({ text: A, font: f.font, weight: f.weight, size: 100 }).w / 100, wB = B ? L.measure({ text: B, font: f.font, weight: f.weight, size: 100 }).w / 100 : 0;
    let size = Math.min(S * 0.26, H * 0.3, (Xmax(-1) - gap) / Math.max(0.5, wA), B ? (Xmax(1) - gap) / Math.max(0.5, wB) : 1e9);
    size = Math.max(size, 4);
    const Hw = H * 0.4;
    const Xw = side => Math.min(Xmax(side) * 1.02, (side < 0 ? wA : Math.max(wB, wA * 0.5)) * size + gap * 3);
    const wallQ = side => [proj(0, -Hw, side), proj(Xw(side), -Hw, side), proj(Xw(side), Hw, side), proj(0, Hw, side)].map(q => [q[0], q[1]]);
    const we = E.outCubic(clamp(lt / 0.5));
    env.poly(wallQ(-1), L.mix(sc.bg, sc.fg, 0.07), io, false);
    env.poly(wallQ(1), L.mix(sc.bg, sc.fg, 0.14), io, false);
    const segs = [];
    for (const side of [-1, 1]) {
      const xw = Xw(side), st = S * 0.08;
      for (let X = st; X < xw; X += st) { const p0 = proj(X, -Hw, side), p1 = proj(X, -Hw + 2 * Hw * we, side); segs.push([p0[0], p0[1], p1[0], p1[1]]); }
      for (let j = -3; j <= 3; j++) { const Y = j * Hw / 3.5, p0 = proj(0, Y, side), p1 = proj(xw * we, Y, side); segs.push([p0[0], p0[1], p1[0], p1[1]]); }
    }
    strokeSegs(env, segs, sc.fg, Math.max(1, 1.2 * u), 0.13 * io);
    const e0 = proj(0, -Hw, 1), e1 = proj(0, Hw, 1);
    env.line([[e0[0], e0[1]], [e1[0], e0[1] + (e1[1] - e0[1]) * we]], sc.accent, Math.max(1.5, 3 * u), 0.8 * io, false);
    const drawSide = (text, side, mi, w) => {
      if (!text) return null;
      const item = { text, font: f.font, weight: f.weight, size, x: W / 2, y: hy, mi };
      const halfW = w * size / 2;
      item.charFns = [(i, g) => {
        const X = side < 0 ? gap + (halfW - g.x) : gap + (g.x + halfW);
        const q = proj(X, 0, side);
        return { dx: q[0] - (W / 2 + g.x), dy: 0, sx: q[3], sy: q[2] };
      }];
      const b = L.mainDraw(env, item);
      if (!b) return null;
      const pf = proj(gap + w * size, 0, side), pn = proj(gap, 0, side);
      return bbOf(Math.min(pf[0], pn[0]), hy - size * 0.6, Math.max(pf[0], pn[0]), hy + size * 0.6);
    };
    const b1 = drawSide(A, -1, 0, wA), b2 = drawSide(B, 1, 1, wB);
    if (!B) env.text({ text: L.fmtTime(cut.start) + '  ' + String(cut.idx + 1).padStart(2, '0'), font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.04, x: (cX + W) / 2, y: hy, color: sc.sub, alpha: io, ghost: false });
    return L.unionBB(b1, b2);
  },
}, P);

/* トンネル: 奥から枠が迫り、中央に歌詞 */
L.register('layout', 'd_tunnel', {
  name: 'トンネル', tags: ['cyber', 'graphic', 'emotional'], w: 0.9, busy: true,
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['display', 'body', 'display']), shape: rng.pick(['rect', 'rect', 'round']), speed: rng.range(0.28, 0.45) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.4);
    const phase = lt * (pr.speed || 0.35) + 1.4 * (1 - Math.exp(-lt * 3));
    const q = 0.68, N = 9, fr = phase % 1;
    const cx = W / 2, cy = H / 2;
    const segs = [];
    const v = bestH(cut.text, f.font, f.weight, W * 0.66, H * 0.34, 3, S * 0.2);
    const mH = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size }).h;
    const w100 = L.measure({ text: cut.text, font: f.font, weight: 700, size: 100 }).w / 100;
    for (let k = -1; k <= N; k++) {
      const s = Math.pow(q, k + 1 - fr);
      if (s > 1.08 || s < 0.03) continue;
      const a = L.smooth(0.03, 0.14, s) * (1 - L.smooth(0.8, 1.08, s)) * io;
      const fw = W * 0.96 * s, fh = H * 0.94 * s;
      if (pr.shape === 'round') env.rrect(cx - fw / 2, cy - fh / 2, fw, fh, Math.min(fw, fh) * 0.18, null, a * 0.6, false, sc.fg, Math.max(1, 3 * u * s));
      else env.rrect(cx - fw / 2, cy - fh / 2, fw, fh, 0, null, a * 0.6, false, sc.fg, Math.max(1, 3 * u * s));
      if (fh > mH * 1.45 && s < 0.95) {
        const ts = Math.min(S * 0.067 * s, fw * 0.86 / Math.max(0.5, w100), (fh - mH) * 0.22);
        env.text({ text: cut.text, font: f.font, weight: 700, size: ts, x: cx, y: cy + fh / 2 - ts * 0.9, color: sc.sub, alpha: a * 0.55, ghost: false });
      }
    }
    const s0 = Math.pow(q, N), s1 = 1.1;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) segs.push([cx + sx * W * 0.48 * s0, cy + sy * H * 0.47 * s0, cx + sx * W * 0.48 * s1, cy + sy * H * 0.47 * s1]);
    strokeSegs(env, segs, sc.fg, Math.max(1, 1.5 * u), 0.25 * io);
    raw(env, c => {
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, S * 0.4);
      g.addColorStop(0, L.rgba(sc.accent, 0.22 * io)); g.addColorStop(1, L.rgba(sc.accent, 0));
      c.fillStyle = g; c.fillRect(cx - S * 0.4, cy - S * 0.4, S * 0.8, S * 0.8);
    });
    return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: cx, y: cy, stroke: v.size * 0.08, strokeColor: sc.bg });
  },
}, P);

/* 魚眼レンズ: レンズが文字列の上を滑り、字が膨らむ */
L.register('layout', 'd_fisheye', {
  name: '魚眼レンズ', tags: ['pop', 'graphic', 'glitch'], w: 0.8, portrait: 0.7,
  fits: n => n >= 3 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'body', 'round']), amp: rng.range(0.45, 0.65), sweep: rng.sign(), grid: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.4), T = Tset(cut);
    const amp = pr.amp || 0.55;
    const lines = rowsOf(cut.text, env.portrait ? 6 : 11);
    const txt = lines.join('\n');
    const size = Math.min(L.fitSize(txt, f.font, W * 0.86 / (1 + amp * 0.42), H * 0.5 / (1 + amp * 0.35), { weight: f.weight, lead: 1.3 }), S * 0.18);
    const X0 = W / 2, Y0 = H / 2;
    const item = { text: txt, font: f.font, weight: f.weight, size, lead: 1.3, x: X0, y: Y0 };
    const m = L.measure(item);
    const lx = (pr.sweep || 1) * (1 - E.inOutCubic(clamp(lt / (T * 1.4)))) * m.w * 0.75 + Math.sin(lt * 0.7) * m.w * 0.1;
    const ly = lines.length > 1 ? Math.sin(lt * 0.55) * m.h * 0.25 : 0;
    const sig = size * 1.7;
    const sc2 = [], ox = [], oy = [];
    const rows = [];
    for (const g of m.lay) (rows[g.line] = rows[g.line] || []).push(g);
    for (const row of rows) {
      if (!row) continue;
      let tot = 0;
      for (const g of row) { const d2 = ((g.x - lx) ** 2 + (g.y - ly) ** 2) / (sig * sig); const k = 1 + amp * Math.exp(-d2); sc2[g.i] = k; tot += g.w * k; }
      let x = -tot / 2;
      for (const g of row) { const w = g.w * sc2[g.i]; ox[g.i] = x + w / 2 - g.x; oy[g.i] = (g.y - ly) * (sc2[g.i] - 1) * 0.35; x += w; }
    }
    item.charFns = [i => ({ dx: ox[i] || 0, dy: oy[i] || 0, s: sc2[i] || 1 })];
    if (pr.grid) {
      const segs = [], gs = size * 0.75, gx0 = X0 - Math.min(W * 0.46, m.w * 0.75), gx1 = X0 + Math.min(W * 0.46, m.w * 0.75), gy0 = Y0 - m.h * 0.9 - size * 0.6, gy1 = Y0 + m.h * 0.9 + size * 0.6;
      const warp = (x, y) => { const dx = x - (X0 + lx), dy = y - (Y0 + ly), k = amp * 0.8 * Math.exp(-(dx * dx + dy * dy) / (sig * sig * 2.2)); return [x + dx * k, y + dy * k]; };
      for (let y = gy0; y <= gy1 + 0.1; y += gs) { const s = []; for (let x = gx0; x <= gx1 + 0.1; x += gs / 2) s.push(...warp(x, y)); segs.push(s); }
      for (let x = gx0; x <= gx1 + 0.1; x += gs) { const s = []; for (let y = gy0; y <= gy1 + 0.1; y += gs / 2) s.push(...warp(x, y)); segs.push(s); }
      strokeSegs(env, segs, sc.fg, Math.max(1, 1 * u), 0.12 * io);
    }
    env.circle(X0 + lx, Y0 + ly, sig * 1.05, null, sc.accent, Math.max(1.5, 3 * u), 0.55 * io);
    env.arc(X0 + lx, Y0 + ly, sig * 0.9, 200, 250, '#ffffff', Math.max(1, 2.5 * u), 0.45 * io);
    const bb = L.mainDraw(env, item);
    return bb ? bbOf(X0 - m.w * (0.5 + amp * 0.25), Y0 - m.h * 0.5 * (1 + amp * 0.4), X0 + m.w * (0.5 + amp * 0.25), Y0 + m.h * 0.5 * (1 + amp * 0.4)) : null;
  },
}, P);

/* 蛇腹: 屏風のように折れた面に一字ずつ、ゆっくり開く */
L.register('layout', 'd_accordion', {
  name: '蛇腹', tags: ['graphic', 'editorial', 'pop'], w: 0.8, treat: 'safe',
  fits: n => n >= 2 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'serif', 'body']), alt: rng.sign() }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {};
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.35), T = Tset(cut);
    const lines = rowsOf(cut.text, env.portrait ? 5 : 10);
    const R = lines.length;
    const perMax = Math.max(...lines.map(l => L.glyphs(l).length));
    const aRest = 24 * DEG;
    const al = aRest + (1 - E.outCubic(clamp(lt / (T * 1.3)))) * 50 * DEG + 3 * DEG * Math.sin(lt * 1.1);
    const pw = Math.min(W * 0.9 / (perMax * Math.cos(aRest)), H * 0.82 / R / 1.42), ph = pw * 1.32;
    const ca = Math.cos(al), sa = Math.sin(al) * 0.34 * (pr.alt || 1);
    const edge = L.mix(sc.onPaper, sc.paper, 0.55);
    let bb = null;
    lines.forEach((ln, r) => {
      const gs = L.glyphs(ln);
      const y = H / 2 + (r - (R - 1) / 2) * ph * 1.12;
      const x0 = W / 2 - gs.length * pw * ca / 2;
      gs.forEach((ch, k) => {
        const x = x0 + (k + 0.5) * pw * ca, s = k % 2 ? -sa : sa;
        const M = [ca, s, 0, 1, x, y];
        const shade = k % 2 ? L.mix(sc.paper, sc.onPaper, 0.06 + 0.3 * Math.sin(al)) : sc.paper;
        withM(env, M, () => {
          env.rect(-pw / 2, -ph / 2, pw, ph, shade, io, false);
          env.rrect(-pw / 2, -ph / 2, pw, ph, 0, null, io, false, edge, Math.max(1, 1.2 * u));
        });
        if (L.isSpace(ch)) return;
        const b = affMain(env, M, { text: ch, font: f.font, weight: f.weight, size: pw * 0.7, color: sc.onPaper, x: 0, y: 0, mi: k * 0.25 + r * 0.6 });
        if (b) bb = L.unionBB(bb, bbOf(x0, y - ph * 0.7, x0 + gs.length * pw * ca, y + ph * 0.7));
      });
    });
    return bb;
  },
}, P);

/* 床面パース: 地平線へ伸びる床に歌詞が寝ている */
L.register('layout', 'd_floor', {
  name: '床面パース', tags: ['cyber', 'graphic', 'emotional'], w: 0.9,
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['display', 'body', 'display']), speed: rng.range(0.4, 0.8), sy: rng.range(0.55, 0.68) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.45);
    const vx = W / 2, vy = H * (env.portrait ? 0.34 : 0.3);
    const lines = rowsOf(cut.text, env.portrait ? 6 : 11).slice(0, 3);
    const K = lines.length;
    const sy = pr.sy || 0.62;
    const yNear = H * 0.8;
    const sOf = l => 1 / (1 + (K - 1 - l) * 0.42);
    let size = S * 0.28;
    lines.forEach((ln, l) => { const w100 = L.measure({ text: ln, font: f.font, weight: f.weight, size: 100 }).w / 100; size = Math.min(size, W * 0.8 / (w100 * sOf(l))); });
    const totalH = lines.reduce((a, ln, l) => a + size * sOf(l) * sy * 1.25, 0);
    size = Math.min(size, size * (yNear - vy - S * 0.04) / Math.max(1, totalH));
    const ge = E.outCubic(clamp(lt / 0.6));
    const segs = [];
    for (let k = -8; k <= 8; k++) { const xb = vx + k * W * 0.14; segs.push([vx + (xb - vx) * 0.04, vy + (H - vy) * 0.04, vx + (xb - vx) * ge, vy + (H - vy) * ge]); }
    const ph = (lt * (pr.speed || 0.6)) % 1;
    for (let j = 0; j < 16; j++) { const s = 1 / (1 + (15 - j + ph) * 0.5); const y = vy + (H - vy) * s; if (y > vy + 2) segs.push([0, y, W, y]); }
    strokeSegs(env, segs, sc.accent, Math.max(1, 1.5 * u), 0.3 * io);
    raw(env, c => {
      const g = c.createLinearGradient(0, vy - S * 0.1, 0, vy + S * 0.14);
      g.addColorStop(0, L.rgba(sc.bg, 0)); g.addColorStop(0.45, L.rgba(sc.bg, 0.9 * io)); g.addColorStop(1, L.rgba(sc.bg, 0));
      c.fillStyle = g; c.fillRect(0, vy - S * 0.1, W, S * 0.24);
    });
    env.line([[W * 0.02, vy], [W * 0.98, vy]], sc.accent2, Math.max(1, 2 * u), 0.7 * io, false);
    let y = yNear, bb = null;
    for (let l = K - 1; l >= 0; l--) {
      const s = sOf(l), hs = size * s * sy;
      const yl = y - hs * 0.6;
      y -= hs * 1.25;
      const item = { text: lines[l], font: f.font, weight: f.weight, size: size * s, sy, x: vx, y: yl, mi: l };
      item.charFns = [(i, g) => ({ skew: Math.atan(0.55 * sy * g.x / Math.max(1, yl - vy)) })];
      bb = L.unionBB(bb, L.mainDraw(env, item));
    }
    return bb;
  },
}, P);

/* ================================================================ 4. ボカロMV系 */

const wallW = new Map();                      // 壁文字の1周期幅キャッシュ
function wallUnit(ctx, font, text) {
  const k = font + '|' + text;
  let w = wallW.get(k);
  if (w == null) { ctx.font = font; w = Math.max(1, ctx.measureText(text).width); if (wallW.size > 200) wallW.clear(); wallW.set(k, w); }
  return w;
}
/* 赤黒分割: 赤と黒の半面、細かい歌詞の壁、巨大な一句 */
L.register('layout', 'd_redwall', {
  name: '赤黒分割', tags: ['dark', 'glitch', 'graphic'], w: 1, busy: true, treat: false, emph: 1.4,
  fits: n => n >= 1 && n <= 30,
  plan: (rng, cut) => ({ split: rng.pick(['v', 'h', 'v']), redFirst: rng.chance(0.5), tilt: rng.range(-4, 4), seed: rng.int(1, 1e6), font: rng.pick(['display', 'rock', 'display']) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.25);
    const red = warm(sc);
    const e = E.outExpo(clamp(lt / 0.4));
    const vs = env.portrait ? false : pr.split !== 'h';
    const halves = vs ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]] : [[0, 0, W, H / 2], [0, H / 2, W, H / 2]];
    const cols = pr.redFirst ? [red, '#000000'] : ['#000000', red];
    halves.forEach((hr, i) => {
      const d = (1 - e) * (vs ? W / 2 : H / 2) * (i ? 1 : -1);
      env.rect(hr[0] + (vs ? d : 0), hr[1] + (vs ? 0 : d), hr[2], hr[3], cols[i], io, false);
    });
    const ws = S * 0.042, rowH = ws * 1.3, rows = Math.min(40, Math.ceil(H / rowH) + 1);
    const unitText = cut.text + (isLat(cut.text) ? ' / ' : '　／　');
    raw(env, c => {
      const font = L.fontStr({ font: L.roleFont(env, 'body'), weight: 700, size: ws });
      const uw = wallUnit(c, font, unitText);
      const reps = Math.min(30, Math.ceil((vs ? W / 2 : W) / uw) + 2);
      const rowStr = unitText.repeat(reps);
      c.font = font; c.textBaseline = 'middle'; c.textAlign = 'left';
      halves.forEach((hr, i) => {
        c.save();
        c.beginPath(); c.rect(hr[0], hr[1], hr[2], hr[3]); c.clip();
        const onRed = cols[i] !== '#000000';
        c.fillStyle = onRed ? '#000000' : red;
        for (let r = 0; r < rows; r++) {
          const y = r * rowH + rowH / 2;
          if (y < hr[1] - rowH || y > hr[1] + hr[3] + rowH) continue;
          const ra = clamp(e * 1.6 - L.r(pr.seed, r, i) * 0.6);
          if (ra <= 0) continue;
          c.globalAlpha = io * ra * (onRed ? 0.32 : 0.42);
          const dir = r % 2 ? 1 : -1, sp = S * (0.05 + 0.05 * L.r(pr.seed, r));
          const off = (((lt * sp * dir + L.r(pr.seed, r, 'o') * uw) % uw) + uw) % uw;
          c.fillText(rowStr, hr[0] - off, y);
        }
        c.restore();
      });
    });
    env.text({ text: 'REC ●', font: "'Oswald', sans-serif", weight: 700, size: S * 0.03, x: W * 0.05, y: H * 0.06, align: 'left', color: '#ffffff', alpha: 0.85 * io, ghost: false });
    env.text({ text: L.fmtTime(Math.max(0, env.t)), font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.03, x: W * 0.95, y: H * 0.94, align: 'right', color: '#ffffff', alpha: 0.75 * io, ghost: false });
    const v = bestH(cut.text, f.font, f.weight, W * 0.88, H * 0.6, 3, S * 0.34);
    return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: W / 2, y: H / 2, rot: (pr.tilt || 0) * DEG, color: '#ffffff', stroke: v.size * 0.06, strokeColor: '#000000',
      shadow: { color: L.rgba(red, 0.95), blur: 0, dx: v.size * 0.05, dy: v.size * 0.05 } });
  },
}, P);

/* 集中線インパクト: 集中線の中心に巨大な一語 */
L.register('layout', 'd_impact', {
  name: '集中線', tags: ['dark', 'graphic', 'pop'], w: 0.9, emph: 2, busy: true,
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ font: rng.pick(['display', 'dela', 'reggae', 'rock']), tilt: rng.range(-5, 5), lines: rng.int(70, 110), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.12);
    const v = bestH(cut.text, f.font, f.weight, W * 0.84, H * 0.62, cut.n > 8 ? 3 : 2, S * 0.42);
    const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
    const cx = W / 2, cy = H / 2;
    const rx = m.w * 0.58 + S * 0.06, ry = m.h * 0.66 + S * 0.06;
    const conv = 1 + (1 - E.outCubic(clamp(lt / 0.3))) * 2.2;
    const k = Math.floor(env.step / 2), N = pr.lines || 90, Ro = Math.hypot(W, H) * 0.62;
    raw(env, c => {
      c.globalAlpha = 0.6 * io; c.fillStyle = sc.fg; c.beginPath();
      for (let i = 0; i < N; i++) {
        const th = TAU * i / N + L.rs(pr.seed, k, i) * Math.PI / N;
        const fi = (1 + L.r(pr.seed, k, i, 1) * 0.55) * conv;
        const dl = 0.004 + 0.01 * L.r(pr.seed, k, i, 2);
        c.moveTo(cx + Math.cos(th) * rx * fi, cy + Math.sin(th) * ry * fi);
        c.lineTo(cx + Math.cos(th - dl) * Ro, cy + Math.sin(th - dl) * Ro);
        c.lineTo(cx + Math.cos(th + dl) * Ro, cy + Math.sin(th + dl) * Ro);
        c.closePath();
      }
      c.fill();
    });
    if (lt < 0.22) env.rect(0, 0, W, H, sc.fg, (1 - lt / 0.22) * 0.5, false);
    return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: cx, y: cy, rot: (pr.tilt || 0) * DEG, stroke: v.size * 0.1, strokeColor: sc.bg });
  },
}, P);

/* コマ割り: 斜めの枠線で割った漫画のコマに一句ずつ */
L.register('layout', 'd_panels', {
  name: 'コマ割り', tags: ['pop', 'graphic', 'editorial', 'dark'], w: 1, busy: true, treat: 'safe',
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['display', 'serif', 'body', 'dela']), slant: rng.range(0.04, 0.08) * rng.sign(), tone: rng.int(0, 3), sfx: rng.pick(['！', '！？', '…']) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.25);
    const lat = isLat(cut.text);
    let parts = L.chunks(cut.text);
    const K = clamp(parts.length, 2, env.portrait ? 3 : 4);
    while (parts.length > K) {
      let bi = 0, bl = 1e9;
      for (let i = 0; i + 1 < parts.length; i++) { const l = L.glyphCount(parts[i] + parts[i + 1]); if (l < bl) { bl = l; bi = i; } }
      parts.splice(bi, 2, parts[bi] + (lat ? ' ' : '') + parts[bi + 1]);
    }
    if (parts.length < 2) parts = [parts[0] || cut.text, null];
    const x0 = W * 0.04, y0 = H * 0.05, x1 = W * 0.96, y1 = H * 0.95, g = S * 0.024;
    const rowsMode = env.portrait;
    const sl = (pr.slant || 0.06) * (rowsMode ? H : W) * 0.5;
    const cut_ = j => j / K;
    const poly = j => {                          // コマ j (画面上の並び順)
      if (!rowsMode) {
        const a = x0 + (x1 - x0) * cut_(j), b = x0 + (x1 - x0) * cut_(j + 1);
        const sa = j === 0 ? 0 : sl, sb = j === K - 1 ? 0 : sl;
        return [[a + sa + (j ? g / 2 : 0), y0], [b + sb - (j < K - 1 ? g / 2 : 0), y0], [b - sb - (j < K - 1 ? g / 2 : 0), y1], [a - sa + (j ? g / 2 : 0), y1]];
      }
      const a = y0 + (y1 - y0) * cut_(j), b = y0 + (y1 - y0) * cut_(j + 1);
      const sa = j === 0 ? 0 : sl * 0.5, sb = j === K - 1 ? 0 : sl * 0.5;
      return [[x0, a - sa + (j ? g / 2 : 0)], [x1, a + sa + (j ? g / 2 : 0)], [x1, b + sb - (j < K - 1 ? g / 2 : 0)], [x0, b - sb - (j < K - 1 ? g / 2 : 0)]];
    };
    const border = sc.onPaper;
    let bb = null;
    const pwMin = rowsMode ? (x1 - x0) : ((x1 - x0) / K - sl * 2 - g);
    const phMin = rowsMode ? ((y1 - y0) / K - sl - g) : (y1 - y0);
    const vert = !lat && !rowsMode;
    const fits = fitParts(parts.map(p => p || '　'), f, pwMin * 0.8, phMin * 0.8, vert, 3, S * 0.26);
    parts.forEach((part, i) => {
      const slot = rowsMode || lat ? i : K - 1 - i;       // 和文の横並びは右から読む
      const pts = poly(slot);
      const cxp = pts.reduce((a, p) => a + p[0], 0) / 4, cyp = pts.reduce((a, p) => a + p[1], 0) / 4;
      const tau = clamp((lt - i * 0.1) / 0.28), k = 0.9 + 0.1 * E.outBack(tau, 1.6), a = io * clamp(tau * 2.5);
      if (a <= 0) return;
      const P2 = pts.map(p => [cxp + (p[0] - cxp) * k, cyp + (p[1] - cyp) * k]);
      env.poly(P2, sc.paper, a, false);
      raw(env, c => {
        c.globalAlpha = a; c.beginPath(); c.moveTo(P2[0][0], P2[0][1]); for (let q = 1; q < 4; q++) c.lineTo(P2[q][0], P2[q][1]); c.closePath(); c.clip();
        if (i % 3 === (pr.tone || 0) % 3) {
          c.globalAlpha = a * 0.22; c.fillStyle = L._pattern(c, 'dots', border, null) || border;
          c.fillRect(Math.min(...P2.map(p => p[0])), cyp, W, H);
        } else if (i % 2 === 1) {
          c.globalAlpha = a * 0.14; c.strokeStyle = border; c.lineWidth = Math.max(1, 1.5 * u); c.beginPath();
          for (let q = 0; q < 40; q++) { const yy = y0 + (y1 - y0) * L.r(cut.seed, 'sl', i, q), xx = cxp + L.rs(cut.seed, 'sx', i, q) * W * 0.2; c.moveTo(xx - W * 0.3, yy); c.lineTo(xx + W * 0.3, yy); }
          c.stroke();
        }
      });
      polyStroke(env, P2, border, Math.max(2, 5 * u), a);
      if (part) {
        const v = fits[i];
        const b = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, vertical: v.vertical, lead: v.lead, color: sc.onPaper, x: cxp, y: cyp, mi: i, delay: dly(env, 0.15) });
        bb = L.unionBB(bb, b);
      } else {
        env.text({ text: pr.sfx || '！', font: FONT.dela[0], weight: 400, size: Math.min(pwMin, phMin) * 0.5, x: cxp, y: cyp, rot: -0.15, color: L.fitContrast(warm(sc), sc.paper, 3), alpha: a, ghost: false });
      }
    });
    return bb;
  },
}, P);

/* 斜め分割: 斜めの切り口で二色に割れた画面、文字も切れ目で色が反転 */
L.register('layout', 'd_slash', {
  name: '斜め分割', tags: ['dark', 'graphic', 'glitch'], w: 1, busy: true, treat: false, emph: 1.3,
  fits: n => n >= 1 && n <= 20,
  plan: rng => ({ ang: rng.range(14, 24) * rng.sign(), font: rng.pick(['display', 'dela', 'body']), flip: rng.chance(0.5) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.2);
    const an = (pr.ang || 18) * DEG * (env.portrait ? 1.6 : 1);
    const d = [Math.cos(an), Math.sin(an)], nv = [-Math.sin(an) * (pr.flip ? -1 : 1), Math.cos(an) * (pr.flip ? -1 : 1)];
    const cx = W / 2, cy = H / 2, B = Math.hypot(W, H) * 1.2;
    const e1 = E.outExpo(clamp(lt / 0.22)), e2 = E.outCubic(clamp((lt - 0.08) / 0.4));
    const ext = B * e2;
    env.poly([[cx - d[0] * B, cy - d[1] * B], [cx + d[0] * B, cy + d[1] * B], [cx + d[0] * B + nv[0] * ext, cy + d[1] * B + nv[1] * ext], [cx - d[0] * B + nv[0] * ext, cy - d[1] * B + nv[1] * ext]], sc.fg, io, false);
    env.line([[cx - d[0] * B * e1, cy - d[1] * B * e1], [cx + d[0] * B * e1, cy + d[1] * B * e1]], sc.accent, Math.max(2, 5 * u), io, false);
    const v = bestH(cut.text, f.font, f.weight, W * 0.84, H * 0.5, 3, S * 0.3);
    const slide = (1 - E.outCubic(clamp((lt - 0.12) / 0.45))) * v.size * 0.7;
    const quad = (o, side) => {                   // 半平面(局所座標) side=+1: nv 側 0..ext, -1: 反対側
      const p = (x, y) => [x - o[0], y - o[1]];
      if (side > 0) return [p(-d[0] * B, -d[1] * B), p(d[0] * B, d[1] * B), p(d[0] * B + nv[0] * ext, d[1] * B + nv[1] * ext), p(-d[0] * B + nv[0] * ext, -d[1] * B + nv[1] * ext)];
      return [p(-d[0] * B, -d[1] * B), p(d[0] * B, d[1] * B), p(d[0] * B - nv[0] * B, d[1] * B - nv[1] * B), p(-d[0] * B - nv[0] * B, -d[1] * B - nv[1] * B)];
    };
    const clipOf = (o, sides) => (ctx) => {
      for (const sd of sides) {
        const q = sd === 2 ? quad([o[0] - nv[0] * ext, o[1] - nv[1] * ext], 1).map(p => [p[0], p[1]]) : quad(o, sd);
        if (sd === 2) { const far = [[-d[0] * B + nv[0] * ext - o[0], -d[1] * B + nv[1] * ext - o[1]], [d[0] * B + nv[0] * ext - o[0], d[1] * B + nv[1] * ext - o[1]], [d[0] * B + nv[0] * B * 2 - o[0], d[1] * B + nv[1] * B * 2 - o[1]], [-d[0] * B + nv[0] * B * 2 - o[0], -d[1] * B + nv[1] * B * 2 - o[1]]]; ctx.moveTo(far[0][0], far[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(far[k][0], far[k][1]); ctx.closePath(); continue; }
        ctx.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath();
      }
    };
    const base = { text: v.text, font: f.font, weight: f.weight, size: v.size, plain: true };
    const bA = L.mainDraw(env, Object.assign({}, base, { x: cx, y: cy, color: sc.fg, clipFn: clipOf([0, 0], [-1, 2]) }));
    const ox = cx + d[0] * slide, oy = cy + d[1] * slide;
    const bB = L.mainDraw(env, Object.assign({}, base, { x: ox, y: oy, color: sc.bg, clipFn: clipOf([ox - cx, oy - cy], [1]) }));
    return L.unionBB(bA, bB);
  },
}, P);

/* 反復グリッド: 歌詞の反復で埋まったグリッドがちらつき、中央の一枠だけが強調 */
L.register('layout', 'd_glitchgrid', {
  name: '反復グリッド', tags: ['glitch', 'dark', 'cyber', 'graphic'], w: 0.9, busy: true, treat: 'safe',
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['display', 'body', 'mono']), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.25);
    const cols = env.portrait ? 3 : (W / H < 1.3 ? 4 : 5), rows = env.portrait ? 6 : 4;
    const cw = W / cols, ch = H / rows;
    const hc0 = env.portrait ? 0 : 1, hc1 = env.portrait ? 3 : cols - 1, hr0 = env.portrait ? 2 : 1, hr1 = env.portrait ? 4 : 3;
    const gl = env.fx.glitch == null ? 0.5 : env.fx.glitch;
    const short = cut.n > 10 ? (L.chunks(cut.text)[0] || cut.text) : cut.text;
    const cf = L.roleFont(env, 'body');
    const cs = Math.min(L.fitSize(short, cf, cw * 0.84, ch * 0.5, { weight: 700 }), S * 0.07);
    const k = Math.floor(env.step / 3);
    const segs = [];
    for (let i = 1; i < cols; i++) segs.push([i * cw, 0, i * cw, H]);
    for (let j = 1; j < rows; j++) segs.push([0, j * ch, W, j * ch]);
    strokeSegs(env, segs, sc.fg, Math.max(1, 1.2 * u), 0.2 * io);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (i >= hc0 && i < hc1 && j >= hr0 && j < hr1) continue;
      const a0 = clamp((lt - L.r(pr.seed, i, j) * 0.35) / 0.12) * io;
      if (a0 <= 0) continue;
      const h = L.r(pr.seed, i, j, k);
      const inv = h < 0.1 * gl + 0.03;
      const blank = !inv && h > 1 - 0.08 * gl;
      if (blank) continue;
      const jit = L.r(pr.seed, i, j, k, 1) < 0.35 * gl ? L.rs(pr.seed, i, j, k, 2) * cw * 0.12 : 0;
      const x = i * cw + cw / 2 + jit, y = j * ch + ch / 2;
      if (inv) env.rect(i * cw, j * ch, cw, ch, sc.fg, 0.85 * a0, false);
      if (L.r(pr.seed, i, j, k, 3) < 0.25 * gl) env.text({ text: short, font: cf, weight: 700, size: cs, x: x + 3 * u, y, color: sc.accent2, alpha: 0.4 * a0, ghost: false });
      env.text({ text: short, font: cf, weight: 700, size: cs, x, y, color: inv ? sc.bg : sc.fg, alpha: (inv ? 0.95 : 0.3) * a0, ghost: false });
      env.text({ text: 'CH' + String(i + j * cols + 1).padStart(2, '0'), font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.022, x: i * cw + S * 0.015, y: j * ch + S * 0.02, align: 'left', color: inv ? sc.bg : sc.sub, alpha: 0.6 * a0, ghost: false });
    }
    const hx = hc0 * cw, hy = hr0 * ch, hw = (hc1 - hc0) * cw, hh = (hr1 - hr0) * ch;
    const ey = E.outExpo(clamp((lt - 0.04) / 0.3));
    env.rect(hx, hy + hh / 2 * (1 - ey), hw, hh * ey, sc.accent, io, false);
    const jj = L.rs(pr.seed, 'hb', Math.floor(env.step / 2)) * 3 * u * gl;
    env.rrect(hx + jj + 4 * u, hy + 4 * u, hw - 8 * u, hh - 8 * u, 0, null, io * ey, false, sc.accent2, Math.max(1.5, 3 * u));
    env.text({ text: 'REC ●  CLEAN', font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.024, x: hx + S * 0.02, y: hy + S * 0.028, align: 'left', color: sc.onInk, alpha: 0.8 * io * ey, ghost: false });
    const v = bestH(cut.text, f.font, f.weight, hw * 0.86, hh * 0.7, 3, S * 0.24);
    return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: hx + hw / 2, y: hy + hh / 2 + S * 0.01, color: sc.onInk, delay: dly(env, 0.12) });
  },
}, P);

/* 輪郭の段重ね: 本体の下へ輪郭のコピーが段々に流れ落ちる */
L.register('layout', 'd_outline_stack', {
  name: '輪郭の段重ね', tags: ['glitch', 'dark', 'graphic'], w: 0.9, emph: 1.3,
  fits: n => n >= 1 && n <= 18,
  plan: rng => ({ font: rng.pick(['display', 'dela', 'rock']), k: rng.int(6, 8), alt: rng.chance(0.5) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3);
    const v = bestH(cut.text, f.font, f.weight, W * 0.86, H * 0.28, env.portrait ? 3 : 2, S * 0.24);
    const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
    const y0 = Math.max(H * 0.06 + m.h / 2, H * (env.portrait ? 0.26 : 0.25));
    const ls = v.text.split('\n'), last = ls[ls.length - 1];
    const lh = v.size * 1.18, ly0 = y0 + m.h / 2 - lh / 2;          // 最終行の位置から下へ流す
    const step = lh * 0.55;
    const K = pr.k || 7, ph = (lt * 0.45) % 1, cas = E.outCubic(clamp(lt / 0.6));
    for (let j = K; j >= 0; j--) {
      const p = j + ph;
      const y = ly0 + p * step * cas;
      if (y - lh / 2 > H) continue;
      const a = io * (1 - p / (K + 1)) * Math.min(1, p * 1.4) * 0.9;
      if (a <= 0.01) continue;
      const col = pr.alt ? (j % 2 ? sc.accent2 : sc.accent) : sc.accent;
      env.text({ text: last, font: f.font, weight: f.weight, size: v.size, x: W / 2, y, fill: false, stroke: Math.max(1, v.size * 0.022), strokeColor: col, color: col, alpha: a, ghost: false });
    }
    return L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: W / 2, y: y0, stroke: v.size * 0.06, strokeColor: sc.bg });
  },
}, P);

/* 巨大漢字と注記: 一字を巨大に、図面のような注記線と小さな本文 */
function focusOf(text, emphIdx) {
  const gs = L.glyphs(text);
  if (emphIdx && emphIdx.length) {
    const run = [emphIdx[0]]; for (let k = 1; k < emphIdx.length && emphIdx[k] === run[run.length - 1] + 1; k++) run.push(emphIdx[k]);
    const s = run.map(i => gs[i] || '').join('').trim();
    if (s) return { text: s, idx: run };
  }
  let best = null, cur = null;
  gs.forEach((c, i) => {
    if (L.isKanji(c)) { if (!cur) cur = { s: i, e: i }; else cur.e = i; if (!best || cur.e - cur.s > best.e - best.s) best = { s: cur.s, e: cur.e }; }
    else cur = null;
  });
  if (best) { const idx = []; for (let i = best.s; i <= best.e; i++) idx.push(i); return { text: gs.slice(best.s, best.e + 1).join(''), idx }; }
  return null;
}
L.register('layout', 'd_kanji_annot', {
  name: '巨大漢字と注記', tags: ['editorial', 'graphic', 'dark'], w: 0.9,
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ font: rng.pick(['serif', 'display', 'tokumin', 'dela']), side: rng.sign(), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'serif'), fb = F(env, 'body');
    const lt = env.lt, io = env.inOut(0.35);
    const fo = focusOf(cut.text, cut.emphIdx);
    let big = fo ? L.glyphs(fo.text).slice(0, 2).join('') : firstGlyph(cut.text);
    if (isLat(cut.text)) big = big.toUpperCase();
    const bn = L.glyphs(big).length;
    const lat = isLat(cut.text);
    let bx, by, bs, tItem;
    const side = pr.side || 1;
    if (!env.portrait) {
      const bw = W * 0.52, bh = H * 0.8;
      bs = Math.min(L.fitSize(big, f.font, bw, bh, { weight: f.weight, vertical: bn > 1 && bw < bh * 1.2 }), S * 0.8);
      bx = W / 2 - side * W * 0.19; by = H / 2;
      const tv = fitVH(cut.text, fb, W * 0.3, H * 0.8, !lat, 3, S * 0.09);
      tItem = { text: tv.text, font: fb.font, weight: fb.weight, size: tv.size, vertical: tv.vertical, lead: tv.lead, x: W / 2 + side * W * 0.3, y: H / 2, mi: 1 };
    } else {
      bs = Math.min(L.fitSize(big, f.font, W * 0.84, H * 0.5, { weight: f.weight }), S * 0.9);
      bx = W / 2; by = H * 0.36;
      const tv = bestH(cut.text, fb.font, fb.weight, W * 0.86, H * 0.2, 3, S * 0.1);
      tItem = { text: tv.text, font: fb.font, weight: fb.weight, size: tv.size, x: W / 2, y: H * 0.8, mi: 1 };
    }
    const vertBig = !env.portrait && bn > 1;
    const bigItem = { text: big, font: f.font, weight: f.weight, size: bs, vertical: vertBig, x: bx, y: by };
    const m = L.measure(bigItem);
    const x0 = bx - m.w / 2, x1 = bx + m.w / 2, y0 = by - m.h / 2, y1 = by + m.h / 2;
    const acc = L.fitContrast(sc.accent, sc.bg, 3);
    const ce = E.outCubic(clamp((lt - 0.1) / 0.4));
    const cm = S * 0.03, crop = [];
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) crop.push([cx + sx * cm * ce, cy, cx, cy, cx, cy + sy * cm * ce]);
    strokeSegs(env, crop, sc.sub, Math.max(1, 2 * u), 0.8 * io);
    const bb1 = L.mainDraw(env, bigItem);
    const bb2 = L.glyphCount(big) >= cut.n ? null : L.mainDraw(env, tItem);
    const labels = ['01', '02', '03'];
    for (let q = 0; q < 3; q++) {
      const e = clamp((lt - 0.35 - q * 0.12) / 0.35);
      if (e <= 0) continue;
      const px = x0 + m.w * (0.22 + 0.56 * L.r(pr.seed, q, 'x')), py = y0 + m.h * (0.2 + 0.6 * ((q + L.r(pr.seed, q, 'y')) / 3));
      const tx = side > 0 ? Math.max(W * 0.05, x0 - S * 0.05) : Math.min(W * 0.95, x1 + S * 0.05);
      const pts = [[px, py], [px - side * S * 0.05, py - S * 0.04], [tx, py - S * 0.04]];
      env.circle(px, py, S * 0.014, null, acc, Math.max(1.5, 2.5 * u), io * e);
      env.polyPartial(pts, E.outCubic(e), acc, Math.max(1, 1.8 * u), io);
      if (e > 0.7) env.text({ text: labels[q], font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.03, x: tx, y: py - S * 0.065, align: side > 0 ? 'left' : 'right', color: acc, alpha: io * (e - 0.7) / 0.3, ghost: false });
    }
    const code = 'U+' + (big.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0');
    const be = E.outCubic(clamp((lt - 0.3) / 0.4));
    const yb = Math.min(H * 0.96, y1 + S * 0.035);
    strokeSegs(env, [[bx - m.w / 2 * be, yb, bx + m.w / 2 * be, yb], [x0, yb - S * 0.012, x0, yb + S * 0.012], [x1, yb - S * 0.012, x1, yb + S * 0.012]], sc.sub, Math.max(1, 1.5 * u), io * be);
    env.text({ text: code + '  /  ' + String(cut.idx + 1).padStart(2, '0'), font: L.roleFont(env, 'mono'), weight: 400, size: S * 0.026, x: bx, y: Math.min(H * 0.975, yb + S * 0.03), color: sc.sub, alpha: io * be, ghost: false });
    return L.unionBB(bb1, bb2);
  },
}, P);

/* 反転ストロボ: 箱が明滅して反転し、落ち着くと反転箱の中に歌詞 */
L.register('layout', 'd_strobe', {
  name: '反転ストロボ', tags: ['glitch', 'dark', 'graphic'], w: 0.8, emph: 1.5, treat: 'safe',
  fits: n => n >= 1 && n <= 16,
  plan: rng => ({ font: rng.pick(['display', 'body', 'dela']), pad: rng.range(0.28, 0.45), seed: rng.int(1, 1e6) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.2);
    const v = bestH(cut.text, f.font, f.weight, W * 0.76, H * 0.4, 3, S * 0.26);
    const m = L.measure({ text: v.text, font: f.font, weight: f.weight, size: v.size });
    const pad = pr.pad || 0.35;
    const bw = m.w + v.size * pad * 2, bh = m.h + v.size * pad * 1.3;
    const gl = env.fx.glitch == null ? 0.5 : env.fx.glitch;
    const sw = Math.min(0.6, cut.dur * 0.25);
    const strobing = lt < sw && gl >= 0.15;
    const on = !strobing || Math.floor(env.step / 5) % 2 === 0;   // 2.4Hz(光過敏対策: 1秒3回以下)
    const eg = E.outExpo(clamp(lt / 0.25));
    const x = W / 2 - bw / 2, y = H / 2 - bh * eg / 2;
    const jit = strobing ? L.rs(pr.seed, Math.floor(env.step / 2)) * S * 0.014 * gl : S * 0.006;
    env.rrect(x - jit, y + jit * 0.5, bw, bh * eg, 0, null, io, false, sc.accent, Math.max(1.5, 3 * u));
    env.rrect(x + jit, y - jit * 0.5, bw, bh * eg, 0, null, io, false, sc.accent2, Math.max(1.5, 3 * u));
    if (on) env.rect(x, y, bw, bh * eg, sc.fg, io, false);
    if (strobing) for (let q = 0; q < 3; q++) env.rect(x, y + bh * eg * L.r(pr.seed, env.step, q), bw, bh * 0.03, on ? sc.bg : sc.fg, 0.7 * io, false);
    const bb = L.mainDraw(env, { text: v.text, font: f.font, weight: f.weight, size: v.size, x: W / 2, y: H / 2, color: on ? sc.bg : sc.fg });
    return bb ? bbOf(x, H / 2 - bh / 2, x + bw, H / 2 + bh / 2) : null;
  },
}, P);

/* 字幕＋特大強調: 強調語を画面いっぱいに、下に字幕帯 */
L.register('layout', 'd_subemph', {
  name: '字幕と特大強調', tags: ['dark', 'graphic', 'editorial', 'emotional'], w: 1, emph: 1.8,
  fits: n => n >= 1 && n <= 30,
  plan: rng => ({ style: rng.pick(['fill', 'outline', 'fill']), font: rng.pick(['display', 'dela', 'rock', 'serif']) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display'), fb = F(env, 'body');
    const lt = env.lt, io = env.inOut(0.3);
    const gs = L.glyphs(cut.text);
    let fo = focusOf(cut.text, cut.emphIdx);
    if (!fo || (fo.idx.length < 2 && !(cut.emphIdx && cut.emphIdx.length))) {
      const ch = L.chunks(cut.text);
      let best = ch[0] || cut.text;
      for (const c of ch) if (L.glyphCount(c) > L.glyphCount(best) && L.glyphCount(c) <= 6) best = c;
      const st = cut.text.indexOf(best);
      const s0 = st >= 0 ? L.glyphs(cut.text.slice(0, st)).length : 0;
      fo = { text: best, idx: L.glyphs(best).map((c, i) => s0 + i) };
    }
    const whole = L.glyphCount(fo.text) >= cut.n;
    const giantText = isLat(fo.text) ? fo.text.toUpperCase() : fo.text;
    const gv = bestH(giantText, f.font, f.weight, W * 0.92, H * (whole ? 0.72 : (env.portrait ? 0.5 : 0.6)), L.glyphCount(giantText) > 6 ? 2 : 1, S * 0.62);
    const gy = whole ? H / 2 : H * 0.44;
    const col = L.fitContrast(sc.accent, sc.bg, 3);
    const gItem = pr.style === 'outline'
      ? { text: gv.text, font: f.font, weight: f.weight, size: gv.size, x: W / 2, y: gy, fill: false, stroke: Math.max(1.5, gv.size * 0.028), strokeColor: sc.fg, color: sc.fg }
      : { text: gv.text, font: f.font, weight: f.weight, size: gv.size, x: W / 2, y: gy, color: col };
    const bb1 = L.mainDraw(env, gItem);
    if (whole) return bb1;
    const ss = Math.min(L.fitSize(cut.text, fb.font, W * 0.84, H * 0.07, { weight: fb.weight }), S * 0.06);
    const sm = L.measure({ text: cut.text, font: fb.font, weight: fb.weight, size: ss });
    const sy = H * (env.portrait ? 0.82 : 0.86);
    const be = E.outExpo(clamp((lt - 0.05) / 0.35));
    const bw = (sm.w + ss * 1.6) * be, bh = ss * 1.8;
    env.rect(W / 2 - bw / 2, sy - bh / 2, bw, bh, '#000000', 0.72 * io, false);
    env.rect(W / 2 - bw / 2, sy - bh / 2, Math.max(0, 4 * u), bh, sc.accent, io * be, false);
    const hi = new Set(fo.idx);
    const hiC = L.fitContrast(sc.accent, '#000000', 4.5);
    const sItem = { text: cut.text, font: fb.font, weight: fb.weight, size: ss, x: W / 2, y: sy, color: '#ffffff', mi: 1, plain: true };
    sItem.charFns = [i => (hi.has(i) ? { color: hiC } : null)];
    const bb2 = L.mainDraw(env, sItem);
    return L.unionBB(bb1, bb2);
  },
}, P);

/* 縦横クロス: 横組みと縦組みが十字に交差 */
L.register('layout', 'd_cross', {
  name: '縦横クロス', tags: ['graphic', 'editorial', 'dark'], w: 0.9,
  fits: n => n >= 2 && n <= 20,
  plan: rng => ({ font: rng.pick(['display', 'serif', 'body', 'dela']), rule: rng.chance(0.75) }),
  render(env) {
    const { W, H, sc, cut, u } = env; const pr = cut.params || {}; const S = Math.min(W, H);
    const f = F(env, pr.font || 'display');
    const lt = env.lt, io = env.inOut(0.3);
    const [A, B] = halves(cut.text);
    const lat = isLat(cut.text);
    const cx = W / 2, cy = H / 2;
    const splitAt = (text) => {                  // 交点の切れ目: 真ん中に近い語(句)の境目
      const gs = L.glyphs(text), nn = gs.length;
      if (nn < 2) return -1;
      const cand = [];
      if (isLat(text)) gs.forEach((c, i) => { if (L.isSpace(c)) cand.push(i + 1); });
      else { let acc = 0; for (const c of L.chunks(text)) { acc += L.glyphs(c).length; if (acc < nn) cand.push(acc); } }
      if (!cand.length) return -1;
      return cand.reduce((b, c) => (Math.abs(c - nn / 2) < Math.abs(b - nn / 2) ? c : b), cand[0]);
    };
    const geo = (it, key) => {                   // 切れ目の位置と、交点から片側への最大長
      const lay = L.measure(it).lay, nn = lay.length, sz = it.size;
      const lo = g => g[key] - (key === 'x' ? g.w / 2 : sz / 2), hi = g => g[key] + (key === 'x' ? g.w / 2 : sz / 2);
      const hf = splitAt(it.text);
      if (hf <= 0 || hf >= nn) return { hf: -1, first: lo(lay[0]), side: hi(lay[nn - 1]) - lo(lay[0]) };
      const bnd = (hi(lay[hf - 1]) + lo(lay[hf])) / 2;
      return { hf, bnd, side: Math.max(bnd - lo(lay[0]), hi(lay[nn - 1]) - bnd) };
    };
    const itA = { text: A, font: f.font, weight: f.weight, size: 100, x: cx, y: cy, mi: 0 };
    const itB = B ? (lat ? { text: B, font: f.font, weight: f.weight, size: 100, x: cx, y: cy, rot: Math.PI / 2, mi: 1 } : { text: B, font: f.font, weight: f.weight, size: 100, vertical: true, x: cx, y: cy, mi: 1 }) : null;
    const gA = geo(itA, 'x'), gB = itB ? geo(itB, lat ? 'x' : 'y') : null;
    const size = Math.min(S * 0.2, W * 0.46 / (gA.side / 100 + 0.65), gB ? H * 0.46 / (gB.side / 100 + 0.65) : 1e9);
    const gap = size * 1.3;
    itA.size = size; if (itB) itB.size = size;
    const shiftFn = (g, key, before) => {
      const k = key === 'x' ? 'dx' : 'dy', sc2 = size / 100;
      if (g.hf < 0) return () => ({ [k]: before ? -gap / 2 - (g.first + g.side) * sc2 : gap / 2 - g.first * sc2 });
      return i => ({ [k]: (i < g.hf ? -gap / 2 : gap / 2) - g.bnd * sc2 });
    };
    const fA = shiftFn(gA, 'x', true);
    itA.charFns = [i => fA(i)];
    const ge = E.outCubic(clamp(lt / 0.5));
    if (pr.rule !== false) {
      env.line([[cx - W * 0.48 * ge, cy], [cx + W * 0.48 * ge, cy]], sc.accent, Math.max(1, 1.5 * u), 0.45 * io, false);
      env.line([[cx, cy - H * 0.48 * ge], [cx, cy + H * 0.48 * ge]], sc.accent, Math.max(1, 1.5 * u), 0.45 * io, false);
      const ticks = [];
      for (let k = 1; k < 12; k++) { const dd = k * S * 0.05; if (dd > W * 0.48 * ge) break; ticks.push([cx + dd, cy - S * 0.008, cx + dd, cy + S * 0.008], [cx - dd, cy - S * 0.008, cx - dd, cy + S * 0.008]); }
      strokeSegs(env, ticks, sc.accent, Math.max(1, 1.2 * u), 0.4 * io);
    }
    const r = gap * 0.2 * E.outBack(clamp((lt - 0.1) / 0.4), 1.6), rot = (1 - ge) * Math.PI / 2 + Math.PI / 4;
    if (r > 0) env.poly([0, 1, 2, 3].map(k => [cx + Math.cos(rot + k * Math.PI / 2) * r, cy + Math.sin(rot + k * Math.PI / 2) * r]), warm(sc), io, false);
    const bA = L.mainDraw(env, itA);
    let bB = null;
    if (itB) {
      const fB = shiftFn(gB, lat ? 'x' : 'y');
      itB.charFns = [i => fB(i)];
      bB = L.mainDraw(env, itB);
    }
    return L.unionBB(bA, bB);
  },
}, P);

})();
