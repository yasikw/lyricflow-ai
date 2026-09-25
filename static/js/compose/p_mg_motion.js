/* LyricFlow 演出パック: p_mg_motion — MGの動き・つなぎ・カメラ
   契約: docs/COMPOSE_PACKS.md  (group: enter+exit+trans+cam)  共通ヘルパー: L.mg (p_motion_graphics.js)
   モーショングラフィックス vol.2: 正確なイージング・マスク・スナップで、拍に乗るキレのある動き。
   登場は p=1 で静止状態と同一、退場は p=0 で静止状態と同一。乱数は cut.seed・字番号・step キーの決定論のみ。実装はLyricFlow独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_mg_motion';
const clamp = L.clamp, lerp = L.lerp, sm = L.smooth, TAU = L.TAU, PI = Math.PI;
const MONO = M.MONO;

/* ================================================================ helpers */
const mulA = (it, k) => { it.alpha = (it.alpha == null ? 1 : it.alpha) * clamp(k); };
const tz = v => (v && Math.abs(v) >= 0.5 ? v : 0);
/* 字ごとの関数。終端付近の微小なずれは0に丸める(p=1直前の1px跳ねを防ぐ) */
const fn = (it, f) => {
  (it.charFns || (it.charFns = [])).push((i, g, n) => {
    const r = f(i, g, n);
    if (!r) return r;
    if (r.dx) r.dx = tz(r.dx);
    if (r.dy) r.dy = tz(r.dy);
    if (r.rot && Math.abs(r.rot) < 0.0035) r.rot = 0;
    if (r.s != null && Math.abs(r.s - 1) < 0.003) r.s = 1;
    return r;
  });
};
const chain = (it, key, f) => { const o = it[key]; it[key] = o ? (e, i, m) => { o(e, i, m); f(e, i, m); } : f; };
const sd = (env, c) => ((env.cut && env.cut.seed) || 0) + ((c && c.mi) || 0) * 7919;
const SZ = it => Math.max(1, it.size || 40);
const meas = it => it._m || L.measure(it);
const isMain = e => e.pass === 'main';
const ia = it => clamp(it.alpha == null ? 1 : it.alpha);
const baseCol = (env, it) => it.color || env.sc.fg;
const nonSpace = m => m.lay.filter(g => !g.space);
/* 色ずれゴースト(遅れて描かれる)を退場の途中で消す: マスクで消える退場の外側にゴーストだけ残らないように */
const ghostFade = (env, it, p, a = 0.1, b = 0.45) => { if (!isMain(env)) mulA(it, 1 - sm(a, b, p)); };
/* 軸に沿った字ごとのクリップ。dir=+1: 座標 < edge だけ表示 / -1: 座標 > edge だけ表示。縦書きは y 軸(90°回転字は x で切る) */
const axisClip = (g, it, vert, edge, dir) => {
  const c = vert ? g.y : g.x;
  const unit = vert ? (g.vrot ? g.w : SZ(it)) : g.w;
  const f = (edge - c) / Math.max(1e-3, unit), lim = 0.85;
  const useY = vert && !g.vrot;
  if (dir > 0) {
    if (f <= -lim) return { hide: true };
    if (f >= lim) return null;
    return useY ? { clipY: [-3, f] } : { clipX: [-3, f] };
  }
  if (f >= lim) return { hide: true };
  if (f <= -lim) return null;
  return useY ? { clipY: [f, 3] } : { clipX: [f, 3] };
};
/* 項目ローカルの矩形 [x0,x1]×[y0,y1] の内側だけ見せる字ごとのクリップ(90°回転字にも対応) */
const boxClip = (g, it, x0, x1, y0, y1) => {
  const s = SZ(it), ax0 = x0 - g.x, ax1 = x1 - g.x, ay0 = y0 - g.y, ay1 = y1 - g.y;
  if (ax1 <= -g.w * 0.8 || ax0 >= g.w * 0.8 || ay1 <= -s * 0.8 || ay0 >= s * 0.8) return { hide: true };
  if (g.vrot) return { clipX: [ay0 / g.w, ay1 / g.w], clipY: [-ax1 / s, -ax0 / s] };
  return { clipX: [ax0 / g.w, ax1 / g.w], clipY: [ay0 / s, ay1 / s] };
};
/* 行(縦書きは列)ごとの範囲 */
const lineSpans = (m, vert) => {
  const out = [];
  for (const g of m.lay) {
    if (g.space) continue;
    const o = out[g.line] || (out[g.line] = { a0: 1e9, a1: -1e9, c: vert ? g.x : g.y, h: vert ? g.w : g.h });
    const c = vert ? g.y : g.x, half = (vert ? g.h : g.w) / 2;
    o.a0 = Math.min(o.a0, c - half); o.a1 = Math.max(o.a1, c + half);
  }
  return out.map((o, i) => o || { a0: 0, a1: 0, c: 0, h: 0, i });
};
/* 図形の内接円の半径(外接1あたり) */
const INNER = { circle: 1, square: 0.86, triangle: 0.52, star: 0.42, hexagon: 0.866, diamond: 0.76 };
const shapePath = (ctx, pts, cx, cy, R, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  pts.forEach(([x, y], i) => { const X = cx + (x * c - y * s) * R, Y = cy + (x * s + y * c) * R; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
  ctx.closePath();
};
/* 字の点をグリッドに吸着(サイズ1あたり)。点配列ごとにキャッシュ */
const gridCache = new WeakMap();
const gridDots = (pts, cell) => {
  let per = gridCache.get(pts);
  if (!per) { per = {}; gridCache.set(pts, per); }
  let g = per[cell];
  if (g) return g;
  const seen = new Set(), dots = [];
  let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
  for (const [x, y] of pts) {
    const gx = Math.round(x / cell), gy = Math.round(y / cell), k = gx * 100003 + gy;
    if (seen.has(k)) continue;
    seen.add(k); dots.push([gx, gy]);
    gx0 = Math.min(gx0, gx); gx1 = Math.max(gx1, gx); gy0 = Math.min(gy0, gy); gy1 = Math.max(gy1, gy);
  }
  g = per[cell] = { dots, gx0, gx1, gy0, gy1 };
  return g;
};
/* 輪郭の文字を線で描く(pre/post 内、項目ローカル座標) */
const strokeGlyph = (ctx, it, g) => {
  ctx.save();
  ctx.translate(g.x, g.y);
  if (g.vrot) ctx.rotate(PI / 2);
  const ox = g.vshift ? it.size * 0.3 * g.vshift : 0, oy = g.vshift ? -it.size * 0.3 * g.vshift : 0;
  ctx.strokeText(g.ch, ox, oy);
  ctx.restore();
};
const regE = (key, def) => L.register('enter', key, def, P);
const regX = (key, def) => L.register('exit', key, def, P);

/* ================================================================ enter */

/* 1. 行ごとの二色バーが斜めに走り、抜けた後ろから字が滑り出る */
regE('mgBarReveal', {
  name: '二色バー開示', tags: ['graphic', 'editorial', 'pop', 'cyber'], w: 1.1,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, s = SZ(it), sc = env.sc;
    const spans = lineSpans(m, vert), nl = Math.max(1, spans.length);
    const st = spans.map((sp, li) => {
      const q = L.stagger(p, li, nl, 0.35);
      const a0 = sp.a0 - s * 0.12, a1 = sp.a1 + s * 0.12;
      const a = E.inOutExpo(clamp(q / 0.55)), b = E.inOutExpo(clamp((q - 0.42) / 0.58));
      return { lead: lerp(a0, a1, a), trail: lerp(a0, a1, b), q };
    });
    fn(it, (i, g) => {
      const o = st[g.line];
      if (!o || o.q >= 1) return null;
      const r = axisClip(g, it, vert, o.trail, 1);
      if (r && r.hide) return r;
      const c = vert ? g.y : g.x;
      const k = E.outCubic(clamp((o.trail - c) / (s * 1.6) + 0.5));
      const off = -s * 0.3 * (1 - k);
      return Object.assign(r || {}, vert ? { dy: off } : { dx: off });
    });
    chain(it, 'post', (e2, it2, m2) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx;
      ctx.save();
      ctx.globalAlpha = ia(it2);
      spans.forEach((sp, li) => {
        const o = st[li];
        if (o.lead - o.trail < 0.5) return;
        const hh = sp.h * 0.56, sk = hh * 0.45;
        const quad = (u0, u1, col) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          if (vert) { ctx.moveTo(sp.c - hh, u0 + sk); ctx.lineTo(sp.c + hh, u0); ctx.lineTo(sp.c + hh, u1); ctx.lineTo(sp.c - hh, u1 + sk); }
          else { ctx.moveTo(u0 + sk, sp.c - hh); ctx.lineTo(u1 + sk, sp.c - hh); ctx.lineTo(u1, sp.c + hh); ctx.lineTo(u0, sp.c + hh); }
          ctx.closePath(); ctx.fill();
        };
        quad(o.trail, o.lead, sc.accent);
        const w2 = Math.min(o.lead - o.trail, s * 0.14);
        quad(o.lead - w2, o.lead, sc.accent2);
      });
      ctx.restore();
    });
  },
});

/* 2. 字ごとに朱の線で描き起こし → 塗りが朱で一瞬光って本来の色へ */
regE('mgStrokeFlash', {
  name: '線描き→閃光塗り', tags: ['graphic', 'editorial', 'cyber', 'pop'], w: 1,
  apply(env, it, p) {
    const acc = env.sc.accent, base = baseCol(env, it);
    const cut = 0.55;
    if (p < cut) {
      const q = p / cut;
      it.dash = E.inOutSine(q);
      it.stroke = 0;
      fn(it, (i, g, n) => ({ outline: true, color: acc, a: sm(0, 0.04, L.stagger(q, i, n, 0.4)) }));
      return;
    }
    const q = (p - cut) / (1 - cut);
    fn(it, (i, g, n) => {
      const k = L.stagger(q, i, n, 0.55, 'lr');
      if (k >= 0.999) return null;
      if (k <= 0) return { outline: true, color: acc };
      return { color: L.mix(acc, base, E.inOutCubic(k)), s: 1 + 0.12 * Math.sin(PI * k) };
    });
  },
});

/* 3. 字ごとの3Dカード: 朱の裏面が現れて回り、表の字で着地 */
regE('mgCardFlip', {
  name: '3Dカード反転', tags: ['graphic', 'pop', 'cyber'], w: 0.9,
  apply(env, it, p) {
    const acc = env.sc.accent, acc2 = env.sc.accent2, s = SZ(it);
    const th = k => PI * (1 - E.inOutCubic(k)) - 0.3 * Math.sin(PI * sm(0.62, 1, k));
    fn(it, (i, g, n) => {
      const k = L.stagger(p, i, n, 0.5, 'lr');
      if (k >= 1) return null;
      const t = th(k), c = Math.cos(t);
      if (c <= 0.02) return { hide: true };
      return { sx: c, sy: 1 + 0.12 * Math.abs(Math.sin(t)) };
    });
    chain(it, 'pre', (e2, it2, m) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, n = m.lay.length;
      ctx.save();
      ctx.globalAlpha = ia(it2);
      for (const g of m.lay) {
        if (g.space) continue;
        const k = L.stagger(p, g.i, n, 0.5, 'lr');
        if (k <= 0 || k >= 1) continue;
        const t = th(k), c = Math.cos(t);
        if (c > -0.02) continue;
        const grow = E.outCubic(clamp(k / 0.2));
        const w = g.w * 0.94 * -c, h = s * 1.02 * (1 + 0.12 * Math.abs(Math.sin(t))) * grow;
        ctx.fillStyle = acc; ctx.fillRect(g.x - w / 2, g.y - h / 2, w, h);
        ctx.fillStyle = acc2; ctx.fillRect(g.x - w / 2, g.y + h * 0.3, w, h * 0.12);
      }
      ctx.restore();
    });
  },
});

/* 4. 磁力スナップ: 字が四方から吸い寄せられ(加速)、着点で小さく行き過ぎて止まる。引き線と着点マーク付き */
regE('mgMagnetSnap', {
  name: '磁力スナップ', tags: ['graphic', 'cyber', 'pop'], w: 1, maxChars: 24,
  apply(env, it, p, c) {
    const seed = sd(env, c), s = SZ(it), acc = env.sc.accent;
    const off = i => { const a = L.r(seed, 'mga', i) * TAU, d = s * (1.4 + 1.8 * L.r(seed, 'mgd', i)); return [Math.cos(a) * d, Math.sin(a) * d]; };
    const pos = (k, o) => {
      if (k < 0.7) { const f = 1 - E.inCubic(k / 0.7); return [o[0] * f, o[1] * f, -1]; }
      const u = (k - 0.7) / 0.3, len = Math.hypot(o[0], o[1]) || 1;
      const b = -Math.sin(u * TAU) * (1 - u) * s * 0.1;
      return [o[0] / len * b, o[1] / len * b, u];
    };
    const kOf = (i, n) => L.stagger(p, i, n, 0.55, 'random', seed);
    fn(it, (i, g, n) => {
      const k = kOf(i, n);
      if (k >= 1) return null;
      if (k <= 0) return { hide: true };
      const [x, y, u] = pos(k, off(i));
      return { dx: x, dy: y, a: sm(0, 0.18, k), s: u >= 0 ? 1 - 0.14 * Math.sin(PI * u) * (1 - u) : 1 };
    });
    chain(it, 'post', (e2, it2, m) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, n = m.lay.length, lw = Math.max(1, s * 0.022);
      ctx.save();
      ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.lineWidth = lw;
      for (const g of m.lay) {
        if (g.space) continue;
        const k = kOf(g.i, n);
        if (k <= 0 || k >= 1) continue;
        const [x, y, u] = pos(k, off(g.i));
        if (u < 0) {
          const a = ia(it2) * 0.75 * sm(0, 0.18, k) * (1 - k / 0.7);
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.moveTo(g.x + x, g.y + y); ctx.lineTo(g.x, g.y); ctx.stroke();
          const t = s * 0.07;
          ctx.fillRect(g.x - t / 2, g.y - t / 2, t, t);
        } else {
          ctx.globalAlpha = ia(it2) * 0.6 * (1 - u);
          ctx.beginPath(); ctx.arc(g.x, g.y, s * (0.25 + 0.35 * u), 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    });
  },
});

/* 5. ゴム伸び: 先頭を留めたまま一気に伸び(行き過ぎ)、ゴムのように縮んで着地。下にゴム紐の線 */
regE('mgRubberSnap', {
  name: 'ゴム紐スナップ', tags: ['pop', 'graphic'], w: 0.9,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent;
    // 行き過ぎは画面端を越えない量に(先頭側を留めるので、反対側の余白で決まる)
    const len0 = (vert ? m.h * Math.abs(it.sy == null ? 1 : it.sy) : m.w * Math.abs(it.sx == null ? 1 : it.sx)) || 1;
    const room = vert ? env.H * 0.98 - (it.y - len0 / 2) : env.W * 0.98 - (it.x - len0 / 2);
    const ov = clamp(room / len0 - 1, 0.04, 0.22);
    const S = p < 0.36 ? (1 + ov) * E.outExpo(p / 0.36) : 1 + ov * (1 - E.outElastic((p - 0.36) / 0.64));
    const cross = clamp(1 / Math.sqrt(Math.max(S, 0.05)), 0.75, 1.3);
    mulA(it, sm(0, 0.06, p));
    if (vert) {
      const sy0 = it.sy == null ? 1 : it.sy;
      it.sy = sy0 * Math.max(1e-3, S); it.sx = (it.sx == null ? 1 : it.sx) * cross;
      it.y += tz((S - 1) * m.h * sy0 / 2);
    } else {
      const sx0 = it.sx == null ? 1 : it.sx;
      it.sx = sx0 * Math.max(1e-3, S); it.sy = (it.sy == null ? 1 : it.sy) * cross;
      it.x += tz((S - 1) * m.w * sx0 / 2);
    }
    const la = 1 - sm(0.45, 0.9, p);
    chain(it, 'post', (e2, it2, m2) => {
      if (!isMain(e2) || la <= 0.002) return;
      const ctx = e2.ctx, th = s * 0.05 / cross, gap = s * 0.12;
      ctx.save(); ctx.globalAlpha = ia(it2) * la; ctx.fillStyle = acc;
      if (vert) ctx.fillRect(m2.w / 2 + gap / cross, -m2.h / 2, th, m2.h);
      else ctx.fillRect(-m2.w / 2, m2.h / 2 + gap / cross, m2.w, th);
      ctx.restore();
    });
  },
});

/* 6. スプリットフラップ: 札が何度もめくれて(字が入れ替わり)最後に正しい字で止まる */
const POOL_L = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const POOL_K = 'アカサタナハマヤラワイキシチニヒミリウクスツヌフムユルエケセテネヘメレオコソトノホモヨロ';
regE('mgSplitFlap', {
  name: 'フラップ表示板', tags: ['editorial', 'cyber', 'graphic'], w: 0.9,
  apply(env, it, p, c) {
    const seed = sd(env, c), s = SZ(it), sc = env.sc, base = baseCol(env, it);
    const kOf = (i, n) => L.stagger(p, i, n, 0.6, 'lr');
    fn(it, (i, g, n) => {
      const k = kOf(i, n);
      if (k >= 1) return null;
      const F = 3 + (L.h(seed, 'ff', i) % 3);
      const fk = k * F, idx = Math.floor(fk), f = fk - idx;
      const pool = L.isLatin(g.ch) ? POOL_L : L.isPunct(g.ch) ? null : POOL_K;
      const pick = j => (j >= F || !pool ? g.ch : pool[L.h(seed, 'fc', i, j) % pool.length]);
      const j = f < 0.5 ? idx : idx + 1;
      return { ch: pick(j), sy: Math.max(0.04, Math.abs(Math.cos(PI * f))), a: sm(0, 0.1, k), dy: (f < 0.5 ? -1 : 1) * s * 0.04 * Math.sin(PI * f) };
    });
    const tileA = 1 - sm(0.55, 1, p);
    chain(it, 'pre', (e2, it2, m) => {
      if (!isMain(e2) || tileA <= 0.002) return;
      const ctx = e2.ctx, n = m.lay.length;
      ctx.save();
      for (const g of m.lay) {
        if (g.space) continue;
        const a = ia(it2) * tileA * sm(0, 0.1, kOf(g.i, n));
        if (a <= 0.002) continue;
        const w = g.w * 1.02, h = s * 1.12;
        ctx.globalAlpha = a * 0.16; ctx.fillStyle = base; ctx.fillRect(g.x - w / 2 + s * 0.02, g.y - h / 2, w - s * 0.04, h);
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = sc.accent; ctx.fillRect(g.x - w / 2 + s * 0.02, g.y - s * 0.012, w - s * 0.04, s * 0.024);
      }
      ctx.restore();
    });
  },
});

/* 7. 横スライスが左右交互から差し込まれる。各スライスは朱/藍の色ブロックを引き連れる */
regE('mgSliceSlide', {
  name: 'スライス差し込み', tags: ['graphic', 'editorial', 'cyber', 'pop'], w: 1,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, s = SZ(it), sc = env.sc;
    const pad = s * 0.6, cross = vert ? m.w : m.h, span = cross + pad * 2;
    const spans = lineSpans(m, vert), nl = Math.max(1, spans.length), per = 3, nB = nl * per;
    // 行(縦書きは列)ごとに3枚。端の帯は余白まで含める
    const cuts = [];
    for (let j = 0; j <= nB; j++) cuts.push(-cross / 2 + cross * j / nB);
    cuts[0] = -span / 2; cuts[nB] = span / 2;
    const scl = Math.abs((vert ? it.sy : it.sx) == null ? 1 : (vert ? it.sy : it.sx)) || 1;
    const dist = (vert ? env.H : env.W) * 0.6 / scl;
    const ks = [], dx = [];
    for (let j = 0; j < nB; j++) { ks[j] = L.stagger(p, j, nB, 0.5, vert ? 'rl' : 'lr'); dx[j] = (j % 2 ? 1 : -1) * dist * (1 - E.outExpo(ks[j])); }
    mulA(it, sm(0, 0.22, p));
    if (dx.every(v => Math.abs(v) < 0.5)) return;
    it.bands = [];
    for (let j = 0; j < nB; j++) { const b = [(cuts[j] + span / 2) / span, (cuts[j + 1] + span / 2) / span, dx[j]]; if (vert) b.vertical = true; it.bands.push(b); }
    let calls = 0;
    chain(it, 'pre', (e2, it2) => {
      if (!it2.bands) return;
      const j = calls++ % nB;
      if (!isMain(e2)) return;
      const bw = s * 1.3 * (1 - E.outCubic(ks[j]));
      if (bw < 0.5) return;
      const li = vert ? nl - 1 - Math.floor(j / per) : Math.floor(j / per), sp = spans[li] || { a0: -s / 2, a1: s / 2 };
      const c0 = Math.max(cuts[j], -cross / 2), c1 = Math.min(cuts[j + 1], cross / 2);
      if (c1 - c0 < 0.5) return;
      const d = j % 2 ? 1 : -1, gap = s * 0.08;
      const u0 = d > 0 ? sp.a0 - gap - bw : sp.a1 + gap;       // 進む側の先頭に色ブロック
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = j % 2 ? sc.accent : sc.accent2;
      if (vert) ctx.fillRect(c0, u0, c1 - c0, bw); else ctx.fillRect(u0, c0, bw, c1 - c0);
      ctx.restore();
    });
  },
});

/* 8. 下線が走り、その線の下から字が押し上がる。最後に線は右へ抜ける */
regE('mgUnderlinePush', {
  name: '下線から押し上げ', tags: ['editorial', 'graphic', 'calm', 'pop'], w: 1.1,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent;
    const th = Math.max(1.5, s * 0.07);
    const ln = (vert ? m.w : m.h) / 2 + s * 0.14;
    const len = vert ? m.h : m.w;
    const a0 = -len / 2 - s * 0.05, a1 = len / 2 + s * 0.05;
    const le = lerp(a0, a1, E.outExpo(clamp(p / 0.34))), ls = lerp(a0, a1, E.inOutCubic(clamp((p - 0.7) / 0.3)));
    const r = E.outBack(clamp((p - 0.26) / 0.46), 1.4);
    const push = (1 - r) * ((vert ? m.w : m.h) + s * 0.2 + th);
    fn(it, () => (vert ? { dx: push } : { dy: push }));
    if (!it.clipFn) {
      const edge = ln + th / 2;
      it.clipFn = (ctx, e2, it2, m2) => {
        const big = (m2.w + m2.h) * 4 + s * 8;
        if (vert) ctx.rect(-big, -big, big + edge, big * 2); else ctx.rect(-big, -big, big * 2, big + edge);
      };
    }
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || le - ls < 0.5) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = acc;
      if (vert) ctx.fillRect(ln - th / 2, ls, th, le - ls); else ctx.fillRect(ls, ln - th / 2, le - ls, th);
      ctx.restore();
    });
  },
});

/* 9. 先頭の一字が巨大に現れて定位置へ縮み、残りの字が順に続く */
regE('mgZoomLetter', {
  name: '頭文字ズーム', tags: ['graphic', 'pop', 'editorial'], w: 0.9, emph: 1.5,
  apply(env, it, p) {
    const m = meas(it), s = SZ(it), acc = env.sc.accent, base = baseCol(env, it);
    const first = nonSpace(m)[0];
    if (!first) return;
    const K = clamp(Math.max(m.w * 0.55, m.h * 1.6) / s, 2.2, 6);
    const e = E.inOutExpo(clamp((p - 0.06) / 0.56));
    const q = clamp((p - 0.38) / 0.62);
    fn(it, (i, g, n) => {
      if (i === first.i) {
        if (e >= 0.999) return null;
        return { s: lerp(K, 1, e), dx: -g.x * (1 - e), dy: -g.y * (1 - e), a: sm(0, 0.06, p), color: L.mix(acc, base, e) };
      }
      const k = L.stagger(q, i, n, 0.55, 'lr');
      if (k >= 1) return null;
      if (k <= 0) return { hide: true };
      return { a: E.outCubic(k), s: 0.4 + 0.6 * E.outBack(k, 2) };
    });
  },
});

/* 10. 字が数字になって高速カウントし、順に本来の字へ確定する。進捗の%表示つき */
regE('mgCountUp', {
  name: '数字カウント確定', tags: ['cyber', 'editorial', 'graphic'], w: 0.9,
  apply(env, it, p, c) {
    const seed = sd(env, c), s = SZ(it), acc = env.sc.accent, base = baseCol(env, it);
    fn(it, (i, g, n) => {
      const k = L.stagger(p, i, n, 0.6, 'lr');
      if (k >= 1) return null;
      const a = sm(0, 0.08, k);
      if (L.isPunct(g.ch)) return { a: sm(0.5, 1, k) };
      if (k < 0.78) return { ch: String((L.h(seed, 'cd', i) + Math.floor(k * 30)) % 10), a, color: acc };
      const u = (k - 0.78) / 0.22;
      return { s: 1 + 0.2 * (1 - E.outCubic(u)), color: L.mix(acc, base, E.outCubic(u)) };
    });
    const ra = sm(0, 0.08, p) * (1 - sm(0.8, 1, p));
    chain(it, 'post', (e2, it2, m) => {
      if (!isMain(e2) || ra <= 0.002) return;
      const ctx = e2.ctx, fs = Math.max(6, s * 0.2);
      ctx.save(); ctx.globalAlpha = ia(it2) * ra; ctx.fillStyle = acc;
      ctx.font = `700 ${fs.toFixed(1)}px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(String(Math.min(100, Math.round(p * 100))).padStart(3, '0') + '%', m.w / 2, -m.h / 2 - s * 0.06);
      ctx.restore();
    });
  },
});

/* 11. 図形マスク開示: 円・星・ひし形・六角・三角のマスクが回りながら広がる */
const MASKS = ['circle', 'star', 'diamond', 'hexagon', 'triangle'];
regE('mgShapeReveal', {
  name: '図形マスク開示', tags: ['graphic', 'pop', 'emotional'], w: 1,
  apply(env, it, p, c) {
    const seed = sd(env, c), m = meas(it), s = SZ(it), sc = env.sc;
    const kind = MASKS[L.h(seed, 'mask') % MASKS.length], dir = L.h(seed, 'mdir') % 2 ? 1 : -1;
    const pts = M.shapePts(kind, 120);
    const Rmax = Math.hypot(m.w / 2 + s * 0.35, m.h / 2 + s * 0.35) / INNER[kind] * 1.03;
    const e = E.outCubic(clamp(p / 0.8)), R = Rmax * e, rot = dir * (1 - e) * PI * 0.6;
    if (!it.clipFn) it.clipFn = ctx => shapePath(ctx, pts, 0, 0, Math.max(0.01, R), rot);
    else mulA(it, e);
    const oa = 1 - sm(0.3, 0.7, p);
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || oa <= 0.002 || R < 1) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2) * oa; ctx.lineJoin = 'round';
      ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); shapePath(ctx, pts, 0, 0, R * 0.97, rot); ctx.stroke();
      ctx.strokeStyle = sc.accent2; ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath(); shapePath(ctx, pts, 0, 0, R * 0.82, -rot * 1.5); ctx.stroke();
      ctx.restore();
    });
  },
});

/* 12. ドットマトリクス: 字の形のドット(格子に吸着)が列ごとに段階的に落ちて並び、字に置き換わる */
regE('mgDotMatrix', {
  name: 'ドットマトリクス', tags: ['cyber', 'graphic', 'pop'], w: 0.9, maxChars: 18,
  apply(env, it, p, c) {
    const ta = sm(0.78, 1, p);
    fn(it, () => ({ a: ta }));
    const seed = sd(env, c), sc = env.sc, N = env.allowFilter ? 700 : 360;
    const CELL = 0.1;
    chain(it, 'pre', (e2, it2) => {
      if (!isMain(e2) || ta >= 0.999) return;
      const pts = M.glyphPoints(it2, N);
      if (!pts.length) return;
      const G = gridDots(pts, CELL), s = SZ(it2), cs = s * CELL, q0 = cs * 0.78;
      const span = Math.max(1, G.gx1 - G.gx0);
      const ctx = e2.ctx, a0 = ia(it2) * (1 - ta);
      ctx.save();
      for (let i = 0; i < G.dots.length; i++) {
        const [gx, gy] = G.dots[i];
        const d = (gx - G.gx0) / span * 0.32 + L.r(seed, 'dm', gx) * 0.12 + L.r(seed, 'dr', i) * 0.06;
        const q = clamp((p - d) / 0.42);
        if (q <= 0) continue;
        const fall = Math.round((1 - E.outCubic(q)) * (6 + L.r(seed, 'df', gx) * 10));
        ctx.globalAlpha = a0 * sm(0, 0.15, q);
        ctx.fillStyle = (L.h(seed, 'dc', gx, gy) % 11) === 0 ? sc.accent : (it2.color || sc.fg);
        ctx.fillRect(gx * cs - q0 / 2, (gy - fall) * cs - q0 / 2, q0, q0);
      }
      ctx.restore();
    });
  },
});

/* 13. 直角移動: 字が格子の上を「横→縦」の直角経路でスナップ移動して着地。経路のガイド線つき */
regE('mgOrthoRoute', {
  name: '直角ルート着地', tags: ['cyber', 'graphic', 'editorial'], w: 0.9, maxChars: 24,
  apply(env, it, p, c) {
    const seed = sd(env, c), s = SZ(it), acc = env.sc.accent;
    const off = i => [(L.r(seed, 'ox', i) < 0.5 ? -1 : 1) * (1 + Math.floor(L.r(seed, 'oxn', i) * 3)) * s * 1.1,
      (L.r(seed, 'oy', i) < 0.5 ? -1 : 1) * (1 + Math.floor(L.r(seed, 'oyn', i) * 2)) * s];
    const kOf = (i, n) => L.stagger(p, i, n, 0.5, 'random', seed);
    const pos = (k, o) => (k < 0.5 ? [o[0] * (1 - E.inOutExpo(k / 0.5)), o[1]] : [0, o[1] * (1 - E.inOutExpo((k - 0.5) / 0.5))]);
    fn(it, (i, g, n) => {
      const k = kOf(i, n);
      if (k >= 1) return null;
      if (k <= 0) return { hide: true };
      const [x, y] = pos(k, off(i));
      return { dx: x, dy: y, a: sm(0, 0.12, k) };
    });
    chain(it, 'post', (e2, it2, m) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, n = m.lay.length, t = s * 0.07;
      ctx.save();
      ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.setLineDash([s * 0.08, s * 0.06]);
      for (const g of m.lay) {
        if (g.space) continue;
        const k = kOf(g.i, n);
        if (k <= 0 || k >= 1) continue;
        const o = off(g.i), [x, y] = pos(k, o);
        ctx.globalAlpha = ia(it2) * 0.8 * sm(0, 0.12, k) * (1 - sm(0.75, 1, k));
        ctx.beginPath(); ctx.moveTo(g.x + x, g.y + y);
        if (k < 0.5) ctx.lineTo(g.x, g.y + o[1]);
        ctx.lineTo(g.x, g.y); ctx.stroke();
        ctx.fillRect(g.x - t / 2, g.y + o[1] - t / 2, t, t);
        ctx.fillRect(g.x - t / 2, g.y - t / 2, t, t);
      }
      ctx.restore();
    });
  },
});

/* 14. トンボ段階スケール: 3段で拡大スナップ(行き過ぎ付き)。四隅のトンボが枠を追う */
regE('mgCropStep', {
  name: 'トンボ段階スケール', tags: ['editorial', 'graphic', 'cyber'], w: 0.9,
  apply(env, it, p) {
    const m = meas(it), s = SZ(it), acc = env.sc.accent;
    let S = 0, prev = 0;
    for (const [t0, tg] of [[0.06, 0.34], [0.33, 0.67], [0.6, 1]]) {
      const u = clamp((p - t0) / 0.16);
      if (u > 0) S = prev + (tg - prev) * E.outBack(u, 2.2);
      prev = tg;
    }
    fn(it, (i, g) => (S >= 0.999 && S <= 1.001 ? null : S <= 0.005 ? { hide: true } : { s: S, dx: g.x * (S - 1), dy: g.y * (S - 1) }));
    const ma = sm(0, 0.06, p) * (1 - sm(0.78, 0.98, p));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || ma <= 0.002) return;
      const ctx = e2.ctx, hx = m.w / 2 * Math.max(0, S) + s * 0.2, hy = m.h / 2 * Math.max(0, S) + s * 0.2, arm = s * 0.28;
      ctx.save(); ctx.globalAlpha = ia(it2) * ma; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.lineCap = 'square';
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx * hx, y = sy * hy;
        ctx.beginPath(); ctx.moveTo(x - sx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * arm); ctx.stroke();
      }
      ctx.restore();
    });
  },
});

/* ================================================================ exit */

/* 1. 右から色帯が字を覆い、覆い終わると帯は細い線に潰れて消える */
regX('mgBarWipeOut', {
  name: '色帯で覆い潰す', tags: ['graphic', 'editorial', 'pop', 'cyber'], w: 1.1,
  apply(env, it, p) {
    ghostFade(env, it, p);
    const m = meas(it), vert = !!it.vertical, s = SZ(it), sc = env.sc;
    const k = s * 0.14, hi = (vert ? m.h : m.w) / 2 + k, lo = -hi;
    const a = E.inOutCubic(clamp(p / 0.55)), b = E.inOutExpo(clamp((p - 0.5) / 0.5));
    const lead = lerp(hi, lo, a);
    fn(it, (i, g) => axisClip(g, it, vert, lead, 1));
    chain(it, 'post', (e2, it2, m2) => {
      if (!isMain(e2) || hi - lead < 0.3) return;
      const cw = ((vert ? m2.w : m2.h) / 2 + s * 0.1) * (1 - b);
      if (cw < 0.3) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = sc.accent;
      if (vert) ctx.fillRect(-cw, lead, cw * 2, hi - lead); else ctx.fillRect(lead, -cw, hi - lead, cw * 2);
      const w2 = Math.min(hi - lead, s * 0.12);
      ctx.fillStyle = sc.accent2;
      if (vert) ctx.fillRect(-cw, lead, cw * 2, w2); else ctx.fillRect(lead, -cw, w2, cw * 2);
      ctx.restore();
    });
  },
});

/* 2. 上下から畳まれて一本の線になり、線が中央へ縮んで消える */
regX('mgFoldLine', {
  name: '一本線にたたむ', tags: ['graphic', 'editorial', 'calm'], w: 1,
  apply(env, it, p) {
    const vert = !!it.vertical, s = SZ(it), acc = env.sc.accent, base = baseCol(env, it);
    if (!isMain(env)) mulA(it, 1 - sm(0.15, 0.45, p));             // 遅れて描かれる色ずれゴーストが線の上に残らないように
    if (p < 0.5) {
      const q = p / 0.5, F = Math.max(0.03, 1 - E.inBack(q, 1.2));
      if (vert) it.sx = (it.sx == null ? 1 : it.sx) * F; else it.sy = (it.sy == null ? 1 : it.sy) * F;
      const cm = sm(0.1, 0.9, q);
      if (cm > 0.001) fn(it, () => ({ color: L.mix(base, acc, cm) }));
      return;
    }
    const q = (p - 0.5) / 0.5, lenK = 1 - E.inOutExpo(q);
    fn(it, () => ({ hide: true }));
    chain(it, 'post', (e2, it2, m) => {
      if (!isMain(e2) || lenK <= 0.002) return;
      const ctx = e2.ctx, th = Math.max(1.5, s * 0.05);
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = acc;
      if (vert) { const h = m.h * lenK; ctx.fillRect(-th / 2, -h / 2, th, h); }
      else { const w = m.w * lenK; ctx.fillRect(-w / 2, -th / 2, w, th); }
      ctx.restore();
    });
  },
});

/* 3. 一瞬ふくらんでから点へ縮み、朱の点がリングと火花を残して弾ける */
regX('mgDotPop', {
  name: '点に縮んで弾ける', tags: ['pop', 'graphic'], w: 1,
  apply(env, it, p) {
    const s = SZ(it), acc = env.sc.accent, base = baseCol(env, it);
    const q = clamp(p / 0.6), S = Math.max(0, 1 - E.inBack(q, 1.6));
    const cm = sm(0.2, 0.8, q);
    if (!isMain(env)) mulA(it, 1 - sm(0.25, 0.6, q));          // 縮む途中の色ずれゴーストが大きく残らないように
    fn(it, (i, g) => (S <= 0.01 ? { hide: true } : { s: S, dx: g.x * (S - 1), dy: g.y * (S - 1), color: cm > 0.001 ? L.mix(base, acc, cm) : null }));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || p < 0.4) return;
      const ctx = e2.ctx, v = clamp((p - 0.6) / 0.4);
      const rd = s * 0.16 * sm(0.42, 0.58, p) * (1 - E.inCubic(clamp(v / 0.5)));
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = acc; ctx.strokeStyle = acc;
      if (rd > 0.3) { ctx.beginPath(); ctx.arc(0, 0, rd, 0, TAU); ctx.fill(); }
      if (v > 0) {
        const r = s * (0.2 + 1.0 * E.outCubic(v));
        ctx.globalAlpha = ia(it2) * (1 - v);
        ctx.lineWidth = Math.max(1, s * 0.06 * (1 - v));
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.lineWidth = Math.max(1, s * 0.035 * (1 - v));
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * PI / 4 + PI / 8; ctx.moveTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12); ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4); }
        ctx.stroke();
      }
      ctx.restore();
    });
  },
});

/* 4. 塗りが上から抜けて朱の輪郭だけが残り、その輪郭がほどけて消える(右の字から) */
regX('mgUndraw', {
  name: '塗り抜け→線ほどき', tags: ['editorial', 'graphic', 'calm', 'emotional'], w: 0.9,
  apply(env, it, p) {
    ghostFade(env, it, p);
    const s = SZ(it), acc = env.sc.accent;
    const kOf = (i, n) => L.stagger(p, i, n, 0.5, 'rl');
    fn(it, (i, g, n) => {
      const kf = clamp(kOf(i, n) / 0.55);
      if (kf <= 0) return null;
      if (kf >= 1) return { hide: true };
      const top = -0.66 + 1.32 * E.inOutCubic(kf);
      return g.vrot ? { clipX: [top * SZ(it) / g.w, 3] } : { clipY: [top, 3] };
    });
    chain(it, 'pre', (e2, it2, m) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, n = m.lay.length, L0 = s * 7;
      ctx.save();
      ctx.font = L.fontStr(it2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.035); ctx.lineJoin = 'round';
      for (const g of m.lay) {
        if (g.space) continue;
        const k = kOf(g.i, n);
        if (k <= 0) continue;
        const d = 1 - E.inOutSine(clamp((k - 0.35) / 0.65));
        if (d <= 0.002) continue;
        ctx.globalAlpha = ia(it2) * sm(0.02, 0.15, k);
        ctx.setLineDash([L0 * d, L0]);
        strokeGlyph(ctx, it2, g);
      }
      ctx.restore();
    });
  },
});

/* 5. 高さ不揃いのスライスが左右ばらばらに加速して飛び去る。速度線つき */
regX('mgSliceScatter', {
  name: 'スライス散開', tags: ['glitch', 'graphic', 'cyber', 'pop'], w: 0.9,
  apply(env, it, p, c) {
    const seed = sd(env, c), m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent;
    const pad = s * 0.6, span = (vert ? m.w : m.h) + pad * 2;
    const nB = Math.max(5, Math.min(14, Math.round(span / (s * 0.3))));
    const ws = []; let tot = 0;
    for (let j = 0; j < nB; j++) { ws[j] = 0.45 + L.r(seed, 'shh', j); tot += ws[j]; }
    const scl = Math.abs((vert ? it.sy : it.sx) == null ? 1 : (vert ? it.sy : it.sx)) || 1;
    const dist = (vert ? env.H : env.W) * 1.3 / scl;
    const bands = []; let acc0 = 0;
    for (let j = 0; j < nB; j++) {
      const dir = L.r(seed, 'sdr', j) < 0.5 ? -1 : 1, dl = L.r(seed, 'sdl', j) * 0.3;
      const k = clamp((p - dl) / 0.7);
      const b = [acc0 / tot, (acc0 + ws[j]) / tot, dir * dist * E.inExpo(k)];
      b.dir = dir; if (vert) b.vertical = true;
      bands.push(b); acc0 += ws[j];
    }
    mulA(it, 1 - sm(0.8, 1, p));
    if (bands.every(b => Math.abs(b[2]) < 0.5)) return;
    it.bands = bands;
    let calls = 0;
    chain(it, 'pre', (e2, it2, m2) => {
      if (!it2.bands) return;
      const j = calls++ % nB;
      if (!isMain(e2)) return;
      const b = bands[j], v = Math.abs(b[2]);
      if (v < 2) return;
      const len = Math.min(v * 0.6, (vert ? e2.H : e2.W) * 0.3), ext = (vert ? m2.h : m2.w) / 2 + s * 0.1;
      const c0 = -span / 2 + span * b[0], c1 = -span / 2 + span * b[1], cc = (c0 + c1) / 2, hb = (c1 - c0) * 0.22;
      const x0 = -b.dir * ext, x1 = x0 - b.dir * len;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2) * 0.85; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      for (const o of [-hb, hb]) { if (vert) { ctx.moveTo(cc + o, x0); ctx.lineTo(cc + o, x1); } else { ctx.moveTo(x0, cc + o); ctx.lineTo(x1, cc + o); } }
      ctx.stroke(); ctx.restore();
    });
  },
});

/* 6. 字ごとに横軸で前へ倒れ、裏の朱の札になって閉じる */
regX('mgFlipAway', {
  name: '札返しで消える', tags: ['graphic', 'editorial', 'pop'], w: 0.9,
  apply(env, it, p) {
    const s = SZ(it), acc = env.sc.accent, acc2 = env.sc.accent2, base = baseCol(env, it), bg = env.sc.bg;
    const kOf = (i, n) => L.stagger(p, i, n, 0.6, 'lr');
    const th = k => PI * E.inOutCubic(k);
    fn(it, (i, g, n) => {
      const k = kOf(i, n);
      if (k <= 0) return null;
      const t = th(k), c = Math.cos(t);
      if (c <= 0.02) return { hide: true };
      return { sy: c, dy: -Math.sin(t) * s * 0.08, color: L.mix(base, bg, 0.35 * Math.sin(t)) };
    });
    chain(it, 'pre', (e2, it2, m) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, n = m.lay.length;
      ctx.save(); ctx.globalAlpha = ia(it2);
      for (const g of m.lay) {
        if (g.space) continue;
        const k = kOf(g.i, n);
        if (k <= 0 || k >= 1) continue;
        const t = th(k), c = Math.cos(t);
        if (c > -0.02) continue;
        const shrink = 1 - sm(0.72, 1, k);
        const w = g.w * 0.94 * shrink, h = s * 1.02 * -c * shrink;
        if (w < 0.3 || h < 0.3) continue;
        const y = g.y - Math.sin(t) * s * 0.08;
        ctx.fillStyle = acc; ctx.fillRect(g.x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = acc2; ctx.fillRect(g.x - w / 2, y - h * 0.06, w, h * 0.12);
      }
      ctx.restore();
    });
  },
});

/* 7. 横に磁石の柱が立ち、字が近い順に加速して吸い込まれる。最後に柱も閉じる */
regX('mgMagnetPull', {
  name: '磁石に吸い込まれる', tags: ['graphic', 'cyber', 'pop'], w: 0.9,
  apply(env, it, p) {
    ghostFade(env, it, p);
    const m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent;
    const bar = (vert ? m.h : m.w) / 2 + s * 0.35, bw = s * 0.12;
    const hb = ((vert ? m.w : m.h) / 2 + s * 0.2) * E.outCubic(clamp(p / 0.25)) * (1 - E.inExpo(clamp((p - 0.82) / 0.18)));
    const q = clamp((p - 0.06) / 0.8);
    fn(it, (i, g, n) => {
      const k = L.stagger(q, i, n, 0.6, 'rl');
      if (k <= 0) return null;
      const c = vert ? g.y : g.x, gw = vert ? SZ(it) : g.w;
      const d = (bar + gw * 0.8 - c) * E.inCubic(k);
      const st = 1 + 0.6 * Math.sin(PI * Math.min(1, k * 1.2));
      const rel = (bar - (c + d)) / (gw * st);
      if (rel <= -0.7) return { hide: true };
      const clip = rel >= 0.7 ? null : [-3, rel];
      const r = vert ? { dy: d, sy: st, sx: 1 / Math.sqrt(st) } : { dx: d, sx: st, sy: 1 / Math.sqrt(st) };
      if (clip) { if (vert && !g.vrot) r.clipY = [-3, (bar - (c + d)) / (SZ(it) * st)]; else r.clipX = clip; }
      return r;
    });
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || hb < 0.3) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2); ctx.fillStyle = acc;
      if (vert) ctx.fillRect(-hb, bar, hb * 2, bw); else ctx.fillRect(bar, -hb, bw, hb * 2);
      ctx.restore();
    });
  },
});

/* 8. 図形マスクが回りながら閉じ、最後は朱の図形になって点へ消える */
regX('mgShapeClose', {
  name: '図形で閉じる', tags: ['graphic', 'pop', 'emotional'], w: 0.9,
  apply(env, it, p, c) {
    ghostFade(env, it, p);
    const seed = sd(env, c), m = meas(it), s = SZ(it), sc = env.sc;
    const kind = MASKS[(L.h(seed, 'xmask') + 1) % MASKS.length], dir = L.h(seed, 'xdir') % 2 ? 1 : -1;
    const pts = M.shapePts(kind, 120);
    const diag = Math.hypot(m.w / 2 + s * 0.35, m.h / 2 + s * 0.35);
    const Rmax = diag / INNER[kind] * 1.03;
    const e = E.inOutCubic(p), R = Rmax * (1 - e), rot = dir * e * PI * 0.6;
    if (!it.clipFn) it.clipFn = ctx => shapePath(ctx, pts, 0, 0, Math.max(0.01, R), rot);
    else mulA(it, 1 - e);
    const fillA = 1 - sm(0.35, 0.8, R / diag);
    const oa = sm(0, 0.2, p);
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || R < 0.3) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.lineJoin = 'round';
      if (fillA > 0.002) { ctx.globalAlpha = ia(it2) * fillA; ctx.fillStyle = sc.accent; ctx.beginPath(); shapePath(ctx, pts, 0, 0, R, rot); ctx.fill(); }
      ctx.globalAlpha = ia(it2) * oa; ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); shapePath(ctx, pts, 0, 0, R * 0.97, rot); ctx.stroke();
      ctx.restore();
    });
  },
});

/* 9. 字が格子ドットに分解され、行ごとに左右へ段階的に流れて縮み消える */
regX('mgDotDisperse', {
  name: 'ドット分解', tags: ['cyber', 'graphic', 'glitch'], w: 0.9, maxChars: 18,
  apply(env, it, p, c) {
    ghostFade(env, it, p);
    const ta = 1 - sm(0, 0.25, p);
    fn(it, () => ({ a: ta }));
    const seed = sd(env, c), sc = env.sc, N = env.allowFilter ? 700 : 360;
    chain(it, 'pre', (e2, it2) => {
      if (!isMain(e2)) return;
      const pts = M.glyphPoints(it2, N);
      if (!pts.length) return;
      const G = gridDots(pts, 0.1), s = SZ(it2), cs = s * 0.1;
      const ctx = e2.ctx, fa = ia(it2) * sm(0, 0.12, p) * (1 - sm(0.7, 1, p));
      if (fa <= 0.002) return;
      ctx.save();
      for (let i = 0; i < G.dots.length; i++) {
        const [gx, gy] = G.dots[i];
        const dl = L.r(seed, 'xd', gy) * 0.2 + L.r(seed, 'xdi', i) * 0.05;
        const q = clamp((p - dl) / (1 - dl));
        const dir = (gy & 1) ? -1 : 1;                               // 行ごとに左右交互の電光掲示板のように流れる
        const cells = Math.round(E.inCubic(q) * (12 + L.r(seed, 'xc', gy) * 30 + L.r(seed, 'xci', i) * 4));
        const sz = cs * 0.78 * (1 - 0.65 * q);
        ctx.globalAlpha = fa;
        ctx.fillStyle = (L.h(seed, 'xcol', gx, gy) % 9) === 0 ? sc.accent : (it2.color || sc.fg);
        ctx.fillRect((gx + dir * cells) * cs - sz / 2, gy * cs - sz / 2, sz, sz);
      }
      ctx.restore();
    });
  },
});

/* 10. ぐっと沈んで溜めてから、縦に伸びて真上へ打ち上がる。足元に土煙の線 */
regX('mgSquashShoot', {
  name: '溜めて打ち上げ', tags: ['pop', 'graphic'], w: 1,
  apply(env, it, p) {
    const m = meas(it), s = SZ(it), acc = env.sc.accent;
    const up = env.H * 1.25 / (Math.abs(it.sy == null ? 1 : it.sy) || 1);
    fn(it, (i, g, n) => {
      const k = L.stagger(p, i, n, 0.3, 'center');
      if (k <= 0) return null;
      if (k < 0.32) {
        const u = E.inOutSine(k / 0.32), sy = 1 - 0.32 * u;
        return { sy, sx: 1 + 0.22 * u, dy: (1 - sy) * s * 0.5 };
      }
      const u = (k - 0.32) / 0.68, f = E.outCubic(clamp(u * 4));
      return { sy: lerp(0.68, 1.9, f), sx: lerp(1.22, 0.62, f), dy: 0.16 * s - E.inCubic(u) * up, a: 1 - sm(0.6, 1, u) };
    });
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2)) return;
      const v = clamp((p - 0.25) / 0.45);
      if (v <= 0 || v >= 1) return;
      const ctx = e2.ctx, y = m.h / 2 + s * 0.04, half = m.w * (0.35 + 0.5 * E.outCubic(v)), gap = m.w * 0.3 * E.outCubic(v);
      ctx.save(); ctx.globalAlpha = ia(it2) * (1 - v); ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.045 * (1 - v)); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(-gap, y); ctx.moveTo(gap, y); ctx.lineTo(half, y); ctx.stroke();
      ctx.restore();
    });
  },
});

/* 11. トンボが枠に吸着 → 枠が横から縦の線へ、線が点へと段階的に切り抜かれる */
regX('mgCropOut', {
  name: 'トンボで切り抜き', tags: ['editorial', 'graphic', 'cyber'], w: 0.9,
  apply(env, it, p) {
    ghostFade(env, it, p);
    const m = meas(it), s = SZ(it), acc = env.sc.accent;
    const mIn = E.outExpo(clamp(p / 0.25));
    const wv = 1 - E.inOutExpo(clamp((p - 0.28) / 0.34)), hv = 1 - E.inOutExpo(clamp((p - 0.62) / 0.34));
    const hw = (m.w / 2 + s * 0.12) * wv, hh = (m.h / 2 + s * 0.12) * hv;
    if (hw < 0.2 || hh < 0.2) fn(it, () => ({ hide: true }));
    else if (wv < 0.999) fn(it, (i, g) => boxClip(g, it, -hw, hw, -hh, hh));
    const ma = sm(0, 0.12, p) * (1 - sm(0.9, 1, p));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || ma <= 0.002) return;
      const f = lerp(1.6, 1, mIn), g = s * 0.1;
      const x = hw * f + g, y = hh * f + g, arm = s * 0.26;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2) * ma; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.lineCap = 'square';
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath(); ctx.moveTo(sx * (x + arm), sy * y); ctx.lineTo(sx * x, sy * y); ctx.lineTo(sx * x, sy * (y + arm)); ctx.stroke();
      }
      ctx.restore();
    });
  },
});

/* 12. 字が札のようにめくれて数字になり、9→0 とカウントダウンして弾けて消える */
regX('mgCountDown', {
  name: 'カウントダウン消去', tags: ['cyber', 'editorial', 'graphic'], w: 0.8,
  apply(env, it, p) {
    const acc = env.sc.accent;
    fn(it, (i, g, n) => {
      const k = L.stagger(p, i, n, 0.55, 'rl');
      if (k <= 0) return null;
      if (L.isPunct(g.ch)) return { a: 1 - sm(0, 0.5, k) };
      if (k < 0.12) { const f = k / 0.12; return f < 0.5 ? { sy: Math.max(0.05, Math.cos(PI * f)) } : { sy: Math.max(0.05, -Math.cos(PI * f)), ch: '9', color: acc }; }
      if (k < 0.78) return { ch: String(Math.max(0, 9 - Math.floor((k - 0.12) / 0.66 * 10))), color: acc };
      const S = 1 - E.inBack((k - 0.78) / 0.22, 2);
      return S <= 0.01 ? { hide: true } : { ch: '0', color: acc, s: S };
    });
  },
});

/* ================================================================ trans
   A=前カットの静止レイヤー、B=今カット(どちらも透明背景・実ピクセル)。ctx は単位行列。p=0→A、p=1→B を厳密に。 */
const trans = (key, def) => {
  const draw = def.draw;
  L.register('trans', key, Object.assign({}, def, {
    draw(ctx, A, B, p, info) {
      if (p <= 0) { ctx.drawImage(A, 0, 0); return; }
      if (p >= 1) { ctx.drawImage(B, 0, 0); return; }
      ctx.save();
      try { draw(ctx, A, B, p, info, info.P || {}); } finally { ctx.restore(); }
    },
  }), P);
};
const put = (ctx, img, info, o = {}) => {
  const a = o.a == null ? 1 : o.a;
  if (a <= 0.002) return;
  const cw = info.cw, ch = info.ch, s = o.s == null ? 1 : o.s;
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.translate(cw / 2 + (o.x || 0), ch / 2 + (o.y || 0));
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(s * (o.sx == null ? 1 : o.sx) || 1e-4, s * (o.sy == null ? 1 : o.sy) || 1e-4);
  ctx.drawImage(img, -cw / 2, -ch / 2);
  ctx.restore();
};
const clipDraw = (ctx, img, path, rule) => { ctx.save(); ctx.beginPath(); path(ctx); ctx.clip(rule || 'nonzero'); ctx.drawImage(img, 0, 0); ctx.restore(); };
const bump = p => Math.sin(PI * clamp(p));
const TSHAPES = ['star', 'diamond', 'hexagon', 'triangle'];

/* 1. 図形ワイプ: 星/ひし形/六角/三角が回りながら中央から広がり、中が B */
trans('mgShapeWipe', {
  name: '図形ワイプ', tags: ['graphic', 'pop', 'editorial'], w: 1, dur: 0.46,
  plan: rng => ({ shape: rng.pick(TSHAPES), dir: rng.sign() }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, kind = Pp.shape || 'star', pts = M.shapePts(kind, 160);
    const e = E.inOutCubic(p), R = Math.hypot(cw, ch) / 2 / INNER[kind] * 1.04 * e, rot = (Pp.dir || 1) * (1 - e) * PI * 0.5;
    const path = c => shapePath(c, pts, cw / 2, ch / 2, Math.max(0.01, R), rot);
    clipDraw(ctx, A, c => { c.rect(0, 0, cw, ch); path(c); }, 'evenodd');
    clipDraw(ctx, B, path);
    const b = bump(p);
    ctx.globalAlpha = b; ctx.lineJoin = 'round';
    ctx.strokeStyle = info.sc.accent; ctx.lineWidth = Math.max(2, info.u * 7);
    ctx.beginPath(); path(ctx); ctx.stroke();
    ctx.globalAlpha = b * 0.8; ctx.strokeStyle = info.sc.accent2; ctx.lineWidth = Math.max(1, info.u * 3);
    ctx.beginPath(); shapePath(ctx, pts, cw / 2, ch / 2, R * 0.82, -rot * 1.4); ctx.stroke();
  },
});

/* 2. 多本バー: 3〜5本の色バーが時間差で画面を横切り、通過した所が B に入れ替わる */
trans('mgBarSweep', {
  name: '多本バー掃引', tags: ['graphic', 'pop', 'cyber', 'editorial'], w: 1.1, dur: 0.5,
  plan: rng => ({ n: rng.int(3, 5), dir: rng.sign(), order: rng.pick(['lr', 'center', 'edges']) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, n = Pp.n || 4, d = Pp.dir || 1, bw = cw * 0.32;
    const lanes = [];
    for (let k = 0; k < n; k++) {
      const e = E.inOutCubic(L.stagger(p, k, n, 0.3, Pp.order || 'lr'));
      const x = lerp(-bw, cw, e);                            // バー左端(d=-1 は鏡像)
      const y0 = Math.round(ch * k / n), y1 = Math.round(ch * (k + 1) / n);
      lanes.push({ x, y0, y1 });
    }
    const X = (x, w) => (d > 0 ? x : cw - x - w);
    clipDraw(ctx, B, c => { for (const l of lanes) if (l.x > 0) c.rect(X(0, l.x), l.y0, l.x, l.y1 - l.y0); });
    clipDraw(ctx, A, c => { for (const l of lanes) { const a = l.x + bw; if (a < cw) c.rect(X(a, cw - a), l.y0, cw - a, l.y1 - l.y0); } });
    lanes.forEach((l, k) => {
      if (l.x + bw <= 0 || l.x >= cw) return;
      ctx.fillStyle = k % 2 ? info.sc.accent2 : info.sc.accent;
      ctx.fillRect(X(l.x, bw), l.y0, bw, l.y1 - l.y0);
    });
  },
});

/* 3. グリッドタイル反転: 升目が斜めの波で次々に裏返り、裏面が B */
trans('mgTileFlip', {
  name: 'タイル反転', tags: ['graphic', 'cyber', 'pop'], w: 0.9, dur: 0.52,
  plan: rng => ({ corner: rng.int(0, 3) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, cell = Math.min(cw, ch) / 5;
    const cols = Math.max(3, Math.round(cw / cell)), rows = Math.max(3, Math.round(ch / cell));
    const cn = Pp.corner || 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = Math.round(cw * c / cols), x1 = Math.round(cw * (c + 1) / cols), y0 = Math.round(ch * r / rows), y1 = Math.round(ch * (r + 1) / rows);
      const w = x1 - x0, h = y1 - y0;
      const fc = cn % 2 ? cols - 1 - c : c, fr = cn > 1 ? rows - 1 - r : r;
      const o = (fc / Math.max(1, cols - 1) + fr / Math.max(1, rows - 1)) / 2;
      const k = clamp((p - o * 0.5) / 0.5), t = PI * E.inOutCubic(k), cs = Math.cos(t);
      const img = cs >= 0 ? A : B, sx = Math.abs(cs);
      if (sx > 0.01) {
        ctx.setTransform(sx, 0, 0, 1, x0 + w / 2, y0 + h / 2);
        ctx.drawImage(img, x0, y0, w, h, -w / 2, -h / 2, w, h);
      }
      if (sx < 0.999) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.6 * (1 - sx);
        ctx.strokeStyle = (r + c) % 2 ? info.sc.accent2 : info.sc.accent; ctx.lineWidth = Math.max(1, info.u * 2.5);
        ctx.strokeRect(x0 + w / 2 - w * sx / 2 + 0.5, y0 + 0.5, Math.max(1, w * sx - 1), h - 1);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
});

/* 4. 突き抜けズーム: A が中心へ吸い込まれるように急拡大、放射の速度線、B は行き過ぎ付きで着地 */
trans('mgPunchThrough', {
  name: '突き抜けズーム', tags: ['pop', 'graphic', 'cyber', 'glitch'], w: 0.9, dur: 0.44,
  plan: rng => ({ n: rng.int(18, 28), seed: rng.int(1, 9999) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch;
    put(ctx, A, info, { s: 1 + 3 * E.inExpo(clamp(p / 0.55)), a: 1 - sm(0.28, 0.55, p) });
    const q = clamp((p - 0.4) / 0.6);
    put(ctx, B, info, { s: lerp(0.3, 1, E.outBack(q, 1.7)), a: sm(0.4, 0.56, p) });
    const b = bump(clamp(p / 0.8)), n = Pp.n || 22, R = Math.hypot(cw, ch) / 2;
    if (b > 0.01) {
      ctx.strokeStyle = info.sc.accent; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = (i + L.r(Pp.seed || 1, 'pl', i) * 0.6) / n * TAU, r0 = R * (0.25 + 0.5 * E.inCubic(clamp(p / 0.7)) + L.r(Pp.seed || 1, 'pr', i) * 0.1);
        const r1 = r0 + R * 0.25 * b;
        ctx.globalAlpha = b * 0.85; ctx.lineWidth = Math.max(1, info.u * (2 + 3 * L.r(Pp.seed || 1, 'pw', i)));
        ctx.beginPath(); ctx.moveTo(cw / 2 + Math.cos(a) * r0, ch / 2 + Math.sin(a) * r0); ctx.lineTo(cw / 2 + Math.cos(a) * r1, ch / 2 + Math.sin(a) * r1); ctx.stroke();
      }
    }
  },
});

/* 5. 上下分割プッシュ: 上半分と下半分が逆方向へスライドして入れ替わる(縦長は左右分割) */
trans('mgSplitPush', {
  name: '上下分割プッシュ', tags: ['graphic', 'editorial', 'pop'], w: 1, dur: 0.44,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, d = Pp.dir || 1, e = E.inOutExpo(p);
    const vert = ch > cw;                                        // 縦長は左右に分割して上下へ
    const halves = vert ? [[0, 0, Math.round(cw / 2), ch, 1], [Math.round(cw / 2), 0, cw - Math.round(cw / 2), ch, -1]]
      : [[0, 0, cw, Math.round(ch / 2), 1], [0, Math.round(ch / 2), cw, ch - Math.round(ch / 2), -1]];
    const L0 = vert ? ch : cw;
    for (const [x, y, w, h, sgn] of halves) {
      const off = -sgn * d * L0 * e, offB = sgn * d * L0 * (1 - e);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      if (vert) { ctx.drawImage(A, 0, off); ctx.drawImage(B, 0, offB); } else { ctx.drawImage(A, off, 0); ctx.drawImage(B, offB, 0); }
      ctx.restore();
    }
    const b = bump(p), lw = Math.max(2, info.u * 5);
    ctx.globalAlpha = b; ctx.fillStyle = info.sc.accent;
    if (vert) ctx.fillRect(cw / 2 - lw / 2, 0, lw, ch); else ctx.fillRect(0, ch / 2 - lw / 2, cw, lw);
  },
});

/* 6. 斜めストライプ: 斜めの帯が順に伸びて B を開く。伸びる縁に色 */
trans('mgStripeWipe', {
  name: '斜めストライプ', tags: ['graphic', 'pop', 'cyber'], w: 1, dur: 0.48,
  plan: rng => ({ n: rng.int(6, 9), slant: rng.sign() * rng.range(0.35, 0.6) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, n = Pp.n || 7, t = Pp.slant || 0.45;
    const sk = ch * Math.abs(t), umax = cw + sk, sw = umax / n;
    const uAt = (u, y) => (t > 0 ? u - sk + y * Math.abs(t) : u - y * Math.abs(t));   // 帯の境界 x(y)
    const ks = [];
    for (let k = 0; k < n; k++) ks.push(E.inOutCubic(L.stagger(p, k, n, 0.5, 'lr')));
    const band = (c, k) => {
      const u0 = sw * k, u1 = u0 + sw * ks[k] + 0.5;
      if (ks[k] <= 0) return;
      c.moveTo(uAt(u0, 0), 0); c.lineTo(uAt(u1, 0), 0); c.lineTo(uAt(u1, ch), ch); c.lineTo(uAt(u0, ch), ch); c.closePath();
    };
    clipDraw(ctx, A, c => { c.rect(0, 0, cw, ch); for (let k = 0; k < n; k++) band(c, k); }, 'evenodd');
    clipDraw(ctx, B, c => { for (let k = 0; k < n; k++) band(c, k); });
    ctx.strokeStyle = info.sc.accent; ctx.lineWidth = Math.max(2, info.u * 5);
    for (let k = 0; k < n; k++) {
      const a = bump(ks[k]);
      if (a <= 0.01) continue;
      const u1 = sw * k + sw * ks[k];
      ctx.globalAlpha = a; ctx.strokeStyle = k % 2 ? info.sc.accent2 : info.sc.accent;
      ctx.beginPath(); ctx.moveTo(uAt(u1, 0), 0); ctx.lineTo(uAt(u1, ch), ch); ctx.stroke();
    }
  },
});

/* 7. 扇の時計ワイプ: 画面中心から2〜4枚の扇が同時に回って B を開く。針は色線 */
trans('mgFanClock', {
  name: '扇の時計ワイプ', tags: ['graphic', 'editorial', 'pop'], w: 0.9, dur: 0.48,
  plan: rng => ({ n: rng.int(2, 4), dir: rng.sign(), a0: rng.range(0, PI) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, n = Pp.n || 3, d = Pp.dir || 1, a0 = Pp.a0 || 0;
    const e = E.inOutCubic(p), R = Math.hypot(cw, ch), cx = cw / 2, cy = ch / 2, seg = TAU / n;
    const fans = c => { for (let k = 0; k < n; k++) { const s0 = a0 + k * seg; c.moveTo(cx, cy); c.arc(cx, cy, R, s0, s0 + d * seg * e, d < 0); c.closePath(); } };
    clipDraw(ctx, A, c => { c.rect(0, 0, cw, ch); fans(c); }, 'evenodd');
    clipDraw(ctx, B, fans);
    const b = bump(p);
    ctx.globalAlpha = b; ctx.strokeStyle = info.sc.accent; ctx.lineWidth = Math.max(2, info.u * 5); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < n; k++) { const a = a0 + k * seg + d * seg * e; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    ctx.stroke();
    ctx.fillStyle = info.sc.accent2; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, info.u * 10), 0, TAU); ctx.fill();
  },
});

/* 8. ピクセルブロック: 升目が中心寄り+乱数の決定論順で A→B に置き換わり、切替の瞬間だけ色が灯る */
trans('mgPixelBlocks', {
  name: 'ブロック置換', tags: ['glitch', 'cyber', 'graphic'], w: 0.9, dur: 0.46,
  plan: rng => ({ k: rng.int(8, 11) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, bs = Math.min(cw, ch) / (Pp.k || 9);
    const cols = Math.max(2, Math.round(cw / bs)), rows = Math.max(2, Math.round(ch / bs));
    const seed = info.seed || 1, blocks = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = Math.round(cw * c / cols), y0 = Math.round(ch * r / rows), x1 = Math.round(cw * (c + 1) / cols), y1 = Math.round(ch * (r + 1) / rows);
      const dc = Math.hypot((c + 0.5) / cols - 0.5, (r + 0.5) / rows - 0.5) / 0.7071;
      const th = 0.12 + 0.72 * (0.55 * L.r(seed, 'pxb', r, c) + 0.45 * dc);
      blocks.push({ x0, y0, w: x1 - x0, h: y1 - y0, th });
    }
    clipDraw(ctx, A, c => { for (const b of blocks) if (p < b.th) c.rect(b.x0, b.y0, b.w, b.h); });
    clipDraw(ctx, B, c => { for (const b of blocks) if (p >= b.th) c.rect(b.x0, b.y0, b.w, b.h); });
    for (const b of blocks) {
      const f = 1 - Math.abs(p - b.th) / 0.05;
      if (f <= 0) continue;
      ctx.globalAlpha = 0.8 * f; ctx.fillStyle = L.h(seed, 'pxc', b.x0, b.y0) % 3 ? info.sc.accent : info.sc.accent2;
      ctx.fillRect(b.x0 + 1, b.y0 + 1, b.w - 2, b.h - 2);
    }
  },
});

/* 9. カラースレート: 斜めの色板が横切り、前は A・後ろは B。板の縁に細い別色 */
trans('mgSlateSlide', {
  name: 'カラースレート', tags: ['graphic', 'pop', 'editorial'], w: 1, dur: 0.5,
  plan: rng => ({ dir: rng.sign(), skew: rng.range(0.15, 0.35) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, d = Pp.dir || 1, sk = ch * (Pp.skew || 0.25);
    const Ws = cw * 0.5, e = E.inOutCubic(p);
    const l = lerp(-Ws - sk, cw + sk, e), r = l + Ws;              // 板の左端/右端(上辺基準、下辺は -sk)
    const X = x => (d > 0 ? x : cw - x);
    const poly = (c, x0, x1) => { c.moveTo(X(x0), 0); c.lineTo(X(x1), 0); c.lineTo(X(x1 - sk), ch); c.lineTo(X(x0 - sk), ch); c.closePath(); };
    clipDraw(ctx, B, c => poly(c, -cw * 2, l));
    clipDraw(ctx, A, c => poly(c, r, cw * 3));
    ctx.fillStyle = info.sc.accent; ctx.beginPath(); poly(ctx, l, r); ctx.fill();
    const t = Math.max(3, info.u * 14);
    ctx.fillStyle = info.sc.accent2;
    ctx.beginPath(); poly(ctx, r - t, r); ctx.fill();
    ctx.beginPath(); poly(ctx, l, l + t * 0.5); ctx.fill();
  },
});

/* 10. 図形アイリス: A が図形の中に閉じて朱の図形になり、別の図形へ変わりながら開いて B */
trans('mgIrisShape', {
  name: '図形アイリス', tags: ['graphic', 'pop', 'emotional'], w: 0.9, dur: 0.55,
  plan: rng => { const a = rng.int(0, M.SHAPES.length - 1); return { a: M.SHAPES[a], b: M.SHAPES[(a + rng.int(1, M.SHAPES.length - 1)) % M.SHAPES.length], dir: rng.sign() }; },
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, ka = Pp.a || 'circle', kb = Pp.b || 'star';
    const pa = M.shapePts(ka, 160), pb = M.shapePts(kb, 160), f = sm(0.35, 0.65, p);
    const pts = pa.map((q, i) => [lerp(q[0], pb[i][0], f), lerp(q[1], pb[i][1], f)]);
    const inner = Math.min(INNER[ka] || 0.5, INNER[kb] || 0.5);
    const Rmax = Math.hypot(cw, ch) / 2 / inner * 1.04, Rmin = Math.min(cw, ch) * 0.07;
    const closing = p < 0.5;
    const R = closing ? Rmax * (1 - E.inCubic(p / 0.5)) : Rmax * E.inCubic((p - 0.5) / 0.5);
    const rot = (Pp.dir || 1) * p * PI;
    const cx = cw / 2, cy = ch / 2;
    const path = c => shapePath(c, pts, cx, cy, Math.max(0.01, R), rot);
    clipDraw(ctx, closing ? A : B, path);
    const fillA = closing ? 1 - sm(Rmin * 1.5, Rmin * 4, R) : 1 - sm(Rmin * 1.2, Rmin * 5, R);
    if (fillA > 0.002 && R > 0.5) { ctx.globalAlpha = fillA; ctx.fillStyle = info.sc.accent; ctx.beginPath(); path(ctx); ctx.fill(); }
    ctx.globalAlpha = bump(p) * 0.9; ctx.strokeStyle = info.sc.accent2; ctx.lineWidth = Math.max(1.5, info.u * 4); ctx.lineJoin = 'round';
    ctx.beginPath(); shapePath(ctx, pts, cx, cy, R + info.u * 14, rot); ctx.stroke();
  },
});

/* 11. 立方体回転: A の面が奥へ回り込み、B の面が手前へ。短冊で遠近を付ける */
trans('mgCubeTurn', {
  name: '立方体回転', tags: ['graphic', 'cyber', 'pop'], w: 0.9, dur: 0.5,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, d = Pp.dir || 1;
    const phi = PI / 2 * E.inOutCubic(p), c = Math.cos(phi), s = Math.sin(phi);
    const wA = cw * c / (c + s), wB = cw - wA;
    const N = 14;
    /* img を横幅 [x0,x0+w] に写す。far=0: 左端が奥、1: 右端が奥。depth で奥側を縮める */
    const face = (img, x0, w, far, depth, a) => {
      if (w < 0.5) return;
      ctx.globalAlpha = a;
      for (let k = 0; k < N; k++) {
        const s0 = Math.round(cw * k / N), s1 = Math.round(cw * (k + 1) / N);
        const t = (k + 0.5) / N, farness = far ? t : 1 - t;
        const hs = 1 - 0.28 * depth * farness;
        const dx0 = x0 + w * s0 / cw, dx1 = x0 + w * s1 / cw;
        ctx.drawImage(img, s0, 0, s1 - s0, ch, dx0, ch / 2 - ch * hs / 2, dx1 - dx0 + 0.6, ch * hs);
      }
    };
    if (d > 0) { face(A, 0, wA, 0, s, 0.45 + 0.55 * c); face(B, wA, wB, 1, c, 0.45 + 0.55 * s); }
    else { face(A, wB, wA, 1, s, 0.45 + 0.55 * c); face(B, 0, wB, 0, c, 0.45 + 0.55 * s); }
    const seam = d > 0 ? wA : wB;
    ctx.globalAlpha = bump(p); ctx.fillStyle = info.sc.accent;
    const lw = Math.max(2, info.u * 4);
    ctx.fillRect(seam - lw / 2, 0, lw, ch);
  },
});

/* 12. 同心リング: 中心から外へ、何重もの輪が順に満ちて B を開く */
trans('mgRingRipple', {
  name: '同心リング', tags: ['graphic', 'pop', 'calm', 'emotional'], w: 0.9, dur: 0.52,
  plan: rng => ({ n: rng.int(4, 6) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, n = Pp.n || 5, cx = cw / 2, cy = ch / 2;
    const Rm = Math.hypot(cw, ch) / 2 * 1.02, Rr = Rm / n;
    const ks = [];
    for (let k = 0; k < n; k++) ks.push(E.inOutCubic(L.stagger(p, k, n, 0.45, 'lr')));
    const rings = c => {
      for (let k = 0; k < n; k++) {
        if (ks[k] <= 0) continue;
        const r0 = k * Rr, r1 = r0 + Rr * ks[k] + 0.5;
        c.moveTo(cx + r1, cy); c.arc(cx, cy, r1, 0, TAU);
        if (r0 > 0) { c.moveTo(cx + r0, cy); c.arc(cx, cy, r0, 0, TAU); }
      }
    };
    clipDraw(ctx, A, c => { c.rect(0, 0, cw, ch); rings(c); }, 'evenodd');
    clipDraw(ctx, B, rings, 'evenodd');
    for (let k = 0; k < n; k++) {
      const a = bump(ks[k]);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a; ctx.strokeStyle = k % 2 ? info.sc.accent2 : info.sc.accent; ctx.lineWidth = Math.max(1.5, info.u * 4);
      ctx.beginPath(); ctx.arc(cx, cy, k * Rr + Rr * ks[k], 0, TAU); ctx.stroke();
    }
  },
});

/* ================================================================ cam
   get(env, P) → {x, y, s, rot(度), sx, sy, skx(度)}。通常は |x|,|y| ≤ 5%、s 0.92〜1.15、rot ≤ 5°。strong は短い衝撃のみ超えて必ず収束。 */
const cam = (key, def) => {
  const get = def.get, strong = !!def.strong;
  L.register('cam', key, Object.assign({}, def, {
    get(env, Pp) {
      const o = get(env, Pp || {}) || {};
      if (!strong) {
        const mx = env.W * 0.05, my = env.H * 0.05;
        if (o.x != null) o.x = clamp(o.x, -mx, mx);
        if (o.y != null) o.y = clamp(o.y, -my, my);
        if (o.s != null) o.s = clamp(o.s, 0.92, 1.15);
        if (o.rot != null) o.rot = clamp(o.rot, -5, 5);
      }
      return o;
    },
  }), P);
};
const lt0 = env => Math.max(0, env.lt);
const prog = env => clamp(env.lt / Math.max(0.3, env.cut.dur));
/* 拍: bpm 無しでもカット内の擬似拍(0.5秒)で動く */
const beatOf = env => {
  if (env.beat && env.beat.len > 0.05) return { since: Math.max(0, env.beat.since), len: env.beat.len, index: env.beat.index };
  const len = 0.5, t = lt0(env);
  return { since: t % len, len, index: Math.floor(t / len) };
};

/* 1. 拍ごとに寄りの段と構図の位置が切り替わる(4拍で一巡)。切替はエクスポで素早く */
const REFRAME = [[0, 0], [-1, -0.7], [0.9, 0.5], [-0.2, 0.9]];
cam('mgBeatReframe', {
  name: '拍リフレーム', tags: ['graphic', 'pop', 'cyber', 'editorial'], w: 0.9,
  plan: rng => ({ a: rng.range(0.028, 0.036), m: rng.range(0.022, 0.032), flip: rng.sign() }),
  get(env, Pp) {
    const b = beatOf(env), cur = ((b.index % 4) + 4) % 4, prv = (cur + 3) % 4;
    const e = E.outExpo(clamp(b.since / Math.min(0.16, b.len * 0.5)));
    const lv = lerp(prv, cur, e), sx = lerp(REFRAME[prv][0], REFRAME[cur][0], e), sy = lerp(REFRAME[prv][1], REFRAME[cur][1], e);
    const ramp = E.outCubic(clamp(lt0(env) / 0.3));
    return { s: 1 + (Pp.a || 0.032) * lv * ramp, x: (Pp.flip || 1) * sx * env.W * (Pp.m || 0.026) * ramp, y: sy * env.H * (Pp.m || 0.026) * ramp };
  },
});

/* 2. 小節の頭でホイップパン(横へ振れて戻り、行き過ぎて止まる)。方向は小節ごとに交互 */
cam('mgBarWhip', {
  name: '小節ホイップ', tags: ['pop', 'graphic', 'glitch'], w: 0.6, strong: true,
  plan: rng => ({ dir: rng.sign(), a: rng.range(0.13, 0.17) }),
  get(env, Pp) {
    const b = beatOf(env), bar = Math.floor(b.index / 4), t = b.since + (((b.index % 4) + 4) % 4) * b.len;
    const d = (Pp.dir || 1) * (bar % 2 ? -1 : 1);
    const env1 = Math.exp(-t * 7);
    if (env1 < 0.002) return { s: 1 };
    const sw = Math.sin(t * 15) * env1;
    return { x: d * env.W * (Pp.a || 0.15) * sw, skx: -d * 7 * Math.sin(t * 30) * Math.exp(-t * 11), sx: 1 + 0.07 * Math.abs(sw), s: 1 + 0.02 * env1 };
  },
});

/* 3. ドリーズーム風: 寄りながら縦横比と位置が逆にずれて、奥行きが歪むような錯覚 */
cam('mgDollyZoom', {
  name: 'ドリーズーム', tags: ['emotional', 'dark', 'cyber', 'editorial'], w: 0.8,
  plan: rng => ({ a: rng.range(0.08, 0.11), dir: rng.sign() }),
  get(env, Pp) {
    const e = E.inOutSine(prog(env)), a = Pp.a || 0.09;
    return { s: 1 + a * e, sx: 1 + 0.025 * e, sy: 1 - 0.035 * e, y: (Pp.dir || 1) * env.H * 0.018 * (e * 2 - 1) };
  },
});

/* 4. 渦を描きながら中心へ収束して着地(回転と寄りも同時に消える) */
cam('mgSpiralSettle', {
  name: 'スパイラル着地', tags: ['pop', 'emotional', 'graphic', 'cyber'], w: 0.8,
  plan: rng => ({ dir: rng.sign(), a0: rng.range(0, TAU) }),
  get(env, Pp) {
    const t = lt0(env), dcy = Math.exp(-t * 3.4), d = Pp.dir || 1;
    const a = (Pp.a0 || 0) + d * t * 9, r = Math.min(env.W, env.H) * 0.045 * dcy;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, rot: d * 4.5 * dcy, s: 1 + 0.1 * dcy };
  },
});

/* 5. ティルトシフト風: 縦に少しつぶした画面がゆっくり縦に流れる(ミニチュア撮影のような漂い) */
cam('mgTiltShift', {
  name: 'ミニチュア漂い', tags: ['calm', 'emotional', 'editorial'], w: 0.9,
  plan: rng => ({ dir: rng.sign(), a: rng.range(0.028, 0.04) }),
  get(env, Pp) {
    const k = E.inOutSine(prog(env)) * 2 - 1, d = Pp.dir || 1;
    return { y: -d * env.H * (Pp.a || 0.034) * k, sy: 0.975, s: 1.04, skx: 1.2 * Math.sin(env.ltb * 0.7), rot: 0.5 * k * d };
  },
});

/* 6. 拍ごとに小さく回転で蹴られ、ばねのように戻る(左右交互) */
cam('mgBeatRotKick', {
  name: '拍回転キック', tags: ['pop', 'glitch', 'graphic', 'dark'], w: 0.8,
  plan: rng => ({ a: rng.range(2.2, 3.2), dir: rng.sign() }),
  get(env, Pp) {
    const b = beatOf(env), t = b.since, d = (Pp.dir || 1) * (b.index % 2 ? -1 : 1);
    const k = (1 - Math.exp(-t / 0.018)) * Math.exp(-t * 5.5) * Math.cos(t * 14);
    const ramp = E.outCubic(clamp(lt0(env) / 0.2));
    return { rot: d * (Pp.a || 2.6) * k * ramp, s: 1 + 0.022 * Math.abs(k) * ramp };
  },
});
})();
