/* LyricFlow 演出パック: p_decor_treat — 装飾(decor) と 文字加工(treat)
   契約: docs/COMPOSE_PACKS.md  (group: decor+treat)
   decor: HUD/計測・幾何・音反応・粒子・手描き・歌詞由来・和柄・UI部品 の8系統
   treat: 縁取り・影/立体・塗り・マーク・字ごとのリズム の5系統
   すべて時刻と添字の決定論関数(Math.random / Date 不使用)。サイズは W/H/env.u の相対。 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const PK = 'p_decor_treat';
const TAU = Math.PI * 2;
const clamp = L.clamp;

/* ================================================================ 共通 */
const warned = new Set();
const guard = (tag, fn) => function guarded() {
  try { return fn.apply(this, arguments); } catch (e) {
    if (!warned.has(tag)) { warned.add(tag); console.warn('[LFC] ' + PK + ' error in ' + tag + ': ' + (e && e.message)); }
    return undefined;
  }
};
const decor = (key, def) => { def.draw = guard('decor:' + key, def.draw); L.register('decor', key, def, PK); };
const treat = (key, def) => { def.apply = guard('treat:' + key, def.apply); L.register('treat', key, def, PK); };

const mn = env => Math.min(env.W, env.H);
const seedOf = P => (P && P.seed != null ? P.seed : 1);
/* bbox(null 可)を pad(=env.u 単位)だけ広げる */
const BBp = (env, bb, k = 0) => {
  const b = L.centerBB(env, bb), p = env.u * k;
  return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p, w: b.w + p * 2, h: b.h + p * 2, cx: b.cx, cy: b.cy };
};
const hit = (r, b) => !(r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1);
/* 点と矩形の距離(内側は 0) */
const distBB = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/* 背景に対して見えるアクセント色 */
const acc = (env, alt) => L.fitContrast(alt ? env.sc.accent2 : env.sc.accent, env.sc.bg, 2.3);
const tone = (env, P) => (P && P.accent ? acc(env) : env.sc.fg);
/* 画面の隅/辺の中央で、歌詞と重ならない w×h の場所 */
const freeSpot = (env, bb, w, h, pref = 0) => {
  const { W, H } = env, m = mn(env) * 0.045;
  const b = BBp(env, bb, 14);
  const C = [[m, m], [W - m - w, m], [W - m - w, H - m - h], [m, H - m - h]];
  const extra = [[(W - w) / 2, m], [(W - w) / 2, H - m - h], [m, (H - h) / 2], [W - m - w, (H - h) / 2]];
  for (let k = 0; k < 8; k++) {
    const idx = k < 4 ? ((pref | 0) + k) % 4 : k - 4;
    const c = k < 4 ? C[idx] : extra[idx];
    if (c[0] < 0 || c[1] < 0) continue;
    const r = { x0: c[0], y0: c[1], x1: c[0] + w, y1: c[1] + h };
    if (!hit(r, b)) return { x: c[0], y: c[1], w, h, cx: c[0] + w / 2, cy: c[1] + h / 2, corner: k < 4 ? idx : -1 };
  }
  return null;
};
/* 歌詞を避けた散布点 [x,y,i] */
const scatter = (env, bb, n, seed, rad, near) => {
  const { W, H } = env, M = mn(env), m = M * 0.05;
  const b = BBp(env, bb, 12), out = [];
  for (let t = 0; out.length < n && t < n * 10; t++) {
    let x, y;
    if (near) {             // 歌詞の周り(輪の上)に置く
      const a = L.r(seed, 'na', t) * TAU, d = M * (0.04 + 0.1 * L.r(seed, 'nd', t));
      const hw = b.w / 2 + rad, hh = b.h / 2 + rad;
      const k = Math.min(hw / (Math.abs(Math.cos(a)) + 1e-6), hh / (Math.abs(Math.sin(a)) + 1e-6));
      x = b.cx + Math.cos(a) * (k + d); y = b.cy + Math.sin(a) * (k + d);
      if (x < m || x > W - m || y < m || y > H - m) continue;
    } else {
      x = m + L.r(seed, 'sx', t) * (W - m * 2); y = m + L.r(seed, 'sy', t) * (H - m * 2);
    }
    if (x > b.x0 - rad && x < b.x1 + rad && y > b.y0 - rad && y < b.y1 + rad) continue;
    let close = false;
    for (const p of out) if (Math.hypot(p[0] - x, p[1] - y) < rad * 2.4) { close = true; break; }
    if (close) continue;
    out.push([x, y, out.length]);
  }
  return out;
};
/* 多数の線分を1パスで(main のみ) */
const segs = (env, list, c, lw, a = 1, cap = 'butt') => {
  if (env.pass !== 'main' || a <= 0.002 || !list.length) return;
  const ctx = env.ctx;
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = cap;
  ctx.beginPath();
  for (const s of list) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  ctx.stroke(); ctx.restore();
};
/* 多数の円を1パスで(main のみ) */
const discs = (env, list, c, a = 1) => {
  if (env.pass !== 'main' || a <= 0.002 || !list.length) return;
  const ctx = env.ctx;
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = c; ctx.beginPath();
  for (const d of list) { if (d[2] <= 0.05) continue; ctx.moveTo(d[0] + d[2], d[1]); ctx.arc(d[0], d[1], d[2], 0, TAU); }
  ctx.fill(); ctx.restore();
};
/* 副テキスト(ゴースト無し)。anchor 'l'|'c'|'r' */
const label = (env, s, x, y, size, o = {}) => {
  if (env.pass !== 'main' || size < 1) return null;
  const it = {
    text: String(s), font: o.font || L.roleFont(env, o.role || 'mono'), weight: o.weight || 700, size,
    track: o.track == null ? 0.06 : o.track, color: o.color || env.sc.sub, alpha: o.alpha == null ? 1 : o.alpha,
    ghost: false, x, y, rot: o.rot || 0, vertical: !!o.vertical,
  };
  if (o.anchor === 'l' || o.anchor === 'r') { const m = L.measure(it); it._m = m; it.x = o.anchor === 'l' ? x + m.w / 2 : x - m.w / 2; }
  return env.text(it);
};
const textW = (s, font, size, track = 0.06) => L.measure({ text: s, font, size, weight: 700, track }).w;
/* 回転+平行移動した多角形 */
const xform = (pts, cx, cy, rot, s = 1) => {
  const c = Math.cos(rot), n = Math.sin(rot);
  return pts.map(([x, y]) => [cx + (x * c - y * n) * s, cy + (x * n + y * c) * s]);
};
/* 手描きのゆらぎ */
const wob = (seed, i, amp) => (L.noise1(i * 0.37, seed) - 0.5) * 2 * amp;
const firstGlyph = s => L.glyphs(s).find(c => !L.isSpace(c) && !L.isPunct(c)) || L.glyphs(s).find(c => !L.isSpace(c)) || '';

/* ================================================================ decor: HUD / 計測 (8) */
decor('cropMarks', {
  name: 'トンボ', tags: ['editorial', 'graphic', 'calm'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.45); if (e <= 0.001) return;
    const M = mn(env), b = BBp(env, bb, 26), lw = Math.max(1, env.u * 1.6);
    const c = tone(env, P);
    const gap = M * 0.012, len = M * 0.055 * E.outCubic(e), off = M * 0.014;
    const list = [];
    for (const [x, y, sx, sy] of [[b.x0, b.y0, -1, -1], [b.x1, b.y0, 1, -1], [b.x1, b.y1, 1, 1], [b.x0, b.y1, -1, 1]]) {
      for (const o of [0, off]) {           // 仕上がり線 + 裁ち落とし線(二重トンボ)
        list.push([x + sx * gap, y + sy * o, x + sx * (gap + len), y + sy * o]);
        list.push([x + sx * o, y + sy * gap, x + sx * o, y + sy * (gap + len)]);
      }
    }
    segs(env, list, c, lw, 0.85 * e);
    const r = M * 0.013 * E.outBack(clamp(e * 1.25 - 0.25));
    if (r <= 0.5) return;
    const vs = Math.min(b.y0, env.H - b.y1) > M * 0.07;
    const marks = vs ? [[b.cx, b.y0 - M * 0.04], [b.cx, b.y1 + M * 0.04]] : [[b.x0 - M * 0.04, b.cy], [b.x1 + M * 0.04, b.cy]];
    for (const [x, y] of marks) {
      env.circle(x, y, r, null, c, lw, 0.85 * e);
      segs(env, [[x - r * 1.9, y, x + r * 1.9, y], [x, y - r * 1.9, x, y + r * 1.9]], c, lw, 0.85 * e);
    }
  },
});

decor('cornerBrackets', {
  name: '角枠', tags: ['graphic', 'pop', 'cyber'], w: 1.1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb);
    const beat = env.beat ? Math.exp(-env.beat.since * 7) : 0;
    const k = E.outBack(clamp(env.lt / 0.45));
    const pad = M * (0.028 + 0.06 * (1 - k) + 0.007 * beat);
    const x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
    const len = Math.min(b.w, b.h) * 0.25 + M * 0.025;
    const lw = Math.max(1.5, env.u * 5.5);
    const c = tone(env, P);
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
      env.line([[x + sx * len, y], [x, y], [x, y + sy * len]], c, lw, e, true);
    }
  },
});

decor('rulerEdge', {
  name: '端の定規', tags: ['editorial', 'graphic', 'cyber'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.55); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const major = M * 0.028, room = major + M * 0.06;
    // 横(下/上) か 縦(左/右) か。空いている辺を使う
    const opts = [
      { hz: true, far: false, sp: H - b.y1 }, { hz: true, far: true, sp: b.y0 },
      { hz: false, far: false, sp: b.x0 }, { hz: false, far: true, sp: W - b.x1 },
    ];
    const order = P.low ? [0, 1, 2, 3] : [1, 0, 3, 2];
    let o = null;
    for (const i of order) if (opts[i].sp > room) { o = opts[i]; break; }
    if (!o) return;
    const len = o.hz ? W : H, edge = M * 0.03;
    const base = o.hz ? (o.far ? edge : H - edge) : (o.far ? W - edge : edge);
    const dir = o.hz ? (o.far ? 1 : -1) : (o.far ? -1 : 1);       // 目盛りの伸びる向き
    const P2 = (a, c) => (o.hz ? [a, c] : [c, a]);
    const tick = M * 0.0125, speed = M * 0.02;
    const shift = env.lt * speed, off = shift % tick, idx0 = Math.floor(shift / tick);
    const list = [], labels = [];
    const n = Math.min(400, Math.ceil(len / tick) + 2), lim = len * E.outCubic(e);
    for (let i = 0; i < n; i++) {
      const a = i * tick - off; if (a < 0 || a > lim) continue;
      const id = i + idx0, tl = id % 10 === 0 ? major : id % 5 === 0 ? M * 0.018 : M * 0.009;
      const p0 = P2(a, base), p1 = P2(a, base + dir * tl);
      list.push([p0[0], p0[1], p1[0], p1[1]]);
      if (id % 10 === 0) labels.push([a, id]);
    }
    const lw = Math.max(1, env.u * 1.3);
    const c = env.sc.fg;
    segs(env, list, c, lw, 0.7 * e);
    const bl0 = P2(0, base), bl1 = P2(lim, base);
    segs(env, [[bl0[0], bl0[1], bl1[0], bl1[1]]], c, lw, 0.7 * e);
    const fs = M * 0.016;
    for (const [a, id] of labels) {
      const p = P2(a, base + dir * (major + fs * 0.9));
      label(env, String(id), p[0], p[1], fs, { color: env.sc.sub, alpha: e, rot: o.hz ? 0 : -Math.PI / 2 });
    }
    // 歌詞の範囲をアクセントで
    const ac = acc(env);
    const s0 = o.hz ? b.x0 : b.y0, s1 = o.hz ? b.x1 : b.y1;
    const q = E.outCubic(clamp((env.lt - 0.2) / 0.5)) * (1 - E.inCubic(env.pOut));
    if (q > 0.01) {
      const m0 = (s0 + s1) / 2, h0 = (s1 - s0) / 2 * q;
      const a0 = P2(m0 - h0, base + dir * M * 0.004), a1 = P2(m0 + h0, base + dir * M * 0.004);
      segs(env, [[a0[0], a0[1], a1[0], a1[1]]], ac, Math.max(2, env.u * 4), q);
      for (const s of [m0 - h0, m0 + h0]) {
        const t0 = P2(s, base + dir * (major + M * 0.004)), tA = P2(s - M * 0.008, base + dir * (major + M * 0.018)), tB = P2(s + M * 0.008, base + dir * (major + M * 0.018));
        env.poly([t0, tA, tB], ac, q);
      }
    }
  },
});

decor('crosshair', {
  name: '照準線', tags: ['graphic', 'cyber', 'editorial'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.45); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = BBp(env, bb, 22);
    const k = E.outCubic(e), c = env.sc.fg, lw = Math.max(1, env.u * 1.2);
    const arms = [
      [0, b.cy, b.x0, b.cy], [W, b.cy, b.x1, b.cy], [b.cx, 0, b.cx, b.y0], [b.cx, H, b.cx, b.y1],
    ];
    const list = [], ticks = [], tk = M * 0.012, ac = tone(env, P);
    for (const [xa, ya, xb, yb] of arms) {
      const L0 = Math.hypot(xb - xa, yb - ya); if (L0 < M * 0.02) continue;
      const ux = (xb - xa) / L0, uy = (yb - ya) / L0;
      list.push([xa, ya, xa + ux * L0 * k, ya + uy * L0 * k]);
      for (let i = 1; i <= 6; i++) {                     // 切れ目の手前に目盛り
        const d = L0 - i * tk; if (d < 0 || d > L0 * k) continue;
        const px = xa + ux * d, py = ya + uy * d, tl = (i % 3 === 0 ? M * 0.013 : M * 0.006);
        ticks.push([px - uy * tl, py + ux * tl, px + uy * tl, py - ux * tl]);
      }
      if (k > 0.97) env.rect(xb - ux * M * 0.004 - M * 0.004, yb - uy * M * 0.004 - M * 0.004, M * 0.008, M * 0.008, ac, e, false);
    }
    segs(env, list, c, lw, 0.45 * e);
    segs(env, ticks, c, lw, 0.75 * e);
  },
});

decor('coordRead', {
  name: '座標表示', tags: ['cyber', 'editorial', 'glitch'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.35); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = BBp(env, bb, 20);
    const cn = (P.corner | 0) % 4;
    const px = cn === 1 || cn === 2 ? b.x1 : b.x0, py = cn >= 2 ? b.y1 : b.y0;
    let sx = cn === 1 || cn === 2 ? 1 : -1, sy = cn >= 2 ? 1 : -1;
    const fs = M * 0.021, lh = fs * 1.35, bw = fs * 6.5, bh = lh * 3;
    // 外側に置けなければ片方だけ反転(歌詞に重ねない)
    const fitsX = s => (s > 0 ? px + M * 0.03 + bw < W - M * 0.02 : px - M * 0.03 - bw > M * 0.02);
    const fitsY = s => (s > 0 ? py + M * 0.02 + bh < H - M * 0.02 : py - M * 0.02 - bh > M * 0.02);
    if (!fitsY(sy)) { if (fitsY(-sy) && fitsX(sx)) sy = -sy; else if (!fitsX(sx) && fitsX(-sx)) sx = -sx; else return; }
    else if (!fitsX(sx)) { if (fitsX(-sx)) sx = -sx; else return; }
    const c = env.sc.fg, ac = tone(env, P), lw = Math.max(1, env.u * 1.4);
    const r = M * 0.014 * E.outBack(e);
    segs(env, [[px - r, py, px + r, py], [px, py - r, px, py + r]], ac, lw * 1.4, e);
    env.circle(px, py, r * 0.55, null, ac, lw, e);
    const tx = px + sx * M * 0.03, ty0 = py + sy * (M * 0.02 + lh * 0.5);
    segs(env, [[px + sx * r * 1.2, py + sy * r * 1.2, tx - sx * fs * 0.2, ty0]], c, lw, 0.5 * e);
    const scr = env.lt < 0.55;
    const num = (v, j) => {
      const s = (v / env.u).toFixed(1).padStart(6, '0');
      return scr ? s.replace(/\d/g, (d, q) => String(L.h(env.step, j, q, seedOf(P)) % 10)) : s;
    };
    const rows = ['X ' + num(px, 0), 'Y ' + num(py, 1), 'W ' + num(b.w, 2)];
    rows.forEach((s, j) => label(env, s, tx, ty0 + sy * lh * j, fs, { anchor: sx > 0 ? 'l' : 'r', color: j === 2 ? env.sc.sub : c, alpha: e * (j === 2 ? 0.7 : 0.9) }));
  },
});

decor('dimLines', {
  name: '寸法線', tags: ['editorial', 'graphic', 'calm'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const off = M * 0.05, k = E.outCubic(e), c = P.accent ? acc(env) : env.sc.fg;
    const lw = Math.max(1, env.u * 1.3), ah = M * 0.012, fs = M * 0.017, font = L.roleFont(env, 'mono');
    const arrow = (x, y, dx, dy) => [[x + dx * ah - dy * ah * 0.45, y + dy * ah + dx * ah * 0.45], [x, y], [x + dx * ah + dy * ah * 0.45, y + dy * ah - dx * ah * 0.45]];
    // 幅(上 or 下)
    const top = b.y0 > off + M * 0.04, bot = H - b.y1 > off + M * 0.04;
    if (top || bot) {
      const s = top ? -1 : 1, y = top ? b.y0 - off : b.y1 + off, ye = top ? b.y0 : b.y1;
      segs(env, [[b.x0, ye + s * M * 0.012, b.x0, y + s * M * 0.012], [b.x1, ye + s * M * 0.012, b.x1, y + s * M * 0.012]], c, lw, 0.6 * e);
      const txt = String(Math.round(b.w / env.u)), tw = textW(txt, font, fs) + fs * 0.8;
      const xl = L.lerp(b.cx, b.x0, k), xr = L.lerp(b.cx, b.x1, k);
      if (xr - xl > tw) segs(env, [[xl, y, b.cx - tw / 2, y], [b.cx + tw / 2, y, xr, y]], c, lw, 0.85 * e);
      env.line(arrow(xl, y, 1, 0), c, lw, 0.85 * e); env.line(arrow(xr, y, -1, 0), c, lw, 0.85 * e);
      label(env, txt, b.cx, y, fs, { color: c, alpha: e });
    }
    // 高さ(右 or 左)
    const rt = W - b.x1 > off + M * 0.04, lf = b.x0 > off + M * 0.04;
    if ((rt || lf) && b.h > M * 0.06) {
      const s = rt ? 1 : -1, x = rt ? b.x1 + off : b.x0 - off, xe = rt ? b.x1 : b.x0;
      segs(env, [[xe + s * M * 0.012, b.y0, x + s * M * 0.012, b.y0], [xe + s * M * 0.012, b.y1, x + s * M * 0.012, b.y1]], c, lw, 0.6 * e);
      const txt = String(Math.round(b.h / env.u)), tw = textW(txt, font, fs) + fs * 0.8;
      const yt = L.lerp(b.cy, b.y0, k), yb = L.lerp(b.cy, b.y1, k);
      if (yb - yt > tw) segs(env, [[x, yt, x, b.cy - tw / 2], [x, b.cy + tw / 2, x, yb]], c, lw, 0.85 * e);
      env.line(arrow(x, yt, 0, 1), c, lw, 0.85 * e); env.line(arrow(x, yb, 0, -1), c, lw, 0.85 * e);
      label(env, txt, x, b.cy, fs, { color: c, alpha: e, rot: -Math.PI / 2 });
    }
  },
});

decor('frameCount', {
  name: 'フレーム番号', tags: ['cyber', 'editorial', 'glitch'], w: 0.8, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const M = mn(env), w = M * 0.24, h = M * 0.072, sq = h * 0.2;
    const s = freeSpot(env, bb, w, h + sq * 2.6, P.corner); if (!s) return;
    const y = s.y + sq * 1.4, k = E.outCubic(e);
    const c = env.sc.fg, lw = Math.max(1, env.u * 1.4);
    const ww = w * k;
    env.rrect(s.x, y, ww, h, h * 0.12, null, 0.8 * e, false, c, lw);
    const nsq = Math.floor(7 * k);
    for (let i = 0; i < nsq; i++) env.rrect(s.x + w * (i + 0.3) / 7, s.y, sq * 1.2, sq, sq * 0.25, c, 0.45 * e, false);
    if (k < 0.6) return;
    const q = (k - 0.6) / 0.4;
    label(env, 'F', s.x + h * 0.32, y + h * 0.52, h * 0.34, { color: env.sc.sub, alpha: q });
    label(env, String(Math.max(0, env.step) % 1000000).padStart(6, '0'), s.x + h * 0.65, y + h * 0.54, h * 0.52, { anchor: 'l', color: c, alpha: q, track: 0.08 });
    if (env.step % 12 < 6) env.circle(s.x + w - h * 0.28, y + h * 0.5, h * 0.09, acc(env), null, 1, q);
    label(env, '24FPS', s.x + w, y + h + sq * 0.9, sq * 1.1, { anchor: 'r', color: env.sc.sub, alpha: q * 0.8 });
  },
});

decor('focusBox', {
  name: '合焦枠', tags: ['cyber', 'graphic', 'emotional'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.25); if (e <= 0.001) return;
    const M = mn(env), b = BBp(env, bb, 18), lt = env.lt;
    const sn = E.outCubic(clamp(lt / 0.42));
    const bump = lt > 0.42 && lt < 0.62 ? Math.sin((lt - 0.42) / 0.2 * Math.PI) * 0.035 : 0;
    const s = 1 + 0.55 * (1 - sn) + bump;
    const hw = b.w / 2 * s + M * 0.01 * (s - 1) * 4, hh = b.h / 2 * s + M * 0.01 * (s - 1) * 4;
    const x0 = b.cx - hw, x1 = b.cx + hw, y0 = b.cy - hh, y1 = b.cy + hh;
    const locked = lt > 0.42;
    const c = locked ? acc(env) : env.sc.fg;
    let a = e;
    if (locked && lt < 0.8 && env.step % 4 < 2) a *= 0.35;
    const lw = Math.max(1, env.u * 1.3);
    env.rrect(x0, y0, x1 - x0, y1 - y0, 0, null, a * 0.55, false, c, lw);
    const len = Math.min(hw, hh) * 0.35, lw2 = Math.max(1.5, env.u * 3.5);
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
      env.line([[x + sx * len, y], [x, y], [x, y + sy * len]], c, lw2, a);
    }
    const tkl = M * 0.012;
    segs(env, [[b.cx, y0 - tkl, b.cx, y0 + tkl], [b.cx, y1 - tkl, b.cx, y1 + tkl], [x0 - tkl, b.cy, x0 + tkl, b.cy], [x1 - tkl, b.cy, x1 + tkl, b.cy]], c, lw, a * 0.8);
    if (locked && y0 > M * 0.05) label(env, 'AF-LOCK', x0, y0 - M * 0.022, M * 0.016, { anchor: 'l', color: c, alpha: e * 0.9 });
  },
});

/* ================================================================ decor: 幾何 (8) */
decor('rings', {
  name: '同心輪', tags: ['graphic', 'emotional', 'calm'], w: 1, layer: 'front',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb), ctx = env.ctx;
    const R0 = Math.hypot(b.w, b.h) / 2 + M * 0.04, n = clamp(P.n || 2, 1, 3);
    const c = env.sc.fg, ac = acc(env, !P.accent);
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const r = R0 + k * M * 0.038;
      const q = E.outCubic(clamp(e * 1.4 - k * 0.2));
      if (q <= 0) continue;
      const rot = (L.r(seedOf(P), k) * 360 + env.lt * (k % 2 ? -14 : 10)) * L.DEG;
      const span = (k === 1 ? 340 : 285) * L.DEG * q;
      ctx.globalAlpha = 0.5 * e;
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, env.u * (k === 0 ? 1.8 : 1.2));
      ctx.setLineDash(k === 1 ? [M * 0.006, M * 0.012] : []);
      ctx.beginPath(); ctx.arc(b.cx, b.cy, r, rot, rot + span); ctx.stroke();
      ctx.setLineDash([]);
      const ha = rot + span;
      ctx.globalAlpha = e; ctx.fillStyle = ac;
      ctx.beginPath(); ctx.arc(b.cx + Math.cos(ha) * r, b.cy + Math.sin(ha) * r, M * 0.006, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
});

decor('orbitDots', {
  name: '周回点', tags: ['calm', 'emotional', 'graphic'], w: 1, layer: 'front',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb), ctx = env.ctx;
    const rx = b.w / 2 * 1.5 + M * 0.035, ry = b.h / 2 * 1.5 + M * 0.035, tilt = (P.r == null ? 0 : P.r - 0.5) * 0.1;
    ctx.save();
    ctx.translate(b.cx, b.cy); ctx.rotate(tilt);
    ctx.globalAlpha = 0.28 * e; ctx.strokeStyle = env.sc.fg; ctx.lineWidth = Math.max(1, env.u * 1.1);
    ctx.setLineDash([M * 0.004, M * 0.01]);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    const nd = 4 + (P.n || 2) * 2, dir = P.right ? 1 : -1, ac = acc(env);
    const vis = nd * E.outCubic(e);
    for (let j = 0; j < nd; j++) {
      if (j >= vis) break;
      const th0 = env.lt * 0.8 * dir + j * TAU / nd;
      for (let q = 3; q >= 0; q--) {
        const th = th0 - dir * q * 0.07;
        const behind = Math.sin(th) < 0;
        const x = Math.cos(th) * rx, y = Math.sin(th) * ry;
        ctx.globalAlpha = e * (behind ? 0.35 : 0.95) * (1 - q * 0.24);
        ctx.fillStyle = j % 3 === 0 ? ac : env.sc.fg;
        ctx.beginPath(); ctx.arc(x, y, M * 0.0065 * (behind ? 0.7 : 1.1) * (1 - q * 0.18), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  },
});

decor('triangles', {
  name: '浮かぶ三角', tags: ['graphic', 'pop'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const M = mn(env), sd = seedOf(P);
    const pts = scatter(env, bb, 2 + (P.n || 1), sd, M * 0.06);
    const ac = acc(env), c = env.sc.fg, lw = Math.max(1, env.u * 2.2);
    for (const [x, y, i] of pts) {
      const pop = E.outBack(clamp((env.lt - i * 0.09) / 0.4)) * (1 - E.inCubic(env.pOut));
      if (pop <= 0.01) continue;
      const sz = M * (0.028 + 0.03 * L.r(sd, 'ts', i)) * pop;
      const rot = L.r(sd, 'tr', i) * TAU + env.lt * 0.5 * (i % 2 ? -1 : 1);
      const tri = xform([[0, -1], [0.866, 0.5], [-0.866, 0.5]], x, y, rot, sz);
      if (i === 0) env.poly(tri, ac, 0.9 * e);
      else env.line(tri.concat([tri[0]]), i % 2 ? c : ac, lw, 0.8 * e);
    }
  },
});

decor('slashes', {
  name: 'スラッシュ', tags: ['graphic', 'pop', 'glitch'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.45); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const hL = Math.min(Math.max(b.h * 0.8, M * 0.05), M * 0.1), sp = M * 0.02, lw = Math.max(1.5, env.u * 4);
    const nL = 4, gw = sp * (nL - 1) + hL * 0.5;
    const side = Math.min(b.x0, W - b.x1) > gw + M * 0.08;
    const groups = [];
    if (side) {
      groups.push([b.x0 - M * 0.045 - gw, b.cy]);
      if ((P.n || 1) > 1) groups.push([b.x1 + M * 0.045, b.cy]);
    } else {
      if (b.y0 > hL + M * 0.08) groups.push([b.cx - gw / 2, b.y0 - M * 0.035 - hL / 2]);
      if (H - b.y1 > hL + M * 0.08 && (groups.length === 0 || (P.n || 1) > 1)) groups.push([b.cx - gw / 2, b.y1 + M * 0.035 + hL / 2]);
    }
    const c = tone(env, P);
    groups.forEach(([gx, gy], gi) => {
      for (let k = 0; k < nL; k++) {
        const q = clamp(e * 1.7 - k * 0.18 - gi * 0.1);
        if (q <= 0) continue;
        const x = gx + k * sp;
        env.polyPartial([[x, gy + hL / 2], [x + hL * 0.5, gy - hL / 2]], E.outCubic(q), c, lw, 1, false);
      }
    });
  },
});

decor('stripeBlock', {
  name: '斜線ブロック', tags: ['graphic', 'pop', 'cyber'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.45); if (e <= 0.001) return;
    const M = mn(env), vert = env.portrait && (P.v || 0) % 2 === 1;
    const w = vert ? M * 0.07 : M * 0.28, h = vert ? M * 0.28 : M * 0.07;
    const s = freeSpot(env, bb, w, h, P.corner); if (!s) return;
    const ctx = env.ctx, k = E.outCubic(e);
    const ac = tone(env, { accent: !P.accent }), sp = M * 0.022;
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y, vert ? w : w * k, vert ? h * k : h); ctx.clip();
    ctx.globalAlpha = 0.85 * e; ctx.fillStyle = ac;
    const off = (env.lt * M * 0.04) % (sp * 2);
    ctx.beginPath();
    const n = Math.min(80, Math.ceil((w + h) / sp) + 3);
    for (let i = -2; i < n; i += 2) {
      const x = s.x + i * sp + off - h;
      ctx.moveTo(x, s.y + h); ctx.lineTo(x + sp, s.y + h); ctx.lineTo(x + sp + h, s.y); ctx.lineTo(x + h, s.y); ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
    env.rrect(s.x, s.y, w, h, 0, null, 0.7 * e, false, env.sc.fg, Math.max(1, env.u * 1.5));
  },
});

decor('dotGrid', {
  name: 'ドット格子', tags: ['graphic', 'calm', 'editorial', 'cyber'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), sp = M / 13;
    const cols = Math.min(40, Math.ceil(W / sp) + 1), rows = Math.min(40, Math.ceil(H / sp) + 1);
    const ox = (W - (cols - 1) * sp) / 2, oy = (H - (rows - 1) * sp) / 2;
    const R = Math.hypot(W, H) * 0.55 * E.outCubic(e), list = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = ox + i * sp, y = oy + j * sp;
      const d = Math.hypot(x - W / 2, y - H / 2); if (d > R) continue;
      const wv = 0.5 + 0.5 * Math.sin((i + j) * 0.55 - env.lt * 2.4 + (P.right ? 0 : i * 0.4));
      list.push([x, y, M * 0.0022 * (0.6 + 1.3 * wv)]);
    }
    discs(env, list, env.sc.fg, (env.sc.dark ? 0.22 : 0.26) * e);
  },
});

decor('plusMarks', {
  name: 'プラス記号', tags: ['graphic', 'editorial', 'pop'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const M = mn(env), sd = seedOf(P);
    const pts = scatter(env, bb, 5 + (P.n || 1) * 2, sd, M * 0.035);
    const ac = acc(env), c = env.sc.fg, lw = Math.max(1, env.u * 2.4);
    const A = [], B = [];
    for (const [x, y, i] of pts) {
      const pop = E.outBack(clamp((env.lt - i * 0.05) / 0.35)) * (1 - E.inCubic(env.pOut));
      if (pop <= 0.01) continue;
      const sz = M * (0.01 + 0.012 * L.r(sd, 'ps', i)) * pop;
      const rot = (1 - clamp((env.lt - i * 0.05) / 0.35)) * Math.PI / 2;
      const cs = Math.cos(rot) * sz, sn = Math.sin(rot) * sz;
      (i % 3 === 0 ? A : B).push([x - cs, y - sn, x + cs, y + sn], [x + sn, y - cs, x - sn, y + cs]);
    }
    segs(env, A, ac, lw, e, 'round'); segs(env, B, c, lw, 0.75 * e, 'round');
  },
});

decor('chevrons', {
  name: '矢印', tags: ['pop', 'graphic', 'cyber'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.35); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const sz = M * 0.038, sp = sz * 1.1, need = sp * 3 + M * 0.08;
    const lw = Math.max(1.5, env.u * 4), c = tone(env, P);
    const hz = Math.min(b.x0, W - b.x1) > need;
    const vt = Math.min(b.y0, H - b.y1) > need;
    if (!hz && !vt) return;
    const lit = Math.floor(env.lt * 6) % 4;
    const groups = hz ? [[b.x0 - M * 0.04, b.cy, 1, 0], [b.x1 + M * 0.04, b.cy, -1, 0]] : [[b.cx, b.y0 - M * 0.04, 0, 1], [b.cx, b.y1 + M * 0.04, 0, -1]];
    for (const [ax, ay, dx, dy] of groups) {
      for (let k = 0; k < 3; k++) {
        const q = clamp(e * 1.6 - k * 0.2); if (q <= 0) continue;
        const d = sp * (k + 0.5) + (1 - E.outCubic(q)) * M * 0.03;
        const tx = ax - dx * d, ty = ay - dy * d;     // 先端(歌詞側)
        const px = -dy, py = dx;
        const pts = [[tx - dx * sz * 0.6 + px * sz * 0.6, ty - dy * sz * 0.6 + py * sz * 0.6], [tx, ty], [tx - dx * sz * 0.6 - px * sz * 0.6, ty - dy * sz * 0.6 - py * sz * 0.6]];
        env.line(pts, c, lw, q * (lit === 2 - k || lit === 3 ? 1 : 0.35));
      }
    }
  },
});

/* ================================================================ decor: 音反応 (4) */
decor('waveLine', {
  name: '波形', tags: ['emotional', 'calm', 'cyber'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const spB = H - b.y1, spT = b.y0, below = P.low ? spB >= M * 0.08 || spB >= spT : spT < M * 0.08 && spB >= spT;
    const band = below ? spB : spT;
    if (band < M * 0.07) return;
    const amp = Math.min(band * 0.3, M * 0.055) * (0.3 + 0.9 * clamp(env.energy));
    const y0 = below ? b.y1 + Math.min(band * 0.5, M * 0.1) : b.y0 - Math.min(band * 0.5, M * 0.1);
    const width = Math.min(W * 0.84, Math.max(b.w * 1.1, W * 0.5)) * E.outCubic(e);
    const N = 72, sd = seedOf(P), a = [], m = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), x = b.cx - width / 2 + width * u;
      const env1 = Math.sin(Math.PI * u);
      const v = (L.noise1(i * 0.45 + env.t * 7, sd) - 0.5) * 1.6 + Math.sin(i * 0.7 + env.t * 9) * 0.3;
      a.push([x, y0 + v * amp * env1]); m.push([x, y0 - v * amp * env1 * 0.55]);
    }
    env.line(m, env.sc.fg, Math.max(1, env.u * 1.2), 0.3 * e);
    env.line(a, tone(env, { accent: P.accent !== false }), Math.max(1.2, env.u * 2.4), 0.9 * e);
  },
});

decor('eqBars', {
  name: 'イコライザ', tags: ['pop', 'cyber', 'graphic'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const bottom = H - b.y1 >= b.y0, space = bottom ? H - b.y1 : b.y0;
    const maxH = Math.min(space - M * 0.07, M * 0.16);
    if (maxH < M * 0.03) return;
    const n = Math.min(30, 16 + (P.n || 1) * 4), span = Math.min(W * 0.62, M * 1.1), bw = span / n * 0.62;
    const base = bottom ? H - M * 0.045 : M * 0.045, dir = bottom ? -1 : 1;
    const beat = env.beat ? Math.exp(-env.beat.since * 9) * 0.25 : 0, sd = seedOf(P);
    const c = env.sc.fg, ac = acc(env);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = W / 2 - span / 2 + span * u - bw / 2;
      const env1 = 0.55 + 0.45 * Math.sin(Math.PI * u);
      const v = clamp(0.08 + (clamp(env.energy) * 0.85 + beat) * (0.3 + 0.7 * L.noise1(i * 0.8 + env.t * 6, sd)) * env1);
      const h = maxH * v * E.outCubic(clamp(e * 1.4 - u * 0.4));
      if (h < 0.5) continue;
      env.rect(x, bottom ? base - h : base, bw, h, c, 0.55 * e, false);
      env.rect(x, base + dir * (h + M * 0.006) - (bottom ? M * 0.004 : 0), bw, M * 0.004, ac, e, false);
    }
  },
});

decor('beatRing', {
  name: '拍の輪', tags: ['pop', 'emotional', 'calm'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const ph = env.beat && env.beat.len > 0 ? env.beat.since / env.beat.len : (env.t * 2) % 1;
    const R0 = Math.max(b.w, b.h) * 0.35, Rm = Math.hypot(W, H) * 0.55;
    const c = tone(env, { accent: P.accent !== false });
    for (let k = 0; k < 3; k++) {
      const p = (ph + k) / 3;
      const r = R0 + (Rm - R0) * E.outQuad(p);
      env.circle(b.cx, b.cy, r, null, c, Math.max(1, env.u * (3 * (1 - p) + 0.8)), (1 - p) * 0.28 * e);
    }
    if (ph < 0.25) env.circle(b.cx, b.cy, R0 * (1 + ph), c, null, 1, (0.25 - ph) * 0.18 * e);
  },
});

decor('levelMeter', {
  name: 'レベルメーター', tags: ['cyber', 'pop', 'glitch'], w: 0.8, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const M = mn(env), w = M * 0.3, h = M * 0.075;
    const s = freeSpot(env, bb, w, h, (P.corner | 0) + 2); if (!s) return;
    const seg = 16, lab = h * 0.5, sw = (w - lab) / seg, sd = seedOf(P);
    const c = env.sc.fg, a1 = acc(env), a2 = acc(env, true);
    const q = E.outCubic(e);
    ['L', 'R'].forEach((ch, ci) => {
      const y = s.y + h * (ci ? 0.56 : 0.08), bh = h * 0.34;
      label(env, ch, s.x + lab * 0.35, y + bh / 2, bh * 0.95, { color: env.sc.sub, alpha: e });
      const lv = clamp(0.12 + clamp(env.energy) * 0.8 * (0.7 + 0.3 * L.noise1(env.t * 9 + ci * 17, sd)));
      const lit = Math.floor(seg * lv * q);
      const pk = Math.min(seg - 1, Math.max(lit, Math.floor(seg * clamp(env.energy * 0.9 + 0.12 + 0.12 * L.noise1(env.t * 1.3 + ci * 5, sd)))));
      for (let i = 0; i < seg; i++) {
        const col = i < 11 ? c : i < 14 ? a1 : a2;
        const on = i < lit || (i === pk && q > 0.9);
        env.rect(s.x + lab + i * sw, y, sw * 0.78, bh, on ? col : c, on ? 0.9 * e : 0.12 * e, false);
      }
    });
  },
});

/* ================================================================ decor: 粒子・空気 (6) */
decor('sparks', {
  name: '火花', tags: ['pop', 'emotional', 'graphic'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.3); if (e <= 0.001) return;
    const M = mn(env), b = BBp(env, bb, 12), sd = seedOf(P);
    const N = 14, A = [], B = [];
    for (let i = 0; i < N; i++) {
      const life = 0.8 + 0.5 * L.r(sd, 'l', i);
      const age = ((env.lt + L.r(sd, 'p', i) * life) % life) / life;
      const ang = L.r(sd, 'a', i) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const k = Math.min((b.w / 2) / (Math.abs(ca) + 1e-6), (b.h / 2) / (Math.abs(sa) + 1e-6));
      const d = k + M * 0.015 + M * (0.05 + 0.06 * L.r(sd, 'd', i)) * E.outCubic(age);
      const x = b.cx + ca * d, y = b.cy + sa * d;
      const sz = M * 0.018 * (1 - age) * (0.6 + 0.6 * L.r(sd, 's', i));
      if (sz < 0.3) continue;
      const tgt = i % 3 === 0 ? A : B;
      tgt.push([x - sz, y, x + sz, y], [x, y - sz, x, y + sz]);
      const s2 = sz * 0.45;
      tgt.push([x - s2, y - s2, x + s2, y + s2], [x - s2, y + s2, x + s2, y - s2]);
    }
    segs(env, A, acc(env), Math.max(1, env.u * 2), 0.95 * e, 'round');
    segs(env, B, env.sc.fg, Math.max(1, env.u * 1.6), 0.8 * e, 'round');
  },
});

decor('confetti', {
  name: '紙吹雪', tags: ['pop', 'emotional'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = BBp(env, bb, 10), sd = seedOf(P);
    const cols = [acc(env), acc(env, true), env.sc.fg];
    const N = Math.min(30, 18 + (P.n || 1) * 4), ctx = env.ctx;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const r = k => L.r(sd, 'c', i, k);
      const vy = H * (0.1 + 0.1 * r(1)), span = H * 1.15;
      const y = ((r(2) * span + env.lt * vy) % span) - H * 0.07;
      const x = r(3) * W + Math.sin(env.t * (1 + r(4)) + r(5) * 6) * M * 0.03;
      const fade = clamp(distBB(x, y, b) / (M * 0.05));
      if (fade <= 0.02) continue;
      const w = M * 0.017, h = M * 0.028, rot = env.t * (1.5 + 2.5 * r(6)) + r(7) * 6, fl = Math.cos(env.t * (2 + 3 * r(8)) + r(9) * 6);
      ctx.globalAlpha = 0.9 * e * fade;
      ctx.fillStyle = cols[i % 3];
      const c =Math.cos(rot), s = Math.sin(rot);
      const pts = [[-w / 2, -h / 2 * fl], [w / 2, -h / 2 * fl], [w / 2, h / 2 * fl], [-w / 2, h / 2 * fl]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
});

decor('dustMotes', {
  name: '漂う塵', tags: ['calm', 'emotional', 'dark'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.8); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), sd = seedOf(P);
    const N = 36;
    for (let i = 0; i < N; i++) {
      const r = k => L.r(sd, 'm', i, k);
      const x = ((r(1) * W + env.t * M * 0.012 * (r(2) - 0.5) * 2 + (L.noise1(env.t * 0.3 + i, sd) - 0.5) * M * 0.08) % W + W) % W;
      const y = ((r(3) * H - env.t * M * 0.008 * (0.3 + r(4)) + (L.noise1(env.t * 0.25 + i * 3, sd) - 0.5) * M * 0.06) % H + H) % H;
      const tw = 0.5 + 0.5 * Math.sin(env.t * (0.8 + r(5) * 2) + r(6) * 6);
      env.circle(x, y, M * (0.0015 + 0.0035 * r(7)), env.sc.fg, null, 1, (0.1 + 0.3 * tw) * e);
    }
  },
});

decor('bubbles', {
  name: 'シャボン玉', tags: ['pop', 'calm', 'emotional'], w: 0.8, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = BBp(env, bb, 10), sd = seedOf(P);
    const N = 10 + (P.n || 1) * 2, ac = acc(env), lw = Math.max(1, env.u * 1.5);
    for (let i = 0; i < N; i++) {
      const r = k => L.r(sd, 'b', i, k);
      const rr = M * (0.012 + 0.022 * r(1)), span = H + rr * 2;
      const y = H + rr - ((r(2) * span + env.lt * H * (0.07 + 0.07 * r(3))) % span);
      const x = r(4) * W + Math.sin(env.t * (0.9 + r(5)) + r(6) * 6) * M * 0.025;
      const d = distBB(x, y, b) - rr;
      if (d <= 0) continue;                       // 歌詞に触れたら割れる(描かない)
      const a = e * clamp(d / (M * 0.03));
      const wob = 1 + 0.06 * Math.sin(env.t * 5 + i);
      env.circle(x, y, rr, env.sc.fg, null, 1, 0.05 * a);
      env.circle(x, y, rr * wob, null, env.sc.fg, lw, 0.55 * a);
      env.arc(x, y, rr * 0.68, 200, 250, ac, lw * 1.4, 0.8 * a);
    }
  },
});

decor('fallDots', {
  name: '降る点列', tags: ['calm', 'cyber', 'emotional'], w: 0.8, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), sd = seedOf(P);
    const cols = 16, list = [], ac = tone(env, { accent: P.accent !== false });
    for (let i = 0; i < cols; i++) {
      const r = k => L.r(sd, 'f', i, k);
      const x = (i + 0.5 + (r(1) - 0.5) * 0.6) / cols * W;
      const span = H * 1.4, head = ((r(2) * span + env.lt * H * (0.25 + 0.3 * r(3))) % span) - H * 0.2;
      for (let q = 0; q < 6; q++) list.push([x, head - q * M * 0.028, M * 0.0055 * (1 - q * 0.14)]);
    }
    discs(env, list, ac, 0.4 * e);
  },
});

decor('lightStreaks', {
  name: '光の筋', tags: ['emotional', 'calm', 'pop'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const { W, H, ctx } = env, M = mn(env), sd = seedOf(P);
    const diag = Math.hypot(W, H), ang = (-28 - 14 * (P.r || 0)) * L.DEG * (P.right ? -1 : 1);
    const dx = Math.cos(ang), dy = Math.sin(ang), c = acc(env, !P.accent);
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const r = k => L.r(sd, 'l', i, k);
      const T = 2.2 + r(1) * 1.4, q = ((env.t + r(2) * T) / T) % 1;
      const off = (r(3) - 0.5) * diag * 0.7;
      const cx = W / 2 - dy * off + dx * (q - 0.5) * diag * 1.5, cy = H / 2 + dx * off + dy * (q - 0.5) * diag * 1.5;
      const len = diag * (0.2 + 0.2 * r(4));
      const g = ctx.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
      g.addColorStop(0, L.rgba(c, 0)); g.addColorStop(0.55, L.rgba(c, 0.38)); g.addColorStop(1, L.rgba(c, 0));
      ctx.globalAlpha = e; ctx.strokeStyle = g; ctx.lineWidth = M * (0.003 + 0.009 * r(5));
      ctx.beginPath(); ctx.moveTo(cx - dx * len / 2, cy - dy * len / 2); ctx.lineTo(cx + dx * len / 2, cy + dy * len / 2); ctx.stroke();
    }
    ctx.restore();
  },
});

/* ================================================================ decor: 手描き・文具 (6) */
decor('scribbleUnder', {
  name: '手描き下線', tags: ['pop', 'emotional', 'editorial'], w: 1.1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb), sd = seedOf(P);
    const c = tone(env, { accent: P.accent !== false }), lw = Math.max(1.5, env.u * 5);
    const vertical = b.h > b.w * 1.4;
    const amp = M * 0.005, N = 26, pts = [];
    if (!vertical) {
      const below = H - b.y1 > M * 0.06;
      const y = below ? b.y1 + M * 0.028 : b.y0 - M * 0.028;
      const x0 = b.x0 - M * 0.015, x1 = b.x1 + M * 0.02;
      for (let i = 0; i < N; i++) { const u = i / (N - 1); pts.push([L.lerp(x0, x1, u), y + wob(sd, i, amp) - u * M * 0.008]); }
      for (let i = 0; i < N; i++) { const u = i / (N - 1); pts.push([L.lerp(x1 - M * 0.03, x0 + M * 0.05, u), y + M * 0.014 + wob(sd, i + 40, amp)]); }
    } else {
      const right = W - b.x1 > M * 0.06;
      const x = right ? b.x1 + M * 0.028 : b.x0 - M * 0.028;
      const y0 = b.y0 - M * 0.015, y1 = b.y1 + M * 0.02;
      for (let i = 0; i < N; i++) { const u = i / (N - 1); pts.push([x + wob(sd, i, amp), L.lerp(y0, y1, u)]); }
      for (let i = 0; i < N; i++) { const u = i / (N - 1); pts.push([x + M * 0.014 + wob(sd, i + 40, amp), L.lerp(y1 - M * 0.03, y0 + M * 0.05, u)]); }
    }
    env.polyPartial(pts, E.inOutQuad(clamp(e)), c, lw, 0.95, false);
  },
});

decor('doodleLoop', {
  name: '手描きの囲み', tags: ['pop', 'emotional', 'editorial'], w: 1, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.7); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb), sd = seedOf(P), pad = M * 0.03;
    // 楕円が画面からはみ出すなら横幅を抑え、角を避けられる縦幅に広げる
    let rx = b.w / 2 * 1.44 + pad, ry = b.h / 2 * 1.44 + pad;
    const rxMax = env.W / 2 - M * 0.025;
    if (rx > rxMax) {
      const k = (b.w / 2 + pad * 0.4) / rxMax;
      if (k < 0.97) { rx = rxMax; ry = Math.max(ry, (b.h / 2 + pad * 0.4) / Math.sqrt(1 - k * k)); }
    }
    const N = 56, pts = [], a0 = -2.2 + L.r(sd, 'a') * 0.8;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), th = a0 + u * TAU * 1.12, gr = 1 + u * 0.07;
      const w = 1 + wob(sd, i, 0.03);
      pts.push([b.cx + Math.cos(th) * rx * gr * w, b.cy + Math.sin(th) * ry * gr * w]);
    }
    env.polyPartial(pts, E.inOutQuad(clamp(e)), tone(env, { accent: P.accent !== false }), Math.max(1.5, env.u * 4), 0.9, false);
  },
});

decor('tapeStrips', {
  name: 'マスキングテープ', tags: ['pop', 'emotional', 'editorial'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.3); if (e <= 0.001) return;
    const M = mn(env), b = BBp(env, bb, 8), sd = seedOf(P);
    const tw = M * 0.17, th = M * 0.048;
    const diag = (P.corner | 0) % 2 === 0;
    const corners = diag ? [[b.x0, b.y0, -1, -1], [b.x1, b.y1, 1, 1]] : [[b.x1, b.y0, 1, -1], [b.x0, b.y1, -1, 1]];
    const col = L.mix(env.sc.accent2, env.sc.dark ? '#ffffff' : env.sc.bg, 0.35);
    corners.forEach(([x, y, sx, sy], ci) => {
      const q = clamp((env.lt - ci * 0.12) / 0.25); if (q <= 0) return;
      const press = 1 + (1 - E.outCubic(q)) * 0.35;
      const nx = sx / Math.SQRT2, ny = sy / Math.SQRT2;
      const cx = x + nx * (th / 2 + M * 0.004) * press, cy = y + ny * (th / 2 + M * 0.004) * press;
      const rot = Math.atan2(-nx, ny) + (L.r(sd, 't', ci) - 0.5) * 0.12;
      const pts = [];
      const tooth = 4;
      for (let k = 0; k <= tooth; k++) pts.push([tw / 2 + (k % 2 ? th * 0.08 : 0), -th / 2 + th * k / tooth]);
      for (let k = tooth; k >= 0; k--) pts.push([-tw / 2 - (k % 2 ? th * 0.08 : 0), -th / 2 + th * k / tooth]);
      const P2 = xform(pts, cx, cy, rot, press);
      env.poly(P2, col, 0.62 * e * q);
      // 質感の線
      const s0 = xform([[-tw * 0.42, -th * 0.18], [tw * 0.42, -th * 0.18]], cx, cy, rot, press);
      env.line(s0, env.sc.dark ?'#ffffff' : L.mix(col, '#ffffff', 0.5), Math.max(1, env.u * 1.2), 0.35 * e * q);
    });
  },
});

decor('paperClip', {
  name: 'クリップ', tags: ['editorial', 'pop', 'emotional'], w: 0.7, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const M = mn(env), pad = M * 0.05, b = BBp(env, bb, 0);
    const sx0 = b.x0 - pad, sy0 = b.y0 - pad, sx1 = b.x1 + pad, sy1 = b.y1 + pad;
    const c = env.sc.fg, lw = Math.max(1, env.u * 1.3);
    // 紙の縁(右下を折る)
    const dog = M * 0.035;
    const sheet = [[sx0, sy0], [sx1, sy0], [sx1, sy1 - dog], [sx1 - dog, sy1], [sx0, sy1], [sx0, sy0]];
    env.polyPartial(sheet, E.outCubic(e), c, lw, 0.4);
    if (e > 0.6) env.line([[sx1, sy1 - dog], [sx1 - dog, sy1 - dog], [sx1 - dog, sy1]], c, lw, 0.4 * (e - 0.6) / 0.4);
    // ゼムクリップ(一筆)
    const R = M * 0.028, rr = R * 0.55, pts = [];
    const arc = (cx, cy, r, a0, a1) => { for (let i = 0; i <= 10; i++) { const a = (a0 + (a1 - a0) * i / 10) * L.DEG; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    pts.push([-rr, 2.2 * R]); arc(0, 0.9 * R, rr, 180, 360);
    pts.push([rr, 2.9 * R]); arc(-0.225 * R, 2.9 * R, 0.775 * R, 0, 180);
    pts.push([-R, 0.8 * R]); arc(0, 0.8 * R, R, 180, 360); pts.push([R, 2.3 * R]);
    const hC = 3.9 * R;
    const cx = sx0 + Math.max(b.w * 0.18, M * 0.04), cy = sy0 - hC * 0.52;
    const tp = xform(pts.map(([x, y]) => [x, y - 1.8 * R]), cx, cy + 1.8 * R - hC * 0.0, -0.18, 1);
    env.polyPartial(tp, E.inOutQuad(clamp(e * 1.3 - 0.3)), tone(env, P), Math.max(1.5, env.u * 3.2), 0.95, false);
  },
});

decor('highlightSwipe', {
  name: '蛍光ペン', tags: ['pop', 'editorial', 'emotional'], w: 0.9, layer: 'back',
  draw(env, bb, P) {
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb), sd = seedOf(P);
    const c = acc(env, !P.accent), a = env.sc.dark ? 0.3 : 0.32;
    const vertical = b.h > b.w * 1.4;
    const k = E.outCubic(e), pts = [], J = 5;
    if (!vertical) {
      const y0 = b.y0 + b.h * 0.45, y1 = b.y1 + M * 0.01, x0 = b.x0 - M * 0.02, x1 = L.lerp(x0, b.x1 + M * 0.025, k);
      const sk = M * 0.012;
      pts.push([x0 + sk, y0]); pts.push([x1 + sk, y0 + wob(sd, 1, M * 0.004)]);
      for (let j = 1; j < J; j++) pts.push([x1 + sk * (1 - j / J) + (j % 2 ? -M * 0.006 : 0), L.lerp(y0, y1, j / J)]);
      pts.push([x1, y1]); pts.push([x0, y1 + wob(sd, 3, M * 0.004)]);
      for (let j = J - 1; j > 0; j--) pts.push([x0 + sk * (1 - j / J) + (j % 2 ? M * 0.006 : 0), L.lerp(y0, y1, j / J)]);
    } else {
      const x0 = b.cx, x1 = b.x1 + M * 0.01, y0 = b.y0 - M * 0.02, y1 = L.lerp(y0, b.y1 + M * 0.025, k);
      pts.push([x0, y0]); pts.push([x1, y0]);
      for (let j = 1; j < J; j++) pts.push([L.lerp(x1, x0, j / J), y1 + (j % 2 ? -M * 0.006 : 0)]);
      pts.push([x0, y1]);
    }
    env.poly(pts, c, a * e);
  },
});

decor('starDoodle', {
  name: '星の落書き', tags: ['pop', 'emotional'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const M = mn(env), sd = seedOf(P);
    const pts = scatter(env, bb, 2 + (P.n || 1), sd, M * 0.04, true);
    const lw = Math.max(1.2, env.u * 3), ac = acc(env), c = env.sc.fg;
    for (const [x, y, i] of pts) {
      const q = clamp(e * 1.5 - i * 0.2); if (q <= 0) continue;
      const R = M * (0.03 + 0.018 * L.r(sd, 'sr', i)), rot = (L.r(sd, 'so', i) - 0.5) * 0.6, st = [];
      for (let k = 0; k <= 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5 + rot, r = (k % 2 ? 0.45 : 1) * R * (1 + wob(sd, i * 20 + k, 0.08));
        st.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      st.push([st[1][0] * 0.3 + st[0][0] * 0.7, st[1][1] * 0.3 + st[0][1] * 0.7]);
      env.polyPartial(st, E.inOutQuad(q), i % 2 ? c : ac, lw, 0.9, false);
      if (q > 0.8) {                                 // 小さなきらめき
        const sx = x + R * 1.3, sy = y - R * 1.1, s = R * 0.3 * (q - 0.8) / 0.2;
        segs(env, [[sx - s, sy, sx + s, sy], [sx, sy - s, sx, sy + s]], ac, lw * 0.8, 0.9, 'round');
      }
    }
  },
});

/* ================================================================ decor: 歌詞由来の装飾 (4) */
decor('bigGlyph', {
  name: '大透かし字', tags: ['editorial', 'emotional', 'calm', 'graphic'], w: 1, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const ch = firstGlyph(env.cut.text); if (!ch) return;
    const { W, H } = env, M = mn(env);
    const size = Math.max(W, H) * (env.portrait ? 0.62 : 0.78);
    const x = W * (P.right ? 0.68 : 0.32) + env.lt * M * 0.012 * (P.right ? -1 : 1), y = H * (P.low ? 0.58 : 0.44);
    env.text({ text: ch, font: L.roleFont(env, 'display'), weight: 900, size: size * (1.06 - 0.06 * E.outCubic(e)), x, y, color: env.sc.fg, alpha: (env.sc.dark ? 0.07 : 0.08) * e, ghost: false });
  },
});

decor('textRing', {
  name: '文字の輪', tags: ['graphic', 'emotional', 'editorial'], w: 0.8, layer: 'front',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const M = mn(env), b = L.centerBB(env, bb), ctx = env.ctx;
    const src = L.glyphs(env.cut.text).filter(c => !L.isSpace(c));
    if (!src.length) return;
    let R = Math.hypot(b.w, b.h) / 2 + M * 0.05, cx = b.cx, cy = b.cy;
    if (R > M * 0.46) {                               // 大きすぎる→空いた隅のバッジに
      const s = freeSpot(env, bb, M * 0.29, M * 0.29, P.corner); if (!s) return;
      R = M * 0.12; cx = s.cx; cy = s.cy;
    }
    const fs = Math.min(M * 0.03, R * 0.2);
    const cnt = Math.max(8, Math.min(64, Math.floor(TAU * R / (fs * 1.25))));
    const vis = Math.floor(cnt * E.outCubic(e));
    const rot = env.lt * 0.22 * (P.right ? 1 : -1) + L.r(seedOf(P)) * TAU;
    ctx.save();
    ctx.font = `700 ${fs.toFixed(2)}px ${L.roleFont(env, 'body')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = P.accent ? acc(env) : env.sc.sub;
    ctx.globalAlpha = 0.85 * e;
    for (let i = 0; i < vis; i++) {
      const a = rot + i * TAU / cnt;
      ctx.save(); ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2);
      ctx.fillText(src[i % src.length], 0, 0); ctx.restore();
    }
    ctx.restore();
  },
});

decor('outlineGlyph', {
  name: '輪郭大字', tags: ['graphic', 'editorial', 'dark'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.9); if (e <= 0.001) return;
    const gs = L.glyphs(env.cut.text).filter(c => !L.isSpace(c) && !L.isPunct(c));
    if (!gs.length) return;
    const kan = gs.filter(c => L.isKanji(c));
    const ch = kan.length ? kan[kan.length - 1] : gs[gs.length - 1];
    const { W, H } = env, M = mn(env);
    const size = M * (env.portrait ? 0.95 : 1.05);
    env.text({
      text: ch, font: L.roleFont(env, 'display'), weight: 900, size, x: W * (P.right ? 0.3 : 0.7), y: H * 0.5 + (P.low ? M * 0.06 : -M * 0.06),
      rot: (P.right ? -1 : 1) * 8 * L.DEG, fill: false, stroke: Math.max(1, env.u * 2.2), strokeColor: env.sc.fg, strokeUnder: false,
      dash: E.inOutQuad(clamp(e)), color: env.sc.fg, alpha: (env.sc.dark ? 0.2 : 0.22), ghost: false,
    });
  },
});

decor('echoColumn', {
  name: '縦の残響', tags: ['editorial', 'calm', 'emotional'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const e = env.inOut(0.6); if (e <= 0.001) return;
    let txt = (env.cut.lineText || env.cut.text || '').replace(/\s+/g, ' ').trim();
    const n = L.glyphCount(txt); if (!n) return;
    if (L.glyphs(txt).length < 8) { const base = txt; while (L.glyphs(txt).length < 10) txt += '　' + base; }
    const { W, H } = env, M = mn(env);
    const size = Math.min(H * 0.82 / Math.max(1, L.glyphs(txt).length), M * 0.045);
    const k = E.outCubic(e);
    for (let j = 0; j < 3; j++) {
      const x = P.right ? W - M * 0.05 - j * size * 1.5 : M * 0.05 + j * size * 1.5;
      env.text({ text: txt, font: L.roleFont(env, 'serif'), weight: 700, size, x, y: H / 2 + (1 - k) * M * 0.05 * (j + 1), vertical: true, color: env.sc.fg, alpha: [0.2, 0.11, 0.06][j] * e * (env.sc.dark ? 1 : 1.2), ghost: false });
    }
  },
});

/* ================================================================ decor: 和柄 (5) */
/* 青海波の継ぎ目なしタイル(2r×r)。色・大きさごとにモジュール内でキャッシュ */
const tileCache = new Map();
const seigaihaTile = (r, fill, stroke, lw) => {
  const key = r + '|' + fill + '|' + stroke + '|' + lw.toFixed(1);
  let c = tileCache.get(key);
  if (c) return c;
  if (tileCache.size > 24) tileCache.clear();
  c = document.createElement('canvas'); c.width = r * 2; c.height = r;
  const g = c.getContext('2d');
  g.lineWidth = lw; g.strokeStyle = stroke; g.fillStyle = fill;
  for (let j = -2; j <= 3; j++) {                 // 上の段から描いて下の段で覆う(半段ずつ互い違い)
    const y = j * r * 0.5, ox = (j & 1) ? r : 0;
    for (let x = -r * 2 + ox; x <= r * 4; x += r * 2) {
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.beginPath();
      for (let q = 1; q <= 3; q++) { const rq = r * q / 3; g.moveTo(x + rq, y); g.arc(x, y, rq, 0, TAU); }
      g.stroke();
    }
  }
  tileCache.set(key, c);
  return c;
};
decor('seigaiha', {
  name: '青海波', tags: ['wa', 'calm', 'emotional'], w: 0.8, layer: 'back', subtle: true, wa: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.7); if (e <= 0.001) return;
    const { W, H, ctx, sc } = env, M = mn(env);
    const cn = (P.corner | 0) % 4, cx = cn === 1 || cn === 2 ? W : 0, cy = cn >= 2 ? H : 0;
    const Rp = M * 0.5 * E.outCubic(e), r = Math.max(4, Math.round(M * 0.065));
    if (Rp < 1) return;
    const tile = seigaihaTile(r, L.mix(sc.bg, sc.fg, sc.dark ? 0.05 : 0.04), L.rgba(sc.fg, sc.dark ? 0.2 : 0.22), Math.max(1, env.u * 1.3));
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, TAU); ctx.clip();
    ctx.globalAlpha = e;
    ctx.translate(cx, cy);                         // 柄の原点を隅に固定
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(-Rp, -Rp, Rp * 2, Rp * 2);
    ctx.restore();
  },
});

decor('sakura', {
  name: '桜吹雪', tags: ['wa', 'emotional', 'calm', 'pop'], w: 0.9, layer: 'front', wa: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.5); if (e <= 0.001) return;
    const { W, H, ctx } = env, M = mn(env), b = BBp(env, bb, 10), sd = seedOf(P);
    const base = env.sc.dark ? L.mix(env.sc.accent2, '#ffffff', 0.55) : L.mix(env.sc.accent2, '#ffffff', 0.15);
    const N = 16, wind = P.right ? -1 : 1;
    for (let i = 0; i < N; i++) {
      const r = k => L.r(sd, 'k', i, k);
      const s = M * (0.02 + 0.014 * r(1));
      const span = H * 1.2, vy = H * (0.07 + 0.06 * r(2));
      const y = ((r(3) * span + env.lt * vy) % span) - H * 0.1;
      const x = (((r(4) * W + wind * env.lt * W * 0.05 + Math.sin(env.t * (0.8 + r(5)) + r(6) * 6) * M * 0.04) % W) + W) % W;
      const fade = clamp(distBB(x, y, b) / (M * 0.05));
      if (fade <= 0.02) continue;
      const rot = env.t * (0.8 + 1.2 * r(7)) * (r(8) < 0.5 ? -1 : 1) + r(9) * 6, fl = 0.35 + 0.65 * Math.abs(Math.cos(env.t * (1.2 + r(10)) + r(11) * 6));
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(fl, 1);
      ctx.globalAlpha = 0.85 * e * fade;
      ctx.fillStyle = i % 4 === 0 ? L.mix(base, '#ffffff', 0.35) : base;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.55);
      ctx.bezierCurveTo(-s * 0.75, s * 0.2, -s * 0.6, -s * 0.55, -s * 0.14, -s * 0.62);
      ctx.lineTo(0, -s * 0.45);
      ctx.lineTo(s * 0.14, -s * 0.62);
      ctx.bezierCurveTo(s * 0.6, -s * 0.55, s * 0.75, s * 0.2, 0, s * 0.55);
      ctx.fill();
      ctx.restore();
    }
  },
});

decor('crest', {
  name: '家紋', tags: ['wa', 'editorial', 'calm'], w: 0.7, layer: 'front', wa: true,
  draw(env, bb, P) {
    const e = env.inOut(0.8); if (e <= 0.001) return;
    const M = mn(env), D = M * 0.2;
    const s = freeSpot(env, bb, D, D, P.corner); if (!s) return;
    const cx = s.cx, cy = s.cy, R = D / 2;
    const c = P.accent ? acc(env, true) : env.sc.fg, lw = Math.max(1, env.u * 2.2);
    const q1 = clamp(e * 1.6), q2 = clamp(e * 1.6 - 0.6);
    const a0 = -90;
    env.arc(cx, cy, R, a0, a0 + 360 * E.outCubic(q1), c, lw * 1.8, 0.9);
    env.arc(cx, cy, R * 0.86, a0 + 180, a0 + 180 + 360 * E.outCubic(q1), c, lw * 0.7, 0.7);
    if (q2 <= 0) return;
    const sc = E.outBack(q2), v = (P.v | 0) % 3;
    if (v === 0) {                                     // 梅鉢風: 五つの円
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * TAU / 5;
        env.circle(cx + Math.cos(a) * R * 0.44 * sc, cy + Math.sin(a) * R * 0.44 * sc, R * 0.2 * sc, c, null, 1, 0.9 * q2);
      }
      env.circle(cx, cy, R * 0.1 * sc, null, c, lw, 0.9 * q2);
    } else if (v === 1) {                              // 三つ巴風: 頭+細る尾
      for (let k = 0; k < 3; k++) {
        const h0 = k * TAU / 3 + env.lt * 0.15, d = R * 0.34 * sc, rh = R * 0.2 * sc;
        const out = [], inn = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, a = h0 + t * 2.1, w = rh * (1 - t) + R * 0.01;
          const dd = d + t * R * 0.24 * sc;
          out.push([cx + Math.cos(a) * (dd + w), cy + Math.sin(a) * (dd + w)]);
          inn.push([cx + Math.cos(a) * (dd - w), cy + Math.sin(a) * (dd - w)]);
        }
        env.poly(out.concat(inn.reverse()), c, 0.9 * q2);
        env.circle(cx + Math.cos(h0) * d, cy + Math.sin(h0) * d, rh, c, null, 1, 0.9 * q2);
      }
    } else {                                           // 井桁
      const g = R * 0.24 * sc, l = R * 0.56 * sc;
      segs(env, [[cx - g, cy - l, cx - g, cy + l], [cx + g, cy - l, cx + g, cy + l], [cx - l, cy - g, cx + l, cy - g], [cx - l, cy + g, cx + l, cy + g]], c, lw * 1.8, 0.9 * q2);
    }
  },
});

decor('fanCorner', {
  name: '扇', tags: ['wa', 'emotional', 'editorial'], w: 0.8, layer: 'front', wa: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.6); if (e <= 0.001) return;
    const { W, H, ctx } = env, M = mn(env), b = BBp(env, bb, 14);
    let R = M * 0.26, pick = null;
    for (const sz of [1, 0.7]) {
      for (let k = 0; k < 4 && !pick; k++) {
        const cn = ((P.corner | 0) + k) % 4, m = M * 0.03, rr = R * sz;
        const px = cn === 1 || cn === 2 ? W - m : m, py = cn >= 2 ? H - m : m;
        const rect = { x0: Math.min(px, px + (cn === 1 || cn === 2 ? -rr : rr)), x1: Math.max(px, px + (cn === 1 || cn === 2 ? -rr : rr)), y0: Math.min(py, py + (cn >= 2 ? -rr : rr)), y1: Math.max(py, py + (cn >= 2 ? -rr : rr)) };
        if (!hit(rect, b)) pick = { cn, px, py, R: rr };
      }
      if (pick) break;
    }
    if (!pick) return;
    R = pick.R;
    const mid = [45, 135, 225, 315][pick.cn] * L.DEG;
    const hs = 44 * L.DEG * E.outCubic(e), a0 = mid - hs, a1 = mid + hs;
    const n = 12, ri = R * 0.4, paper = acc(env, true), c = env.sc.fg;
    ctx.save();
    ctx.globalAlpha = e;
    for (let i = 0; i < n; i++) {                   // 折り目ごとに濃淡
      const s0 = a0 + (a1 - a0) * i / n, s1 = a0 + (a1 - a0) * (i + 1) / n;
      ctx.fillStyle = L.rgba(paper, i % 2 ? 0.5 : 0.34);
      ctx.beginPath(); ctx.arc(pick.px, pick.py, R, s0, s1); ctx.arc(pick.px, pick.py, ri, s1, s0, true); ctx.closePath(); ctx.fill();
    }
    if ((P.v | 0) % 2 === 1 && e > 0.5) {           // 日の丸
      ctx.globalAlpha = (e - 0.5) * 2 * 0.95; ctx.fillStyle = L.mix(env.sc.accent2, '#000000', 0.25);
      ctx.beginPath(); ctx.arc(pick.px + Math.cos(mid) * R * 0.7, pick.py + Math.sin(mid) * R * 0.7, R * 0.11, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 0.7 * e; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, env.u * 1.2);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; ctx.moveTo(pick.px + Math.cos(a) * R * 0.08, pick.py + Math.sin(a) * R * 0.08); ctx.lineTo(pick.px + Math.cos(a) * R * 0.98, pick.py + Math.sin(a) * R * 0.98); }
    ctx.moveTo(pick.px + Math.cos(a0) * R, pick.py + Math.sin(a0) * R); ctx.arc(pick.px, pick.py, R, a0, a1);
    ctx.moveTo(pick.px + Math.cos(a0) * ri, pick.py + Math.sin(a0) * ri); ctx.arc(pick.px, pick.py, ri, a0, a1);
    ctx.stroke();
    ctx.globalAlpha = e; ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(pick.px, pick.py, R * 0.035, 0, TAU); ctx.fill();
    ctx.restore();
  },
});

decor('asanoha', {
  name: '麻の葉', tags: ['wa', 'calm', 'editorial'], w: 0.8, layer: 'back', subtle: true, wa: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const e = env.inOut(0.7); if (e <= 0.001) return;
    const { W, H, ctx, sc } = env, M = mn(env);
    const cx = W * (P.right ? 0.8 : 0.2), cy = H * (P.low ? 0.72 : 0.28);
    const Rw = M * 0.32 * E.outCubic(e), s = M * 0.09, hh = s * Math.sqrt(3) / 2;
    if (Rw < 2) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rw, 0, TAU); ctx.clip();
    ctx.strokeStyle = L.rgba(sc.fg, sc.dark ? 0.15 : 0.13); ctx.lineWidth = Math.max(1, env.u * 1.1);
    ctx.globalAlpha = e;
    ctx.beginPath();
    const rows = Math.min(20, Math.ceil(Rw * 2 / hh) + 2), cols = Math.min(24, Math.ceil(Rw * 2 / s) + 2);
    const x0 = cx - Rw - s, y0 = cy - Rw - hh;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const ox = x0 + i * s + (j % 2 ? s / 2 : 0), oy = y0 + j * hh;
      // 上向き三角と下向き三角: 辺 + 重心から頂点
      for (const tri of [[[ox, oy + hh], [ox + s, oy + hh], [ox + s / 2, oy]], [[ox + s / 2, oy], [ox + s * 1.5, oy], [ox + s, oy + hh]]]) {
        const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.lineTo(tri[0][0], tri[0][1]);
        for (const v of tri) { ctx.moveTo(gx, gy); ctx.lineTo(v[0], v[1]); }
      }
    }
    ctx.stroke();
    ctx.restore();
    env.circle(cx, cy, Rw, null, sc.fg, Math.max(1, env.u * 1.4), (sc.dark ? 0.2 : 0.18) * e);
  },
});

/* ================================================================ decor: UI 部品 (5) */
decor('progressBar', {
  name: '進行バー', tags: ['pop', 'cyber', 'graphic'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.4); if (e <= 0.001) return;
    const { W, H } = env, M = mn(env), b = L.centerBB(env, bb);
    const bottom = P.low ? H - b.y1 > M * 0.09 : !(b.y0 > M * 0.09) && H - b.y1 > M * 0.09;
    if (!bottom && b.y0 <= M * 0.09) return;
    const w = W * (env.portrait ? 0.72 : 0.5) * E.outCubic(e), h = M * 0.01, x = (W - w) / 2;
    const y = bottom ? H - M * 0.06 : M * 0.06;
    const p = clamp(env.lt / Math.max(0.1, env.cut.dur));
    const ac = acc(env);
    env.rrect(x, y - h / 2, w, h, h / 2, env.sc.fg, 0.2 * e, false);
    env.rrect(x, y - h / 2, w * p, h, h / 2, ac, 0.95 * e, false);
    env.circle(x + w * p, y, h * 1.25, env.sc.fg, null, 1, e);
    const fs = M * 0.02;
    label(env, L.fmtTime(env.lt), x, y - fs * 1.2, fs, { anchor: 'l', color: env.sc.sub, alpha: e });
    label(env, Math.round(p * 100) + '%', x + w, y - fs * 1.2, fs, { anchor: 'r', color: env.sc.fg, alpha: e });
  },
});

decor('recTime', {
  name: '録画表示', tags: ['cyber', 'emotional', 'glitch'], w: 0.9, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.3); if (e <= 0.001) return;
    const M = mn(env), fs = M * 0.032, w = fs * 9.5, h = fs * 1.6;
    const s = freeSpot(env, bb, w, h, (P.corner | 0) % 2); if (!s) return;
    const cy = s.cy, on = Math.floor(env.t * 1.25) % 2 === 0;
    const red = acc(env, true);
    env.circle(s.x + fs * 0.45, cy, fs * 0.36, red, null, 1, e * (on ? 1 : 0.25));
    label(env, 'REC', s.x + fs * 1.05, cy, fs, { anchor: 'l', color: env.sc.fg, alpha: e, role: 'body', weight: 900, track: 0.05 });
    label(env, L.fmtTime(env.t), s.x + fs * 3.6, cy, fs * 0.9, { anchor: 'l', color: env.sc.fg, alpha: 0.9 * e, track: 0.04 });
  },
});

decor('battery', {
  name: '電池残量', tags: ['pop', 'cyber'], w: 0.6, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.35); if (e <= 0.001) return;
    const M = mn(env), bw = M * 0.1, bh = M * 0.046, fs = M * 0.023, w = bw + fs * 3.4, h = bh * 1.2;
    const s = freeSpot(env, bb, w, h, ((P.corner | 0) + 1) % 4); if (!s) return;
    const c = env.sc.fg, ac = acc(env), lw = Math.max(1, env.u * 1.8);
    const x = s.x + fs * 3.2, y = s.y + (h - bh) / 2;
    env.rrect(x, y, bw, bh, bh * 0.2, null, e, false, c, lw);
    env.rrect(x + bw + lw, y + bh * 0.3, bh * 0.14, bh * 0.4, 1, c, e, false);
    const lit = env.lt < 0.4 ? 0 : 1 + Math.floor((env.lt - 0.4) * 3) % 4;
    for (let i = 0; i < 4; i++) {
      const on = i < lit;
      env.rect(x + lw * 1.4 + i * (bw - lw * 2.8) / 4, y + lw * 1.4, (bw - lw * 2.8) / 4 - lw * 0.8, bh - lw * 2.8, on ? ac : c, on ? 0.95 * e : 0.12 * e, false);
    }
    const pct = 40 + (L.h(seedOf(P), 'bat') % 60);
    label(env, pct + '%', x - fs * 0.4, s.cy, fs, { anchor: 'r', color: c, alpha: e });
  },
});

decor('barcode', {
  name: 'バーコード', tags: ['glitch', 'graphic', 'cyber'], w: 0.8, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.45); if (e <= 0.001) return;
    const M = mn(env), w = M * 0.26, bh = M * 0.07, fs = M * 0.018, h = bh + fs * 1.6;
    const s = freeSpot(env, bb, w, h, ((P.corner | 0) + 2) % 4); if (!s) return;
    const sd = seedOf(P), c = env.sc.fg;
    const units = [];
    let tot = 0;
    for (let i = 0; i < 40 && tot < 90; i++) { const u = 1 + (L.h(sd, 'bc', i) % 3); units.push(u); tot += u; }
    const uw = w / tot, lim = w * E.outCubic(e);
    let x = s.x;
    for (let i = 0; i < units.length; i++) {
      const bwid = units[i] * uw;
      if (i % 2 === 0 && x - s.x < lim) env.rect(x, s.y, bwid, bh * (i % 11 === 0 ? 1.08 : 1), c, 0.9 * e, false);
      x += bwid;
    }
    const digits = Array.from({ length: 12 }, (_, i) => L.h(sd, 'dg', i) % 10).join('');
    label(env, digits.replace(/^(\d)(\d{6})(\d{5})$/, '$1 $2 $3'), s.cx, s.y + bh + fs * 0.95, fs, { color: env.sc.sub, alpha: e, track: 0.14 });
    const sc = ((env.lt - 0.3) % 2.6) / 0.7;       // スキャン光
    if (env.lt > 0.3 && sc >= 0 && sc <= 1) env.rect(s.x - M * 0.01, s.y + bh * E.inOutSine(sc), w + M * 0.02, Math.max(1, env.u * 2.2), acc(env), 0.9 * e, false);
  },
});

decor('spinner', {
  name: '読み込み', tags: ['cyber', 'pop', 'glitch'], w: 0.7, layer: 'front',
  draw(env, bb, P) {
    const e = env.inOut(0.3); if (e <= 0.001) return;
    const M = mn(env), r = M * 0.03, fs = M * 0.022, w = r * 2.6 + fs * 6.5, h = r * 2.4;
    const b = BBp(env, bb, 14);
    let x = b.x1 - w, y = b.y1 + M * 0.035;
    if (y + h > env.H - M * 0.03) {
      const s = freeSpot(env, bb, w, h, P.corner); if (!s) return;
      x = s.x; y = s.y;
    }
    x = Math.max(M * 0.03, x);
    const cx = x + r * 1.2, cy = y + h / 2, head = Math.floor(env.lt * 12) % 12;
    const c = tone(env, P), lw = Math.max(1.2, env.u * 3);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, age = (head - i + 12) % 12;
      const al = e * (1 - age / 12) * 0.95 + 0.05 * e;
      env.line([[cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]], c, lw, al);
    }
    const dots = '.'.repeat(1 + Math.floor(env.lt * 3) % 3);
    label(env, 'LOADING' + dots, x + r * 2.7, cy, fs, { anchor: 'l', color: env.sc.sub, alpha: e, track: 0.12 });
  },
});

/* ================================================================ treat 共通 */
const itA = it => (it.alpha == null ? 1 : it.alpha);
const skipT = it => !it || it.fill === false || itA(it) < 0.25 || !(it.size > 0);
/* 文字色の下地: 背景と十分差があれば背景、無ければ文字色の反対 */
const tRef = (env, it) => (L.contrast(it.color || env.sc.fg, env.sc.bg) >= 2.5 ? env.sc.bg : (L.lum(it.color || env.sc.fg) > 0.4 ? '#000000' : '#ffffff'));
const tAcc = (env, it, alt, ratio = 3) => L.fitContrast(alt ? env.sc.accent2 : env.sc.accent, tRef(env, it), ratio);
const isLight = c => L.lum(c) > 0.4;
const chain = (it, slot, fn) => { const prev = it[slot]; it[slot] = prev ? (e, i, m) => { prev(e, i, m); fn(e, i, m); } : fn; };
/* 行(縦書きは列)ごとの矩形(項目ローカル座標) */
const lineBoxes = m => {
  const out = [];
  for (const g of m.lay) {
    if (g.space) continue;
    let b = out[g.line];
    if (!b) b = out[g.line] = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, line: g.line };
    b.x0 = Math.min(b.x0, g.x - g.w / 2); b.x1 = Math.max(b.x1, g.x + g.w / 2);
    b.y0 = Math.min(b.y0, g.y - g.h / 2); b.y1 = Math.max(b.y1, g.y + g.h / 2);
  }
  return out.filter(Boolean);
};
/* 字ごとの変形(登場/退場の charFns)を再現して cb(ctx,g,ch,a) を呼ぶ。own は自分の関数(除外) */
const eachGlyph = (env, it, m, own, cb) => {
  const ctx = env.ctx, fns = it.charFns || [], n = m.lay.length;
  for (const g of m.lay) {
    if (g.space) continue;
    let dx = 0, dy = 0, rot = 0, s = 1, sx = 1, sy = 1, a = 1, hide = false, cX = null, cY = null, ch = g.ch;
    for (const f of fns) {
      if (f === own) continue;
      const r = f(g.i, g, n); if (!r) continue;
      if (r.dx) dx += r.dx; if (r.dy) dy += r.dy; if (r.rot) rot += r.rot;
      if (r.s != null) s *= r.s; if (r.sx != null) sx *= r.sx; if (r.sy != null) sy *= r.sy;
      if (r.a != null) a *= r.a; if (r.hide) hide = true; if (r.clipX) cX = r.clipX; if (r.clipY) cY = r.clipY; if (r.ch != null) ch = r.ch;
    }
    if (hide || a <= 0.01 || !ch) continue;
    ctx.save();
    ctx.translate(g.x + dx, g.y + dy);
    if (rot) ctx.rotate(rot);
    if (s !== 1 || sx !== 1 || sy !== 1) ctx.scale((s * sx) || 1e-4, (s * sy) || 1e-4);
    if (cX || cY) {
      const xa = cX ? cX[0] * g.w : -g.w * 2, xb = cX ? cX[1] * g.w : g.w * 2;
      const ya = cY ? cY[0] * it.size : -it.size * 2, yb = cY ? cY[1] * it.size : it.size * 2;
      ctx.beginPath(); ctx.rect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); ctx.clip();
    }
    cb(ctx, g, ch, a);
    ctx.restore();
  }
};
/* 項目テキストの非空白字の通し番号(lay の添字 → 0..) */
const rankMap = it => {
  const gs = L.glyphs(it.text).filter(c => c !== '\n');
  const out = []; let k = 0;
  for (let i = 0; i < gs.length; i++) out.push(L.isSpace(gs[i]) ? -1 : k++);
  return { rank: out, gs };
};
const sweep = (env, delay, dur) => E.outCubic(clamp((env.lt - delay) / dur));

/* ================================================================ treat: 縁取り (4) */
treat('hollow', {
  name: '袋文字', tags: ['graphic', 'pop', 'glitch', 'cyber'], w: 1.1, safe: true,
  plan: rng => ({ w: rng.range(0.028, 0.042), f: rng.pick([0, 0.1, 0.18]) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    it.stroke = Math.max(1, it.size * (P.w || 0.034));
    it.strokeColor = it.color; it.strokeUnder = false; it.ghostStroke = false;
    it.fillAlpha = P.f == null ? 0.1 : P.f;
  },
});

treat('doubleLine', {
  name: '二重縁', tags: ['pop', 'graphic'], w: 0.8,
  plan: rng => ({ alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, ref = tRef(env, it), ring = tAcc(env, it, P.alt, 2);
    it.stroke = s * 0.1; it.strokeColor = ref; it.strokeUnder = true; it.ghostStroke = false;
    chain(it, 'pre', guard('treat:doubleLine:pre', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const ctx = env2.ctx;
      ctx.save();
      ctx.font = L.fontStr(it2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.22; ctx.strokeStyle = ring;
      eachGlyph(env2, it2, m, null, (c, g, ch, a) => {
        c.globalAlpha = clamp(a * itA(it2));
        if (g.vrot) c.rotate(Math.PI / 2);
        const ox = g.vshift ? s * 0.3 * g.vshift : 0, oy = g.vshift ? -s * 0.3 * g.vshift : 0;
        c.strokeText(ch, ox, oy);
      });
      ctx.restore();
    }));
  },
});

treat('sticker', {
  name: 'シール縁', tags: ['pop', 'graphic', 'emotional'], w: 1, safe: true,
  plan: rng => ({ k: rng.range(0.14, 0.2) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, ref = tRef(env, it), sc = env.sc;
    // 縁の色: 文字とも背景とも差が出る色を scheme から選ぶ
    const cands = ['#ffffff', L.mix(sc.bg, '#000000', 0.6), sc.accent, sc.accent2, L.mix(sc.accent, '#000000', 0.35), L.mix(sc.accent2, '#000000', 0.35), L.mix(sc.accent, '#ffffff', 0.5)];
    let best = cands[0], bs = -1;
    for (const c of cands) { const v = Math.min(L.contrast(c, it.color) * 1.15, L.contrast(c, ref)); if (v > bs) { bs = v; best = c; } }
    it.stroke = s * (P.k || 0.16);
    it.strokeColor = best;
    it.strokeUnder = true; it.ghostStroke = false;
    it.shadow = { color: 'rgba(0,0,0,0.28)', blur: 0, dx: s * 0.02, dy: s * 0.045 };
  },
});

treat('dashLine', {
  name: '点線輪郭', tags: ['calm', 'editorial', 'cyber'], w: 0.5,
  plan: rng => ({ d: rng.range(0.05, 0.08) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, d = P.d || 0.065;
    it.stroke = Math.max(1, s * 0.04); it.strokeColor = it.color; it.strokeUnder = false; it.ghostStroke = false;
    it.strokeDash = [s * d, s * d * 0.75];
    it.fillAlpha = 0.22;
  },
});

/* ================================================================ treat: 影・立体 (4) */
treat('hardShadow', {
  name: 'ずらし影', tags: ['pop', 'graphic', 'glitch'], w: 1,
  plan: rng => ({ ang: rng.pick([45, 135, 30, 60]), d: rng.range(0.05, 0.08), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, a = (P.ang || 45) * L.DEG, d = s * (P.d || 0.065);
    it.shadow = { color: tAcc(env, it, P.alt, 1.8), blur: 0, dx: Math.cos(a) * d, dy: Math.sin(a) * d };
  },
});

treat('longShadow', {
  name: '長い影', tags: ['pop', 'graphic', 'dark'], w: 0.7,
  plan: rng => ({ ang: rng.pick([35, 45, 55, 135]) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, a = (P.ang || 45) * L.DEG, st = s * 0.032;
    const sc = env.sc;
    const col = sc.dark ? L.mix(sc.bg, sc.accent, 0.4) : L.mix(sc.bg, '#000000', 0.28);
    it.extrude = { n: 13, dx: Math.cos(a) * st, dy: Math.sin(a) * st, color: col, fade: true, a: 0.95 };
  },
});

treat('extrude3d', {
  name: '立体', tags: ['pop', 'graphic'], w: 0.9,
  plan: rng => ({ side: rng.sign(), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, side = P.side || 1;
    const base = tAcc(env, it, P.alt, 1.5);
    it.extrude = { n: 9, dx: s * 0.012 * side, dy: s * 0.018, color: L.mix(base, '#000000', isLight(it.color) ? 0.35 : 0.1), fade: false };
    it.stroke = Math.max(1, s * 0.018); it.strokeColor = L.mix(base, '#000000', 0.5); it.strokeUnder = true; it.ghostStroke = false;
  },
});

treat('glowShadow', {
  name: '発光影', tags: ['emotional', 'calm', 'cyber', 'dark'], w: 0.9, safe: true,
  plan: rng => ({ alt: rng.chance(0.35), b: rng.range(0.3, 0.5) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const c = P.alt ? env.sc.accent2 : env.sc.accent;
    it.shadow = { color: L.rgba(c, env.sc.dark ? 0.95 : 0.8), blur: it.size * (P.b || 0.4), dx: 0, dy: 0 };
  },
});

/* ================================================================ treat: 塗り (5) */
treat('gradAccent', {
  name: '二色グラデ', tags: ['pop', 'emotional', 'cyber'], w: 1,
  plan: rng => ({ mode: rng.int(0, 2), flip: rng.chance(0.5) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const a1 = tAcc(env, it, false, 3), a2 = tAcc(env, it, true, 3);
    const mode = P.mode | 0;
    let g = mode === 0 ? [a1, a2] : mode === 1 ? [it.color, a1] : [a1, it.color, a2];
    if (P.flip) g = g.slice().reverse();
    it.gradient = g;
  },
});

treat('chrome', {
  name: 'クローム', tags: ['pop', 'graphic', 'cyber'], w: 0.7,
  apply(env, it) {
    if (skipT(it)) return;
    const c = it.color, sc = env.sc, ac = sc.accent;
    if (isLight(c)) {
      it.gradient = [[0, '#ffffff'], [0.46, L.mix(c, ac, 0.28)], [0.5, L.mix(ac, '#000000', 0.45)], [0.54, L.mix(c, ac, 0.45)], [1, '#ffffff']];
      it.stroke = Math.max(1, it.size * 0.03); it.strokeColor = L.mix(sc.bg, '#000000', 0.5); it.strokeUnder = true; it.ghostStroke = false;
    } else {
      it.gradient = [[0, L.mix(c, '#ffffff', 0.5)], [0.44, L.mix(c, '#ffffff', 0.12)], [0.5, L.mix(ac, '#000000', 0.6)], [0.53, c], [1, L.mix(c, ac, 0.4)]];
      it.stroke = Math.max(1, it.size * 0.025); it.strokeColor = '#ffffff'; it.strokeUnder = true; it.ghostStroke = false;
    }
  },
});

treat('patternFill', {
  name: '柄塗り', tags: ['pop', 'graphic', 'editorial'], w: 0.7,
  plan: rng => ({ kind: rng.pick(['dots', 'stripes', 'hatch', 'lines']) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    it.pattern = P.kind || 'stripes';
    it.patternColor = it.color;
    it.patternBg = L.rgba(it.color, 0.3);
    it.stroke = Math.max(1, it.size * 0.03); it.strokeColor = it.color; it.strokeUnder = false; it.ghostStroke = false;
  },
});

treat('duotone', {
  name: '上下二色', tags: ['pop', 'graphic'], w: 0.8,
  plan: rng => ({ at: rng.range(0.5, 0.58), top: rng.chance(0.4), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const a = tAcc(env, it, P.alt, 3), at = P.at || 0.54;
    const c1 = P.top ? a : it.color, c2 = P.top ? it.color : a;
    it.gradient = [[0, c1], [at, c1], [at + 0.001, c2], [1, c2]];
  },
});

treat('cutout', {
  name: '抜き文字', tags: ['graphic', 'editorial', 'pop'], w: 0.7,
  apply(env, it) {
    if (skipT(it)) return;
    const s = it.size, ref = tRef(env, it), c = it.color;
    it.stroke = Math.max(1, s * 0.045); it.strokeColor = c; it.strokeUnder = false; it.ghostStroke = false;
    it.extrude = { n: 4, dx: s * 0.016, dy: s * 0.016, color: c, fade: false, a: 0.85 };
    it.charFns.push(() => ({ color: ref }));
  },
});

/* ================================================================ treat: マーク (6) */
treat('markerBg', {
  name: 'マーカー', tags: ['pop', 'editorial', 'emotional'], w: 1,
  plan: rng => ({ mode: rng.int(0, 2), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, ref = tRef(env, it), col = L.hex(P.alt ? env.sc.accent2 : env.sc.accent);
    // 文字との差が保てるまで濃さを下げる
    let a = P.mode === 1 ? 0.4 : 0.6;
    while (a > 0.15 && L.contrast(it.color, L.mix(ref, col, a)) < 3.2) a -= 0.05;
    const mode = P.mode | 0, vert = !!it.vertical;
    chain(it, 'pre', guard('treat:markerBg:pre', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const ctx = env2.ctx;
      ctx.save(); ctx.fillStyle = col;
      for (const b of lineBoxes(m)) {
        const q = sweep(env2, 0.06 + b.line * 0.12, 0.42); if (q <= 0) continue;
        ctx.globalAlpha = clamp(a * itA(it2));
        ctx.beginPath();
        if (!vert) {
          const x0 = b.x0 - s * 0.1, x1 = L.lerp(x0, b.x1 + s * 0.1, q), cy = (b.y0 + b.y1) / 2;
          const y0 = mode === 1 ? cy - s * 0.52 : mode === 2 ? cy + s * 0.22 : cy - s * 0.02, y1 = mode === 2 ? cy + s * 0.5 : cy + s * 0.5;
          const sk = s * 0.08;
          ctx.moveTo(x0 + sk, y0); ctx.lineTo(x1 + sk, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
        } else {
          const y0 = b.y0 - s * 0.1, y1 = L.lerp(y0, b.y1 + s * 0.1, q), cx = (b.x0 + b.x1) / 2;
          const x0 = mode === 1 ? cx - s * 0.52 : cx - s * 0.02, x1 = cx + s * 0.5;
          ctx.rect(x0, y0, x1 - x0, y1 - y0);
        }
        ctx.fill();
      }
      ctx.restore();
    }));
  },
});

treat('underBar', {
  name: '下線', tags: ['editorial', 'calm', 'graphic'], w: 0.9,
  plan: rng => ({ mode: rng.int(0, 2), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, col = tAcc(env, it, P.alt, 2.5), mode = P.mode | 0, vert = !!it.vertical;
    chain(it, 'post', guard('treat:underBar:post', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const ctx = env2.ctx;
      ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round';
      for (const b of lineBoxes(m)) {
        const q = sweep(env2, 0.15 + b.line * 0.12, 0.45); if (q <= 0) continue;
        ctx.globalAlpha = clamp(0.95 * itA(it2));
        const t0 = vert ? b.y0 - s * 0.05 : b.x0 - s * 0.05, t1 = L.lerp(t0, (vert ? b.y1 : b.x1) + s * 0.05, q);
        const base = vert ? b.x1 + s * 0.12 : b.y1 + s * 0.06;
        const P2 = (t, o) => (vert ? [base + o, t] : [t, base + o]);
        ctx.beginPath();
        if (mode === 2) {                                  // 波線
          ctx.lineWidth = s * 0.045;
          const N = Math.min(80, Math.max(8, Math.floor((t1 - t0) / (s * 0.08))));
          for (let i = 0; i <= N; i++) { const t = L.lerp(t0, t1, i / N), p = P2(t, Math.sin(i / N * (t1 - t0) / (s * 0.22) * Math.PI) * s * 0.035); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        } else {
          ctx.lineWidth = mode === 1 ? s * 0.035 : s * 0.065;
          for (const o of mode === 1 ? [-s * 0.03, s * 0.04] : [0]) { const a = P2(t0, o), b2 = P2(t1, o); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); }
        }
        ctx.stroke();
      }
      ctx.restore();
    }));
  },
});

treat('strike', {
  name: '取り消し線', tags: ['glitch', 'editorial', 'emotional', 'dark'], w: 0.5,
  plan: rng => ({ dbl: rng.chance(0.4), tilt: rng.range(-0.08, 0.08) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, col = tAcc(env, it, true, 2.5), vert = !!it.vertical, tilt = P.tilt || 0.05;
    chain(it, 'post', guard('treat:strike:post', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const ctx = env2.ctx;
      ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = s * (P.dbl ? 0.04 : 0.06);
      for (const b of lineBoxes(m)) {
        const q = sweep(env2, 0.35 + b.line * 0.1, 0.3); if (q <= 0) continue;
        ctx.globalAlpha = clamp(0.9 * itA(it2));
        ctx.beginPath();
        for (const o of P.dbl ? [-s * 0.07, s * 0.07] : [0]) {
          if (!vert) {
            const x0 = b.x0 - s * 0.12, x1 = L.lerp(x0, b.x1 + s * 0.12, q), cy = (b.y0 + b.y1) / 2 + o, span = b.x1 - b.x0 + s * 0.24;
            ctx.moveTo(x0, cy + span * tilt / 2); ctx.lineTo(x1, cy + span * tilt / 2 - (x1 - x0) * tilt);
          } else {
            const y0 = b.y0 - s * 0.12, y1 = L.lerp(y0, b.y1 + s * 0.12, q), cx = (b.x0 + b.x1) / 2 + o;
            ctx.moveTo(cx, y0); ctx.lineTo(cx - (y1 - y0) * tilt, y1);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }));
  },
});

treat('boxGlyph', {
  name: '箱組', tags: ['graphic', 'editorial', 'pop'], w: 0.7,
  plan: rng => ({ mode: rng.int(0, 1) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, line = it.color, fillc = tAcc(env, it, false, 1.5), mode = P.mode | 0;
    const rk = rankMap(it), cnt = rk.rank.filter(v => v >= 0).length;
    chain(it, 'pre', guard('treat:boxGlyph:pre', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const p = clamp((env2.lt - 0.05) / 0.55);
      eachGlyph(env2, it2, m, null, (c, g, ch, a) => {
        const k = rk.rank[g.i] == null ? 0 : Math.max(0, rk.rank[g.i]);
        const q = E.outBack(L.stagger(p, k, cnt, 0.6)); if (q <= 0.01) return;
        const w = (Math.max(g.w, s * 0.6) + s * 0.06) * q, h = s * 1.06 * q;
        c.globalAlpha = clamp(a * itA(it2));
        if (mode === 1 && k % 2 === 0) { c.globalAlpha = clamp(a * itA(it2) * 0.28); c.fillStyle = fillc; c.fillRect(-w / 2, -h / 2, w, h); c.globalAlpha = clamp(a * itA(it2)); }
        c.strokeStyle = L.rgba(line, 0.6); c.lineWidth = Math.max(1, s * 0.035);
        c.strokeRect(-w / 2, -h / 2, w, h);
      });
    }));
  },
});

treat('ringGlyph', {
  name: '丸囲み', tags: ['pop', 'graphic'], w: 0.6,
  plan: rng => ({ fill: rng.chance(0.4), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, col = tAcc(env, it, P.alt, 2);
    const rk = rankMap(it), cnt = rk.rank.filter(v => v >= 0).length;
    const own = () => ({ s: 0.74 });
    it.charFns.push(own);
    chain(it, 'pre', guard('treat:ringGlyph:pre', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const p = clamp((env2.lt - 0.05) / 0.55);
      eachGlyph(env2, it2, m, own, (c, g, ch, a) => {
        const k = Math.max(0, rk.rank[g.i] || 0);
        const q = E.outBack(L.stagger(p, k, cnt, 0.6)); if (q <= 0.01) return;
        const r = s * 0.54 * q;
        c.beginPath(); c.arc(0, 0, r, 0, TAU);
        if (P.fill) { c.globalAlpha = clamp(a * itA(it2) * 0.22); c.fillStyle = col; c.fill(); }
        c.globalAlpha = clamp(a * itA(it2) * 0.95); c.strokeStyle = col; c.lineWidth = Math.max(1, s * 0.045); c.stroke();
      });
    }));
  },
});

treat('cornerQuote', {
  name: 'かぎ括弧', tags: ['editorial', 'emotional', 'calm'], w: 0.7,
  plan: rng => ({ alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, col = tAcc(env, it, P.alt, 2.5), vert = !!it.vertical;
    chain(it, 'post', guard('treat:cornerQuote:post', (env2, it2, m) => {
      if (env2.pass !== 'main') return;
      const q = sweep(env2, 0.1, 0.45); if (q <= 0) return;
      const ctx = env2.ctx, hw = m.w / 2 + s * 0.18, hh = m.h / 2 + s * 0.12, arm = Math.min(s * 0.55, Math.max(hw, hh)) * q;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = s * 0.07; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      ctx.globalAlpha = clamp(itA(it2));
      ctx.beginPath();
      if (!vert) {       // 「 左上、」 右下
        ctx.moveTo(-hw, -hh + arm); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw + arm * 0.8, -hh);
        ctx.moveTo(hw, hh - arm); ctx.lineTo(hw, hh); ctx.lineTo(hw - arm * 0.8, hh);
      } else {           // 縦書き: 右上 と 左下
        ctx.moveTo(hw - arm, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh + arm * 0.8);
        ctx.moveTo(-hw + arm, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh - arm * 0.8);
      }
      ctx.stroke(); ctx.restore();
    }));
  },
});

/* ================================================================ treat: 字ごとのリズム (4) */
treat('altColor', {
  name: '交互色', tags: ['pop', 'graphic'], w: 0.9,
  plan: rng => ({ mode: rng.int(0, 1), alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const col = tAcc(env, it, P.alt, 3), rk = rankMap(it);
    const kan = rk.gs.filter(c => L.isKanji(c) || L.isKata(c)).length, nn = rk.rank.filter(v => v >= 0).length;
    const byScript = (P.mode | 0) === 1 && kan > 0 && kan < nn;
    it.charFns.push((i, g) => {
      const k = rk.rank[i]; if (k == null || k < 0) return null;
      const hitc = nn <= 1 ? true : byScript ? (L.isKanji(g.ch) || L.isKata(g.ch)) : k % 2 === 1;
      return hitc ? { color: col } : null;
    });
  },
});

treat('emphGlyph', {
  name: '強調字', tags: ['pop', 'emotional', 'graphic'], w: 0.9,
  plan: rng => ({ alt: rng.chance(0.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const col = tAcc(env, it, P.alt, 3), cut = env.cut || {}, rk = rankMap(it);
    const itNS = []; rk.gs.forEach((c, i) => { if (!L.isSpace(c)) itNS.push({ ch: c, i }); });
    let pick = new Set();
    const ei = cut.emphIdx || [];
    if (ei.length) {
      const ctNS = []; L.glyphs(cut.text || '').forEach((c, i) => { if (!L.isSpace(c)) ctNS.push({ ch: c, i }); });
      const es = new Set(ei);
      for (let o = 0; o + itNS.length <= ctNS.length; o++) {
        let ok = true;
        for (let j = 0; j < itNS.length && ok; j++) if (ctNS[o + j].ch !== itNS[j].ch) ok = false;
        if (ok) { itNS.forEach((g, j) => { if (es.has(ctNS[o + j].i)) pick.add(g.i); }); break; }
      }
    }
    if (!pick.size) {                                   // 記法が無ければ字種で選ぶ
      const kan = itNS.filter(g => L.isKanji(g.ch)), kat = itNS.filter(g => L.isKata(g.ch));
      const src = kan.length && kan.length < itNS.length ? kan : kat.length && kat.length < itNS.length ? kat : null;
      if (src) src.slice(0, 4).forEach(g => pick.add(g.i));
      else if (L.hasLatinWords(it.text)) {             // 欧文は最初の語(改行も語の区切り)
        let li = 0;
        for (const ch of L.glyphs(it.text)) { if (ch === '\n') break; if (L.isSpace(ch)) break; pick.add(li); li++; }
      } else if (itNS.length > 1) { const mid = Math.floor(itNS.length / 2); pick.add(itNS[mid].i); if (itNS[mid - 1]) pick.add(itNS[mid - 1].i); }
    }
    if (itNS.length === 1) { it.charFns.push(() => ({ color: col })); return; }
    if (!pick.size || pick.size >= itNS.length) return;
    // 大きくした字の分だけ行内の字を押し広げる(重なり防止)。行ごとに中央を保つ
    const S = 1.2, m = L.measure(it), vert = !!it.vertical, shift = new Map(), tot = new Map();
    for (const g of m.lay) {
      const acc0 = tot.get(g.line) || 0, grow = pick.has(g.i) ? (S - 1) * (vert ? it.size : g.w) : 0;
      shift.set(g.i, acc0 + grow / 2);
      tot.set(g.line, acc0 + grow);
    }
    const up = it.size * 0.04;
    it.charFns.push((i, g) => {
      const o = (shift.get(i) || 0) - (tot.get(g.line) || 0) / 2;
      const r = vert ? { dy: o } : { dx: o };
      if (pick.has(i)) { r.color = col; r.s = S; if (vert) r.dx = up; else r.dy = (r.dy || 0) - up; }
      return r;
    });
  },
});

treat('jitter', {
  name: '手組み', tags: ['pop', 'emotional', 'glitch'], w: 0.8, safe: true,
  plan: rng => ({ k: rng.range(0.9, 1.4) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const sd = (env.cut && env.cut.seed) || 1, s = it.size, k = P.k || 1.1;
    it.charFns.push(i => ({ rot: L.rs(sd, 'jr', i) * 0.1 * k, dy: L.rs(sd, 'jy', i) * s * 0.045 * k, dx: L.rs(sd, 'jx', i) * s * 0.02 * k, s: 1 + L.rs(sd, 'js', i) * 0.06 * k }));
  },
});

treat('baseWave', {
  name: '波打ち', tags: ['pop', 'emotional', 'calm'], w: 0.8, safe: true,
  plan: rng => ({ f: rng.range(0.7, 1.1), ph: rng.range(0, 6.28), a: rng.range(0.07, 0.1) }),
  apply(env, it, P) {
    if (skipT(it)) return;
    const s = it.size, f = P.f || 0.9, ph = P.ph || 0, amp = P.a || 0.08, vert = !!it.vertical;
    it.charFns.push(i => {
      const v = Math.sin(i * f + ph) * s * amp, slope = Math.cos(i * f + ph) * f * amp * 0.9;
      return vert ? { dx: v, rot: -slope } : { dy: v, rot: slope };
    });
  },
});
})();
