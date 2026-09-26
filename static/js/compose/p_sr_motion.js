/* LyricFlow 演出パック: p_sr_motion — ショーリールの動き・つなぎ・装飾・配色
   契約: docs/COMPOSE_PACKS.md  (group: enter+exit+trans+decor+cam+style)  共通ヘルパー: L.mg (p_motion_graphics.js)
   モーションデザイナーのショーリール風: 弾む玉(つぶれと伸び)・デザインツールの選択枠・注釈線・可変幅・グレイン・波形・リキャップ格子。
   登場は p=1 で静止状態と同一、退場は p=0 で静止状態と同一。乱数は cut.seed・字番号・step キーの決定論のみ。実装はLyricFlow独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_sr_motion';
const clamp = L.clamp, lerp = L.lerp, sm = L.smooth, TAU = L.TAU, PI = Math.PI;
const MONO = M.MONO;

/* ================================================================ helpers */
const mulA = (it, k) => { it.alpha = (it.alpha == null ? 1 : it.alpha) * clamp(k); };
const tz = v => (v && Math.abs(v) >= 0.5 ? v : 0);
/* 字ごとの関数。終端付近の微小なずれは0に丸める */
const fn = (it, f) => {
  (it.charFns || (it.charFns = [])).push((i, g, n) => {
    const r = f(i, g, n);
    if (!r) return r;
    if (r.dx) r.dx = tz(r.dx);
    if (r.dy) r.dy = tz(r.dy);
    if (r.rot && Math.abs(r.rot) < 0.0035) r.rot = 0;
    if (r.s != null && Math.abs(r.s - 1) < 0.003) r.s = 1;
    if (r.sx != null && Math.abs(r.sx - 1) < 0.003) r.sx = 1;
    if (r.sy != null && Math.abs(r.sy - 1) < 0.003) r.sy = 1;
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
const ghostFade = (env, it, p, a = 0.1, b = 0.45) => { if (!isMain(env)) mulA(it, 1 - sm(a, b, p)); };
const pad2 = n => String(Math.max(0, n | 0)).padStart(2, '0');
/* 軸に沿った字ごとのクリップ。dir=+1: 座標 < edge だけ表示 */
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
/* 行(縦書きは列)ごとの範囲 */
const lineSpans = (m, vert) => {
  const out = [];
  for (const g of m.lay) {
    if (g.space) continue;
    const o = out[g.line] || (out[g.line] = { a0: 1e9, a1: -1e9, c: vert ? g.x : g.y, h: vert ? g.w : g.h });
    const c = vert ? g.y : g.x, half = (vert ? g.h : g.w) / 2;
    o.a0 = Math.min(o.a0, c - half); o.a1 = Math.max(o.a1, c + half);
  }
  return out.map(o => o || { a0: 0, a1: 0, c: 0, h: 0 });
};
/* 折れ線を弧長 [t0,t1] だけ描く(パスに追加) */
const pathSeg = (ctx, pts, t0, t1) => {
  let acc = 0, started = false;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.max(t0, acc), b = Math.min(t1, acc + d);
    if (b > a && d > 0) {
      const fa = (a - acc) / d, fb = (b - acc) / d;
      if (!started) { ctx.moveTo(lerp(x0, x1, fa), lerp(y0, y1, fa)); started = true; }
      ctx.lineTo(lerp(x0, x1, fb), lerp(y0, y1, fb));
    }
    acc += d;
  }
};
const polyLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
/* 選択枠: 細い線の矩形 + 8個の四角いハンドル(白地に色線) */
const selFrame = (ctx, x0, y0, x1, y1, col, lw, hs, a, handleFill) => {
  if (a <= 0.002) return;
  ctx.globalAlpha = a;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.strokeRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.fillStyle = handleFill;
  for (const [x, y] of [[x0, y0], [mx, y0], [x1, y0], [x1, my], [x1, y1], [mx, y1], [x0, y1], [x0, my]]) {
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
  }
};
/* 玉(光沢付き)。sx/sy でつぶれと伸び */
const drawBall = (ctx, x, y, r, sx, sy, col, a) => {
  if (a <= 0.002 || r <= 0.2) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y); ctx.scale(Math.max(0.05, sx), Math.max(0.05, sy));
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = L.mix(col, '#000000', 0.28); ctx.beginPath(); ctx.arc(r * 0.12, r * 0.14, r * 0.86, 0.1 * PI, 0.95 * PI); ctx.arc(0, 0, r, 0.95 * PI, 0.1 * PI, true); ctx.fill();
  ctx.globalAlpha = a * 0.75; ctx.fillStyle = L.mix(col, '#ffffff', 0.7);
  ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.4, r * 0.24, r * 0.15, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
};
const regE = (key, def) => L.register('enter', key, def, P);
const regX = (key, def) => L.register('exit', key, def, P);

/* ================================================================ enter (4) */

/* 1. 可変幅スナップ: 字が極端に横長・平たい状態から、順に行き過ぎ付きで本来の幅へ(可変フォントが動くように行の送りも追従) */
regE('srWidthPulse', {
  name: '可変幅スナップ', tags: ['graphic', 'editorial', 'pop', 'cyber'], w: 1,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, n = m.lay.length;
    const scl = Math.abs((vert ? it.sy : it.sx) == null ? 1 : (vert ? it.sy : it.sx)) || 1;
    const spans = lineSpans(m, vert);
    let maxLen = 1;
    for (const sp of spans) maxLen = Math.max(maxLen, sp.a1 - sp.a0);
    const F = clamp((vert ? env.H : env.W) * 1.05 / (maxLen * scl), 1.3, 2.2);
    const wf = new Float64Array(n), hf = new Float64Array(n), ks = new Float64Array(n), off = new Float64Array(n);
    for (const g of m.lay) {
      const k = L.stagger(p, g.i, n, 0.5, 'lr');
      ks[g.i] = k;
      wf[g.i] = F + (1 - F) * E.outBack(k, 1.9);
      hf[g.i] = 0.5 + 0.5 * E.outBack(k, 2.6);
    }
    // 行ごとに送りを積み上げて、行の中心を保ったまま字の位置をずらす
    const byLine = [];
    for (const g of m.lay) (byLine[g.line] || (byLine[g.line] = [])).push(g);
    for (const row of byLine) {
      if (!row) continue;
      let tot = 0;
      for (const g of row) tot += (vert ? g.h : g.w) * (wf[g.i] - 1);
      let run = 0;
      for (const g of row) {
        const adv = (vert ? g.h : g.w) * (wf[g.i] - 1);
        off[g.i] = run + adv / 2 - tot / 2;
        run += adv;
      }
    }
    const a0 = sm(0, 0.12, p);
    fn(it, i => {
      const k = ks[i];
      if (k >= 1 && Math.abs(off[i]) < 0.5) return null;
      const a = a0 * (0.18 + 0.82 * sm(0, 0.5, k));
      return vert ? { dy: off[i], sx: hf[i], sy: wf[i], a } : { dx: off[i], sx: wf[i], sy: hf[i], a };
    });
  },
});

/* 2. 選択枠スナップ: デザインツールの選択枠(細線+8ハンドル)が緩く大きい所から字に吸着、字は 0.85 から着地。枠は消えて残らない */
regE('srBoxSnap', {
  name: '選択枠スナップ', tags: ['graphic', 'editorial', 'cyber'], w: 1,
  apply(env, it, p, c) {
    const m = meas(it), s = SZ(it), sc = env.sc, seed = sd(env, c);
    const S = 0.85 + 0.15 * E.outBack(clamp((p - 0.1) / 0.6), 1.6);
    mulA(it, sm(0, 0.22, p));
    if (Math.abs(S - 1) > 0.002) fn(it, (i, g) => ({ s: S, dx: g.x * (S - 1), dy: g.y * (S - 1) }));
    const hw0 = m.w / 2 + s * 0.14, hh0 = m.h / 2 + s * 0.14;
    const e = E.outBack(clamp((p - 0.04) / 0.5), 2);
    const ox = (L.h(seed, 'bsx') % 2 ? 1 : -1) * s * 0.45, oy = (L.h(seed, 'bsy') % 2 ? 1 : -1) * s * 0.3;
    const hw = lerp(hw0 * 1.35 + s * 0.5, hw0, e), hh = lerp(hh0 * 1.35 + s * 0.5, hh0, e);
    const cx = ox * (1 - e), cy = oy * (1 - e);
    const fa = sm(0, 0.1, p) * (1 - sm(0.7, 0.96, p));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || fa <= 0.002) return;
      const ctx = e2.ctx;
      ctx.save();
      selFrame(ctx, cx - hw, cy - hh, cx + hw, cy + hh, sc.accent2, Math.max(1, s * 0.022), Math.max(3, s * 0.085), ia(it2) * fa, '#ffffff');
      ctx.restore();
    });
  },
});

/* 3. 玉の着地: 上から玉が落ちて底辺でつぶれ、着地点から字が外へ向かって順に弾み出る。玉は小さく跳ねて消える */
regE('srBallDrop', {
  name: '玉の着地', tags: ['pop', 'graphic'], w: 1, maxChars: 26,
  apply(env, it, p, c) {
    const m = meas(it), s = SZ(it), acc = env.sc.accent, seed = sd(env, c);
    const ns = nonSpace(m);
    if (!ns.length) return;
    const gi = ns[Math.min(ns.length - 1, Math.floor(ns.length * (0.3 + 0.4 * L.r(seed, 'bdi'))))];
    const ix = gi.x, base = m.h / 2, r = s * 0.2, T1 = 0.3;
    // 字の順番: 着地点からの距離
    let dmax = 1e-3;
    const dist = m.lay.map(g => { const d = Math.hypot(g.x - ix, (g.y - base) * 0.6); dmax = Math.max(dmax, d); return d; });
    const order = dist.map(d => d / dmax);
    const q = clamp((p - T1 + 0.02) / (1 - T1 + 0.02));
    fn(it, (i, g, n) => {
      const k = L.stagger(q, i, n, 0.55, order);
      if (k >= 1) return null;
      if (k <= 0) return { hide: true };
      const S = E.outBack(k, 2.2), gh = s * 0.5;
      return { s: S, dy: (1 - S) * gh - Math.sin(PI * k) * s * 0.22, a: sm(0, 0.18, k) };
    });
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, A = ia(it2);
      let by, sx = 1, sy = 1, sc = 1, a = sm(0, 0.06, p);
      if (p < T1) {
        const f = E.inQuad(p / T1);
        by = lerp(-m.h / 2 - s * 3.2, base - r, f);
        sy = 1 + 0.35 * f; sx = 1 - 0.15 * f;
      } else if (p < T1 + 0.12) {
        const u = (p - T1) / 0.12, k = Math.sin(PI * u);
        sx = 1 + 0.6 * k; sy = 1 - 0.45 * k; by = base - r * sy;
      } else {
        const v = clamp((p - T1 - 0.12) / 0.45);
        sc = 1 - E.inCubic(v);
        by = base - r * sc - Math.sin(PI * Math.min(1, v * 1.2)) * s * 0.9;
        a *= 1 - sm(0.55, 1, v);
      }
      ctx.save();
      // 着地の衝撃: 地面の細線と楕円の波紋
      const u2 = clamp((p - T1) / 0.35);
      if (u2 > 0 && u2 < 1) {
        ctx.globalAlpha = A * (1 - u2) * 0.9; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.03 * (1 - u2));
        ctx.beginPath(); ctx.ellipse(ix, base, r * (1.2 + 3.5 * E.outCubic(u2)), r * (0.25 + 0.6 * E.outCubic(u2)), 0, 0, TAU); ctx.stroke();
        const hl = r * (2 + 5 * E.outCubic(u2));
        ctx.beginPath(); ctx.moveTo(ix - hl, base + s * 0.02); ctx.lineTo(ix + hl, base + s * 0.02); ctx.stroke();
      }
      drawBall(ctx, ix, by, r * sc, sx, sy, acc, A * a);
      ctx.restore();
    });
  },
});

/* 4. 注釈線から: 外側の点から引き出し線が伸び、字の下を走る線の先端に合わせて左→右に字が現れる。線は最後に巻き取られて消える */
regE('srAnnotate', {
  name: '注釈線から', tags: ['editorial', 'graphic', 'calm', 'cyber'], w: 1,
  apply(env, it, p) {
    const m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent, base = baseCol(env, it);
    const spans = lineSpans(m, vert);
    let A0 = 1e9, A1 = -1e9;
    for (const sp of spans) { A0 = Math.min(A0, sp.a0); A1 = Math.max(A1, sp.a1); }
    if (A0 > A1) return;
    const ul = (vert ? m.w : m.h) / 2 + s * 0.14, mg = s * 0.12;
    const pt = (a, c) => (vert ? [c, a] : [a, c]);
    // 引き出し線の長さは画面内に収まる量に(項目ローカル座標 = 画面座標 / 拡大率)
    const kA = Math.abs((vert ? it.sy : it.sx) == null ? 1 : (vert ? it.sy : it.sx)) || 1;
    const kC = Math.abs((vert ? it.sx : it.sy) == null ? 1 : (vert ? it.sx : it.sy)) || 1;
    const roomA = vert ? ((it.y || 0) / kA + A0) : ((it.x || 0) / kA + A0);
    const roomC = vert ? ((env.W - (it.x || 0)) / kC - ul) : ((env.H - (it.y || 0)) / kC - ul);
    const lead = clamp(Math.min(roomA - s * 0.2, roomC / 0.78 - s * 0.2), s * 0.35, s * 1.1);
    const S0 = pt(A0 - s * 0.12 - lead, ul + lead * 0.78), E0 = pt(A0 - s * 0.12, ul), U1 = pt(A1 + mg, ul);
    const pts = [S0, E0, U1];
    const Ld = Math.hypot(E0[0] - S0[0], E0[1] - S0[1]), Lt = polyLen(pts), Lu = Lt - Ld;
    const d1 = E.outCubic(clamp(p / 0.26));
    const u = E.inOutSine(clamp((p - 0.2) / 0.58));
    const tail = E.inOutCubic(clamp((p - 0.62) / 0.36));
    const head = d1 * Ld + u * Lu, t0 = tail * Lt;
    fn(it, (i, g) => {
      if (u >= 1) return null;
      const sp = spans[g.line];
      if (!sp) return null;
      const tip = lerp(sp.a0 - s * 0.05, sp.a1 + mg, u);
      const r = axisClip(g, it, vert, tip, 1);
      if (r && r.hide) return r;
      const c = vert ? g.y : g.x;
      const k = clamp((tip - c) / (s * 1.2));
      const o = r || {};
      if (k < 1) o.color = L.mix(acc, base, E.outCubic(k));
      return o;
    });
    const dotA = sm(0, 0.08, p) * (1 - sm(0.6, 0.85, p));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, A = ia(it2);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (head - t0 > 0.5) {
        ctx.globalAlpha = A; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath(); pathSeg(ctx, pts, t0, head); ctx.stroke();
        // 先端の小さな四角
        if (u > 0 && u < 1 && tail < 0.98) {
          const hp = pt(lerp(A0 - s * 0.12, A1 + mg, u), ul), q = s * 0.07;
          ctx.fillStyle = acc; ctx.fillRect(hp[0] - q / 2, hp[1] - q / 2, q, q);
        }
      }
      if (dotA > 0.002) {
        ctx.globalAlpha = A * dotA; ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(S0[0], S0[1], s * 0.06 * E.outBack(clamp(p / 0.12), 2), 0, TAU); ctx.fill();
        ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.arc(S0[0], S0[1], s * 0.13, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    });
  },
});

/* ================================================================ exit (3) */

/* 1. 玉で弾き飛ばす: 玉が底辺を転がり抜け、通過した字から順に跳ね上がって回りながら飛び去る */
regX('srBallKnock', {
  name: '玉で弾き飛ばす', tags: ['pop', 'graphic'], w: 0.9,
  apply(env, it, p, c) {
    ghostFade(env, it, p, 0.1, 0.4);
    const seed = sd(env, c), m = meas(it), vert = !!it.vertical, s = SZ(it), acc = env.sc.accent;
    const d = L.h(seed, 'bkd') % 2 ? 1 : -1;
    const r = s * 0.2, lenA = (vert ? m.h : m.w) / 2, crossH = (vert ? m.w : m.h) / 2;
    const X0 = -d * (lenA + s * 1.0), X1 = d * (lenA + s * 1.4), T = 0.68, D = 0.3;
    const bx = lerp(X0, X1, clamp(p / T));
    const ballC = crossH - r;
    fn(it, (i, g) => {
      const c0 = (vert ? g.y : g.x) - d * ((vert ? g.h : g.w) * 0.5 + r * 0.6);
      const hitP = clamp((c0 - X0) / (X1 - X0)) * T;
      const t = (p - hitP) / D;
      if (t <= 0) return null;
      const q = Math.min(t, 1.3), rr = L.r(seed, 'bk', i);
      const fwd = d * s * (1.3 + 1.3 * rr) * q;
      const up = -s * (2.4 + 1.4 * L.r(seed, 'bku', i)) * q + s * 3 * q * q;
      const a = 1 - sm(0.35, 1, t);
      if (a <= 0.003) return { hide: true };
      const o = { rot: d * (1.2 + 2.2 * rr) * PI * q, a, s: 1 - 0.18 * Math.min(1, q) };
      if (vert) { o.dy = fwd; o.dx = up; } else { o.dx = fwd; o.dy = up; }
      return o;
    });
    const ba = sm(0, 0.07, p) * (1 - sm(0.66, 0.76, p));
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || ba <= 0.002) return;
      const ctx = e2.ctx, A = ia(it2) * ba;
      const hop = Math.abs(Math.sin(bx / (s * 0.8) * PI)) * r * 0.4;
      const P0 = vert ? [ballC - hop, bx] : [bx, ballC - hop];
      ctx.save();
      // 速度の残像
      for (let k = 3; k >= 1; k--) {
        const bk = bx - d * r * 0.9 * k;
        const Pk = vert ? [ballC, bk] : [bk, ballC];
        ctx.globalAlpha = A * 0.18 * (4 - k) / 3; ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(Pk[0], Pk[1], r * (1 - 0.15 * k), 0, TAU); ctx.fill();
      }
      drawBall(ctx, P0[0], P0[1], r, 1, 1, acc, A);
      // 転がりの目印
      const ang = bx / r;
      ctx.globalAlpha = A * 0.8; ctx.strokeStyle = L.mix(acc, '#000000', 0.45); ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.beginPath(); ctx.moveTo(P0[0] + Math.cos(ang) * r * 0.25, P0[1] + Math.sin(ang) * r * 0.25); ctx.lineTo(P0[0] + Math.cos(ang) * r * 0.8, P0[1] + Math.sin(ang) * r * 0.8); ctx.stroke();
      ctx.restore();
    });
  },
});

/* 2. 選択して削除: 選択枠が付いて点滅 → 字が後ろから一字ずつ消え(バックスペース)、枠は線→点へたたまれて消える */
regX('srSelectDelete', {
  name: '選択して削除', tags: ['editorial', 'cyber', 'graphic'], w: 0.9,
  apply(env, it, p) {
    ghostFade(env, it, p, 0.08, 0.28);
    const m = meas(it), s = SZ(it), sc = env.sc, vert = !!it.vertical, n = m.lay.length;
    const hw0 = m.w / 2 + s * 0.16, hh0 = m.h / 2 + s * 0.16;
    const e = E.outExpo(clamp(p / 0.2));
    const cw = E.inOutExpo(clamp((p - 0.62) / 0.2)), chh = E.inOutExpo(clamp((p - 0.78) / 0.16));
    const hw = lerp(hw0 * 1.15 + s * 0.2, hw0, e) * (1 - cw), hh = lerp(hh0 * 1.15 + s * 0.2, hh0, e) * (1 - chh);
    const bl = p > 0.26 && p < 0.44 ? (Math.floor((p - 0.26) / 0.045) % 2 ? 0.25 : 1) : 1;
    const fa = sm(0, 0.1, p) * bl * (1 - sm(0.93, 1, p));
    const sel = E.inOutCubic(clamp((p - 0.1) / 0.16)), selA = 0.32 * (1 - sm(0.46, 0.58, p));
    const q = clamp((p - 0.46) / 0.14);
    const gone = i => q > 0 && L.stagger(q, i, n, 0.85, 'rl') > 0;
    if (q > 0) fn(it, i => (gone(i) ? { hide: true } : null));
    // キャレット: 残っている最後の字の後ろ
    let car = null;
    if (p > 0.44 && p < 0.74) {
      let last = null, first = null;
      for (const g of m.lay) { if (g.space) continue; if (!first) first = g; if (!gone(g.i)) last = g; }
      const g = last || first;
      if (g) car = last ? (vert ? [g.x, g.y + g.h / 2 + s * 0.04] : [g.x + g.w / 2 + s * 0.04, g.y]) : (vert ? [g.x, g.y - g.h / 2] : [g.x - g.w / 2, g.y]);
    }
    const carOn = Math.floor(p / 0.05) % 2 === 0;
    chain(it, 'pre', (e2, it2) => {
      if (!isMain(e2) || selA * sel <= 0.002) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2) * selA; ctx.fillStyle = sc.accent2;
      if (vert) ctx.fillRect(-hw0, -hh0, hw0 * 2, hh0 * 2 * sel); else ctx.fillRect(-hw0, -hh0, hw0 * 2 * sel, hh0 * 2);
      ctx.restore();
    });
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2)) return;
      const ctx = e2.ctx, A = ia(it2);
      ctx.save();
      if (fa > 0.002) {
        const lw = Math.max(1, s * 0.022), hs = Math.max(3, s * 0.085) * (1 - 0.5 * cw);
        if (hw < 0.5 && hh < 0.5) { ctx.globalAlpha = A * fa; ctx.fillStyle = sc.accent2; ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, s * 0.05), 0, TAU); ctx.fill(); }
        else selFrame(ctx, -hw, -hh, hw, hh, sc.accent2, lw, hs, A * fa, '#ffffff');
      }
      if (car && carOn) {
        ctx.globalAlpha = A; ctx.fillStyle = sc.accent;
        const t = Math.max(1.5, s * 0.06), L1 = s * 1.05;
        if (vert) ctx.fillRect(car[0] - L1 / 2, car[1] - t / 2, L1, t); else ctx.fillRect(car[0] - t / 2, car[1] - L1 / 2, t, L1);
      }
      ctx.restore();
    });
  },
});

/* 3. タイルへ縮む: 字が枠つきの小さなタイルに収まりながら画面の隅へ縮んで(リキャップ格子に並ぶように)消える */
regX('srTileAway', {
  name: 'タイルへ縮む', tags: ['editorial', 'graphic', 'calm'], w: 0.9,
  apply(env, it, p, c) {
    ghostFade(env, it, p, 0.0, 0.15);
    const seed = sd(env, c), m = meas(it), s = SZ(it), sc = env.sc, W = env.W, H = env.H;
    const corner = L.h(seed, 'tile') % 4;
    const tx = W * (corner % 2 ? 0.8 : 0.2), ty = H * (corner > 1 ? 0.78 : 0.22);
    const sx0 = Math.abs(it.sx == null ? 1 : it.sx) || 1, sy0 = Math.abs(it.sy == null ? 1 : it.sy) || 1;
    const pad = s * 0.35;
    let hw = m.w / 2 + pad, hh = m.h / 2 + pad;
    const ar = W / H;
    if (hw * sx0 / (hh * sy0) < ar) hw = hh * sy0 * ar / sx0; else hh = hw * sx0 / ar / sy0;
    const Sf = clamp(Math.min(W, H) * 0.3 / (hh * 2 * sy0), 0.06, 0.45);
    const e = E.inOutExpo(clamp((p - 0.06) / 0.66));
    const S = lerp(1, Sf, e);
    const grow = E.outCubic(clamp(p / 0.25));
    const fhw = lerp(m.w / 2 + s * 0.1, hw, grow), fhh = lerp(m.h / 2 + s * 0.1, hh, grow);
    const ta = sm(0.02, 0.2, p);
    it.x = lerp(it.x || 0, tx, e); it.y = lerp(it.y || 0, ty, e);
    it.sx = (it.sx == null ? 1 : it.sx) * S; it.sy = (it.sy == null ? 1 : it.sy) * S;
    mulA(it, 1 - sm(0.74, 1, p));
    const idx = (env.cut && env.cut.idx) || 0;
    chain(it, 'pre', (e2, it2) => {
      if (!isMain(e2) || ta <= 0.002) return;
      const ctx = e2.ctx;
      ctx.save(); ctx.globalAlpha = ia(it2) * ta * 0.85; ctx.fillStyle = L.mix(sc.bg, sc.fg, 0.07);
      ctx.fillRect(-fhw, -fhh, fhw * 2, fhh * 2);
      ctx.restore();
    });
    chain(it, 'post', (e2, it2) => {
      if (!isMain(e2) || ta <= 0.002) return;
      const ctx = e2.ctx, k = Math.abs(it2.sx || 1) || 1, lw = Math.max(1, e2.u * 2) / k;
      ctx.save(); ctx.globalAlpha = ia(it2) * ta * 0.8; ctx.strokeStyle = sc.fg; ctx.lineWidth = lw;
      ctx.strokeRect(-fhw, -fhh, fhw * 2, fhh * 2);
      const fs = Math.max(6, e2.u * 15) / k;
      ctx.fillStyle = sc.accent; ctx.font = `700 ${fs.toFixed(2)}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(pad2(idx + 1), -fhw, fhh + fs * 0.4);
      ctx.restore();
    });
  },
});

/* ================================================================ trans (5)
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
const putAt = (ctx, img, cw, ch, cx, cy, sx, sy, a) => {
  if (a <= 0.002) return;
  ctx.save(); ctx.globalAlpha = clamp(a);
  ctx.translate(cx, cy); ctx.scale(sx || 1e-4, sy || 1e-4); ctx.translate(-cx, -cy);
  ctx.drawImage(img, 0, 0, cw, ch);
  ctx.restore();
};

/* 1. 玉で塗りつぶす: 玉が端から弾んで入り、着地して画面いっぱいに膨らむ。逆の円(穴)が開いて B */
trans('srBallFill', {
  name: '玉で塗りつぶす', tags: ['pop', 'graphic'], w: 1, dur: 0.62,
  plan: rng => ({ side: rng.sign() }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, side = Pp.side || 1, u = info.u, acc = info.sc.accent;
    const R0 = Math.min(cw, ch) * 0.07, gy = ch * 0.66, lx = cw / 2;
    const sx0 = side < 0 ? -R0 * 2 : cw + R0 * 2, sy0 = ch * 0.12, bx1 = lerp(sx0, lx, 0.55), hgt = ch * 0.2;
    const T1 = 0.4, T2 = 0.6;
    const posAt = v => {                                           // v 0..1 → 玉の底の位置
      if (v < 0.55) { const t = v / 0.55; return [lerp(sx0, bx1, t), lerp(sy0, gy, t * t)]; }
      const t = (v - 0.55) / 0.45; return [lerp(bx1, lx, t), gy - hgt * 4 * t * (1 - t)];
    };
    const Rc = Math.max(Math.hypot(lx, gy - R0), Math.hypot(cw - lx, gy - R0), Math.hypot(lx, ch - gy + R0), Math.hypot(cw - lx, ch - gy + R0)) * 1.03;
    if (p < T2) ctx.drawImage(A, 0, 0);
    if (p < T1) {
      const v = p / T1;
      // 点線の放物線とオニオンスキン
      ctx.fillStyle = info.sc.fg;
      for (let k = 0; k * 0.035 < v; k++) {
        const [x, y] = posAt(k * 0.035);
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y - R0, Math.max(1, u * 2.5), 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, u * 2);
      for (let k = 1; k <= 3; k++) {
        const vv = v - k * 0.07;
        if (vv <= 0) break;
        const [x, y] = posAt(vv);
        ctx.globalAlpha = 0.45 * (1 - k / 4); ctx.beginPath(); ctx.arc(x, y - R0, R0, 0, TAU); ctx.stroke();
      }
      const [x, y] = posAt(v);
      const q = Math.max(Math.exp(-Math.pow((v - 0.55) / 0.045, 2)), Math.exp(-Math.pow((v - 1) / 0.045, 2)));
      const sxq = 1 + 0.45 * q, syq = 1 - 0.38 * q;
      ctx.globalAlpha = 0.6; ctx.fillStyle = info.sc.fg; ctx.fillRect(Math.min(sx0, lx) - R0, gy, Math.abs(lx - sx0) + R0 * 3, Math.max(1, u * 2));
      drawBall(ctx, x, y - R0 * syq, R0, sxq, syq, acc, 1);
      return;
    }
    if (p < T2) {
      const e = E.inCubic((p - T1) / (T2 - T1)), r = lerp(R0, Rc, e);
      ctx.globalAlpha = 1; ctx.fillStyle = acc;
      ctx.beginPath(); ctx.arc(lx, gy - R0, r, 0, TAU); ctx.fill();
      return;
    }
    const e = E.inOutCubic(clamp((p - T2) / (0.96 - T2))), hr = Rc * e;
    ctx.save(); ctx.beginPath(); ctx.arc(lx, gy - R0, Math.max(0.01, hr), 0, TAU); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    ctx.globalAlpha = 1; ctx.fillStyle = acc;
    ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.arc(lx, gy - R0, Math.max(0.01, hr), 0, TAU); ctx.fill('evenodd');
    ctx.globalAlpha = 1 - e; ctx.strokeStyle = info.sc.accent2; ctx.lineWidth = Math.max(1.5, u * 5);
    ctx.beginPath(); ctx.arc(lx, gy - R0, hr + u * 3, 0, TAU); ctx.stroke();
  },
});

/* 2. 点に潜る: A の中心付近の一点へ突っ込み、ぼけた円(藍の放射グラデ)が画面を満たし、その色から B が現れる */
trans('srDotDive', {
  name: '点に潜る', tags: ['graphic', 'emotional', 'pop', 'editorial'], w: 0.9, dur: 0.6,
  plan: rng => ({ ox: rng.range(-0.06, 0.06), oy: rng.range(-0.04, 0.04) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, col = info.sc.accent2;
    const cx = cw * (0.5 + (Pp.ox || 0)), cy = ch * (0.5 + (Pp.oy || 0));
    const dmax = Math.max(Math.hypot(cx, cy), Math.hypot(cw - cx, cy), Math.hypot(cx, ch - cy), Math.hypot(cw - cx, ch - cy));
    if (p < 0.58) {
      const z = 1 + 7 * E.inExpo(clamp(p / 0.55));
      putAt(ctx, A, cw, ch, cx, cy, z, z, 1 - sm(0.3, 0.55, p));
      const rd = lerp(info.u * 8, dmax / 0.5 * 1.04, E.inCubic(clamp((p - 0.03) / 0.52)));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rd);
      g.addColorStop(0, L.rgba(col, 1)); g.addColorStop(0.5, L.rgba(col, 1)); g.addColorStop(1, L.rgba(col, 0));
      ctx.globalAlpha = sm(0, 0.08, p); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      return;
    }
    const q = (p - 0.58) / 0.42;
    ctx.globalAlpha = 1 - E.inOutSine(q); ctx.fillStyle = col; ctx.fillRect(0, 0, cw, ch);
    const z = 1 + 0.35 * (1 - E.outCubic(q));
    putAt(ctx, B, cw, ch, cx, cy, z, z, E.outCubic(clamp(q * 1.3)));
  },
});

/* 3. 光の線で繋ぐ: A が上下に潰れて一本の光る横線になり、その線が上下に開いて B になる */
trans('srCrtLine', {
  name: '光の線で繋ぐ', tags: ['cyber', 'glitch', 'dark', 'graphic'], w: 0.9, dur: 0.5,
  draw(ctx, A, B, p, info) {
    const cw = info.cw, ch = info.ch, u = info.u, ly = ch / 2;
    const bgL = L.lum(info.sc.bg) > 0.5;
    const gc = bgL ? info.sc.fg : L.mix(info.sc.fg, '#ffffff', 0.7);
    let la, lwid;
    if (p < 0.44) {
      const q = p / 0.44, sy = Math.max(0.004, 1 - E.inExpo(q)), sx = 1 + 0.06 * E.inCubic(q);
      putAt(ctx, A, cw, ch, cw / 2, ly, sx, sy, 1);
      la = sm(0.45, 1, q); lwid = cw * (0.4 + 0.6 * E.outCubic(q));
    } else if (p < 0.54) {
      la = 1; lwid = cw;
    } else {
      const q = (p - 0.54) / 0.46, sy = Math.max(0.004, E.outExpo(q)), sx = 1 + 0.06 * (1 - E.outCubic(q));
      putAt(ctx, B, cw, ch, cw / 2, ly, sx, sy, 1);
      la = 1 - sm(0, 0.55, q); lwid = cw * (1 - 0.3 * E.inCubic(q));
    }
    if (la <= 0.002) return;
    const flick = p > 0.4 && p < 0.58 ? 0.85 + 0.15 * Math.sin(p * 90) : 1;
    for (const [h, a] of [[u * 44, 0.07], [u * 18, 0.16], [u * 7, 0.45], [u * 2.6, 1]]) {
      ctx.globalAlpha = la * a * flick; ctx.fillStyle = gc;
      const hh = Math.max(1, h);
      ctx.fillRect(cw / 2 - lwid / 2, ly - hh / 2, lwid, hh);
    }
  },
});

/* 4. パネルで押し出す: 右から B のパネルが縦の直線で A を左へ押し出す。境目に細い色線、層ごとに少し速さが違う */
trans('srPanelSlide', {
  name: 'パネルで押し出す', tags: ['editorial', 'graphic', 'pop'], w: 1, dur: 0.5,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, d = Pp.dir || 1, u = info.u;
    const e = E.inOutExpo(p), edge = cw * (1 - e);                // d=1: パネル左端(d=-1 は鏡像)
    const X = x => (d > 0 ? x : cw - x);
    const xa = -cw * e * 0.85, xb = edge * 0.8;
    ctx.save(); ctx.beginPath(); ctx.rect(d > 0 ? 0 : X(edge), 0, edge, ch); ctx.clip();
    ctx.drawImage(A, d * xa, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(d > 0 ? edge : 0, 0, cw - edge, ch); ctx.clip();
    const ta = 0.45 * (1 - sm(0.55, 0.95, p));
    if (ta > 0.002) { ctx.globalAlpha = ta; ctx.fillStyle = L.mix(info.sc.bg, info.sc.fg, 0.08); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
    ctx.drawImage(B, d * xb, 0); ctx.restore();
    const sa = sm(0, 0.04, p) * (1 - sm(0.9, 1, p));
    if (sa > 0.002) {
      const lw = Math.max(2, u * 6);
      ctx.globalAlpha = sa; ctx.fillStyle = info.sc.accent; ctx.fillRect(X(edge) - lw / 2, 0, lw, ch);
      ctx.fillStyle = info.sc.accent2; const l2 = Math.max(1, u * 2);
      ctx.fillRect(X(edge + u * 16) - l2 / 2, 0, l2, ch);
    }
  },
});

/* 5. 格子から戻る: A が 3×3 の枠付きタイルの一つに縮み(他のタイルには A/B の淡い写し)、中央のタイルから B が画面いっぱいへ戻る */
trans('srRecapGrid', {
  name: '格子から戻る', tags: ['editorial', 'graphic', 'calm'], w: 0.8, dur: 0.8,
  plan: rng => ({ tile: rng.pick([0, 1, 2, 3, 5, 6, 7, 8]), seed: rng.int(1, 9999) }),
  draw(ctx, A, B, p, info, Pp) {
    const cw = info.cw, ch = info.ch, u = info.u, sc = info.sc, kA = Pp.tile == null ? 0 : Pp.tile, seed = Pp.seed || 1;
    const g = Math.min(cw, ch) * 0.028, tw = (cw - 4 * g) / 3, th = (ch - 4 * g) / 3;
    const rect = i => [g + (i % 3) * (tw + g), g + Math.floor(i / 3) * (th + g)];
    const fa = sm(0.05, 0.35, p) * (1 - sm(0.62, 0.96, p));
    // 縮小写しを一度だけ作る(A: 左半分 / B: 右半分)
    const bw = Math.max(1, Math.ceil(tw)), bh = Math.max(1, Math.ceil(th));
    let T = null;
    if (fa > 0.002 && info.tmp) {
      T = info.tmp(bw * 2, bh);
      const tc = T.getContext('2d');
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1;
      tc.clearRect(0, 0, bw * 2, bh);
      tc.drawImage(A, 0, 0, cw, ch, 0, 0, bw, bh);
      tc.drawImage(B, 0, 0, cw, ch, bw, 0, bw, bh);
    }
    const e1 = E.inOutExpo(clamp(p / 0.42)), e3 = E.inOutExpo(clamp((p - 0.55) / 0.45));
    if (fa > 0.002) {
      for (let i = 0; i < 9; i++) {
        const [x, y] = rect(i);
        ctx.globalAlpha = fa * 0.55; ctx.fillStyle = L.mix(sc.bg, sc.fg, 0.06); ctx.fillRect(x, y, tw, th);
        if (T && i !== kA && i !== 4) {
          const useB = L.h(seed, 'rg', i) % 2;
          ctx.globalAlpha = fa * 0.3;
          ctx.drawImage(T, useB ? bw : 0, 0, bw, bh, x, y, tw, th);
        }
        ctx.globalAlpha = fa * 0.4; ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 1.5);
        ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      }
    }
    // A: 全画面 → タイル kA、B が出た後は淡く
    const [ax, ay] = rect(kA);
    const aA = 1 - sm(0.6, 0.85, p);
    if (aA > 0.002) {
      ctx.globalAlpha = aA;
      ctx.drawImage(A, 0, 0, cw, ch, lerp(0, ax, e1), lerp(0, ay, e1), lerp(cw, tw, e1), lerp(ch, th, e1));
    }
    // 注目の枠: A のタイル → 中央
    const [cx4, cy4] = rect(4);
    const hl = sm(0.44, 0.54, p);
    const hx = lerp(ax, cx4, E.inOutCubic(hl)), hy = lerp(ay, cy4, E.inOutCubic(hl));
    const ha = sm(0.3, 0.42, p) * (1 - sm(0.6, 0.72, p));
    if (ha > 0.002) { ctx.globalAlpha = ha; ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(2, u * 4); ctx.strokeRect(hx, hy, tw, th); }
    // B: 中央タイル → 全画面
    if (p > 0.5) {
      ctx.globalAlpha = sm(0.5, 0.58, p);
      ctx.drawImage(B, 0, 0, cw, ch, lerp(cx4, 0, e3), lerp(cy4, 0, e3), lerp(tw, cw, e3), lerp(th, ch, e3));
    }
    ctx.globalAlpha = 1;
  },
});

/* ================================================================ decor (7) */
const warned = new Set();
const regD = (key, def) => {
  const f = def.draw;
  def.draw = function (env, bb, Pd) {
    try { return f.call(this, env, bb, Pd || {}); } catch (e) {
      if (!warned.has(key)) { warned.add(key); console.warn('[LFC] ' + P + ' decor ' + key + ': ' + (e && e.message)); }
      return undefined;
    }
  };
  L.register('decor', key, def, P);
};
const mn = env => Math.min(env.W, env.H);
const accC = (env, two) => L.fitContrast(two ? env.sc.accent2 : env.sc.accent, env.sc.bg, 2.3);
const padBB = (env, bb, k) => {
  const b = L.centerBB(env, bb), q = env.u * k;
  return { x0: b.x0 - q, y0: b.y0 - q, x1: b.x1 + q, y1: b.y1 + q, w: b.w + q * 2, h: b.h + q * 2, cx: b.cx, cy: b.cy };
};
const hit = (r, b) => !(r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1);
const beatOf = env => {
  const len = M.beatLen(env);
  let k, since;
  if (env.beat) { k = env.beat.index; since = Math.max(0, env.beat.since); }
  else { const t = Math.max(0, env.t); k = Math.floor(t / len); since = t - k * len; }
  return { k, since, len, f: clamp(since / len), kick: Math.exp(-since / 0.13) };
};
/* 隅(pref から順に)で歌詞と重ならない w×h の場所 */
const spot = (env, bb, w, h, pref = 0, kx = 0.06, ky = 0.08) => {
  const { W, H } = env, m = mn(env), mx = m * kx, my = m * ky, b = padBB(env, bb, 12);
  const C = [[mx, my], [W - mx - w, my], [W - mx - w, H - my - h], [mx, H - my - h]];
  for (let k = 0; k < 4; k++) {
    const idx = (((pref | 0) + k) % 4 + 4) % 4, c = C[idx];
    if (c[0] < 0 || c[1] < 0) continue;
    const r = { x0: c[0], y0: c[1], x1: c[0] + w, y1: c[1] + h };
    if (!hit(r, b)) return { x: c[0], y: c[1], w, h, cx: c[0] + w / 2, cy: c[1] + h / 2, corner: idx };
  }
  return null;
};
const fitSpot = (env, bb, w, h, pref) => {
  for (const k of [1, 0.75, 0.55]) { const s = spot(env, bb, w * k, h * k, pref); if (s) { s.k = k; return s; } }
  return null;
};
/* 整数ハッシュ(グレイン用に高速) */
const ih = (a, b) => {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const monoFont = (fs, w = 700) => `${w} ${fs.toFixed(1)}px ${MONO}`;

/* 1. フィルムグレイン: 24コマ/秒で入れ替わる細かい粒と、まれな埃。背景側で非常に淡く */
regD('srGrain', {
  name: 'フィルムグレイン', tags: ['dark', 'editorial', 'emotional', 'calm', 'graphic'], w: 0.8, layer: 'back', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env;
    const N = Math.min(1000, Math.max(200, Math.round(W * H / (2200 * u * u))));
    const st = env.step | 0, sd0 = (Pd.seed | 0) & 0xffff;
    const light = [], dark = [];
    ctx.save();
    const pl = new Path2D(), pd = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = ih(st * 7919 + i, sd0) * W, y = ih(i * 31 + 7, st * 104729 + sd0) * H, r3 = ih(i, st + 13);
      const z = Math.max(1, u * (1 + 2 * r3));
      (r3 < 0.5 ? pl : pd).rect(x, y, z, z);
    }
    ctx.globalAlpha = io * (sc.dark ? 0.11 : 0.05); ctx.fillStyle = '#ffffff'; ctx.fill(pl);
    ctx.globalAlpha = io * (sc.dark ? 0.16 : 0.1); ctx.fillStyle = '#000000'; ctx.fill(pd);
    // 埃・毛くず(たまに)
    ctx.lineWidth = Math.max(1, u * 1.5); ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      if (ih(st, j + sd0 * 3) > 0.3) continue;
      const x = ih(st + 99, j) * W, y = ih(j + 5, st + 7) * H, rr = mn(env) * (0.01 + 0.03 * ih(st, j + 40));
      ctx.globalAlpha = io * 0.22; ctx.strokeStyle = sc.dark ? '#ffffff' : '#000000';
      ctx.beginPath(); ctx.arc(x, y, rr, ih(j, st + 3) * TAU, ih(j, st + 3) * TAU + 1.6); ctx.stroke();
    }
    // 露光のちらつき
    ctx.globalAlpha = io * 0.025 * ih(st, 777); ctx.fillStyle = sc.dark ? '#ffffff' : '#000000'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    light.length = dark.length = 0;
  },
});

/* 2. 注釈ラベル: 歌詞の角の外から斜め→水平の引き出し線、小さな点、アニメーション原則の等幅ラベル */
const PRINCIPLES = ['EASE OUT', 'OVERSHOOT', 'ANTICIPATION', 'FOLLOW THROUGH', 'SQUASH & STRETCH', 'ARC', 'TIMING', 'SPACING'];
regD('srCallout', {
  name: '注釈ラベル', tags: ['editorial', 'graphic', 'cyber', 'calm'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), b = padBB(env, bb, 8), bs = padBB(env, bb, 4), bt = beatOf(env);
    const label = PRINCIPLES[(((Pd.v | 0) + (Pd.seed | 0)) % 8 + 8) % 8];
    const fs = Math.max(7, u * 17);
    let found = null;
    /* 候補: 四隅(斜め外向き)と上下の辺の点(真上/真下へ斜め)。ラベルは水平線の上に載る */
    const cands = [];
    for (let k = 0; k < 4; k++) {
      const c = (((Pd.corner | 0) + k) % 4 + 4) % 4;
      const sx = c === 1 || c === 2 ? 1 : -1, sy = c >= 2 ? 1 : -1;
      cands.push([sx > 0 ? b.x1 : b.x0, sy > 0 ? b.y1 : b.y0, sx, sy]);
    }
    for (const sy of [-1, 1]) for (const f of [0.2, 0.8]) cands.push([b.x0 + b.w * f, sy > 0 ? b.y1 : b.y0, f < 0.5 ? 1 : -1, sy]);
    for (const shrink of [1, 0.75, 0.55]) {
      const f = fs * shrink;
      ctx.font = monoFont(f);
      const tw = ctx.measureText(label).width * 1.08, hl = tw + f * 1.2;
      for (const dk of [0.055, 0.1]) {
        const d = m * dk * Math.max(0.7, shrink);
        for (const [ax, ay, sx, sy] of cands) {
          const ex = ax + sx * d, ey = ay + sy * d, fx = ex + sx * hl;
          const r = { x0: Math.min(ex, fx) - f * 0.3, x1: Math.max(ex, fx) + f * 0.3, y0: ey - f * 2.4, y1: ey + f * 0.4 };
          if (r.x0 < m * 0.03 || r.x1 > W - m * 0.03 || r.y0 < m * 0.03 || r.y1 > H - m * 0.03) continue;
          if (hit(r, bs)) continue;
          found = { ax, ay, ex, ey, fx, sx, sy, f, tw };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) return;
    const { ax, ay, ex, ey, fx, sx, f } = found;
    const lt = env.lt, pts = [[ax, ay], [ex, ey], [fx, ey]];
    const e1 = E.inOutCubic(clamp(lt / 0.6));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = io * 0.85; ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 1.6);
    ctx.beginPath(); pathSeg(ctx, pts, 0, polyLen(pts) * e1); ctx.stroke();
    const dp = E.outBack(clamp(lt / 0.25), 2.2), ac = accC(env);
    ctx.globalAlpha = io; ctx.fillStyle = ac;
    ctx.beginPath(); ctx.arc(ax, ay, Math.max(2, u * 5) * dp, 0, TAU); ctx.fill();
    if (bt.f < 1) { ctx.globalAlpha = io * 0.5 * (1 - bt.f); ctx.strokeStyle = ac; ctx.lineWidth = Math.max(1, u * 1.4); ctx.beginPath(); ctx.arc(ax, ay, u * (6 + 14 * E.outCubic(bt.f)), 0, TAU); ctx.stroke(); }
    // 端の小さな縦線
    if (e1 > 0.98) { ctx.globalAlpha = io * 0.85; ctx.fillStyle = sc.fg; ctx.fillRect(fx - u, ey - f * 0.35, Math.max(1, u * 1.6), f * 0.7); }
    const nch = Math.floor(label.length * clamp((lt - 0.4) / 0.45) + 0.001);
    if (nch > 0) {
      ctx.globalAlpha = io; ctx.fillStyle = sc.fg; ctx.font = monoFont(f); ctx.textBaseline = 'alphabetic';
      ctx.textAlign = sx > 0 ? 'left' : 'right';
      const lx = ex + sx * f * 0.3;
      ctx.fillText(label.slice(0, nch), lx, ey - f * 0.45);
      ctx.globalAlpha = io * 0.7; ctx.fillStyle = sc.sub; ctx.font = monoFont(f * 0.72, 400);
      ctx.fillText(`t=${Math.max(0, lt).toFixed(2)}s`, lx, ey - f * 1.55);
    }
    ctx.restore();
  },
});

/* 3. 選択ハンドル: 歌詞を囲む選択枠(細い差し色2の線・白い四角ハンドル8個)と、塗りの札に W×H */
regD('srSelectBox', {
  name: '選択ハンドル', tags: ['editorial', 'cyber', 'graphic'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), lt = env.lt;
    const b0 = padBB(env, bb, 14), mg = m * 0.02;
    const x0 = Math.max(mg, b0.x0), y0 = Math.max(mg, b0.y0), x1 = Math.min(W - mg, b0.x1), y1 = Math.min(H - mg, b0.y1);
    const col = accC(env, true), lw = Math.max(1, u * 1.6), hs = Math.max(3, u * 9);
    const e = E.outExpo(clamp(lt / 0.45));
    ctx.save();
    ctx.globalAlpha = io; ctx.strokeStyle = col; ctx.lineWidth = lw;
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    ctx.beginPath(); pathSeg(ctx, pts, 0, polyLen(pts) * e); ctx.stroke();
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    [[x0, y0], [mx, y0], [x1, y0], [x1, my], [x1, y1], [mx, y1], [x0, y1], [x0, my]].forEach(([x, y], i) => {
      const k = E.outBack(clamp((lt - 0.1 - i * 0.03) / 0.25), 2.2);
      if (k <= 0.01) return;
      const z = hs * k;
      ctx.globalAlpha = io; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - z / 2, y - z / 2, z, z);
      ctx.strokeRect(x - z / 2, y - z / 2, z, z);
    });
    // W×H の札(下に余白が無ければ上)
    const fs = Math.max(7, u * 14), txt = `${Math.round((x1 - x0) / u)} × ${Math.round((y1 - y0) / u)}`;
    ctx.font = monoFont(fs);
    const tw = ctx.measureText(txt).width, pw = tw + fs * 1.1, ph = fs * 1.6;
    let ty = y1 + hs * 0.5 + fs * 0.5;
    if (ty + ph > H - mg) ty = y0 - hs * 0.5 - fs * 0.5 - ph;
    if (ty >= mg * 0.5) {
      const ta = io * sm(0.3, 0.55, lt), tx = mx - pw / 2;
      ctx.globalAlpha = ta; ctx.fillStyle = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx, ty, pw, ph, ph * 0.28); else ctx.rect(tx, ty, pw, ph);
      ctx.fill();
      ctx.fillStyle = L.onColor(col); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, mx, ty + ph / 2 + fs * 0.05);
    }
    ctx.restore();
  },
});

/* 4. 波形ストリップ: 画面下(無理なら上)に音声波形の縦棒の列、カットの進行で動く再生ヘッド、両端に時刻 */
regD('srWaveStrip', {
  name: '波形ストリップ', tags: ['editorial', 'cyber', 'graphic', 'pop'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, W, H, u, sc, cut } = env, m = mn(env), lt = env.lt, bt = beatOf(env);
    const b = padBB(env, bb, 10), fs = Math.max(6, u * 13);
    let hS = m * 0.075;
    const x0 = m * 0.07, x1 = W - m * 0.07;
    let yc = null;
    for (const k of [1, 0.65]) {
      const h = hS * k, yB = H - m * 0.08 - h / 2, yT = m * 0.08 + fs * 1.4 + h / 2;
      if (!hit({ x0, x1, y0: yB - h / 2 - fs * 1.6, y1: yB + h / 2 }, b)) { yc = yB; hS = h; break; }
      if (!hit({ x0, x1, y0: yT - h / 2 - fs * 1.6, y1: yT + h / 2 }, b)) { yc = yT; hS = h; break; }
    }
    if (yc == null) return;
    const N = Math.round(clamp((x1 - x0) / (u * 9), 24, 120)), step = (x1 - x0) / N, bw = step * 0.55;
    const prog = clamp(lt / Math.max(0.3, cut.dur)), ph = x0 + (x1 - x0) * prog;
    const sd0 = (Pd.seed | 0) % 97, en = env.energy == null ? 0.5 : env.energy;
    const played = new Path2D(), rest = new Path2D();
    for (let i = 0; i < N; i++) {
      const gr = E.outCubic(clamp((lt - i / N * 0.35) / 0.3));
      if (gr <= 0.01) continue;
      let h = 0.16 + 0.84 * Math.pow(L.noise1(i * 0.23, sd0), 1.3) * (0.5 + 0.5 * L.noise1(i * 0.06 + 5, sd0 + 3));
      const x = x0 + i * step + (step - bw) / 2;
      const near = Math.abs(x - ph) / (step * 4);
      if (near < 1) h *= 1 + (0.25 + 0.5 * en) * (1 - near) * (0.5 + 0.5 * bt.kick);
      const hh = Math.min(1.25, h) * hS / 2 * gr;
      ((x + bw / 2) < ph ? played : rest).rect(x, yc - hh, bw, hh * 2);
    }
    ctx.save();
    ctx.globalAlpha = io; ctx.fillStyle = accC(env); ctx.fill(played);
    ctx.globalAlpha = io * 0.45; ctx.fillStyle = sc.sub; ctx.fill(rest);
    ctx.globalAlpha = io * 0.35; ctx.fillStyle = sc.sub; ctx.fillRect(x0, yc - Math.max(0.5, u * 0.6), x1 - x0, Math.max(1, u * 1.2));
    // 再生ヘッド
    ctx.globalAlpha = io; ctx.fillStyle = sc.fg;
    const lw = Math.max(1, u * 2), top = yc - hS * 0.75;
    ctx.fillRect(ph - lw / 2, top, lw, hS * 1.5);
    ctx.beginPath(); ctx.moveTo(ph - fs * 0.4, top - fs * 0.45); ctx.lineTo(ph + fs * 0.4, top - fs * 0.45); ctx.lineTo(ph, top); ctx.closePath(); ctx.fill();
    ctx.font = monoFont(fs); ctx.textBaseline = 'bottom'; ctx.fillStyle = sc.sub; ctx.globalAlpha = io * 0.9;
    const ly = yc - hS * 0.62;
    ctx.textAlign = 'left'; ctx.fillText(L.fmtTime(cut.start), x0, ly);
    ctx.textAlign = 'right'; ctx.fillText(L.fmtTime(cut.end), x1, ly);
    ctx.restore();
  },
});

/* 5. 余白のコード: 画面の脇の列に、淡い等幅の擬似コードが行番号付きで上へ流れる(背景) */
const CODE_T = [
  'const {i} = {f}({i}, {n});', 'if ({i} > {n}) {', '}', '{i}.{p} = lerp({i}.{p}, {n}, t);', 'return {f}({i} * {n});',
  'for (let k = 0; k < {k}; k++) {', '// {c}', 'key({n}, "{e}");', '{i}.{p} += vel * dt;', 'await beat({k});',
];
const CODE_I = ['pos', 'scale', 'ball', 'frame', 'beat', 'vel', 'amp', 'dot', 'grid', 'curve'];
const CODE_F = ['ease', 'spring', 'snap', 'wave', 'bounce', 'hold'];
const CODE_P = ['x', 'y', 'r', 'sx', 'sy', 'rot'];
const CODE_E = ['outExpo', 'inOutCubic', 'outBack', 'linear'];
const CODE_C = ['squash on impact', 'hold 2 frames', 'overshoot 8%', 'anticipation', 'follow through', 'ease into pose'];
const codeCache = new Map();
const codeLine = (seed, n) => {
  const key = seed * 100003 + n;
  let s = codeCache.get(key);
  if (s) return s;
  const r = j => L.h(seed, 'cl', n, j);
  let t = CODE_T[r(0) % CODE_T.length];
  let j = 1;
  t = t.replace(/\{(\w)\}/g, (_, c) => {
    const v = r(j++);
    if (c === 'i') return CODE_I[v % CODE_I.length];
    if (c === 'f') return CODE_F[v % CODE_F.length];
    if (c === 'p') return CODE_P[v % CODE_P.length];
    if (c === 'e') return CODE_E[v % CODE_E.length];
    if (c === 'c') return CODE_C[v % CODE_C.length];
    if (c === 'k') return String(2 + v % 14);
    return ((v % 1000) / 100).toFixed(2);
  });
  s = '  '.repeat(r(9) % 3) + t;
  if (codeCache.size > 600) codeCache.clear();
  codeCache.set(key, s);
  return s;
};
regD('srCodeMargin', {
  name: '余白のコード', tags: ['cyber', 'editorial', 'dark', 'graphic'], w: 0.75, layer: 'back', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.5); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), b = L.centerBB(env, bb), bt = beatOf(env);
    const fs = Math.max(5, u * 13), lh = fs * 1.6;
    const lf = b.x0, rf = W - b.x1;
    let right = !!Pd.right;
    if ((right ? rf : lf) < m * 0.3 && (right ? lf : rf) > (right ? rf : lf)) right = !right;
    const colW = clamp(Math.max(right ? rf : lf, m * 0.3) - m * 0.06, m * 0.25, Math.min(W * 0.32, m * 0.6));
    const x0 = right ? W - m * 0.05 - colW : m * 0.05, yT = m * 0.08, yB = H - m * 0.08;
    const sd0 = (Pd.seed | 0) % 9973;
    const off = Math.max(0, env.ltb) * lh * 1.8 + (env.beat ? bt.k * lh * 0.5 + lh * 0.5 * E.outCubic(clamp(bt.since / 0.12)) : 0);
    const base = Math.floor(off / lh), frac = off - base * lh;
    const rows = Math.ceil((yB - yT) / lh) + 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, yT, colW, yB - yT); ctx.clip();
    ctx.font = monoFont(fs, 400); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const nw = fs * 2.6;
    for (let r = 0; r < rows; r++) {
      const y = yT + r * lh - frac + lh / 2;
      const ef = sm(0, lh * 2.5, y - yT) * sm(0, lh * 2.5, yB - y);
      if (ef <= 0.01) continue;
      const n = base + r;
      ctx.globalAlpha = io * ef * 0.14; ctx.fillStyle = sc.sub;
      ctx.fillText(String(n + 1).padStart(3, '0'), x0, y);
      ctx.globalAlpha = io * ef * (n % 7 === 3 ? 0.3 : 0.2); ctx.fillStyle = n % 7 === 3 ? accC(env) : sc.sub;
      ctx.fillText(codeLine(sd0, n), x0 + nw, y);
    }
    ctx.restore();
  },
});

/* 6. クローム星バッジ: 隅でゆっくり回る、ぷっくりした金属の星(差し色版もあり)。拍で弾む */
const puffyStar = (ctx, n, R, ri) => {
  const v = [];
  for (let k = 0; k < n * 2; k++) { const a = -PI / 2 + k * PI / n, r = k % 2 ? R * ri : R; v.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(v[v.length - 1], v[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let k = 0; k < v.length; k++) { const nx = v[(k + 1) % v.length], mm = mid(v[k], nx); ctx.quadraticCurveTo(v[k][0], v[k][1], mm[0], mm[1]); }
  ctx.closePath();
};
regD('srChromeBadge', {
  name: 'クローム星バッジ', tags: ['pop', 'graphic', 'cyber'], w: 0.8, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, u, sc } = env, m = mn(env), bt = beatOf(env), lt = env.lt;
    const R0 = m * (Pd.big ? 0.07 : 0.056);
    const sp = fitSpot(env, bb, R0 * 2.8, R0 * 2.8, (Pd.corner | 0) + 1); if (!sp) return;
    const R = R0 * sp.k, n = [5, 6, 8][(Pd.v | 0) % 3], ri = n === 8 ? 0.7 : 0.6;
    const sIn = E.outBack(clamp(lt / 0.45), 2.2);
    const hop = Math.sin(PI * clamp(bt.f / 0.5)) * R * 0.28 * (bt.len >= 0.3 ? 1 : 0.5);
    const sc1 = sIn * (1 + 0.1 * bt.kick);
    const ang = env.ltb * 0.9, wob = 0.82 + 0.18 * Math.cos(env.ltb * 2.1);
    const cx = sp.cx, cy = sp.cy - hop;
    ctx.save();
    ctx.globalAlpha = io * 0.35; ctx.fillStyle = sc.dark ? '#000000' : L.mix(sc.bg, '#000000', 0.3);
    ctx.beginPath(); ctx.ellipse(sp.cx, sp.cy + R * 1.15, R * 0.8 * sc1 * (1 - hop / (R * 0.6)), R * 0.14, 0, 0, TAU); ctx.fill();
    ctx.translate(cx, cy); ctx.scale(sc1 * wob, sc1); ctx.rotate(ang);
    const accent = !!Pd.accent;
    const gA = Math.cos(-ang + 0.6), gB = Math.sin(-ang + 0.6);
    const g = ctx.createLinearGradient(-gA * R, -gB * R, gA * R, gB * R);
    const stops = accent
      ? [[0, L.mix(sc.accent, '#ffffff', 0.65)], [0.3, sc.accent], [0.5, L.mix(sc.accent, '#ffffff', 0.35)], [0.7, L.mix(sc.accent, '#000000', 0.35)], [1, sc.accent]]
      : [[0, '#f7f8fa'], [0.22, '#9aa0aa'], [0.42, '#ffffff'], [0.56, '#474b54'], [0.74, '#dde1e7'], [1, '#7c818b']];
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.globalAlpha = io; ctx.fillStyle = g;
    ctx.beginPath(); puffyStar(ctx, n, R, ri); ctx.fill();
    ctx.strokeStyle = L.mix(sc.bg, '#000000', 0.5); ctx.lineWidth = Math.max(1, u * 1.8) / sc1; ctx.stroke();
    // 内側のふくらみ
    const g2 = ctx.createLinearGradient(gA * R, gB * R, -gA * R, -gB * R);
    g2.addColorStop(0, 'rgba(255,255,255,0.0)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g2.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g2; ctx.beginPath(); puffyStar(ctx, n, R * 0.62, ri + 0.05); ctx.fill();
    ctx.rotate(-ang);
    ctx.globalAlpha = io * 0.8; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-R * 0.3, -R * 0.35, R * 0.16, R * 0.08, -0.7, 0, TAU); ctx.fill();
    ctx.restore();
  },
});

/* 7. 矢印チップ: 歌詞と反対側の隅に、角丸の札(PLAY / NEXT / SCENE 0n…)と「↗」の丸、上に「01 / 05」の番号 */
regD('srArrowChip', {
  name: '矢印チップ', tags: ['pop', 'editorial', 'graphic'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, H, u, sc, cut } = env, b = L.centerBB(env, bb), bt = beatOf(env), lt = env.lt;
    const idx = (cut && cut.idx) || 0;
    const labels = ['PLAY', 'NEXT', 'SCENE ' + pad2(idx + 1), 'VIEW', 'SCENE ' + pad2(idx + 1), 'WATCH'];
    const label = labels[(Pd.v | 0) % labels.length], num = `${pad2(idx % 5 + 1)} / 05`;
    const fs0 = Math.max(7, u * 17);
    // 歌詞と反対の隅
    const opp = (b.cx < W / 2 ? 1 : 0) + (b.cy < H / 2 ? 2 : 0), pref = opp === 3 ? 2 : opp === 2 ? 3 : opp;
    ctx.font = monoFont(fs0);
    const tw0 = ctx.measureText(label).width;
    const chW = tw0 + fs0 * 2, chH = fs0 * 2.2, totW = chW + fs0 * 0.4 + chH, totH = chH + fs0 * 1.6;
    const sp = fitSpot(env, bb, totW, totH, pref); if (!sp) return;
    const k = sp.k, fs = fs0 * k, cH = chH * k, cW = chW * k;
    const right = sp.cx > W / 2;
    const sl = (1 - E.outExpo(clamp(lt / 0.5))) * totW * 0.35 * k * (right ? 1 : -1);
    const x = sp.x + sl, y = sp.y + fs * 1.6;
    ctx.save();
    ctx.globalAlpha = io * 0.85; ctx.fillStyle = sc.sub; ctx.font = monoFont(fs * 0.85); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText(num, x + fs * 0.2, y - fs * 0.5);
    ctx.globalAlpha = io; ctx.fillStyle = sc.accent;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, cW, cH, cH / 2); else ctx.rect(x, y, cW, cH);
    ctx.fill();
    ctx.fillStyle = sc.onInk; ctx.font = monoFont(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + cW / 2, y + cH / 2 + fs * 0.05);
    const ccx = x + cW + fs * 0.4 * k + cH / 2, ccy = y + cH / 2, cr = cH / 2 - Math.max(1, u);
    ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 2);
    ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.stroke();
    const nd = bt.kick * cr * 0.18, al = cr * 0.42;
    const ax = ccx + nd, ay = ccy - nd;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, u * 2.4);
    ctx.beginPath(); ctx.moveTo(ax - al, ay + al); ctx.lineTo(ax + al, ay - al);
    ctx.moveTo(ax - al * 0.1, ay - al); ctx.lineTo(ax + al, ay - al); ctx.lineTo(ax + al, ay + al * 0.1); ctx.stroke();
    ctx.restore();
  },
});

/* ================================================================ cam (1) */
/* キーフレーム跳び: 拍ごと(bpm 無しは約0.8秒ごと)に、止め→素早いスナップで小さく構図が跳ぶ。着地で僅かに行き過ぎて止まる */
L.register('cam', 'srKeyHop', {
  name: 'キーフレーム跳び', tags: ['graphic', 'editorial', 'pop', 'cyber'], w: 0.8,
  plan: rng => ({ seed: rng.int(1, 9999), amp: rng.range(0.026, 0.038) }),
  get(env, Pp) {
    Pp = Pp || {};
    let len, k, since;
    if (env.beat && env.beat.len > 0.05) {
      len = env.beat.len; k = env.beat.index; since = Math.max(0, env.beat.since);
      if (len < 0.3) { since += (((k % 2) + 2) % 2) * len; k = Math.floor(k / 2); len *= 2; }
    } else {
      len = 0.8; const t = Math.max(0, env.lt); k = Math.floor(t / len); since = t - k * len;
    }
    const sd0 = Pp.seed || 1, amp = Pp.amp || 0.032;
    const T = j => ({
      x: (((j % 2) + 2) % 2 ? 1 : -1) * amp * env.W * (0.45 + 0.55 * L.r(sd0, 'khx', j)),
      y: L.rs(sd0, 'khy', j) * amp * env.H * 0.9,
      s: 1.01 + 0.09 * L.r(sd0, 'khs', j),
      rot: L.rs(sd0, 'khr', j) * 2.2,
    });
    const a = T(k - 1), b = T(k);
    const d = Math.min(0.2, len * 0.45), uu = since / d;
    const f = uu < 1 ? E.inOutExpo(uu) : 1 + 0.07 * Math.sin((since - d) * 30) * Math.exp(-(since - d) * 15);
    const ramp = E.outCubic(clamp(Math.max(0, env.lt) / 0.3));
    const o = { x: lerp(a.x, b.x, f) * ramp, y: lerp(a.y, b.y, f) * ramp, s: 1 + (lerp(a.s, b.s, f) - 1) * ramp, rot: lerp(a.rot, b.rot, f) * ramp };
    o.x = clamp(o.x, -env.W * 0.05, env.W * 0.05); o.y = clamp(o.y, -env.H * 0.05, env.H * 0.05);
    o.s = clamp(o.s, 0.92, 1.15); o.rot = clamp(o.rot, -3, 3);
    return o;
  },
}, P);

/* ================================================================ styles (3) */
const SR_MONO = "'Space Mono', 'DotGothic16', monospace";
L.registerStyle('srOpusReel', {
  name: 'ショーリール(墨)', desc: '墨色の地に細かいフィルムグレイン、オレンジと青の差し色、生成りの文字。弾む玉・選択枠・注釈線のモーションデザイン・リール',
  moods: ['graphic', 'editorial', 'dark'],
  colors: { bg1: '#0d0d0f', bg2: '#17171b', accent: '#ff5a1f', accent2: '#3547ff', text: '#efeae0' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Shippori Mincho', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: SR_MONO, hand: "'Zen Maru Gothic', sans-serif" },
  ghost: 0.12, ghostA: '#ff5a1f', ghostB: '#3547ff',
  bias: {
    layout: { s_bounceBall: 4, s_selectFrame: 3.5, s_posterBlock: 3, s_codeWall: 3, s_halftone: 3, s_columns3d: 3, s_marquee: 3, r_galaxy: 2.5, r_montage: 2.5, r_wireWeave: 2.5, r_endCard: 2.5 },
    enter: { srBallDrop: 2.5, srBoxSnap: 2.5, srWidthPulse: 2, srAnnotate: 2 },
    exit: { srBallKnock: 2, srSelectDelete: 2.5, srTileAway: 2 },
  },
  decor: { srGrain: 5, mgHud: 4, srCallout: 3.5, srSelectBox: 3, srCodeMargin: 1.5 },
});
L.registerStyle('srLimePoster', {
  name: 'ライムポスター', desc: '黒地にアシッドライム。極太の左寄せ見出し、クロームの立体と星ステッカー、矢印チップと番号のポスター組版',
  moods: ['graphic', 'pop', 'cyber'],
  colors: { bg1: '#0c0d0a', bg2: '#151710', accent: '#d6ff3a', accent2: '#ffffff', text: '#f3f5ee' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Zen Old Mincho', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: SR_MONO, hand: "'Zen Maru Gothic', sans-serif" },
  ghost: 0.18, ghostA: '#d6ff3a', ghostB: '#8a8f86',
  bias: {
    layout: { r_chromeObj: 4, r_textRing3d: 3.5, r_waveHeadline: 3.5, n_wordstack: 3 },
    enter: { srWidthPulse: 2.5, srBoxSnap: 1.5 },
    exit: { srTileAway: 1.5 },
  },
  decor: { srChromeBadge: 4.5, srArrowChip: 4.5, srWaveStrip: 3.5, srGrain: 1.5 },
});
L.registerStyle('srCreamBlue', {
  name: '生成りと青', desc: '生成りの紙色に青の差し色とオレンジの一点。選択枠・注釈線・波形で組む明るいデザインツール風',
  moods: ['editorial', 'graphic', 'calm'],
  colors: { bg1: '#efeae0', bg2: '#e4ded2', accent: '#2f44ff', accent2: '#ff5a1f', text: '#121214' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Shippori Mincho', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: SR_MONO, hand: "'Klee One', cursive" },
  ghost: 0.08, ghostA: '#2f44ff', ghostB: '#ff5a1f',
  bias: {
    layout: { s_posterBlock: 4, s_selectFrame: 4, r_endCard: 3, r_waveHeadline: 3 },
    enter: { srAnnotate: 2.5, srBoxSnap: 2, srWidthPulse: 1.5 },
    exit: { srSelectDelete: 2, srTileAway: 2 },
  },
  decor: { srSelectBox: 4, srCallout: 4, srWaveStrip: 3, srArrowChip: 2, srGrain: 1.5 },
});
})();
