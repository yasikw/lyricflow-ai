/* LyricFlow 演出パック: p_mg_decor_styles — MGの装飾・配色
   契約: docs/COMPOSE_PACKS.md  (group: decor+style)  共通ヘルパー: L.mg (p_motion_graphics.js)
   decor: 拍(env.beat / env.bpm)で刻むモーションデザインのアクセント18種。
   style: モーションリール向けの配色8種(バウハウス/スイス/リソグラフ/ブループリント/アシッド/パステル幾何/モノクロ印刷/ネオンワイヤー)。
   全て時刻・拍・シードの決定論関数(Math.random / Date 不使用)。サイズは W/H/env.u の相対。実装は LyricFlow 独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_mg_decor_styles';
const clamp = L.clamp, lerp = L.lerp, TAU = L.TAU;

/* ================================================================ 共通 */
const warned = new Set();
const reg = (key, def) => {
  const fn = def.draw;
  def.draw = function (env, bb, Pd) {
    try { return fn.call(this, env, bb, Pd || {}); } catch (e) {
      if (!warned.has(key)) { warned.add(key); console.warn('[LFC] ' + P + ' decor ' + key + ': ' + (e && e.message)); }
      return undefined;
    }
  };
  L.register('decor', key, def, P);
};
const mn = env => Math.min(env.W, env.H);
/* 背景に対して見えるアクセント色 */
const acc = (env, two) => L.fitContrast(two ? env.sc.accent2 : env.sc.accent, env.sc.bg, 2.3);
const ink = (env, Pd) => (Pd && Pd.accent ? acc(env) : env.sc.fg);
const padBB = (env, bb, k) => {
  const b = L.centerBB(env, bb), p = env.u * k;
  return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p, w: b.w + p * 2, h: b.h + p * 2, cx: b.cx, cy: b.cy };
};
const hit = (r, b) => !(r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1);
const distBB = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/* 拍の状態。bpm が無い時は 0.5 秒の仮拍。flash は明滅用(3回/秒を超えるテンポでは1拍おき) */
const beatOf = env => {
  const len = M.beatLen(env);
  let k, since;
  if (env.beat) { k = env.beat.index; since = Math.max(0, env.beat.since); }
  else { const t = Math.max(0, env.t); k = Math.floor(t / len); since = t - k * len; }
  const kick = Math.exp(-since / 0.13);
  const q = ((k % 4) + 4) % 4;
  return { k, since, len, f: clamp(since / len), kick, q, bar: Math.floor(k / 4), flash: len >= 0.34 || k % 2 === 0 ? kick : 0 };
};
/* 画面の隅/辺の中央で、歌詞と重ならない w×h の場所(上下は HUD の文字を避けて少し内側) */
const spot = (env, bb, w, h, pref = 0) => spotAt(env, bb, w, h, pref, 0.07, 0.1) || spotAt(env, bb, w, h, pref, 0.04, 0.045);
const spotAt = (env, bb, w, h, pref, kx, ky) => {
  const { W, H } = env, m = mn(env), mx = m * kx, my = m * ky;
  const b = padBB(env, bb, 12);
  const C = [[mx, my], [W - mx - w, my], [W - mx - w, H - my - h], [mx, H - my - h]];
  const X = [[(W - w) / 2, my], [(W - w) / 2, H - my - h], [mx, (H - h) / 2], [W - mx - w, (H - h) / 2]];
  for (let k = 0; k < 8; k++) {
    const idx = k < 4 ? (((pref | 0) + k) % 4 + 4) % 4 : k - 4;
    const c = k < 4 ? C[idx] : X[idx];
    if (c[0] < 0 || c[1] < 0 || c[0] + w > W || c[1] + h > H) continue;
    const r = { x0: c[0], y0: c[1], x1: c[0] + w, y1: c[1] + h };
    if (!hit(r, b)) return { x: c[0], y: c[1], w, h, cx: c[0] + w / 2, cy: c[1] + h / 2, corner: k < 4 ? idx : -1 };
  }
  return null;
};
/* 収まらなければ小さくして探す(sp.k = 縮小率) */
const fit = (env, bb, w, h, pref = 0) => {
  for (const k of [1, 0.74, 0.55]) { const s = spot(env, bb, w * k, h * k, pref); if (s) { s.k = k; return s; } }
  return null;
};
/* 歌詞の上か下の帯(高さ need 以上)。{y, below, space} */
const lane = (env, bb, need, preferLow) => {
  const { H } = env, m = mn(env), b = padBB(env, bb, 10);
  const top = b.y0 - m * 0.1, bot = H - m * 0.1 - b.y1;
  const order = preferLow ? [['b', bot], ['t', top]] : [['t', top], ['b', bot]];
  for (const [s, sp] of order) {
    if (sp < need) continue;
    const y = s === 'b' ? b.y1 + Math.min(sp * 0.5, need * 0.5 + m * 0.03) : b.y0 - Math.min(sp * 0.5, need * 0.5 + m * 0.03);
    return { y, below: s === 'b', space: sp };
  }
  return null;
};
/* bbox の外側の上下の行(画面外なら反対側に寄せる)。両方無理なら null */
const rowsOut = (env, b, off, r) => {
  let yT = b.y0 - off, yB = b.y1 + off;
  const okT = yT - r >= 0, okB = yB + r <= env.H;
  if (!okT && !okB) return null;
  if (!okT) yT = yB; if (!okB) yB = yT;
  return [yT, yB];
};
/* 副テキスト(ゴースト無し、等幅) */
const tag = (env, s, x, y, size, o = {}) => {
  const a = o.alpha == null ? 1 : o.alpha;
  if (env.pass !== 'main' || a <= 0.002) return null;
  const it = { text: String(s), font: M.MONO, weight: o.weight || 700, size, x, y, color: o.color || env.sc.sub, alpha: a, ghost: false, track: o.track == null ? 0.08 : o.track };
  return o.anchor ? M.anchored(env, it, o.anchor) : env.text(it);
};
const fsOf = (env, k = 18) => Math.max(7, env.u * k);
/* 小さな幾何図形: 0円 1三角 2四角 3プラス */
const geo = (ctx, kind, x, y, s, rot, col, fill) => {
  ctx.beginPath();
  if (kind === 3) {
    const c = Math.cos(rot) * s, n = Math.sin(rot) * s;
    ctx.moveTo(x - c, y - n); ctx.lineTo(x + c, y + n); ctx.moveTo(x + n, y - c); ctx.lineTo(x - n, y + c);
    ctx.strokeStyle = col; ctx.stroke(); return;
  }
  if (kind === 0) ctx.arc(x, y, s, 0, TAU);
  else {
    const k = kind === 1 ? 3 : 4, R = s * (kind === 1 ? 1.25 : 1.15);
    for (let j = 0; j < k; j++) { const a = rot + j / k * TAU; const X = x + Math.cos(a) * R, Y = y + Math.sin(a) * R; if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.closePath();
  }
  if (fill) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.stroke(); }
};

/* ================================================================ decor (18) */

/* 1. 拍ごとに歌詞の角から小さな図形が弾ける(1拍に1回・上限14個・前の拍の残りが重なって途切れない) */
reg('mgBurst', {
  name: '拍の図形バースト', tags: ['pop', 'graphic'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.3); if (io <= 0.002) return;
    const { ctx, u } = env, m = mn(env), b = padBB(env, bb, 10), bt = beatOf(env), sd = Pd.seed || 1;
    const N = Math.min(14, 8 + (Pd.n || 1) * 2);
    const cols = [acc(env), acc(env, true), env.sc.fg];
    ctx.save(); ctx.lineWidth = Math.max(1, u * 3); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [kb, f] of [[bt.k - 1, 1 + bt.f], [bt.k, bt.f]]) {
      const life = f / 1.6; if (life >= 1) continue;          // 1バースト = 1.6拍
      const c = (((kb + sd) % 4) + 4) % 4;                     // 0左上 1右上 2右下 3左下
      const left = c === 0 || c === 3;
      let up = c < 2;
      if (up && b.y0 < m * 0.08) up = false; else if (!up && b.y1 > env.H - m * 0.08) up = true;
      const ox = clamp(left ? b.x0 : b.x1, m * 0.08, env.W - m * 0.08), oy = up ? b.y0 : b.y1;
      const a0 = Math.atan2(up ? -1 : 1, left ? -1 : 1);
      const e = E.outCubic(clamp(life)), fade = 1 - E.inQuad(clamp(life));
      for (let i = 0; i < N; i++) {
        const r = j => L.r(sd, 'bu', kb, i, j);
        const ang = a0 + (r(0) - 0.5) * 1.5, dist = m * (0.05 + 0.17 * r(1)) * e;
        const x = ox + Math.cos(ang) * dist, y = oy + Math.sin(ang) * dist;
        const s = m * (0.01 + 0.014 * r(2)) * E.outBack(clamp(life * 5), 2) * (1 - 0.4 * life);
        if (s <= 0.2) continue;
        ctx.globalAlpha = clamp(io * fade);
        geo(ctx, Math.floor(r(5) * 4), x, y, s, r(3) * TAU + life * (r(4) - 0.5) * 5, cols[i % 3], i % 2 === 0);
      }
    }
    ctx.restore();
  },
});

/* 2. 隅の破線リング: 外周は拍ごとに45°ずつカチッと回り、内周は逆回転。4分割のアクセント弧が拍を指す */
reg('mgDashRing', {
  name: '回転破線リング', tags: ['graphic', 'cyber', 'editorial'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, u, sc } = env, m = mn(env), bt = beatOf(env);
    const R0 = m * (Pd.big ? 0.09 : 0.072);
    const sp = fit(env, bb, R0 * 2.6, R0 * 2.6, Pd.corner || 0); if (!sp) return;
    const R = R0 * sp.k, cx = sp.cx, cy = sp.cy, r = R * (0.5 + 0.5 * E.outBack(clamp(env.lt / 0.5), 1.4));
    const dir = Pd.right ? 1 : -1;
    const step = (bt.k + E.outBack(clamp(bt.f / 0.4), 1.6)) * Math.PI / 4 * dir;
    ctx.save(); ctx.globalAlpha = io;
    ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1.2, u * 3.2); ctx.lineCap = 'butt';
    ctx.setLineDash([r * 0.3, r * 0.22]);
    ctx.beginPath(); ctx.arc(cx, cy, r, step, step + TAU); ctx.stroke();
    ctx.setLineDash([Math.max(1, u * 2), r * 0.1]); ctx.lineWidth = Math.max(1, u * 1.6); ctx.strokeStyle = sc.sub;
    const s2 = -env.ltb * 0.7 * dir;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, s2, s2 + TAU); ctx.stroke();
    ctx.setLineDash([]);
    const q0 = (bt.k + E.outCubic(clamp(bt.f / 0.3))) * Math.PI / 2 - Math.PI / 2;
    ctx.strokeStyle = acc(env); ctx.lineWidth = Math.max(1.5, u * 5); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, q0 + 0.12, q0 + Math.PI / 2 - 0.12); ctx.stroke();
    ctx.restore();
    tag(env, String(bt.q + 1), cx, cy, Math.max(7, r * 0.5), { color: sc.fg, alpha: io, track: 0 });
  },
});

/* 3. 背景のグリッド: 線が順に描き起こされ、しばらくして薄く沈む。拍ごとに1本だけ光る */
reg('mgGridDraw', {
  name: 'グリッド描画', tags: ['graphic', 'editorial', 'cyber'], w: 0.8, layer: 'back', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.3); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), bt = beatOf(env);
    const g = m * [0.1, 0.13, 0.085][(Pd.v || 0) % 3];
    const nx = Math.min(30, Math.floor(W / g)), ny = Math.min(30, Math.floor(H / g));
    const ox = (W - nx * g) / 2, oy = (H - ny * g) / 2;
    const rest = lerp(1, 0.5, L.smooth(0.8, 2.4, env.lt));
    const base = (sc.dark ? 0.17 : 0.14) * io * rest;
    const total = nx + ny + 2, hl = ((bt.k % total) + total) % total;
    const segs = [];
    let idx = 0, hs = null;
    for (let i = 0; i <= nx; i++, idx++) {
      const p = E.outCubic(clamp((env.lt - idx * 0.02) / 0.45)); if (p <= 0) continue;
      const x = ox + i * g, down = i % 2 === 0;
      const s = down ? [x, 0, x, H * p] : [x, H, x, H * (1 - p)];
      if (idx === hl) hs = s; else segs.push(s);
    }
    for (let j = 0; j <= ny; j++, idx++) {
      const p = E.outCubic(clamp((env.lt - idx * 0.02) / 0.45)); if (p <= 0) continue;
      const y = oy + j * g, right = j % 2 === 0;
      const s = right ? [0, y, W * p, y] : [W, y, W * (1 - p), y];
      if (idx === hl) hs = s; else segs.push(s);
    }
    ctx.save(); ctx.lineWidth = Math.max(1, u * 1.2); ctx.strokeStyle = sc.fg; ctx.globalAlpha = clamp(base);
    ctx.beginPath(); for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
    if (hs) {
      ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1, u * 2);
      ctx.globalAlpha = clamp(io * (base / io + 0.1 + 0.18 * bt.flash));
      ctx.beginPath(); ctx.moveTo(hs[0], hs[1]); ctx.lineTo(hs[2], hs[3]); ctx.stroke();
    }
    ctx.restore();
  },
});

/* 4. 追尾照準: 拍ごとに歌詞の隣の角へ跳んで(隣の角だけ=歌詞を横切らない)、45°回る */
reg('mgTrackCross', {
  name: '角を追う照準', tags: ['cyber', 'graphic', 'editorial'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), b = padBB(env, bb, 6), bt = beatOf(env);
    const r = m * 0.028, off = r * 1.3;
    const rows = rowsOut(env, b, off, r * 1.4); if (!rows) return;
    const C = [[b.x0 - off, rows[0]], [b.x1 + off, rows[0]], [b.x1 + off, rows[1]], [b.x0 - off, rows[1]]];
    const s0 = (Pd.seed || 0) % 4, dir = Pd.right ? 1 : 3;
    const at = k => C[(((s0 + k * dir) % 4) + 4) % 4];
    const mv = E.outExpo(clamp(bt.f / 0.3));
    const A = at(bt.k - 1), B = at(bt.k);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const x = cl(lerp(A[0], B[0], mv), r * 1.4, W - r * 1.4), y = cl(lerp(A[1], B[1], mv), r * 1.4, H - r * 1.4);
    const rot = (bt.k + mv) * Math.PI / 4;
    const lw = Math.max(1, u * 2.2), ac = acc(env);
    ctx.save(); ctx.globalAlpha = io; ctx.strokeStyle = sc.fg; ctx.lineWidth = lw; ctx.lineCap = 'round';
    // 通ってきた軌跡
    if (mv < 1) {
      ctx.globalAlpha = io * 0.35 * (1 - mv); ctx.setLineDash([u * 4, u * 5]);
      ctx.beginPath(); ctx.moveTo(cl(A[0], r, W - r), cl(A[1], r, H - r)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = io;
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const a = rot + j * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(x + c * r * 0.55, y + s * r * 0.55); ctx.lineTo(x + c * r * 1.45, y + s * r * 1.45);
    }
    ctx.stroke();
    // 着地の波紋
    ctx.strokeStyle = ac; ctx.globalAlpha = io * 0.7 * (1 - mv) * (bt.len >= 0.34 || bt.k % 2 === 0 ? 1 : 0.5);
    ctx.beginPath(); ctx.arc(x, y, r * (1 + 0.9 * mv), 0, TAU); ctx.stroke();
    ctx.globalAlpha = io; ctx.fillStyle = ac;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, r * 0.16), 0, TAU); ctx.fill();
    ctx.restore();
    const inw = x > W / 2 ? -1 : 1, below = y > b.cy, fs = fsOf(env, 16);   // 画面の内側へ・歌詞の外側(上/下)へ
    tag(env, `X${(x / W).toFixed(2).slice(1)} Y${(y / H).toFixed(2).slice(1)}`, x + inw * r * 0.2, y + (below ? 1 : -1) * (r * 1.55 + fs * 0.6), fs, { anchor: inw > 0 ? 'left' : 'right', alpha: io });
  },
});

/* 5. 楕円軌道: 傾いた2本の軌道上の点が拍ごとに1/8周ずつ進む。中心の核は拍で脈打つ */
reg('mgOrbit', {
  name: '楕円軌道', tags: ['graphic', 'cyber', 'pop'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.45); if (io <= 0.002) return;
    const { ctx, u, sc } = env, m = mn(env), bt = beatOf(env);
    const S0 = m * (Pd.big ? 0.24 : 0.2);
    const sp = fit(env, bb, S0, S0 * 0.8, (Pd.corner || 0) + 1); if (!sp) return;
    const S = S0 * sp.k;
    const cx = sp.cx, cy = sp.cy, rx = S * 0.46, ry = S * 0.15;
    const draw = E.inOutCubic(clamp(env.lt / 0.7)), ac = acc(env), ac2 = acc(env, true);
    const orbits = [[-0.42, 3, 1], [0.5, 2, -1]];
    const dots = [];
    ctx.save(); ctx.lineWidth = Math.max(1, u * 1.6); ctx.strokeStyle = sc.fg;
    orbits.forEach(([tilt, nd, dir], oi) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
      ctx.globalAlpha = io * 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * draw); ctx.stroke();
      ctx.restore();
      const stepA = (bt.k + E.outBack(clamp(bt.f / 0.45), 1.5)) * TAU / 8 * dir;
      for (let j = 0; j < nd; j++) {
        const th = stepA + j * TAU / nd + oi * 0.7;
        const ex = Math.cos(th) * rx, ey = Math.sin(th) * ry, c = Math.cos(tilt), s = Math.sin(tilt);
        dots.push([cx + ex * c - ey * s, cy + ex * s + ey * c, Math.sin(th) < 0, oi === 0 ? ac : ac2, j]);
      }
    });
    const vis = clamp((env.lt - 0.25) / 0.3);
    const dot = (d, z) => { ctx.globalAlpha = io * vis * (d[2] ? 0.45 : 1); ctx.fillStyle = d[3]; ctx.beginPath(); ctx.arc(d[0], d[1], S * 0.045 * (d[2] ? 0.7 : 1.1) * z, 0, TAU); ctx.fill(); };
    for (const d of dots) if (d[2]) dot(d, 1);
    ctx.globalAlpha = io; ctx.fillStyle = sc.fg;
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.08 * (0.4 + 0.6 * E.outBack(clamp(env.lt / 0.4))) * (1 + 0.3 * bt.kick), 0, TAU); ctx.fill();
    for (const d of dots) if (!d[2]) dot(d, 1);
    ctx.restore();
  },
});

/* 6. 画面枠の描き起こし: 上辺の中央から左右へ枠が伸びて閉じる。四隅を拍ごとに巡る小さな四角 */
reg('mgFrameDraw', {
  name: '画面枠の描き起こし', tags: ['editorial', 'graphic', 'calm'], w: 0.8, layer: 'front', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.3); if (io <= 0.002) return;
    const { W, H, u, sc } = env, m = mn(env), bt = beatOf(env);
    const d = m * 0.026, lw = Math.max(1, u * 2);
    const e = E.inOutCubic(clamp(env.lt / 0.9)) * (1 - E.inCubic(env.pOut));
    const top = Pd.low ? H - d : d, bot = Pd.low ? d : H - d;
    env.polyPartial([[W / 2, top], [W - d, top], [W - d, bot], [W / 2, bot]], e, sc.fg, lw, 0.6 * io);
    env.polyPartial([[W / 2, top], [d, top], [d, bot], [W / 2, bot]], e, sc.fg, lw, 0.6 * io);
    const C = [[d, d], [W - d, d], [W - d, H - d], [d, H - d]];
    const on = clamp((env.lt - 0.75) / 0.3) * io;
    if (on <= 0.002) return;
    const ac = acc(env), cs = m * 0.012;
    for (let i = 0; i < 4; i++) {
      const hot = i === bt.q ? 1 + 0.6 * bt.kick : 1;
      env.rect(C[i][0] - cs * hot / 2, C[i][1] - cs * hot / 2, cs * hot, cs * hot, i === bt.q ? ac : sc.fg, on, false);
    }
    // 角から次の角へ(拍の前半で移動)
    const mv = E.inOutCubic(clamp(bt.f / 0.5));
    const A = C[(bt.q + 3) % 4], B = C[bt.q];
    const x = lerp(A[0], B[0], mv), y = lerp(A[1], B[1], mv), rs = m * 0.018;
    env.rect(x - rs / 2, y - rs / 2, rs, rs, ac, on, false);
  },
});

/* 7. 拍カウンター: 4つの四角が拍ごとに1つずつ点く(1拍目はアクセント色)。小節番号つき */
reg('mgBeatPips', {
  name: '拍カウンター', tags: ['graphic', 'cyber', 'pop'], w: 0.9, layer: 'front', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.3); if (io <= 0.002) return;
    const { u, sc } = env, m = mn(env), bt = beatOf(env);
    let s = m * (Pd.big ? 0.034 : 0.027), gap = s * 0.45, fs = fsOf(env, 16);
    const lab = env.bpm ? `BAR ${M.pad2(bt.bar + 1)}  ${bt.q + 1}/4` : `COUNT ${bt.q + 1}/4`;
    const lw0 = L.measure({ text: 'BAR 00  0/4', font: M.MONO, weight: 700, size: fs, track: 0.08 }).w;
    const sp = fit(env, bb, Math.max(4 * s + 3 * gap, lw0), s + fs * 1.7, Pd.corner || 0); if (!sp) return;
    s *= sp.k; gap *= sp.k; fs = Math.max(6, fs * sp.k);
    const lw = Math.max(1, u * 2), ac = acc(env);
    for (let i = 0; i < 4; i++) {
      const pop = E.outBack(clamp((env.lt - i * 0.06) / 0.3), 1.8);
      if (pop <= 0.01) continue;
      const x = sp.x + i * (s + gap) + s / 2, y = sp.y + s / 2, ss = s * pop;
      env.rrect(x - ss / 2, y - ss / 2, ss, ss, 0, null, io, false, sc.fg, lw);
      const lit = i === bt.q ? E.outBack(clamp(bt.f / 0.22), 1.6) : i === (bt.q + 3) % 4 ? 1 - E.outCubic(clamp(bt.f / 0.3)) : 0;
      if (lit > 0.01) { const ls = ss * 0.72 * Math.min(1.1, lit); env.rect(x - ls / 2, y - ls / 2, ls, ls, i === 0 ? ac : sc.fg, io * clamp(lit), false); }
    }
    tag(env, lab, sp.x, sp.y + s + fs * 0.95, fs, { anchor: 'left', alpha: io });
  },
});

/* 8. ミニ棒グラフ: 軸つきの小さなチャート。拍ごとに棒の値が入れ替わる(少しずつずれて弾む) */
reg('mgBarChart', {
  name: 'ミニ棒グラフ', tags: ['editorial', 'graphic', 'cyber'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { u, sc } = env, m = mn(env), bt = beatOf(env), sd = Pd.seed || 1;
    const fs0 = fsOf(env, 15);
    const sp = fit(env, bb, Math.max(m * 0.26, fs0 * 9), Math.max(m * 0.17, fs0 * 5), (Pd.corner || 0) + 2); if (!sp) return;
    const w = sp.w, h = sp.h, fs = Math.max(6, fs0 * sp.k);
    const lw = Math.max(1, u * 1.8), ac = acc(env);
    const x0 = sp.x, x1 = sp.x + w, y1 = sp.y + h, y0 = sp.y + fs * 1.6;
    const ax = E.outCubic(clamp(env.lt / 0.4));
    env.line([[x0, y0 + (y1 - y0) * (1 - ax)], [x0, y1], [x0 + (x1 - x0) * ax, y1]], sc.fg, lw, 0.75 * io);
    const n = 7, cw = (w - w * 0.08) / n, bw = cw * 0.6, maxH = (y1 - y0) * 0.92;
    const val = (k, i) => 0.18 + 0.82 * L.noise1(i * 0.7 + k * 0.93, sd);
    let best = -1, bv = -1;
    const vs = [];
    for (let i = 0; i < n; i++) {
      const q = E.outBack(clamp((bt.f - i * 0.035) / 0.35), 1.3);
      const v = lerp(val(bt.k - 1, i), val(bt.k, i), q);
      vs.push(v); if (v > bv) { bv = v; best = i; }
    }
    for (let i = 0; i < n; i++) {
      const g = E.outCubic(clamp((env.lt - 0.1 - i * 0.04) / 0.35));
      const bh = maxH * vs[i] * g; if (bh < 0.5) continue;
      const x = x0 + w * 0.06 + i * cw;
      env.rect(x, y1 - lw - bh, bw, bh, i === best ? ac : sc.fg, io * (i === best ? 1 : 0.7), false);
    }
    tag(env, 'DATA', x0, sp.y + fs * 0.6, fs, { anchor: 'left', alpha: io });
    tag(env, `${Math.round(bv * 100)}%`, x1, sp.y + fs * 0.6, fs, { anchor: 'right', alpha: io, color: ac });
  },
});

/* 9. スキャンバー: 1小節で画面を1回なぞる細い線と薄い残光(背景)。縦長では上から下へ */
reg('mgScanBar', {
  name: 'スキャンバー', tags: ['cyber', 'graphic', 'dark'], w: 0.75, layer: 'back', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, bt = beatOf(env);
    const vert = env.portrait;                           // 縦長: 横線が下へ
    const Lx = vert ? H : W, band = Lx * 0.16, rev = !!Pd.right;
    const bf = (bt.q + bt.f) / 4;
    let p = lerp(-band * 0.2, Lx + band, bf);
    if (rev) p = Lx - p;
    const dir = rev ? 1 : -1;                            // 残光の向き(進行の後ろ)
    ctx.save();
    const g = vert ? ctx.createLinearGradient(0, p, 0, p + dir * band) : ctx.createLinearGradient(p, 0, p + dir * band, 0);
    g.addColorStop(0, L.rgba(sc.fg, 0.075 * io)); g.addColorStop(1, L.rgba(sc.fg, 0));
    ctx.fillStyle = g;
    if (vert) ctx.fillRect(0, Math.min(p, p + dir * band), W, band); else ctx.fillRect(Math.min(p, p + dir * band), 0, band, H);
    ctx.globalAlpha = 0.45 * io; ctx.strokeStyle = sc.sub; ctx.lineWidth = Math.max(1, u * 2);
    ctx.beginPath(); if (vert) { ctx.moveTo(0, p); ctx.lineTo(W, p); } else { ctx.moveTo(p, 0); ctx.lineTo(p, H); } ctx.stroke();
    // 拍の位置の目盛り(通過済みは濃く)
    const tk = Math.min(W, H) * 0.02;
    for (let i = 1; i < 4; i++) {
      let q = Lx * i / 4; if (rev) q = Lx - q;
      ctx.globalAlpha = io * (i <= bt.q ? 0.5 : 0.2);
      ctx.beginPath();
      if (vert) { ctx.moveTo(0, q); ctx.lineTo(tk, q); ctx.moveTo(W, q); ctx.lineTo(W - tk, q); }
      else { ctx.moveTo(q, 0); ctx.lineTo(q, tk); ctx.moveTo(q, H); ctx.lineTo(q, H - tk); }
      ctx.stroke();
    }
    ctx.restore();
  },
});

/* 10. 放射目盛り: 歌詞を囲む楕円上の目盛り。拍ごとに4分の1周ずつ灯っていく */
reg('mgTickRing', {
  name: '放射目盛り', tags: ['graphic', 'cyber', 'editorial'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, u, sc } = env, m = mn(env), b = L.centerBB(env, bb), bt = beatOf(env);
    const rx = b.w / 2 * 1.42 + m * 0.035, ry = b.h / 2 * 1.42 + m * 0.035;
    const N = 60, qn = N / 4, lit = E.outCubic(clamp(bt.f / 0.5)) * qn;
    const A = [], B = [];
    for (let i = 0; i < N; i++) {
      const p = clamp((env.lt - i * 0.008) / 0.18); if (p <= 0) continue;
      const th = i / N * TAU - Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      let nx = c / rx, ny = s / ry; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const x = b.cx + c * rx, y = b.cy + s * ry, len = (i % 5 === 0 ? m * 0.024 : m * 0.011) * p;
      const inQ = i >= bt.q * qn && i - bt.q * qn < lit;
      (inQ ? A : B).push([x, y, x + nx * len, y + ny * len]);
    }
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1, u * 2);
    ctx.globalAlpha = io * 0.4; ctx.strokeStyle = sc.fg;
    ctx.beginPath(); for (const s of B) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
    ctx.globalAlpha = io; ctx.strokeStyle = acc(env); ctx.lineWidth = Math.max(1.2, u * 3);
    ctx.beginPath(); for (const s of A) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
    ctx.restore();
  },
});

/* 11. 進行アーク: カットの長さに対する進み具合を円弧で。拍の位置に刻み、先端の点が拍で脈打つ */
reg('mgProgressArc', {
  name: '進行アーク', tags: ['editorial', 'cyber', 'calm'], w: 0.8, layer: 'front', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, u, sc, cut } = env, m = mn(env), bt = beatOf(env);
    const R00 = m * 0.056, sp = fit(env, bb, R00 * 2.9, R00 * 2.9, (Pd.corner || 0) + 3); if (!sp) return;
    const R0 = R00 * sp.k, R = R0 * (0.6 + 0.4 * E.outBack(clamp(env.lt / 0.4), 1.4));
    const span = Math.max(0.3, cut.dur - cut.outDur);
    const prog = clamp(env.lt / span), lw = Math.max(1.2, u * 2);
    const ac = acc(env), a0 = -90, a1 = a0 + 360 * prog;
    env.circle(sp.cx, sp.cy, R, null, sc.fg, lw, 0.25 * io);
    if (prog > 0.002) env.arc(sp.cx, sp.cy, R, a0, a1, ac, lw * 2.2, io);
    // 拍の刻み(このカットの長さ内)
    const nb = Math.min(32, Math.floor(cut.dur / bt.len));
    if (nb >= 2) {
      ctx.save(); ctx.lineWidth = Math.max(1, u * 1.5); ctx.lineCap = 'butt';
      for (let j = 0; j < nb; j++) {
        const fr = j * bt.len / span; if (fr > 1) break;
        const a = (a0 + 360 * fr) * L.DEG, c = Math.cos(a), s = Math.sin(a);
        ctx.globalAlpha = io * (fr <= prog ? 0.9 : 0.35); ctx.strokeStyle = fr <= prog ? ac : sc.fg;
        ctx.beginPath(); ctx.moveTo(sp.cx + c * R * 1.14, sp.cy + s * R * 1.14); ctx.lineTo(sp.cx + c * R * 1.3, sp.cy + s * R * 1.3); ctx.stroke();
      }
      ctx.restore();
    }
    const ea = a1 * L.DEG;
    env.circle(sp.cx + Math.cos(ea) * R, sp.cy + Math.sin(ea) * R, lw * 1.6 * (1 + 0.6 * bt.kick), ac, null, 1, io);
    tag(env, `${M.pad2(Math.round(prog * 99))}%`, sp.cx, sp.cy, Math.max(7, R * 0.42), { alpha: io, color: sc.fg, track: 0.02 });
  },
});

/* 12. 図形の列: 歌詞の上(下)に3つの図形。1拍ずつずれてモーフし、拍で30°ずつ回る */
reg('mgShapeRow', {
  name: '図形モーフの列', tags: ['graphic', 'pop', 'editorial'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { W, u, sc } = env, m = mn(env), bt = beatOf(env);
    const R = m * (Pd.big ? 0.032 : 0.026);
    const ln = lane(env, bb, R * 2.8, Pd.low); if (!ln) return;
    const n = 3, gap = R * 3.4, x0 = W / 2 - gap;
    const s0 = (Pd.seed || 0) % M.SHAPES.length;
    const order = M.SHAPES.map((_, i) => M.SHAPES[(s0 + i) % M.SHAPES.length]);
    const lw = Math.max(1.2, u * 3), ac = acc(env);
    env.line([[x0 - R * 1.6, ln.y], [x0 + gap * 2 + R * 1.6, ln.y]], sc.fg,Math.max(1, u), 0.3 * io * E.outCubic(clamp(env.lt / 0.5)), false, [u * 3, u * 5]);
    for (let i = 0; i < n; i++) {
      const g = E.outBack(clamp((env.lt - i * 0.08) / 0.4), 1.6); if (g <= 0.01) continue;
      const mm = M.morphAt(env, order, env.ltb + i * bt.len);
      const rot = (bt.k + E.outBack(clamp(bt.f / 0.35), 1.5)) * Math.PI / 6 * (i % 2 ? -1 : 1);
      const fill = i === 1;
      M.drawShape(env, mm.pts, x0 + i * gap, ln.y, R * g * (1 + (fill ? 0.12 : 0) * bt.kick), rot, fill ? ac : null, fill ? null : sc.fg, lw, io);
    }
  },
});

/* 13. 浮遊プラス: ゆっくり昇るプラス記号。拍ごとに45°回って「+」と「×」を行き来する */
reg('mgPlusFloat', {
  name: '浮遊プラス', tags: ['graphic', 'pop', 'calm'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, m = mn(env), b = padBB(env, bb, 8), bt = beatOf(env), sd = Pd.seed || 1;
    const N = Math.min(12, 6 + (Pd.n || 1) * 2), ac = acc(env);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, u * 3);
    for (let i = 0; i < N; i++) {
      const r = j => L.r(sd, 'pf', i, j);
      const pop = E.outBack(clamp((env.lt - i * 0.05) / 0.35), 2); if (pop <= 0.01) continue;
      const x = m * 0.06 + r(0) * (W - m * 0.12) + Math.sin(env.ltb * 0.8 + r(1) * 6) * m * 0.006;
      const y = m * 0.1 + r(2) * (H - m * 0.2) - env.ltb * m * (0.012 + 0.016 * r(3));
      const s = m * (0.011 + 0.009 * r(4)) * pop * (1 + 0.2 * bt.kick);
      const away = clamp((distBB(x, y, b) - s * 1.5) / (m * 0.04));
      if (away <= 0.02) continue;
      const rot = (bt.k + E.outBack(clamp((bt.f - r(5) * 0.08) / 0.3), 1.8)) * Math.PI / 4 * (r(6) < 0.5 ? 1 : -1);
      ctx.globalAlpha = io * away * (i % 3 === 0 ? 1 : 0.75);
      geo(ctx, 3, x, y, s, rot, i % 3 === 0 ? ac : sc.fg, false);
    }
    ctx.restore();
  },
});

/* 14. 行進シェブロン: 歌詞の上(下)の帯を「›」の列が拍ごとに1コマずつ進む。印の1つが列を渡っていく */
reg('mgChevronMarch', {
  name: '行進シェブロン', tags: ['pop', 'graphic', 'cyber'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, u, sc } = env, m = mn(env), bt = beatOf(env);
    const sz = m * 0.02, sp = sz * 3.2;
    const ln = lane(env, bb, sz * 3, !Pd.low); if (!ln) return;
    const laneW = Math.min(W * 0.7, m * 1.0) * E.outCubic(clamp(env.lt / 0.5));
    const Lx = W / 2 - laneW / 2, Rx = W / 2 + laneW / 2;
    const dir = Pd.right ? -1 : 1;
    const e = E.outCubic(clamp(bt.f / 0.3));
    const cnt = Math.min(40, Math.ceil(laneW / sp) + 2);
    const ac = acc(env), A = [], B = [];
    for (let j = -1; j < cnt; j++) {
      const X = dir > 0 ? Lx + (j + e) * sp : Rx - (j + e) * sp;
      if (X < Lx - sp || X > Rx + sp) continue;
      const a = clamp(Math.min(X - Lx, Rx - X) / (sp * 1.8));
      if (a <= 0.02) continue;
      const id = (((j - bt.k) % 5) + 5) % 5;
      (id === 0 ? A : B).push([X, a]);
    }
    const chev = (list, col, al) => {
      ctx.strokeStyle = col;
      for (const [X, a] of list) {
        ctx.globalAlpha = io * a * al;
        ctx.beginPath(); ctx.moveTo(X - dir * sz * 0.5, ln.y - sz); ctx.lineTo(X + dir * sz * 0.5, ln.y); ctx.lineTo(X - dir * sz * 0.5, ln.y + sz); ctx.stroke();
      }
    };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, u * 3.2);
    chev(B, sc.fg, 0.55); chev(A, ac, 1);
    ctx.restore();
  },
});

/* 15. 拍の正弦波: 歌詞の下のきれいなサイン波。拍の頭で振幅が跳ね、位相は半拍で半周。小さな点が波に乗る */
reg('mgSineKick', {
  name: '拍の正弦波', tags: ['emotional', 'graphic', 'cyber'], w: 0.9, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.4); if (io <= 0.002) return;
    const { W, u, sc } = env, m = mn(env), b = L.centerBB(env, bb), bt = beatOf(env);
    const ln = lane(env, bb, m * 0.07, true); if (!ln) return;
    const wd = Math.min(W * 0.86, Math.max(b.w * 1.05, W * 0.42)), x0 = W / 2 - wd / 2;
    const A = Math.min(ln.space * 0.25, m * 0.016 * (1 + 2 * bt.kick));
    const ph = -env.ltb / bt.len * Math.PI, cyc = 3 + ((Pd.v || 0) % 2);
    const N = 72, pts = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), taper = Math.sqrt(Math.sin(Math.PI * t));
      pts.push([x0 + wd * t, ln.y + Math.sin(t * TAU * cyc + ph) * A * taper]);
    }
    const draw = E.outCubic(clamp(env.lt / 0.55)) * (1 - E.inCubic(env.pOut));
    env.line([[x0, ln.y], [x0 + wd * draw, ln.y]], sc.fg, Math.max(1, u), 0.25 * io, false, [u * 4, u * 6]);
    env.polyPartial(pts, draw, ink(env, { accent: Pd.accent !== false }), Math.max(1.5, u * 3.2), io);
    const tk = m * 0.012;
    env.line([[x0, ln.y - tk], [x0, ln.y + tk]], sc.fg, Math.max(1, u * 1.5), 0.6 * io);
    if (draw > 0.98) env.line([[x0 + wd, ln.y - tk], [x0 + wd, ln.y + tk]], sc.fg, Math.max(1, u * 1.5), 0.6 * io);
    // 8拍で往復する点
    const t = 0.5 - 0.5 * Math.cos(TAU * ((((bt.k % 8) + 8) % 8) + bt.f) / 8);
    if (t <= draw) {
      const taper = Math.sqrt(Math.sin(Math.PI * t));
      env.circle(x0 + wd * t, ln.y + Math.sin(t * TAU * cyc + ph) * A * taper, Math.max(2, m * 0.008), sc.fg, null, 1, io);
    }
  },
});

/* 16. タイムコード札: 枠つきの小札に REC・タイムコード・BPM・小節.拍 */
reg('mgTcTag', {
  name: 'タイムコード札', tags: ['editorial', 'cyber', 'graphic'], w: 0.8, layer: 'front', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.3); if (io <= 0.002) return;
    const { u, sc, cut } = env, bt = beatOf(env), fs = fsOf(env, 17);
    const l1 = 'TC ' + M.tc60(env.t);
    const l2 = env.bpm ? `${Math.round(env.bpm)} BPM · ${M.pad2(bt.bar + 1)}.${bt.q + 1}` : `FREE · CUT ${M.pad2(cut.idx + 1)}`;
    const tw = L.measure({ text: 'TC 00:00:00:00', font: M.MONO, weight: 700, size: fs, track: 0.08 }).w;
    const w2 = L.measure({ text: l2, font: M.MONO, weight: 700, size: fs, track: 0.08 }).w;
    const w = Math.max(tw, w2) + fs * 2.4, h = fs * 3.3;
    const sp = spot(env, bb, w, h, (Pd.corner || 0) + 1); if (!sp) return;   // 文字が主役なので縮めない
    const sl = (1 - E.outCubic(clamp(env.lt / 0.35))) * fs * 1.5 * (sp.cx < env.W / 2 ? -1 : 1);
    const x = sp.x + sl, y = sp.y;
    env.rrect(x, y, w, h, fs * 0.3, L.rgba(sc.bg, 0.6), io, false, L.rgba(sc.fg, 0.55), Math.max(1, u * 1.6));
    const soft = 0.4 + 0.6 * Math.exp(-bt.since / 0.3) * (bt.len >= 0.34 || bt.k % 2 === 0 ? 1 : 0.4);
    env.circle(x + fs * 0.95, y + h * 0.31, fs * 0.28, acc(env), null, 1, io * soft);
    tag(env, l1, x + fs * 1.55, y + h * 0.31, fs, { anchor: 'left', alpha: io, color: sc.fg });
    tag(env, l2, x + fs * 1.55, y + h * 0.7, fs, { anchor: 'left', alpha: io });
  },
});

/* 17. 比率ガイド: 1:1・4:5・9:16… のセーフ枠(破線)を描き起こし、拍ごとに1つずつ浮かせる(背景) */
const RATIOS = [[1, '1:1'], [0.8, '4:5'], [9 / 16, '9:16'], [16 / 9, '16:9'], [2.39, '2.39:1'], [4 / 3, '4:3']];
reg('mgAspectGuides', {
  name: '比率ガイド', tags: ['editorial', 'graphic', 'calm'], w: 0.7, layer: 'back', subtle: true,
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, W, H, u, sc } = env, bt = beatOf(env);
    const ar = W / H, v = (Pd.v || 0) % RATIOS.length;
    const list = [];
    for (let k = 0; k < RATIOS.length && list.length < 3; k++) {
      const [r, lab] = RATIOS[(v + k) % RATIOS.length];
      if (Math.abs(r - ar) / ar < 0.08) continue;
      const rw = Math.min(W * 0.92, H * 0.92 * r), rh = rw / r;
      list.push([W / 2 - rw / 2, H / 2 - rh / 2, rw, rh, lab]);
    }
    const n = list.length; if (!n) return;
    const hl = ((bt.k % n) + n) % n, fs = fsOf(env, 15);
    const up = (1 - Math.exp(-bt.since / 0.04)) * Math.exp(-bt.since / Math.max(0.2, bt.len * 0.8));
    const placed = [];
    list.forEach(([x, y, w, h, lab], i) => {
      let ly = y + fs * 0.9;
      for (let t = 0; t < 4 && placed.some(([px, py]) => Math.abs(px - x) < fs * 4 && Math.abs(py - ly) < fs * 1.2); t++) ly += fs * 1.25;
      placed.push([x, ly]);
      const e = E.inOutCubic(clamp((env.lt - i * 0.15) / 0.8));
      const a = io * (0.22 + (i === hl ? 0.22 * up : 0));
      ctx.save(); ctx.setLineDash([u * 7, u * 6]);
      env.polyPartial([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], e, sc.sub, Math.max(1, u * 1.5), a);
      ctx.restore();
      tag(env, lab, x + fs * 0.5, ly, fs, { anchor: 'left', alpha: a * clamp((env.lt - i * 0.15 - 0.2) / 0.3) * 1.6, color: sc.sub });
    });
  },
});

/* 18. アイソメ立方体: 隅に積んだ小さな立方体。落ちてきて積まれ、拍ごとに1つずつ跳ねる */
const ISO = [[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1]]];
reg('mgIsoCubes', {
  name: 'アイソメ立方体', tags: ['graphic', 'pop', 'cyber'], w: 0.85, layer: 'front',
  draw(env, bb, Pd) {
    if (env.pass !== 'main') return;
    const io = env.inOut(0.35); if (io <= 0.002) return;
    const { ctx, u, sc } = env, m = mn(env), bt = beatOf(env);
    const s0 = m * (Pd.big ? 0.04 : 0.032), c30 = 0.866;
    const cubes = ISO[Math.min(ISO.length - 1, Math.max(0, (Pd.n || 1) - 1))].slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);
    const sp = fit(env, bb, s0 * c30 * 4.4, s0 * 5.2, (Pd.corner || 0) + 2); if (!sp) return;
    const s = s0 * sp.k, h = sp.h;
    const ox = sp.cx, oy = sp.y + h * 0.5;
    const hop = bt.k % cubes.length;
    const edge = sc.bg, lw = Math.max(1, u * 1.6);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = edge;
    cubes.forEach(([gx, gy, gz], i) => {
      const t = clamp((env.lt - i * 0.09) / 0.5); if (t <= 0) return;
      const drop = (1 - E.outBounce(t)) * s * 3;
      const jump = i === ((hop + cubes.length) % cubes.length) ? Math.sin(Math.PI * clamp(bt.f / 0.55)) * s * 0.8 : 0;
      const X = ox + (gx - gy) * s * c30, Y = oy + (gx + gy) * s * 0.5 - gz * s - drop - jump;
      const base = i % 2 ? acc(env) : sc.fg;
      const top = L.mix(base, '#ffffff', 0.3), left = L.mix(base, '#000000', 0.12), right = L.mix(base, '#000000', 0.38);
      const T = [X, Y - s * 0.5], R = [X + s * c30, Y], Bm = [X, Y + s * 0.5], Lf = [X - s * c30, Y];
      const face = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke(); };
      ctx.globalAlpha = io * clamp(t * 4);
      face([Lf, Bm, [Bm[0], Bm[1] + s], [Lf[0], Lf[1] + s]], left);
      face([Bm, R, [R[0], R[1] + s], [Bm[0], Bm[1] + s]], right);
      face([T, R, Bm, Lf], top);
    });
    ctx.restore();
  },
});

/* ================================================================ styles (8) */
const MONO = M.MONO;
const DECOR_BASE = { mgHud: 5 };
const style = (key, def) => L.registerStyle(key, Object.assign({}, def, { decor: Object.assign({}, DECOR_BASE, def.decor || {}) }));

style('mgBauhaus', {
  name: 'バウハウス', desc: '生成りの地に赤・黄・青の原色と黒。円・三角・四角が拍で弾む構成主義のリール',
  moods: ['graphic', 'pop', 'editorial'],
  colors: { bg1: '#f0e7d3', bg2: '#e3d6ba', accent: '#d52a1e', accent2: '#1e4f9e', text: '#151515' },
  fonts: { display: "'Dela Gothic One', sans-serif", serif: "'Shippori Mincho', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: MONO, hand: "'Zen Maru Gothic', sans-serif" },
  ghost: 0.3, ghostA: '#f2b705', ghostB: '#1e4f9e',
  bias: { layout: { m_morph: 5, m_cube: 3, m_particles: 2.5, m_graph: 2, m_tunnel: 1, g_bauhaus: 3, g_shapeGrid: 2, g_tiles: 2, g_burst: 2, g_isoStack: 2, n_tiles: 1.5, n_waffle: 1.5 }, enter: { particleIn: 1.5 }, exit: { particleOut: 1.5 } },
  decor: { mgBurst: 4, mgShapeRow: 4, mgIsoCubes: 3, mgBeatPips: 3, mgDashRing: 2.5, mgGridDraw: 2.5, mgMorphCorner: 3, mgPlusFloat: 2 },
});
style('mgSwiss', {
  name: 'スイス', desc: '白地に黒の角ゴシック、赤一点。グリッドと数値ラベルで組む厳格なタイポグラフィ',
  moods: ['editorial', 'graphic'],
  colors: { bg1: '#f6f5f1', bg2: '#e7e6e1', accent: '#e2001a', accent2: '#111111', text: '#111111' },
  fonts: { display: "'Noto Sans JP', sans-serif", serif: "'Shippori Mincho', serif", body: "'BIZ UDPGothic', sans-serif", mono: MONO, hand: "'Zen Kaku Gothic New', sans-serif" },
  ghost: 0.05,
  bias: { layout: { m_graph: 5, m_morph: 2.5, m_cube: 2, m_particles: 1.5, m_tunnel: 0.8, n_specimen: 2.5, n_ruler: 2, n_bars: 2, n_hbar: 2, n_columns: 2, n_wordstack: 2, n_tracking: 2, n_stats: 1.5, g_mark: 1.5 }, enter: { fade: 1.3 }, exit: { fade: 1.3 } },
  decor: { mgGridDraw: 5, mgFrameDraw: 3, mgTcTag: 3, mgBarChart: 3, mgTickRing: 2.5, mgProgressArc: 2.5, mgAspectGuides: 2, mgBeatPips: 2 },
});
style('mgRiso', {
  name: 'リソグラフ', desc: '紙に蛍光ピンク・ティール・黄の刷り重ね。版ずれ風の色ずれと丸いゴシック',
  moods: ['pop', 'graphic', 'emotional'],
  colors: { bg1: '#f3ede0', bg2: '#e8dcc6', accent: '#f0368c', accent2: '#00897b', text: '#1c2b4a' },
  fonts: { display: "'RocknRoll One', sans-serif", serif: "'Kaisei Tokumin', serif", body: "'Zen Maru Gothic', sans-serif", mono: MONO, hand: "'Yomogi', cursive" },
  ghost: 0.65, ghostA: '#ff5fae', ghostB: '#ffcf00',
  bias: { layout: { m_particles: 4, m_morph: 4, m_cube: 2, m_graph: 1.5, m_tunnel: 1, g_blob: 2, g_burst: 2, g_kaleido: 2, g_ripple: 1.5, n_waffle: 1.5, n_dotmatrix: 1.5, n_outlinecut: 1.5 }, enter: { particleIn: 1.5 } },
  decor: { mgBurst: 4, mgPlusFloat: 4, mgChevronMarch: 3, mgShapeRow: 3, mgSineKick: 3, mgOrbit: 2, mgMorphCorner: 2 },
});
style('mgBlueprint', {
  name: 'ブループリント', desc: '紺の青焼きに白い線。寸法の目盛り・比率ガイド・ワイヤー立方体で設計図のように',
  moods: ['editorial', 'cyber', 'calm'],
  colors: { bg1: '#0e2d52', bg2: '#15406f', accent: '#8ed1ff', accent2: '#ffd54a', text: '#f1f6fc' },
  fonts: { display: "'BIZ UDPGothic', sans-serif", serif: "'Shippori Mincho', serif", body: "'BIZ UDPGothic', sans-serif", mono: MONO, hand: "'Klee One', cursive" },
  ghost: 0.18, ghostA: '#8ed1ff', ghostB: '#ffffff',
  bias: { layout: { m_cube: 5, m_graph: 4, m_tunnel: 2.5, m_morph: 2, m_particles: 1.2, g_gridFloor: 2.5, g_isoStack: 2, g_prism: 2, g_gyro: 2, n_ruler: 2.5, n_linegraph: 2, n_notebook: 1.5 } },
  decor: { mgGridDraw: 5, mgAspectGuides: 4, mgTickRing: 3, mgTrackCross: 3, mgCubeCorner: 3, mgIsoCubes: 2, mgTcTag: 2, mgFrameDraw: 2 },
});
style('mgAcid', {
  name: 'アシッド', desc: '黒地に酸性ライム。強い色ずれと走査線、拍で刻む計器類でレイブ風に',
  moods: ['cyber', 'dark', 'glitch', 'graphic'],
  colors: { bg1: '#0a0a0a', bg2: '#141a0b', accent: '#c8ff00', accent2: '#a9adb8', text: '#f3ffd9' },
  fonts: { display: "'Reggae One', sans-serif", serif: "'Kaisei Tokumin', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: MONO, hand: "'Yusei Magic', sans-serif" },
  ghost: 0.7, ghostA: '#c8ff00', ghostB: '#5d6068',
  bias: { layout: { m_tunnel: 5, m_particles: 4, m_cube: 3, m_morph: 2, m_graph: 1.5, g_warp: 2.5, g_terrain: 2, g_torus: 2, g_helix: 2, n_onebeat: 2, n_odometer: 1.5, n_countdown: 1.5, n_maskbar: 1.5 }, enter: { particleIn: 2 }, exit: { particleOut: 2 } },
  decor: { mgScanBar: 4, mgChevronMarch: 4, mgBeatPips: 3, mgTrackCross: 3, mgBarChart: 2.5, mgDashRing: 2.5, mgSineKick: 2 },
});
style('mgPastelGeo', {
  name: 'パステル幾何', desc: '桜色とミントの淡い地に、丸ゴシックとやわらかな幾何図形。浮かぶ記号と軌道',
  moods: ['pop', 'calm', 'emotional'],
  colors: { bg1: '#fbf1e6', bg2: '#e4eef9', accent: '#ff7f96', accent2: '#4fae9b', text: '#34304c' },
  fonts: { display: "'M PLUS Rounded 1c', sans-serif", serif: "'Kaisei Tokumin', serif", body: "'Zen Maru Gothic', sans-serif", mono: MONO, hand: "'Hachi Maru Pop', cursive" },
  ghost: 0.25, ghostA: '#ffb3c1', ghostB: '#9ad6c9',
  bias: { layout: { m_morph: 5, m_particles: 4, m_cube: 2, m_graph: 1.2, m_tunnel: 0.6, g_blob: 2.5, g_orbits: 2, g_lissajous: 2, g_pendulum: 2, g_dotSphere: 1.5, n_donut: 2, n_waffle: 1.5 } },
  decor: { mgPlusFloat: 4, mgOrbit: 4, mgShapeRow: 3, mgIsoCubes: 3, mgSineKick: 3, mgBurst: 2, mgMorphCorner: 2 },
});
style('mgNewsprint', {
  name: 'モノクロ印刷', desc: '灰色がかった新聞紙に墨一色。明朝の見出しと数値・枠・目盛りで紙面のように',
  moods: ['editorial', 'calm', 'dark'],
  colors: { bg1: '#e8e5dc', bg2: '#d2cdc0', accent: '#141414', accent2: '#5a5a5a', text: '#111111' },
  fonts: { display: "'Zen Old Mincho', serif", serif: "'Shippori Mincho', serif", body: "'BIZ UDPGothic', sans-serif", mono: MONO, hand: "'Klee One', cursive" },
  ghost: 0.12, ghostA: '#3a3a3a', ghostB: '#8a8a8a',
  bias: { layout: { m_graph: 4, m_cube: 3, m_morph: 2.5, m_particles: 2, m_tunnel: 1, n_columns: 2.5, n_specimen: 2, n_notebook: 2, n_stats: 2, n_tally: 1.5, n_pctswap: 1.5, n_ladder: 1.5 }, enter: { fade: 1.2 }, exit: { fade: 1.2 } },
  decor: { mgFrameDraw: 4, mgTcTag: 4, mgBarChart: 3, mgProgressArc: 3, mgAspectGuides: 2.5, mgTickRing: 2, mgGridDraw: 2 },
});
style('mgNeonWire', {
  name: 'ネオンワイヤー', desc: '真っ黒の地にシアンとマゼンタの細い発光線。ワイヤー立方体・軌道・照準が拍で動く',
  moods: ['cyber', 'dark', 'glitch'],
  colors: { bg1: '#050507', bg2: '#0d0a1c', accent: '#00f0ff', accent2: '#ff2bd6', text: '#f3fbff' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Shippori Mincho', serif", body: "'Noto Sans JP', sans-serif", mono: MONO, hand: "'Zen Kurenaido', sans-serif" },
  ghost: 0.6, ghostA: '#00f0ff', ghostB: '#ff2bd6',
  bias: { layout: { m_tunnel: 4.5, m_cube: 4.5, m_particles: 4, m_morph: 2, m_graph: 2, g_torus: 2.5, g_helix: 2, g_dotSphere: 2, g_cardRing: 2, g_gyro: 2, g_lissajous: 2, n_gridlight: 2, n_countup: 1.5 }, enter: { particleIn: 1.8 }, exit: { particleOut: 1.8 } },
  decor: { mgOrbit: 4, mgTrackCross: 4, mgDashRing: 3, mgTickRing: 3, mgCubeCorner: 3, mgSineKick: 3, mgScanBar: 2.5 },
});
})();
