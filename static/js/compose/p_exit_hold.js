/* LyricFlow 演出パック: p_exit_hold — 退場(exit)・保持(hold)
   契約: docs/COMPOSE_PACKS.md  (group: exit+hold)
   exit: p=0 で静止状態そのまま → p=1 で完全に消える。字ごとの動きは L.stagger。
   hold: amt=0 で無変化、amt に比例。歌詞が読める控えめな動き。
   乱数は全て L.r / L.noise1(cut.seed・添字・step キー)で決定論。 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_exit_hold';
const PI = Math.PI, TAU = L.TAU;
const clamp = L.clamp, sm = L.smooth;

/* ---------------------------------------------------------------- helpers */
const X = (key, name, tags, w, apply, o) => L.register('exit', key, Object.assign({ name, tags, w, apply }, o || {}), P);
const H = (key, name, tags, w, apply, o) => L.register('hold', key, Object.assign({ name, tags, w, apply }, o || {}), P);
const A = (it, k) => { it.alpha = (it.alpha == null ? 1 : it.alpha) * clamp(k); };
const SC = (it, kx, ky) => {
  it.sx = (it.sx == null ? 1 : it.sx) * Math.max(0.001, kx);
  it.sy = (it.sy == null ? 1 : it.sy) * Math.max(0.001, ky == null ? kx : ky);
};
const seedOf = env => (env.cut && env.cut.seed) || 1;
const fn = (it, f) => { (it.charFns = it.charFns || []).push(f); };
const addPost = (it, f) => { const prev = it.post; it.post = prev ? (e, i2, m) => { prev(e, i2, m); f(e, i2, m); } : f; };
const clipX = (it, a, b) => { if (it.clip) { a = Math.max(a, it.clip[0]); b = Math.min(b, it.clip[1]); } it.clip = [a, Math.max(a, b)]; };
const clipY = (it, a, b) => { if (it.clipY) { a = Math.max(a, it.clipY[0]); b = Math.min(b, it.clipY[1]); } it.clipY = [a, Math.max(a, b)]; };
const sz = it => Math.max(1, it.size || 10);
const bright = env => (env.sc.dark ? '#ffffff' : env.sc.accent);
/* 各描画(帯・残像)の何回目かを数える: 字の添字が戻ったら次の描画 */
const drawCounter = () => { let last = Infinity, k = -1; return i => { if (i <= last) k++; last = i; return k; }; };
/* ビート: 無い時は 120BPM 相当を合成(プレビューで拍情報が無くても動く) */
const beatOf = env => {
  if (env.beat && env.beat.len > 0) return env.beat;
  const len = 0.5, t = Math.max(0, env.ltb || 0), k = Math.floor(t / len);
  return { since: t - k * len, len, index: k };
};
const GLITCH_CH = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ#%&$@*+=<>/01ΣΔ░▒▓';
const gch = (...k) => GLITCH_CH[L.h(...k) % GLITCH_CH.length];
/* ワイプ端の細いバー(項目ローカル座標、main パスのみ) */
const edgeBar = (it, axis, f, side, p, env) => {
  const a = Math.sin(clamp(p) * PI) * 0.9;
  if (a < 0.02) return;
  const col = env.sc.accent;
  addPost(it, (e, i2, m) => {
    const pad = sz(i2) * 0.6, t = sz(i2) * 0.07;
    if (axis === 'x') {
      const x = -m.w / 2 - pad + (m.w + pad * 2) * f;
      e.rect(side < 0 ? x - t : x, -m.h / 2, t, m.h, col, a, false);
    } else {
      const y = -m.h / 2 - pad + (m.h + pad * 2) * f;
      e.rect(-m.w / 2, side < 0 ? y - t : y, m.w, t, col, a, false);
    }
  });
};

/* ================================================================ EXIT */
/* ---- clip conceal ×10 */
X('wipeL', '左へ拭う', ['editorial', 'graphic', 'calm'], 1.1, (env, it, p) => {
  const e = E.inOutCubic(p); clipX(it, 0, 1 - e); edgeBar(it, 'x', 1 - e, -1, p, env);
});
X('wipeR', '右へ拭う', ['editorial', 'graphic', 'calm'], 1.1, (env, it, p) => {
  const e = E.inOutCubic(p); clipX(it, e, 1); edgeBar(it, 'x', e, 1, p, env);
});
X('wipeUp', '上へ拭う', ['editorial', 'graphic', 'cyber'], 1, (env, it, p) => {
  const e = E.inOutCubic(p); clipY(it, 0, 1 - e); edgeBar(it, 'y', 1 - e, -1, p, env);
});
X('wipeDown', '下へ拭う', ['editorial', 'graphic', 'calm'], 1, (env, it, p) => {
  const e = E.inOutCubic(p); clipY(it, e, 1); edgeBar(it, 'y', e, 1, p, env);
});
X('irisClose', 'アイリス閉じ', ['pop', 'graphic', 'editorial'], 0.9, (env, it, p) => {
  const e = E.inOutCubic(p), col = env.sc.accent;
  let R = 0;
  it.clipFn = (ctx, e2, i2, m) => { R = Math.hypot(m.w / 2, m.h / 2) * 1.04 * (1 - e); if (R > 0.5) ctx.arc(0, 0, R, 0, TAU); };
  addPost(it, (e2, i2) => { if (R > 0.5) e2.circle(0, 0, R, null, col, sz(i2) * 0.05, Math.sin(p * PI), false); });
});
X('blindsClose', 'ブラインド', ['graphic', 'editorial', 'cyber'], 0.9, (env, it, p) => {
  it.clipFn = (ctx, e2, i2, m) => {
    const pad = sz(i2) * 0.6, x0 = -m.w / 2 - pad, bw = m.w + pad * 2;
    const n = Math.max(3, Math.min(40, Math.round(bw / (sz(i2) * 0.28))));
    const cw = bw / n;
    for (let k = 0; k < n; k++) {
      const q = E.inOutQuad(L.stagger(p, k, n, 0.45, 'lr'));
      const w = cw * (1 - q);
      if (w > 0.2) ctx.rect(x0 + cw * k, -m.h / 2 - pad, w, m.h + pad * 2);
    }
  };
});
X('glyphWipe', '字ごと下抜け', ['editorial', 'calm', 'graphic'], 1, (env, it, p) => {
  fn(it, (i, g, n) => {
    const q = E.inOutQuad(L.stagger(p, i, n, 0.6, 'lr'));
    if (q <= 0) return null;
    if (q >= 1) return { hide: true };
    return { clipY: [-0.66 + 1.32 * q, 0.7], dy: q * sz(it) * 0.08 };
  });
});
X('diagWipe', '斜めワイプ', ['graphic', 'editorial', 'cyber'], 1, (env, it, p) => {
  const e = E.inOutCubic(p), th = -0.5, c = Math.cos(th), s = Math.sin(th), col = env.sc.accent;
  let cu = 0, R = 0;
  const mp = (u, v) => [u * c - v * s, u * s + v * c];
  it.clipFn = (ctx, e2, i2, m) => {
    const pad = sz(i2) * 0.2;
    R = Math.abs(m.w / 2 * c) + Math.abs(m.h / 2 * s) + pad;
    const R2 = Math.hypot(m.w, m.h) + pad * 4;
    cu = -R + 2 * R * e;
    if (cu >= R) return;
    const pts = [mp(cu, -R2), mp(R2, -R2), mp(R2, R2), mp(cu, R2)];
    ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath();
  };
  addPost(it, (e2, i2, m) => {
    const R2 = Math.hypot(m.w, m.h);
    e2.line([mp(cu + sz(i2) * 0.04, -R2), mp(cu + sz(i2) * 0.04, R2)], col, sz(i2) * 0.08, Math.sin(p * PI), false);
  });
});
X('splitMid', '中央へ閉じる', ['graphic', 'editorial', 'calm'], 0.9, (env, it, p) => {
  const e = E.inOutCubic(p); clipX(it, e / 2, 1 - e / 2);
  edgeBar(it, 'x', e / 2, 1, p, env); edgeBar(it, 'x', 1 - e / 2, -1, p, env);
});
X('curtain', '幕のように開く', ['emotional', 'calm', 'editorial'], 0.8, (env, it, p) => {
  const e = E.inOutCubic(p), s0 = sz(it), D = env.W * 0.6;
  fn(it, (i, g) => {
    const side = g.x < 0 || (g.x === 0 && i % 2 === 0) ? -1 : 1;
    const nx = side * D * e + g.x * (1 - 0.75 * e);
    const k = Math.min(1, Math.abs(g.x) / Math.max(1, s0 * 4));
    return { dx: nx - g.x, sx: 1 - 0.6 * e * (0.4 + 0.6 * (1 - k)), rot: side * Math.sin(e * PI) * 0.12, dy: Math.sin(e * PI) * s0 * 0.06, a: 1 - sm(0.7, 1, p) };
  });
});

/* ---- physics ×9 */
X('dropFall', 'ばらばら落下', ['pop', 'emotional', 'dark'], 1.1, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.55, 'random', sd);
    if (q <= 0) return null;
    const qq = E.inQuad(q);
    return { dy: qq * (env.H * 0.85 + s0) - Math.sin(Math.min(1, q * 4) * PI) * s0 * 0.08, dx: L.rs(sd, i, 'dx') * s0 * 0.6 * q, rot: L.rs(sd, i, 'r') * 1.5 * qq, a: 1 - sm(0.65, 1, q) };
  });
});
X('windBlow', '風にさらわれる', ['emotional', 'calm', 'pop'], 1, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'lr');
    if (q <= 0) return null;
    const r = L.r(sd, i, 'w');
    return { dx: E.inQuad(q) * env.W * (0.55 + 0.3 * r), dy: -Math.sin(q * PI * 0.9) * s0 * (0.5 + r) - q * s0 * 0.4, rot: q * (1.5 + 2 * r), skew: -0.3 * sm(0, 0.4, q), s: 1 - 0.35 * q, a: 1 - sm(0.45, 1, q) };
  });
});
X('explode', '爆散', ['graphic', 'pop', 'dark', 'glitch'], 0.9, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it), D = Math.min(env.W, env.H) * 0.7;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.25, 'center');
    if (q <= 0) return null;
    const ang = Math.atan2(g.y + L.rs(sd, i, 'ey') * s0 * 0.8, g.x + L.rs(sd, i, 'ex') * s0 * 0.8);
    const d = E.outCubic(q) * (D * (0.6 + 0.6 * L.r(sd, i, 'ed')) + Math.abs(g.x) * 0.6);
    return { dx: Math.cos(ang) * d, dy: Math.sin(ang) * d + E.inQuad(q) * s0, rot: L.rs(sd, i, 'er') * 3 * q, s: 1 + 0.5 * q, a: 1 - sm(0.3, 1, q) };
  });
}, { emph: 1.5 });
X('shatter', '砕け散る', ['glitch', 'graphic', 'dark'], 0.9, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it), cnt = drawCounter();
  it.bands = [[-4, 5, 0], [-4, 5, 0], [-4, 5, 0], [-4, 5, 0]];
  fn(it, (i, g, n) => {
    const piece = cnt(i) % 4, qx = piece & 1 ? 1 : -1, qy = piece & 2 ? 1 : -1;
    const cX = qx < 0 ? [-0.8, 0] : [0, 0.8], cY = qy < 0 ? [-0.9, 0] : [0, 0.9];
    const q = L.stagger(p, i, n, 0.4, 'random', sd);
    if (q <= 0) return { clipX: cX, clipY: cY };
    const r = L.r(sd, i, piece, 'sh');
    const o = E.outQuad(q) * s0 * (0.6 + 1.6 * r);
    return { clipX: cX, clipY: cY, dx: qx * o, dy: qy * o * 0.6 + E.inQuad(q) * env.H * 0.5, rot: qx * q * (0.8 + 2 * r), a: 1 - sm(0.45, 1, q) };
  });
}, { emph: 1.4 });
X('domino', 'ドミノ倒し', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.7, 'lr');
    if (q <= 0) return null;
    const th = E.inQuad(Math.min(1, q / 0.75)) * PI / 2, px = g.w / 2, py = s0 / 2;
    const c = Math.cos(th), s = Math.sin(th);
    return { rot: th, dx: px - (px * c - py * s), dy: py - (px * s + py * c) + E.inQuad(sm(0.7, 1, q)) * s0 * 1.2, a: 1 - sm(0.7, 1, q) };
  });
});
X('bounceOut', '弾んで去る', ['pop'], 0.9, (env, it, p) => {
  const bb = L.itemBox(it), s0 = sz(it);
  const dist = env.W - bb.x0 + s0;
  const e = E.inOutSine(p);   // 最初の跳ねがいきなり全速にならないように
  const hop = Math.abs(Math.sin(e * PI * 3)) * s0 * 1.1 * (1 - e * 0.6);
  const land = 1 - Math.abs(Math.sin(e * PI * 3));
  it.x = (it.x || 0) + E.inQuad(e) * dist;
  it.y = (it.y || 0) - hop;
  SC(it, 1 + 0.12 * land * land * Math.min(1, e * 6), 1 - 0.14 * land * land * Math.min(1, e * 6));
  it.rot = (it.rot || 0) + e * 0.35;
});
X('sink', '沈む', ['emotional', 'dark', 'calm'], 1, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.5, 'random', sd);
    if (q <= 0) return null;
    const dy = E.inQuad(q) * s0 * 1.3;
    return { dy, rot: Math.sin(q * 9 + i) * 0.15 * q, clipY: [-2, 0.64 - dy / s0], a: 1 - sm(0.9, 1, q) };
  });
});
X('balloonUp', '風船で昇る', ['pop', 'emotional', 'calm'], 1, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'random', sd);
    if (q <= 0) return null;
    const ph = L.r(sd, i, 'b') * 6;
    return { dy: -E.inQuad(q) * env.H * 0.8, dx: Math.sin(q * 6 + ph) * s0 * 0.35 * q, rot: Math.sin(q * 5 + ph) * 0.3 * q, s: 1 - 0.25 * q, a: 1 - sm(0.55, 1, q) };
  });
});
X('hingeDrop', '片吊り落下', ['graphic', 'pop', 'dark'], 0.8, (env, it, p) => {
  const m = L.measure(it), sx = it.sx == null ? 1 : it.sx, sy = it.sy == null ? 1 : it.sy;
  const u = Math.min(1, p / 0.6), v = sm(0.6, 1, p);
  const span = Math.max(m.w * sx, m.h * sy);
  // 出だしはゆっくり(inQuad)で傾き始め、終盤に行き過ぎる。開始直後に角度が飛ばないように
  const th = (0.9 * E.outBack(E.inQuad(u), 2.2)) * Math.min(1, (m.h * sy * 3) / Math.max(1, span) + 0.25) + v * 0.4;
  const px = -m.w * sx / 2, py = -m.h * sy / 2;
  const c = Math.cos(th), s = Math.sin(th);
  it.rot = (it.rot || 0) + th;
  it.x = (it.x || 0) + px - (px * c - py * s);
  it.y = (it.y || 0) + py - (px * s + py * c) + E.inQuad(v) * (env.H + span);
});

/* ---- rotation ×5 */
X('spinOut', '回転消失', ['pop', 'graphic'], 1, (env, it, p) => {
  const dir = L.r(seedOf(env), 'sp') < 0.5 ? -1 : 1;
  it.rot = (it.rot || 0) + dir * E.inCubic(p) * PI * 1.6;
  SC(it, 1 - 0.55 * E.inQuad(p));
  A(it, 1 - sm(0.45, 1, p));
});
X('flipCard', '字めくり', ['editorial', 'pop', 'graphic'], 1, (env, it, p) => {
  const shade = env.sc.sub;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.65, 'lr');
    if (q <= 0) return null;
    if (q >= 1) return { hide: true };
    return { sx: Math.cos(E.inQuad(q) * PI / 2), dy: -Math.sin(q * PI) * sz(it) * 0.08, color: q > 0.3 ? shade : null };
  });
});
X('flipY', '縦回転で消す', ['graphic', 'editorial', 'cyber'], 0.9, (env, it, p) => {
  const e = E.inOutQuad(Math.min(1, p / 0.92));
  SC(it, 1, Math.cos(e * PI / 2));
  it.skew = (it.skew || 0) + 0.3 * e;
  it.y = (it.y || 0) - e * sz(it) * 0.3;
  if (e > 0.3) it.color = L.mix(it.color || env.sc.fg, env.sc.sub, sm(0.3, 1, e));
});
X('accordion', '蛇腹たたみ', ['graphic', 'editorial', 'pop'], 0.8, (env, it, p) => {
  const shade = env.sc.sub, col = it.color || env.sc.fg;
  fn(it, (i, g, n) => {
    const q = E.inOutCubic(L.stagger(p, i, n, 0.2, 'edges'));
    if (q <= 0) return null;
    const odd = i % 2 === 1;
    return { sx: 1 - q, dx: -g.x * q * 0.92, dy: (odd ? 1 : -1) * q * sz(it) * 0.08, color: odd ? L.mix(col, shade, 0.6 * q) : null, a: 1 - sm(0.85, 1, q) };
  });
});
X('rollAway', '転がり去る', ['pop'], 0.9, (env, it, p) => {
  const s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.5, 'rl');
    if (q <= 0) return null;
    const d = E.inQuad(q) * env.W * 0.9;
    return { dx: d, rot: d / (s0 * 0.5), dy: -Math.abs(Math.sin(d / (s0 * 0.8))) * s0 * 0.08, a: 1 - sm(0.7, 1, q) };
  });
});

/* ---- scale ×5 */
X('shrinkPoint', '点に縮む', ['pop', 'graphic', 'calm'], 1, (env, it, p) => {
  const k = 1 - E.inBack(Math.min(1, p / 0.9), 2.2);
  SC(it, k);
  if (p > 0.4) it.color = L.mix(it.color || env.sc.fg, env.sc.accent, sm(0.4, 0.9, p));
});
X('stretchThin', '細く伸びる', ['graphic', 'cyber', 'editorial'], 0.9, (env, it, p) => {
  SC(it, 1 + 2.4 * E.inCubic(p), 1 - E.inQuad(p));
  A(it, 1 - sm(0.75, 1, p));
});
X('zoomThrough', '突き抜ける', ['graphic', 'pop', 'dark'], 1, (env, it, p) => {
  const e = E.inCubic(p);
  SC(it, 1 + 6 * e);
  it.echo = { n: 3, scale: -0.14 * sm(0, 0.5, p), a: 0.4, decay: 0.7 };
  A(it, 1 - sm(0.15, 0.9, p));
}, { emph: 1.3 });
X('squashFlat', '押し潰す', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const m = L.measure(it), hh = m.h * (it.sy == null ? 1 : it.sy) / 2;
  const ky = p < 0.3 ? 1 + 0.15 * Math.sin(p / 0.3 * PI) : 1 - E.outQuad(Math.min(1, (p - 0.3) / 0.45));
  const kx = 1 + 0.25 * sm(0.3, 0.75, p);
  SC(it, kx, ky);
  it.y = (it.y || 0) + hh * (1 - Math.max(0.001, ky));
  const col = env.sc.accent, la = Math.sin(clamp(p) * PI) * 0.9;
  addPost(it, (e2, i2, mm) => { if (la > 0.02) e2.rect(-mm.w / 2 - sz(i2) * 0.3, mm.h / 2, mm.w + sz(i2) * 0.6, Math.max(1, sz(i2) * 0.05) / Math.max(0.05, ky), col, la, false); });
  A(it, 1 - sm(0.9, 1, p));
});
X('glyphShrink', '字ごと縮む', ['pop', 'calm', 'editorial'], 1, (env, it, p) => {
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'edges');
    if (q <= 0) return null;
    if (q >= 1) return { hide: true };
    return { s: Math.max(0.001, 1 - E.inBack(q, 1.8)) };
  });
});

/* ---- bands / drips ×4 */
X('melt', '溶け落ちる', ['emotional', 'dark', 'glitch'], 0.9, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.5, 'random', sd);
    if (q <= 0) return null;
    const syk = 1 + 2.4 * E.inQuad(q);
    return { sy: syk, sx: 1 - 0.4 * q, dy: (syk - 1) * s0 * 0.5 + E.inCubic(q) * s0 * 0.9, a: 1 - sm(0.5, 1, q) };
  });
});
X('sliceSlide', '横スライス退場', ['graphic', 'cyber', 'glitch'], 1, (env, it, p) => {
  const sd = seedOf(env);
  const n = 6 + (L.h(sd, 'sl') % 3);
  L.itemBands(env, it, n, (k) => (k % 2 ? 1 : -1) * E.inCubic(L.stagger(p, k, n, 0.5, 'random', sd)) * env.W * 1.2);
  A(it, 1 - sm(0.85, 1, p));
});
X('vSliceDrop', '縦スライス落下', ['graphic', 'dark', 'glitch'], 0.9, (env, it, p) => {
  const sd = seedOf(env), m = L.measure(it);
  const n = Math.max(6, Math.min(24, Math.round((m.w + sz(it) * 1.2) / (sz(it) * 0.4))));
  L.itemVBands(env, it, n, (k) => E.inQuad(L.stagger(p, k, n, 0.6, 'random', sd)) * env.H * 1.1);
  A(it, 1 - sm(0.85, 1, p));
});
X('interlace', 'インターレース', ['cyber', 'glitch', 'editorial'], 0.9, (env, it, p) => {
  const u = env.u;
  it.clipFn = (ctx, e2, i2, m) => {
    const pad = sz(i2) * 0.6, x0 = -m.w / 2 - pad, bw = m.w + pad * 2, y0 = -m.h / 2 - pad, bh = m.h + pad * 2;
    const lh = Math.max(bh / 120, Math.max(3 * u, sz(i2) * 0.13));
    const n = Math.min(120, Math.ceil(bh / lh));
    const ev = 1 - E.inOutQuad(sm(0, 0.6, p)), od = 1 - E.inOutQuad(sm(0.35, 1, p));
    for (let k = 0; k < n; k++) {
      const t = lh * (k % 2 ? od : ev);
      if (t > 0.15) ctx.rect(x0 + (k % 2 ? 1 : -1) * p * sz(i2) * 0.3, y0 + lh * k, bw, t);
    }
  };
});

/* ---- glitch ×6 */
X('glitchOut', 'グリッチ消失', ['glitch', 'cyber', 'dark'], 1, (env, it, p) => {
  const sd = seedOf(env), st = env.step, s0 = sz(it);
  const e = p * p;
  L.itemBands(env, it, 8, (k) => {
    if (L.r(sd, k, st, 'gd') < e * 0.8) return env.W * 3;
    return L.r(sd, k, st, 'go') < 0.35 + p * 0.5 ? L.rs(sd, k, st, 'gx') * s0 * (0.1 + 1.4 * e) : 0;
  });
  if (p > 0.3 && L.r(sd, st, 'gb') < p * 0.35) A(it, 0.15);
  A(it, 1 - sm(0.85, 1, p));
});
X('scramble', '文字化けして消える', ['glitch', 'cyber'], 1, (env, it, p) => {
  const sd = seedOf(env), st = env.step, ac = env.sc.accent, sub = env.sc.sub;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'lr');
    if (q < 0.12) return null;
    if (q >= 0.92) return { hide: true };
    const on = q < 0.65 || L.r(sd, i, st, 'sb') < (0.92 - q) * 3;
    return on ? { ch: gch(sd, i, st), color: L.r(sd, i, st, 'sc') < 0.5 ? ac : sub } : { hide: true };
  });
});
X('crtOff', '電源オフ', ['cyber', 'glitch', 'dark'], 0.9, (env, it, p) => {
  const e1 = sm(0, 0.55, p), e2 = sm(0.55, 1, p);
  SC(it, (1 + 0.3 * e1) * (1 - E.inQuad(e2)), Math.max(0.006, 1 - E.inCubic(e1) * 0.995));
  it.color = L.mix(it.color || env.sc.fg, bright(env), e1 * 0.85);
  it.shadow = { color: L.rgba(env.sc.accent, 0.9), blur: sz(it) * 0.5 * e1, dx: 0, dy: 0 };
  A(it, 1 - sm(0.9, 1, p));
});
X('pixelDissolve', '画素崩れ', ['glitch', 'cyber'], 0.9, (env, it, p) => {
  const sd = seedOf(env), st2 = Math.floor(env.step / 2), cell = sz(it) * 0.12;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.5, 'random', sd);
    if (q <= 0) return null;
    if (q >= 0.97) return { hide: true };
    const v = 1 - q;
    const ox = L.rs(sd, i, st2, 'px') * (1 - v) * 0.5, oy = L.rs(sd, i, st2, 'py') * (1 - v) * 0.5;
    const hw = 0.6 * v, hh = 0.66 * Math.max(0.1, v * (0.6 + 0.4 * L.r(sd, i, st2, 'ph')));
    return {
      dx: Math.round(L.rs(sd, i, st2, 'jx') * q * 3) * cell, dy: Math.round(L.rs(sd, i, st2, 'jy') * q * 2) * cell,
      clipX: [ox - hw, ox + hw], clipY: [oy - hh, oy + hh], a: L.r(sd, i, st2, 'pa') < v * 1.4 ? 1 : 0,
    };
  });
});
X('rgbSplit', 'RGB分離', ['glitch', 'cyber', 'pop'], 1, (env, it, p) => {
  const cnt = drawCounter(), s0 = sz(it), cA = env.sc.accent, cB = env.sc.accent2;
  const d = E.inCubic(p) * s0 * 2.2 + p * s0 * 0.25;
  it.bands = [[-4, 5, 0], [-4, 5, 0], [-4, 5, 0]];
  fn(it, (i) => {
    const k = cnt(i) % 3;
    if (k === 0) return { dx: -d, dy: -d * 0.12, color: cA, a: 0.9 * (1 - sm(0.55, 1, p)) };
    if (k === 1) return { dx: d, dy: d * 0.12, color: cB, a: 0.9 * (1 - sm(0.55, 1, p)) };
    return { a: 1 - sm(0, 0.5, p) };
  });
});
X('signalLoss', '信号途絶', ['glitch', 'cyber', 'dark'], 0.9, (env, it, p) => {
  const sd = seedOf(env), st = env.step, s0 = sz(it);
  if (p > 0.85) { A(it, 0); return; }
  const on = L.r(sd, st, 'sl') > 0.1 + p * 0.9;
  A(it, on ? 1 - 0.3 * L.r(sd, st, 'sa') * p : 0.04);
  A(it, 1 - sm(0.3, 0.85, p) * 0.8);
  const blk = Math.floor(st / 2);
  if (L.r(sd, blk, 'roll') < 0.25 + p * 0.45) {
    it.y = (it.y || 0) + L.rs(sd, blk, 'ry') * s0 * 0.6 * p;
    SC(it, 1 + 0.15 * p, 1 - 0.35 * p * L.r(sd, blk, 'rs'));
    L.itemBands(env, it, 3, k => L.rs(sd, blk, k, 'rb') * s0 * 0.35 * p);
  }
  it.color = L.mix(it.color || env.sc.fg, env.sc.sub, p * 0.8);
});

/* ---- slide / whip ×3 */
X('whipLeft', '左へ払う', ['graphic', 'pop', 'cyber'], 1.1, (env, it, p) => {
  const bb = L.itemBox(it);
  const off = E.inBack(Math.min(1, p / 0.8), 1.4) * (bb.x1 + bb.w * 0.4 + sz(it));
  it.x = (it.x || 0) - off;
  it.skew = (it.skew || 0) + 0.35 * sm(0.1, 0.5, p);
  SC(it, 1 + 0.5 * sm(0.2, 1, p), 1);
  if (p > 0.2) it.streak = { n: 6, dx: -Math.max(0, off) * 0.35, dy: 0, a: 0.35 };
  A(it, 1 - sm(0.7, 0.95, p));
});
X('whipUp', '上へ跳ね上げ', ['graphic', 'pop'], 1, (env, it, p) => {
  const bb = L.itemBox(it);
  const off = E.inBack(Math.min(1, p / 0.8), 1.6) * (bb.y1 + bb.h * 0.5 + sz(it));
  it.y = (it.y || 0) - off;
  SC(it, 1 - 0.15 * sm(0.2, 1, p), 1 + 0.6 * sm(0.2, 1, p));
  if (p > 0.2) it.streak = { n: 6, dx: 0, dy: -Math.max(0, off) * 0.35, a: 0.35 };
  A(it, 1 - sm(0.7, 0.95, p));
});
X('slideStagger', '順に流れ去る', ['editorial', 'calm', 'graphic'], 1, (env, it, p) => {
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'rl');
    if (q <= 0) return null;
    return { dx: E.inCubic(q) * env.W * 0.9, sx: 1 + 0.8 * sm(0, 0.6, q), a: 1 - sm(0.6, 1, q) };
  });
});

/* ---- path / vortex ×3 */
X('swirlIn', '渦に吸い込む', ['emotional', 'pop', 'dark'], 0.9, (env, it, p) => {
  const dir = L.r(seedOf(env), 'sw') < 0.5 ? -1 : 1;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.4, 'edges');
    if (q <= 0) return null;
    const r0 = Math.hypot(g.x, g.y), a0 = Math.atan2(g.y, g.x);
    const r = r0 * (1 - E.inCubic(q)), da = dir * E.inQuad(q) * PI * 1.6, ang = a0 + da;
    return { dx: Math.cos(ang) * r - g.x, dy: Math.sin(ang) * r - g.y, rot: da, s: 1 - 0.92 * q, a: 1 - sm(0.75, 1, q) };
  });
});
X('suckPoint', '一点に吸われる', ['glitch', 'dark', 'graphic'], 0.8, (env, it, p) => {
  const m = L.measure(it), s0 = sz(it);
  const tx = m.w / 2 + s0 * 0.6, ty = 0;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.55, 'rl');
    if (q <= 0) return null;
    const vx = tx - g.x, vy = ty - g.y, e = E.inCubic(q);
    const stretch = Math.sin(Math.min(1, q) * PI);
    return { dx: vx * e, dy: vy * e, sx: (1 + 1.4 * stretch) * (1 - 0.9 * q), sy: (1 - 0.5 * stretch) * (1 - 0.9 * q), skew: -0.4 * stretch, a: 1 - sm(0.8, 1, q) };
  });
  addPost(it, (e2, i2) => { const a = Math.sin(p * PI) * 0.8; e2.circle(tx, ty, s0 * 0.07 * (1 + p), env.sc.accent, null, 2, a, false); });
});
X('spiralOut', '渦巻き飛散', ['pop', 'emotional', 'graphic'], 0.9, (env, it, p) => {
  const sd = seedOf(env), dir = L.r(sd, 'spo') < 0.5 ? -1 : 1, D = Math.min(env.W, env.H) * 0.75;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.4, 'center');
    if (q <= 0) return null;
    const r0 = Math.hypot(g.x, g.y), a0 = r0 > 1 ? Math.atan2(g.y, g.x) : L.r(sd, i, 'a') * TAU;
    const r = r0 + E.inQuad(q) * D, ang = a0 + dir * E.inQuad(q) * 2.4;
    return { dx: Math.cos(ang) * r - g.x, dy: Math.sin(ang) * r - g.y, rot: dir * q * 2.5, s: 1 + 0.3 * q, a: 1 - sm(0.45, 1, q) };
  });
});

/* ---- light ×4 */
X('bloomWhite', '白く飛ぶ', ['emotional', 'calm', 'pop'], 1, (env, it, p) => {
  const e = sm(0, 0.6, p);
  it.color = L.mix(it.color || env.sc.fg, '#ffffff', e);
  it.shadow = { color: L.rgba(L.mix(env.sc.accent, '#ffffff', env.sc.dark ? 0.45 : 0), 1), blur: sz(it) * 1.4 * e, dx: 0, dy: 0 };
  it.echo = { n: 2, scale: 0.04 * e, a: 0.45 * e, decay: 0.7, color: '#ffffff' };
  SC(it, 1 + 0.15 * E.outQuad(p));
  A(it, 1 - sm(0.4, 1, p));
});
X('blurOut', 'ぼやけて消える', ['calm', 'emotional'], 1, (env, it, p) => {
  const e = E.inQuad(p);
  if (env.allowFilter) it.blur = (it.blur || 0) + sz(it) * 0.28 * e;
  else it.echo = { n: 3, scale: 0.05 * e, a: 0.35, decay: 0.8 };
  it.track = (it.track || 0) + 0.35 * E.outQuad(p);
  A(it, 1 - sm(0.25, 1, p));
});
X('randomDissolve', 'ランダム消散', ['calm', 'emotional', 'editorial'], 1.1, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.75, 'random', sd);
    if (q <= 0) return null;
    return { a: 1 - E.inOutQuad(q), dy: -q * s0 * 0.18, s: 1 + 0.15 * q };
  });
});
X('sweepFlash', '光が通り消える', ['pop', 'cyber', 'emotional'], 1, (env, it, p) => {
  const ac = env.sc.accent, col = it.color || env.sc.fg;
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.65, 'lr');
    if (q <= 0) return null;
    const f = Math.sin(Math.min(1, q / 0.5) * PI);
    return { color: L.mix(col, ac, Math.min(1, q / 0.2)), s: 1 + 0.18 * f, dy: -f * sz(it) * 0.06, a: 1 - sm(0.35, 0.85, q) };
  });
});

/* ---- line work ×2 */
X('outlineUndraw', '線画に戻る', ['editorial', 'calm', 'emotional'], 0.9, (env, it, p) => {
  const f = sm(0, 0.35, p);
  it.fillAlpha = (it.fillAlpha == null ? 1 : it.fillAlpha) * (1 - f);
  if (f >= 1) it.fill = false;
  it.stroke = Math.max(1, sz(it) * 0.035);
  it.strokeColor = it.color || env.sc.fg;
  it.strokeUnder = false;
  it.strokeDash = null;
  if (p > 0.3) { it.extrude = null; it.shadow = null; it.gradient = null; it.pattern = null; }
  const d = 1 - E.outQuad(sm(0.3, 0.95, p));
  if (d < 1) it.dash = d;
});
X('outlineDots', '点線にほどける', ['editorial', 'cyber', 'calm'], 0.8, (env, it, p) => {
  const f = sm(0, 0.35, p), g = sm(0.3, 1, p), s0 = sz(it);
  it.fillAlpha = (it.fillAlpha == null ? 1 : it.fillAlpha) * (1 - f);
  if (f >= 1) it.fill = false;
  it.stroke = Math.max(1, s0 * 0.04 * (1 - 0.5 * g));
  it.strokeColor = it.color || env.sc.fg;
  it.strokeUnder = false;
  it.dash = null;
  if (p > 0.3) { it.extrude = null; it.shadow = null; it.gradient = null; it.pattern = null; }
  if (g > 0) it.strokeDash = [Math.max(0.6, s0 * 0.35 * (1 - g)), s0 * 0.04 + s0 * 0.45 * g];
  A(it, 1 - sm(0.8, 1, p));
});

/* ---- backspace ×1 */
X('backspace', 'バックスペース', ['cyber', 'editorial', 'pop'], 0.9, (env, it, p) => {
  const m = L.measure(it), n = m.lay.length;
  const k = Math.ceil((1 - sm(0, 0.82, p)) * n - 1e-6);
  fn(it, (i) => (i >= k ? { hide: true } : null));
  const blinkOn = p < 0.82 || Math.floor(env.t * 5) % 2 === 0;
  const col = env.sc.accent;
  addPost(it, (e2, i2, mm) => {
    if (!blinkOn || !mm.lay.length) return;
    const s0 = sz(i2), gl = mm.lay[Math.max(0, Math.min(mm.lay.length - 1, k - 1))];
    const a = 1 - sm(0.92, 1, p);
    if (i2.vertical) {
      const y = k > 0 ? gl.y + s0 * 0.58 : gl.y - s0 * 0.62;
      e2.rect(gl.x - s0 * 0.45, y, s0 * 0.9, s0 * 0.08, col, a, false);
    } else {
      const x = k > 0 ? gl.x + gl.w / 2 + s0 * 0.04 : gl.x - gl.w / 2 - s0 * 0.1;
      e2.rect(x, gl.y - s0 * 0.48, s0 * 0.08, s0 * 0.96, col, a, false);
    }
  });
});

/* ---- echo out ×1 */
X('echoOut', '残響', ['emotional', 'calm', 'graphic'], 1, (env, it, p) => {
  it.echo = { n: 4, scale: 0.09 * E.outCubic(p), a: 0.6, decay: 0.72, outline: true, color: env.sc.accent };
  it.fillAlpha = (it.fillAlpha == null ? 1 : it.fillAlpha) * (1 - sm(0.05, 0.55, p));
  A(it, 1 - sm(0.55, 1, p));
});

/* ---- extra */
X('hopAway', '跳ねて落ちる', ['pop'], 0.9, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.6, 'lr');
    if (q <= 0) return null;
    const up = q < 0.35 ? Math.sin(q / 0.35 * PI / 2) : Math.cos((q - 0.35) / 0.65 * PI / 2);
    const fall = q > 0.35 ? E.inQuad((q - 0.35) / 0.65) * (env.H * 0.7 + s0) : 0;
    return { dy: -up * s0 * 0.9 + fall, rot: L.rs(sd, i, 'hp') * q * 2.2, a: 1 - sm(0.75, 1, q) };
  });
});
X('tearSplit', '縦に裂ける', ['dark', 'graphic', 'glitch'], 0.8, (env, it, p) => {
  const e = E.inCubic(p), d = e * env.H * 0.9, s0 = sz(it);
  it.bands = [[0, 0.5, -d], [0.5, 1, d]];
  it.bands[0].vertical = true; it.bands[1].vertical = true;
  fn(it, (i, g) => ({ dx: (g.x < 0 ? -1 : 1) * E.outQuad(Math.min(1, p * 3)) * s0 * 0.12 }));
  A(it, 1 - sm(0.8, 1, p));
});
X('crumple', 'くしゃっと丸める', ['pop', 'dark'], 0.8, (env, it, p) => {
  const sd = seedOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const q = L.stagger(p, i, n, 0.3, 'edges');
    if (q <= 0) return null;
    const c = E.inOutCubic(Math.min(1, q / 0.65)), f = sm(0.6, 1, q);
    return {
      dx: -g.x * c * 0.95 + L.rs(sd, i, 'cx') * s0 * 0.2 * c, dy: -g.y * c * 0.95 + L.rs(sd, i, 'cy') * s0 * 0.2 * c + E.inQuad(f) * (env.H * 0.7 + s0),
      rot: L.rs(sd, i, 'cr') * 2.5 * c, skew: L.rs(sd, i, 'ck') * 0.6 * c, s: 1 - 0.6 * c, a: 1 - sm(0.85, 1, q),
    };
  });
});

/* ================================================================ HOLD */
/* ---- whole item ×7 */
H('breathe', '呼吸', ['calm', 'emotional'], 1.1, (env, it, amt) => {
  SC(it, 1 + 0.045 * amt * Math.sin(env.ltb * TAU / 3.2));
});
H('floatDrift', 'ふわり浮遊', ['calm', 'emotional', 'pop'], 1.1, (env, it, amt) => {
  const s0 = sz(it), ph = L.r(seedOf(env), 'fd') * TAU;
  it.x = (it.x || 0) + Math.sin(env.ltb * 0.8 + ph) * s0 * 0.1 * amt;
  it.y = (it.y || 0) + Math.sin(env.ltb * 1.25 + ph * 2) * s0 * 0.08 * amt;
});
H('sway', 'ゆらぎ回転', ['calm', 'emotional', 'wa'], 1, (env, it, amt) => {
  it.rot = (it.rot || 0) + Math.sin(env.ltb * 1.3) * 0.045 * amt;
});
H('slowPush', 'ゆっくり寄る', ['calm', 'emotional', 'editorial'], 1.1, (env, it, amt, c) => {
  const span = Math.max(0.5, (c && c.dur ? c.dur : 3) - (c && c.inDur ? c.inDur : 0.3));
  const prog = clamp((env.ltb - (c && c.inDur ? c.inDur : 0.3)) / span);
  SC(it, 1 + 0.08 * amt * E.outSine(prog));
});
H('skewWobble', '斜体ゆれ', ['pop', 'graphic', 'editorial'], 0.9, (env, it, amt) => {
  it.skew = (it.skew || 0) + Math.sin(env.ltb * 1.9) * 0.18 * amt;
});
H('tiltBob', 'かしげ揺れ', ['pop', 'emotional'], 1, (env, it, amt) => {
  const t = env.ltb * 1.7;
  it.rot = (it.rot || 0) + Math.sin(t) * 0.03 * amt;
  it.y = (it.y || 0) - Math.abs(Math.cos(t)) * sz(it) * 0.06 * amt;
});
H('heartbeat', '鼓動', ['emotional', 'pop', 'dark'], 0.9, (env, it, amt) => {
  const b = beatOf(env), s = b.since;
  const k = Math.exp(-s / 0.07) + (s > 0.17 ? 0.6 * Math.exp(-(s - 0.17) / 0.08) : 0);
  SC(it, 1 + 0.05 * amt * k);
});

/* ---- per glyph ×7 */
H('wave', '波うち', ['pop', 'calm', 'emotional'], 1.1, (env, it, amt) => {
  const s0 = sz(it), t = env.ltb * 3.2;
  fn(it, i => ({ dy: Math.sin(t - i * 0.55) * s0 * 0.09 * amt }));
});
H('pendulum', '振り子', ['pop', 'calm'], 0.9, (env, it, amt) => {
  const s0 = sz(it), t = env.ltb * 2.2;
  fn(it, i => {
    const th = Math.sin(t - i * 0.35) * 0.2 * amt;
    return { rot: th, dx: -s0 / 2 * Math.sin(th), dy: -s0 / 2 + s0 / 2 * Math.cos(th) };
  });
});
H('altBob', '交互に上下', ['pop'], 1, (env, it, amt) => {
  const s0 = sz(it), v = Math.sin(env.ltb * 2.6) * s0 * 0.08 * amt;
  fn(it, i => ({ dy: i % 2 ? v : -v }));
});
H('ripple', '波紋', ['pop', 'emotional', 'calm'], 1, (env, it, amt) => {
  const s0 = sz(it), per = 2.2;
  fn(it, (i, g, n) => {
    const ph = ((env.ltb / per) % 1) * (n + 5) - 2.5 - i;
    const k = Math.exp(-ph * ph * 0.6) * amt;
    return k > 0.002 ? { s: 1 + 0.14 * k, dy: -k * s0 * 0.05 } : null;
  });
});
H('orbit', '小さく公転', ['pop', 'calm'], 0.9, (env, it, amt) => {
  const s0 = sz(it), t = env.ltb * 2.4, r = s0 * 0.06 * amt;
  fn(it, i => ({ dx: Math.cos(t + i * 0.9) * r, dy: Math.sin(t + i * 0.9) * r }));
});
H('jelly', 'ぷるぷる', ['pop'], 0.9, (env, it, amt) => {
  const s0 = sz(it), t = env.ltb * 5.5;
  fn(it, i => {
    const w = Math.sin(t + i * 0.8) * 0.1 * amt;
    return { sx: 1 + w, sy: 1 - w, dy: w * s0 * 0.5 };
  });
});
H('glyphTurn', '字ごと揺らぐ', ['calm', 'emotional', 'editorial'], 1, (env, it, amt) => {
  const sd = seedOf(env), t = env.ltb;
  fn(it, i => {
    const r = L.r(sd, i, 'gt');
    return { rot: Math.sin(t * (0.8 + 0.6 * r) + r * 6) * 0.14 * amt };
  });
});

/* ---- beat / audio ×5 */
H('beatPulse', 'ビート波紋', ['pop', 'graphic', 'cyber'], 1, (env, it, amt) => {
  const b = beatOf(env), k = Math.exp(-b.since / 0.12);
  SC(it, 1 + 0.045 * amt * k);
  const kk = Math.min(1, b.since / Math.max(0.2, b.len * 0.8));
  if (kk < 1 && !it.echo) it.echo = { n: 1, scale: 0.02 + 0.12 * E.outCubic(kk), a: 0.55 * amt * (1 - kk), decay: 1, outline: true, color: env.sc.accent };
});
H('beatBounce', 'ビート跳ね', ['pop', 'graphic'], 1, (env, it, amt) => {
  const b = beatOf(env), s0 = sz(it);
  fn(it, (i, g, n) => {
    const dl = Math.min(0.025, b.len * 0.4 / Math.max(1, n));
    let d = b.since - i * dl; if (d < 0) d += b.len;
    const hop = d < 0.22 ? Math.sin(d / 0.22 * PI) : 0;
    return hop > 0 ? { dy: -hop * s0 * 0.15 * amt } : null;
  });
});
H('energyShake', '音圧シェイク', ['dark', 'glitch', 'graphic'], 0.8, (env, it, amt) => {
  const sd = seedOf(env), en = clamp(env.energy == null ? 0.5 : env.energy), s0 = sz(it);
  const amp = s0 * 0.05 * amt * (0.25 + en * en * 1.2), t = env.ltb * 16;
  it.x = (it.x || 0) + (L.noise1(t, sd) - 0.5) * 2 * amp;
  it.y = (it.y || 0) + (L.noise1(t, sd + 7) - 0.5) * 2 * amp;
  it.rot = (it.rot || 0) + (L.noise1(t * 0.7, sd + 3) - 0.5) * 0.04 * amt * en;
});
H('kickFlash', 'キック発色', ['pop', 'cyber', 'graphic'], 0.9, (env, it, amt) => {
  const b = beatOf(env), k = Math.exp(-b.since / 0.15) * (b.index % 2 === 0 ? 1 : 0.45) * amt;
  if (k < 0.005) return;
  it.color = L.mix(it.color || env.sc.fg, env.sc.accent, 0.85 * k);
  SC(it, 1 + 0.02 * k);
});
H('bassSquash', '低音つぶれ', ['pop', 'dark', 'graphic'], 0.8, (env, it, amt) => {
  const b = beatOf(env), k = Math.exp(-b.since / 0.18) * (b.index % 2 === 0 ? 1 : 0.5) * amt;
  if (k < 0.005) return;
  const hh = L.measure(it).h * (it.sy == null ? 1 : it.sy) / 2, ky = 1 - 0.12 * k;
  SC(it, 1 + 0.08 * k, ky);
  it.y = (it.y || 0) + hh * (1 - ky);
});

/* ---- noise / jitter ×4 */
H('handheld', '手持ちゆれ', ['calm', 'emotional', 'editorial'], 1, (env, it, amt) => {
  const sd = seedOf(env), s0 = sz(it), t = env.ltb * 1.6;
  it.x = (it.x || 0) + (L.noise1(t, sd + 11) - 0.5) * s0 * 0.09 * amt;
  it.y = (it.y || 0) + (L.noise1(t, sd + 12) - 0.5) * s0 * 0.07 * amt;
  it.rot = (it.rot || 0) + (L.noise1(t * 0.8, sd + 13) - 0.5) * 0.03 * amt;
});
H('handwrite', '手描きゆらぎ', ['pop', 'emotional', 'editorial'], 0.9, (env, it, amt) => {
  const sd = seedOf(env), s0 = sz(it), st = Math.floor(env.ltb * 8);
  fn(it, i => ({ rot: L.rs(sd, i, st, 'hr') * 0.08 * amt, dx: L.rs(sd, i, st, 'hx') * s0 * 0.02 * amt, dy: L.rs(sd, i, st, 'hy') * s0 * 0.02 * amt, s: 1 + L.rs(sd, i, st, 'hs') * 0.025 * amt }));
});
H('tremble', '震え', ['dark', 'emotional', 'glitch'], 0.8, (env, it, amt) => {
  const sd = seedOf(env), s0 = sz(it), st = env.step;
  const bad = L.h(sd, 'tb');
  fn(it, (i, g, n) => {
    const k = (i === bad % Math.max(1, n) ? 2.2 : 1) * s0 * 0.018 * amt;
    return { dx: L.rs(sd, i, st, 'tx') * k, dy: L.rs(sd, i, st, 'ty') * k };
  });
});
H('noiseDrift', '漂う', ['calm', 'emotional', 'dark'], 1, (env, it, amt) => {
  const sd = seedOf(env), s0 = sz(it), t = env.ltb * 0.7;
  fn(it, i => ({
    dx: (L.noise1(t + i * 3.1, sd + 21) - 0.5) * s0 * 0.07 * amt,
    dy: (L.noise1(t + i * 2.3, sd + 22) - 0.5) * s0 * 0.16 * amt,
    rot: (L.noise1(t + i * 1.7, sd + 23) - 0.5) * 0.14 * amt,
  }));
});

/* ---- light / colour ×3 */
H('shimmer', 'きらめき', ['pop', 'emotional', 'cyber'], 1, (env, it, amt) => {
  const col = it.color || env.sc.fg;
  const ac = L.contrast(env.sc.accent, col) < 1.4 ? L.mix(col, env.sc.dark ? '#ffffff' : '#000000', 0.5) : env.sc.accent;
  fn(it, (i, g, n) => {
    const ph = ((env.ltb * 0.45) % 1) * (n + 6) - 3 - i;
    const k = Math.exp(-ph * ph / 2) * amt;
    return k > 0.01 ? { color: L.mix(col, ac, 0.8 * k), dy: -k * sz(it) * 0.02 } : null;
  });
});
H('neonFlicker', 'ネオン明滅', ['cyber', 'dark', 'pop'], 0.9, (env, it, amt) => {
  const sd = seedOf(env), st = env.step;
  it.shadow = Object.assign({}, it.shadow || {}, { color: L.rgba(env.sc.accent, 0.85), blur: sz(it) * 0.3 * amt });
  const r = L.r(sd, st, 'nf');
  if (r < 0.03) A(it, 1 - 0.8 * amt); else if (r < 0.08) A(it, 1 - 0.45 * amt);
  const bad = L.h(sd, 'nb'), st3 = Math.floor(st / 5);   // 1字の明滅も1秒3回以下に
  fn(it, (i, g, n) => (i === bad % Math.max(1, n) && L.r(sd, st3, 'nbf') < 0.4 ? { a: 1 - 0.75 * amt } : null));
});
H('glowPulse', '発光脈動', ['emotional', 'cyber', 'calm'], 1, (env, it, amt) => {
  const k = 0.5 + 0.5 * Math.sin(env.ltb * 2.4);
  it.shadow = Object.assign({ dx: 0, dy: 0 }, it.shadow || {}, { color: L.rgba(env.sc.accent, 0.9), blur: sz(it) * (0.1 + 0.4 * k) * amt });
});

/* ---- glitch tick ×2 */
H('glitchSlip', '時々ずれる', ['glitch', 'cyber'], 0.8, (env, it, amt) => {
  const sd = seedOf(env), tick = Math.floor(env.step / 3), s0 = sz(it);
  if (L.r(sd, tick, 'gs') >= 0.14 * amt) return;
  L.itemBands(env, it, 5, k => (L.r(sd, tick, k, 'gk') < 0.55 ? L.rs(sd, tick, k, 'gv') * s0 * 0.28 * amt : 0));
  it.color = L.mix(it.color || env.sc.fg, L.r(sd, tick, 'gc') < 0.5 ? env.sc.accent : env.sc.accent2, 0.5 * amt);
});
H('charSwap', '一瞬の化け', ['glitch', 'cyber', 'dark'], 0.8, (env, it, amt) => {
  const sd = seedOf(env), tick = Math.floor(env.step / 2), st = env.step, ac = env.sc.accent;
  const blk = Math.floor(tick / 8), ph = tick - blk * 8, at = L.h(sd, blk, 'ca') % 7;
  if ((ph !== at && ph !== at + 1) || L.r(sd, blk, 'cs') >= 0.75 * amt) return;
  const j = L.h(sd, blk, 'cj'), j2 = L.h(sd, blk, 'cj2'), two = L.r(sd, blk, 'c2') < 0.35;
  fn(it, (i, g, n) => {
    if (i !== j % n && !(two && i === j2 % n)) return null;
    return { ch: gch(sd, i, st), color: ac, dx: L.rs(sd, i, st, 'cx') * sz(it) * 0.08 * amt };
  });
});
})();
