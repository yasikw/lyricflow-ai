/* LyricFlow 演出パック: p_enter — 登場
   契約: docs/COMPOSE_PACKS.md  (group: enter)
   p=0 で不可視、p→1 で静止状態へ収束(apply は p<1 の間だけ呼ばれる)。
   字ごとの動きは charFns + L.stagger(全字が p=1 で揃う)。乱数は cut.seed/字番号/step をキーにした決定論のみ。 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_enter';
const clamp = L.clamp, sm = L.smooth, PI = Math.PI, TAU = L.TAU;

/* ---------------------------------------------------------------- helpers */
const reg = (key, name, tags, w, apply, extra) => L.register('enter', key, Object.assign({ name, tags, w, apply }, extra || {}), P);
const mulA = (it, k) => { it.alpha = (it.alpha == null ? 1 : it.alpha) * clamp(k); };
const s1 = v => (Math.abs(v - 1) < 0.003 ? 1 : v);
const mulS = (it, sx, sy) => { it.sx = (it.sx == null ? 1 : it.sx) * s1(sx); it.sy = (it.sy == null ? 1 : it.sy) * s1(sy == null ? sx : sy); };
/* 字ごとの関数を登録。終端付近の微小なずれ(<0.5px / 回転<0.2°/ 倍率±0.3%)は0に丸める(p=1 直前の1px跳ね・回転描画の差を防ぐ) */
const tz = v => (v && Math.abs(v) >= 0.5 ? v : 0);
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
/* 帯: 全帯のずれが0.5px未満なら帯をやめる(帯の継ぎ目を残さない) */
const bandsDone = it => { if (it.bands && it.bands.every(b => Math.abs(b[2] || 0) < 0.5 && (b[1] - b[0]) > 1e-4)) { const full = it.bands.reduce((a, b) => a + (b[1] - b[0]), 0); if (full > 0.999) it.bands = null; } };
/* 項目の位置・回転: 微小なら0 */
const settle = (it, dx, dy, rot) => { it.x += tz(dx); it.y += tz(dy); if (rot && Math.abs(rot) >= 0.0035) it.rot = (it.rot || 0) + rot; };
const chain = (it, key, f) => { const o = it[key]; it[key] = o ? (e, i, m) => { o(e, i, m); f(e, i, m); } : f; };
const sd = (env, c) => ((env.cut && env.cut.seed) || 0) + ((c && c.mi) || 0) * 7919;
const SZ = it => Math.max(1, it.size || 40);
const meas = it => it._m || L.measure(it);
const setClip = (it, a, b) => { const c = it.clip; it.clip = c ? [Math.max(c[0], a), Math.min(c[1], b)] : [a, b]; };
const setClipY = (it, a, b) => { const c = it.clipY; it.clipY = c ? [Math.max(c[0], a), Math.min(c[1], b)] : [a, b]; };
const colOf = (env, it) => it.color || env.sc.fg;
const hot = env => (env.sc.dark ? '#ffffff' : L.mix(env.sc.accent, '#ffffff', 0.35));
/* 項目の余白込みの箱(クリップ座標と同じ) */
const padBox = (it, m) => { const pad = SZ(it) * 0.6; return { hw: m.w / 2 + pad, hh: m.h / 2 + pad }; };
/* 空白を除いた字の通し番号(lay 添字 → 序数)。テキストごとにキャッシュ */
const ordCache = new Map();
const ordinals = (it, m) => {
  const k = (it.vertical ? 'v' : 'h') + it.text;
  let o = ordCache.get(k);
  if (!o) {
    let c = 0;
    o = { ord: m.lay.map(g => (g.space ? -1 : c++)), N: 0 };
    o.N = c;
    if (ordCache.size > 400) ordCache.clear();
    ordCache.set(k, o);
  }
  return o;
};
/* 項目ローカル座標で字を直接描く(pre/post 用、main パスのみ呼ぶこと) */
const rawGlyphs = (env, it, m, o) => {
  const ctx = env.ctx;
  const a = clamp((it.alpha == null ? 1 : it.alpha) * (o.alpha == null ? 1 : o.alpha));
  if (a <= 0.003) return;
  const size = SZ(it);
  ctx.save();
  ctx.font = L.fontStr(it); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (o.comp) ctx.globalCompositeOperation = o.comp;
  ctx.globalAlpha = a;
  if (o.lw) {
    ctx.lineWidth = o.lw; ctx.strokeStyle = o.color; ctx.lineJoin = 'round';
    if (o.dash != null && o.dash < 1) { const L0 = size * 7; ctx.setLineDash([L0 * clamp(o.dash), L0]); }
  } else ctx.fillStyle = o.color;
  const dx = o.dx || 0, dy = o.dy || 0;
  for (const g of m.lay) {
    if (g.space) continue;
    if (o.skip && o.skip(g)) continue;
    const ox = g.vshift ? size * 0.3 * g.vshift : 0, oy = g.vshift ? -size * 0.3 * g.vshift : 0;
    ctx.save();
    ctx.translate(g.x + dx, g.y + dy);
    if (g.vrot) ctx.rotate(PI / 2);
    if (o.lw) ctx.strokeText(g.ch, ox, oy); else ctx.fillText(g.ch, ox, oy);
    ctx.restore();
  }
  ctx.restore();
};
/* 語・行のグループ番号(語ごと表示用) */
const grpCache = new Map();
const groupsOf = (it, m) => {
  const k = (it.vertical ? 'v' : 'h') + it.text;
  let r = grpCache.get(k);
  if (r) return r;
  const lay = m.lay;
  const gi = new Array(lay.length).fill(0);
  const lines = lay.reduce((mx, g) => Math.max(mx, g.line), 0) + 1;
  let G = 1;
  if (lines > 1) { lay.forEach((g, i) => { gi[i] = g.line; }); G = lines; }
  else if (lay.some(g => g.space)) { let c = 0; lay.forEach((g, i) => { if (g.space && i > 0 && !lay[i - 1].space) c++; gi[i] = c; }); G = c + 1; }
  else {
    const ch = L.chunks(String(it.text).replace(/\n/g, ''));
    let idx = 0;
    ch.forEach((c, j) => { const len = L.glyphs(c).length; for (let q = 0; q < len && idx < lay.length; q++) gi[idx++] = j; });
    while (idx < lay.length) gi[idx++] = Math.max(0, ch.length - 1);
    G = Math.max(1, ch.length);
  }
  r = { gi, G };
  if (grpCache.size > 400) grpCache.clear();
  grpCache.set(k, r);
  return r;
};
const damp = (e, freq, k) => Math.exp(-k * e) * Math.cos(freq * PI * e) * (1 - e);   // 減衰振動(e=1 で必ず0)
const POOL_LAT = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@*+=?<>';
const POOL_KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const POOL_BLOCK = '█▓▒░■□▪▚▞▙▟';
const pick = (pool, ...k) => pool[Math.floor(L.r(...k) * pool.length) % pool.length];

/* ================================================================ クリップ系 (clip reveals) */
reg('wipeL', '左ワイプ', ['editorial', 'graphic', 'calm'], 1.2, (env, it, p) => { setClip(it, 0, E.outCubic(p)); });
reg('wipeR', '右ワイプ', ['editorial', 'graphic', 'calm'], 0.9, (env, it, p) => { setClip(it, 1 - E.outCubic(p), 1); });
reg('wipeT', '上ワイプ', ['editorial', 'calm', 'emotional'], 0.9, (env, it, p) => { setClipY(it, 0, E.outCubic(p)); });
reg('wipeB', '下ワイプ', ['editorial', 'calm', 'graphic'], 0.9, (env, it, p) => {
  const e = E.outCubic(p);
  setClipY(it, 1 - e, 1);
  it.y += (1 - e) * SZ(it) * 0.25;
});
reg('wipeMid', '中央から開く', ['editorial', 'graphic', 'calm'], 1, (env, it, p) => {
  const e = E.outQuart(p);
  setClip(it, 0.5 - e / 2, 0.5 + e / 2);
});
reg('openY', '上下に開く', ['editorial', 'emotional', 'calm'], 0.9, (env, it, p) => {
  const e = E.inOutCubic(p);
  setClipY(it, 0.5 - e / 2, 0.5 + e / 2);
  mulS(it, 1, 0.55 + 0.45 * E.outCubic(p));
});
reg('wipeDiag', '斜めワイプ', ['graphic', 'editorial', 'pop'], 1, (env, it, p) => {
  const e = E.outCubic(p);
  it.clipFn = (ctx, env2, it2, m) => {
    const { hw, hh } = padBox(it2, m);
    const sl = hh * 0.9, span = 2 * hw + 2 * sl, xe = -hw - sl + span * e, xl = -hw - 3 * sl;
    ctx.moveTo(xl, -hh); ctx.lineTo(xe + sl, -hh); ctx.lineTo(xe - sl, hh); ctx.lineTo(xl, hh); ctx.closePath();
  };
});
reg('iris', 'アイリス', ['pop', 'graphic', 'emotional'], 0.9, (env, it, p) => {
  const e = E.outCubic(p);
  it.clipFn = (ctx, env2, it2, m) => { const { hw, hh } = padBox(it2, m); ctx.arc(0, 0, Math.hypot(hw, hh) * e, 0, TAU); };
  mulS(it, 1.15 - 0.15 * e);
});
reg('clock', '時計ワイプ', ['graphic', 'pop', 'editorial'], 0.8, (env, it, p) => {
  const e = E.inOutCubic(p);
  if (e <= 0.0005) { it.alpha = 0; return; }
  it.clipFn = (ctx, env2, it2, m) => {
    const { hw, hh } = padBox(it2, m); const R = Math.hypot(hw, hh) * 1.05;
    ctx.moveTo(0, 0); ctx.arc(0, 0, R, -PI / 2, -PI / 2 + TAU * e); ctx.closePath();
  };
});
reg('barWipe', '色帯ワイプ', ['graphic', 'pop', 'editorial', 'cyber'], 1.1, (env, it, p) => {
  const e = E.inOutCubic(clamp(p / 0.85));
  const fade = 1 - sm(0.8, 1, p);
  it.clipFn = (ctx, env2, it2, m) => {
    const pad = SZ(it2) * 0.14, x0 = -m.w / 2 - pad, x1 = m.w / 2 + pad * 3;
    const xe = x0 + (x1 - x0) * e;
    ctx.rect(x0 - SZ(it2) * 2, -m.h / 2 - pad * 2, xe - x0 + SZ(it2) * 2, m.h + pad * 4);
  };
  chain(it, 'post', (env2, it2, m) => {
    const pad = SZ(it2) * 0.14, x0 = -m.w / 2 - pad, x1 = m.w / 2 + pad * 3, bw = SZ(it2) * 0.22;
    const xe = x0 + (x1 - x0) * e;
    env2.rect(xe - bw, -m.h / 2 - pad, bw, m.h + pad * 2, env2.sc.accent, fade * sm(0, 0.05, p), true);
  });
});
reg('blockReveal', 'ブロック出現', ['graphic', 'pop', 'editorial', 'cyber'], 1.2, (env, it, p) => {
  const a = E.inOutCubic(clamp(p / 0.48)), b = E.inOutCubic(clamp((p - 0.5) / 0.5));
  const x = (m, it2) => { const pad = SZ(it2) * 0.14; return [-m.w / 2 - pad, m.w / 2 + pad, pad]; };
  it.clipFn = (ctx, env2, it2, m) => {
    const [x0, x1, pad] = x(m, it2);
    const xe = p < 0.5 ? x0 + (x1 - x0) * a : x1 + SZ(it2) * 2;
    ctx.rect(x0 - SZ(it2) * 2, -m.h / 2 - pad * 3, xe - x0 + SZ(it2) * 2, m.h + pad * 6);
  };
  chain(it, 'post', (env2, it2, m) => {
    const [x0, x1, pad] = x(m, it2);
    const l = p < 0.5 ? x0 : x0 + (x1 - x0) * b, r = p < 0.5 ? x0 + (x1 - x0) * a : x1;
    if (r - l > 0.5) env2.rect(l, -m.h / 2 - pad, r - l, m.h + pad * 2, env2.sc.accent, 1, false);
  });
}, { emph: 1.2 });
reg('blinds', 'ブラインド', ['editorial', 'graphic', 'calm'], 0.9, (env, it, p) => {
  const m = meas(it);
  const n = Math.max(4, Math.min(9, Math.round((m.h / SZ(it)) * 5)));
  it.bands = [];
  for (let i = 0; i < n; i++) {
    const e = E.outCubic(L.stagger(p, i, n, 0.35));
    it.bands.push([i / n, i / n + e / n, 0]);
  }
  bandsDone(it);
});
reg('glyphWipe', '一字ずつワイプ', ['editorial', 'calm', 'graphic'], 1, (env, it, p) => {
  fn(it, (i, g, n) => {
    const e = E.outQuad(L.stagger(p, i, n, 0.65));
    if (e <= 0) return { hide: true };
    return e >= 1 ? null : { clipX: [-0.6, -0.6 + 1.2 * e] };
  });
});
reg('maskRise', '字ごとせり上がり', ['editorial', 'graphic', 'calm', 'emotional'], 1.4, (env, it, p) => {
  fn(it, (i, g, n) => {
    const e = 1 - Math.pow(1 - L.stagger(p, i, n, 0.5), 5);
    if (e <= 0) return { hide: true };
    if (e >= 1) return null;
    const d = (1 - e) * 1.15;
    return { dy: d * SZ(it), clipY: [-0.62 - d, 0.62 - d] };
  });
});
reg('curtain', '幕開き', ['graphic', 'pop', 'wa', 'editorial'], 0.8, (env, it, p) => {
  const o = E.inOutCubic(clamp((p - 0.12) / 0.88));
  const pa = sm(0, 0.12, p) * (1 - sm(0.82, 1, p));
  mulA(it, sm(0.06, 0.16, p));
  chain(it, 'post', (env2, it2, m) => {
    const pad = SZ(it2) * 0.18, hw = m.w / 2 + pad, top = -m.h / 2 - pad, h = m.h + pad * 2;
    const cw = hw * (1 - o);               // 各パネルの幅
    const off = hw * o * 0.35;             // 開きながら少し外へ
    if (cw > 0.5) {
      env2.rect(-hw - off, top, cw, h, env2.sc.accent, pa, false);
      env2.rect(hw - cw + off, top, cw, h, env2.sc.accent, pa, false);
    }
    const lw = Math.max(1, SZ(it2) * 0.04);
    env2.rect(-hw - off + cw - lw, top, lw, h, env2.sc.accent2, pa, false);
    env2.rect(hw - cw + off, top, lw, h, env2.sc.accent2, pa, false);
  });
});

/* ================================================================ スライド系 */
const slide = (dirX, dirY) => (env, it, p) => {
  const e = E.outExpo(p);
  const dist = dirX ? env.W * 0.55 : env.H * 0.5;
  const d = (1 - e) * dist;
  settle(it, dirX * d, dirY * d, 0);
  mulA(it, sm(0, 0.12, p));
  const tr = Math.min(d, (1 - e) * dist * 0.4 + SZ(it) * 0.3 * (1 - e));
  if (tr > 1) it.streak = { n: 6, dx: -dirX * tr, dy: -dirY * tr, a: 0.4 };
};
reg('slideL', '左から滑り込み', ['pop', 'graphic', 'cyber'], 1, slide(-1, 0));
reg('slideR', '右から滑り込み', ['pop', 'graphic', 'cyber'], 1, slide(1, 0));
reg('slideUp', '下から滑り込み', ['pop', 'graphic', 'emotional'], 1, slide(0, 1));
reg('slideDown', '上から滑り込み', ['pop', 'graphic', 'dark'], 0.8, slide(0, -1));
reg('whip', 'ホイップ', ['pop', 'graphic', 'cyber', 'dark'], 1.1, (env, it, p) => {
  const e = E.outBack(clamp(p / 0.9), 2.4);
  const d = (1 - e) * env.W * 0.7;
  it.x += d;
  const v = Math.pow(1 - clamp(p / 0.5), 2);
  it.skew = (it.skew || 0) - 0.45 * v + 0.12 * Math.sin(clamp(p / 0.9) * PI * 2) * (1 - p) * (p > 0.4 ? 1 : 0);
  if (v > 0.02) { it.blur = (it.blur || 0) + SZ(it) * 0.12 * v; it.streak = { n: 5, dx: -env.W * 0.12 * v, dy: 0, a: 0.35 }; }
  mulA(it, sm(0, 0.1, p));
}, { emph: 1.3 });
reg('zipper', 'ジッパー', ['pop', 'graphic', 'cyber'], 1, (env, it, p) => {
  const vert = !!it.vertical;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.5);
    if (s <= 0) return { hide: true };
    const e = E.outCubic(s), d = (1 - e) * SZ(it) * 2.4 * (i % 2 ? 1 : -1);
    return vert ? { dx: d, a: sm(0, 0.35, s) } : { dy: d, a: sm(0, 0.35, s) };
  });
});
reg('glyphFlow', '字ごと流入', ['calm', 'emotional', 'editorial'], 1, (env, it, p) => {
  const vert = !!it.vertical;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.6);
    if (s <= 0) return { hide: true };
    const e = E.outQuart(s), d = (1 - e) * SZ(it) * 3.2;
    return vert ? { dy: d, a: sm(0, 0.5, s) } : { dx: d, a: sm(0, 0.5, s), skew: -0.25 * (1 - e) };
  });
});

/* ================================================================ スケール系 */
reg('pop', 'ポップ', ['pop'], 1.3, (env, it, p) => {
  const s = Math.max(0, E.outBack(p, 2.4));
  mulS(it, s);
  mulA(it, sm(0, 0.15, p));
}, { emph: 1.2 });
reg('punch', 'パンチイン', ['pop', 'graphic', 'dark', 'cyber'], 1.1, (env, it, p) => {
  const e = E.outQuart(p);
  mulS(it, 1 + 2.3 * (1 - e));
  it.blur = (it.blur || 0) + SZ(it) * 0.22 * Math.pow(1 - e, 1.5);
  mulA(it, E.outQuad(clamp(p * 2.5)));
}, { emph: 1.6 });
reg('zoomFar', '奥から寄る', ['calm', 'emotional', 'cyber'], 1, (env, it, p) => {
  const e = E.outCubic(p);
  mulS(it, 0.18 + 0.82 * e);
  it.color = L.mix(env.sc.bg, colOf(env, it), sm(0, 0.9, p));
  mulA(it, sm(0, 0.3, p));
  it.y -= (1 - e) * SZ(it) * 0.6;
});
const popGlyph = (order, spin) => (env, it, p, c) => {
  const seed = sd(env, c);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.6, order, seed);
    if (s <= 0) return { hide: true };
    const k = Math.max(0, E.outBack(s, 2.6));
    const r = { s: k, a: sm(0, 0.25, s) };
    if (spin) r.rot = L.rs(seed, i, 'pr') * 0.9 * (1 - E.outCubic(s));
    return r;
  });
};
reg('popCenter', '中央から弾ける', ['pop', 'graphic'], 1, popGlyph('center', false));
reg('popEdges', '両端から弾ける', ['pop', 'graphic'], 0.9, popGlyph('edges', false));
reg('popRandom', 'ばらばらポップ', ['pop'], 1, popGlyph('random', true));
reg('stretch', '伸びて縮む', ['graphic', 'pop', 'cyber'], 0.9, (env, it, p) => {
  const e = E.outExpo(p);
  const v = !!it.vertical;
  const a = 1 + 2.6 * (1 - e), b = 0.15 + 0.85 * E.outBack(p, 1.6);
  if (v) mulS(it, b, a); else mulS(it, a, b);
  mulA(it, sm(0, 0.15, p));
});

/* ================================================================ 物理系 */
reg('dropBounce', '落下バウンド', ['pop'], 1.1, (env, it, p) => {
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.55);
    if (s <= 0) return { hide: true };
    return { dy: -(1 - E.outBounce(clamp(s / 0.9))) * SZ(it) * 2.4, a: sm(0, 0.12, s) };
  });
}, { minDur: 0.8 });
reg('riseOver', 'せり上がり', ['pop', 'emotional', 'graphic'], 1, (env, it, p) => {
  const e = E.outBack(p, 2.8);
  it.y += (1 - e) * SZ(it) * 1.6;
  mulA(it, sm(0, 0.2, p));
});
reg('spring', 'バネ', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const k = damp(p, 3.4, 3.8);
  it.x -= k * env.W * 0.32;
  mulS(it, 1 + Math.abs(k) * 0.25 * (it.vertical ? 0 : 1), 1 - Math.abs(k) * 0.15);
  mulA(it, sm(0, 0.1, p));
});
reg('elastic', 'ゴム弾性', ['pop'], 0.9, (env, it, p) => {
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.5);
    if (s <= 0) return { hide: true };
    return { s: Math.max(0, E.outElastic(s)), a: sm(0, 0.1, s) };
  });
});
reg('squash', '着地つぶれ', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const m = meas(it);
  const h = m.h * (it.sy == null ? 1 : it.sy);
  const tf = 0.42;
  if (p < tf) {
    const q = p / tf;
    it.y -= (1 - E.inQuad(q)) * env.H * 0.62;
    mulS(it, 0.9, 1.15);
    it.y -= h * 0.075;
  } else {
    const q = (p - tf) / (1 - tf);
    const k = damp(q, 2.6, 3.5);
    const sy = 1 - 0.38 * k, sx = 1 + 0.32 * k;
    mulS(it, sx, sy);
    it.y += (1 - sy) * h / 2;
  }
  mulA(it, sm(0, 0.08, p));
}, { minDur: 0.9 });
reg('gravity', '重力落下', ['pop', 'dark', 'graphic'], 0.9, (env, it, p, c) => {
  const seed = sd(env, c);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.7, 'random', seed);
    if (s <= 0) return { hide: true };
    const h0 = SZ(it) * (1.8 + 2.2 * L.r(seed, i, 'gh'));
    const f = clamp(s / 0.78), q = clamp((s - 0.78) / 0.22);
    const hop = q > 0 ? Math.sin(PI * q) * (1 - q) * SZ(it) * 0.35 : 0;   // 着地後の小さな跳ね
    return { dy: -h0 * (1 - f * f) - hop, rot: L.rs(seed, i, 'gr') * 0.35 * (1 - f), a: sm(0, 0.15, s) };
  });
});
reg('pendulum', '振り子', ['pop', 'emotional'], 0.8, (env, it, p) => {
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.4);
    if (s <= 0) return { hide: true };
    const th = (i % 2 ? 1 : -1) * 1.2 * damp(s, 3, 2.6);
    const hs = SZ(it) / 2;
    return { rot: th, dx: -Math.sin(th) * hs, dy: (Math.cos(th) - 1) * hs, a: sm(0, 0.2, s) };
  });
});
reg('jelly', 'ゼリー', ['pop'], 0.9, (env, it, p) => {
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.45);
    if (s <= 0) return { hide: true };
    const base = E.outCubic(clamp(s / 0.25));
    const w = Math.sin(s * PI * 4.5) * Math.exp(-2.2 * s) * (1 - s) * 0.75;
    return { sx: base * (1 + w), sy: base * (1 - w), a: sm(0, 0.15, s) };
  });
});

/* ================================================================ 回転・反転・折り */
reg('flipX', '字ごと横回転', ['graphic', 'editorial', 'cyber'], 1, (env, it, p) => {
  const bg = env.sc.bg, col = colOf(env, it);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.55);
    if (s <= 0) return { hide: true };
    const th = (1 - E.outBack(s, 1.4)) * PI / 2;
    const c = Math.cos(th);
    return { sx: Math.max(0.001, Math.abs(c)), color: L.mix(col, bg, Math.min(0.7, Math.abs(Math.sin(th)) * 0.7)), a: sm(0, 0.15, s) };
  });
});
reg('flipY', '字ごと縦回転', ['graphic', 'editorial'], 0.9, (env, it, p) => {
  const bg = env.sc.bg, col = colOf(env, it);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.55);
    if (s <= 0) return { hide: true };
    const th = (1 - E.outCubic(s)) * PI * 0.5;
    return { sy: Math.max(0.001, Math.cos(th)), dy: -Math.sin(th) * SZ(it) * 0.35, color: L.mix(col, bg, Math.sin(th) * 0.6), a: sm(0, 0.2, s) };
  });
});
reg('foldDown', '折り下ろし', ['editorial', 'graphic', 'calm'], 0.9, (env, it, p) => {
  const m = meas(it);
  const sy = Math.max(0.001, E.outBack(p, 1.5));
  const h = m.h * (it.sy == null ? 1 : it.sy);
  mulS(it, 1, sy);
  it.y -= h / 2 * (1 - sy);
  it.color = L.mix(colOf(env, it), env.sc.bg, (1 - clamp(sy)) * 0.6);
  mulA(it, sm(0, 0.12, p));
});
reg('hinge', 'ヒンジ', ['graphic', 'pop', 'dark'], 0.8, (env, it, p) => {
  const m = meas(it);
  const th = PI / 2 * damp(p, 2.2, 2.8);
  mulA(it, sm(0, 0.12, p));
  if (it.vertical) {
    const h = m.h * (it.sy == null ? 1 : it.sy) / 2;
    settle(it, -Math.sin(th) * h, (Math.cos(th) - 1) * h, th);
  } else {
    const w = m.w * (it.sx == null ? 1 : it.sx) / 2;
    settle(it, (Math.cos(th) - 1) * w, Math.sin(th) * w, th);
  }
}, { minDur: 0.8 });
reg('spinIn', 'スピンイン', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const e = E.outCubic(p);
  it.rot = (it.rot || 0) - (1 - e) * TAU * 0.75;
  mulS(it, Math.max(0, E.outBack(p, 1.3)));
  mulA(it, sm(0, 0.15, p));
});
reg('roll', '転がり込み', ['pop', 'graphic'], 0.9, (env, it, p) => {
  const vert = !!it.vertical;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.5, 'rl');
    if (s <= 0) return { hide: true };
    const e = E.outCubic(s), d = (1 - e) * SZ(it) * 3.5;
    const rot = -d / (SZ(it) * 0.5);
    return vert ? { dy: -d, rot: -rot, a: sm(0, 0.2, s) } : { dx: -d, rot, a: sm(0, 0.2, s) };
  });
});
reg('cardTurn', 'カード回転', ['graphic', 'editorial', 'cyber'], 0.9, (env, it, p) => {
  const e = E.outCubic(p);
  const th = (1 - e) * PI * 0.49;
  mulS(it, Math.max(0.001, Math.cos(th)), 1);
  it.skewY = (it.skewY || 0) + Math.sin(th) * 0.32;
  it.x += Math.sin(th) * SZ(it) * 0.8;
  it.color = L.mix(colOf(env, it), env.sc.bg, Math.sin(th) * 0.55);
  mulA(it, sm(0, 0.12, p));
});
reg('tumble', '転げ落ち', ['pop', 'dark'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.6, 'random', seed);
    if (s <= 0) return { hide: true };
    const e = E.outCubic(s), q = 1 - e;
    const dir = L.r(seed, i, 'td') < 0.5 ? -1 : 1;
    return { dy: -q * SZ(it) * 3.2, dx: dir * q * SZ(it) * (0.6 + L.r(seed, i, 'tx') * 1.2), rot: dir * q * TAU * (1 + L.r(seed, i, 'tr')), a: sm(0, 0.2, s) };
  });
});

/* ================================================================ グリッチ・解読 */
reg('scramble', 'ランダム解読', ['cyber', 'glitch', 'graphic'], 1.1, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step, acc = env.sc.accent;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.72);
    if (s <= 0) return { hide: true };
    if (s >= 0.55) return null;
    return { ch: pick(POOL_LAT, seed, i, st, 'sc'), color: acc, a: 0.6 + 0.4 * sm(0, 0.2, s) };
  });
}, { emph: 1.1 });
reg('kataDecode', 'カタカナ解読', ['cyber', 'glitch', 'dark'], 0.9, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step, acc = env.sc.accent2;
  const on = sm(0, 0.15, p);
  fn(it, (i, g, n) => {
    const tr = 0.25 + 0.62 * L.r(seed, i, 'kd');
    if (p >= tr) { const f = clamp((p - tr) / 0.1); return f < 1 ? { color: L.mix('#ffffff', it.color || env.sc.fg, f) } : null; }
    return { ch: pick(POOL_KATA, seed, i, Math.floor(st / 2), 'kc'), color: acc, a: on * (0.55 + 0.35 * L.r(seed, i, st, 'ka')) };
  });
});
reg('glitchSlices', 'スライス収束', ['glitch', 'cyber', 'dark'], 1, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step, q = Math.pow(1 - E.outCubic(p), 2);
  const amp = SZ(it) * 2.4 * q;
  L.itemBands(env, it, 7, i => (L.r(seed, i, st, 'gz') < 0.35 ? 0 : L.rs(seed, i, st, 'gs') * amp));
  bandsDone(it);
  mulA(it, sm(0, 0.1, p));
  if (q > 0.05 && L.r(seed, st, 'gsk') < 0.3) it.x += L.rs(seed, st, 'gx') * SZ(it) * 0.3 * q;
}, { emph: 1.3 });
reg('rgbSplit', 'RGB分離収束', ['glitch', 'cyber', 'pop'], 1, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step;
  const q = 1 - E.outCubic(p);
  const d = SZ(it) * (0.55 * q + 0.08 * q * L.rs(seed, st, 'rj'));
  const vert = !!it.vertical;
  mulA(it, E.outQuad(clamp(p * 1.6)));
  if (q < 0.01) return;
  chain(it, 'pre', (env2, it2, m) => {
    if (env2.pass !== 'main') return;
    const comp = env2.sc.dark ? 'lighter' : 'multiply';
    const a1 = 0.85 * Math.min(1, q * 1.4);
    rawGlyphs(env2, it2, m, { color: env2.sc.accent, alpha: Math.min(1, a1), dx: vert ? 0 : -d, dy: vert ? -d : 0, comp });
    rawGlyphs(env2, it2, m, { color: env2.sc.accent2, alpha: Math.min(1, a1), dx: vert ? 0 : d, dy: vert ? d : 0, comp });
  });
}, { emph: 1.2 });
reg('pixelJitter', 'ブロック震え', ['glitch', 'cyber', 'dark'], 0.9, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step;
  const q = Math.pow(1 - p, 1.4);
  const amp = SZ(it) * 0.7 * q, gq = SZ(it) * 0.18;
  fn(it, (i, g, n) => {
    const vis = L.r(seed, i, st, 'pv') < 0.25 + 0.75 * sm(0, 0.7, p) || p > 0.75;
    if (!vis) return { hide: true };
    const r = { dx: Math.round(L.rs(seed, i, st, 'px') * amp / gq) * gq, dy: Math.round(L.rs(seed, i, st, 'py') * amp / gq) * gq };
    if (q > 0.25 && L.r(seed, i, st, 'pc') < 0.45) { const a = -0.62 + 0.9 * L.r(seed, i, st, 'pa'); r.clipY = [a, a + 0.35 + 0.5 * (1 - q)]; }
    return r;
  });
  mulA(it, sm(0, 0.15, p));
});
reg('datamosh', 'データモッシュ', ['glitch', 'dark', 'cyber'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c);
  const q = 1 - E.outCubic(p);
  const amp = SZ(it) * 2.2 * q;
  const ph = env.step * 0.35;
  L.itemBands(env, it, 6, (i, n) => amp * ((i / (n - 1)) - 0.5) * 2 * (0.6 + 0.8 * L.noise1(ph + i * 0.7, seed)));
  bandsDone(it);
  if (q > 0.03) it.streak = { n: 5, dx: 0, dy: -SZ(it) * 1.6 * q, a: 0.5 };
  mulA(it, sm(0, 0.12, p));
});
reg('noiseSwap', 'ノイズ置換', ['glitch', 'cyber'], 0.9, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step, acc = env.sc.accent;
  const pn = Math.pow(1 - p, 1.2);
  fn(it, (i, g, n) => {
    if (L.r(seed, i, st, 'nv') > sm(0, 0.35, p) + 0.1 && p < 0.35) return { hide: true };
    if (p < 0.9 && L.r(seed, i, st, 'nn') < pn) return { ch: pick(POOL_BLOCK, seed, i, st, 'nb'), color: L.r(seed, i, st, 'nc') < 0.5 ? acc : null };
    return null;
  });
  mulA(it, sm(0, 0.15, p));
});

/* ================================================================ 光・ぼかし */
reg('focus', 'ピント合わせ', ['calm', 'emotional', 'editorial'], 1.2, (env, it, p) => {
  const e = E.outCubic(p);
  it.blur = (it.blur || 0) + SZ(it) * 0.35 * Math.pow(1 - e, 1.3);
  mulS(it, 1 + 0.1 * (1 - e));
  mulA(it, E.outQuad(p));
});
reg('flash', '白フラッシュ', ['pop', 'graphic', 'dark'], 1, (env, it, p) => {
  const w = hot(env);
  const f = sm(0.1, 0.85, p);
  it.color = L.mix(w, colOf(env, it), f);
  it.shadow = { color: L.rgba(w, 0.95 * (1 - f)), blur: SZ(it) * 0.9 * (1 - f), dx: 0, dy: 0 };
  mulS(it, 1 + 0.08 * (1 - E.outCubic(p)));
  mulA(it, sm(0, 0.08, p));
}, { emph: 1.3 });
reg('bloom', 'グロー開花', ['emotional', 'calm', 'cyber'], 1, (env, it, p) => {
  const e = E.outCubic(p);
  const k = Math.sin(clamp(p) * PI) * (1 - sm(0.7, 1, p) * 0.5);
  it.shadow = { color: L.rgba(env.sc.accent, 0.95 * (1 - sm(0.75, 1, p))), blur: SZ(it) * (0.25 + 0.9 * k), dx: 0, dy: 0 };
  it.color = L.mix(L.mix(env.sc.accent, '#ffffff', 0.5), colOf(env, it), sm(0.2, 0.95, p));
  mulA(it, E.outQuad(clamp(p * 1.4)));
  mulS(it, 0.94 + 0.06 * e);
});
reg('softUp', 'ふわり浮上', ['calm', 'emotional'], 1.3, (env, it, p) => {
  const e = E.outCubic(p);
  it.y += (1 - e) * SZ(it) * 0.45;
  it.blur = (it.blur || 0) + SZ(it) * 0.07 * (1 - e);
  mulA(it, E.inOutSine(p));
});
reg('burn', '焼き付き', ['dark', 'emotional', 'graphic'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c), w = hot(env), acc = env.sc.accent2, col = colOf(env, it);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.7, 'random', seed);
    if (s <= 0) return { hide: true };
    const cc = s < 0.4 ? L.mix(w, acc, s / 0.4) : L.mix(acc, col, (s - 0.4) / 0.6);
    return { color: cc, s: 1 + 0.18 * (1 - E.outCubic(s)), a: sm(0, 0.12, s) };
  });
});

/* ================================================================ 線→塗り */
reg('drawOn', '線描き→塗り', ['editorial', 'calm', 'emotional', 'wa'], 1, (env, it, p) => {
  const d = E.inOutSine(clamp(p / 0.7));
  const fa = sm(0.55, 1, p);
  const la = 1 - sm(0.85, 1, p);
  it.fillAlpha = (it.fillAlpha == null ? 1 : it.fillAlpha) * fa;
  chain(it, 'pre', (env2, it2, m) => {
    if (env2.pass !== 'main' || d <= 0) return;
    rawGlyphs(env2, it2, m, { color: colOf(env2, it2), lw: Math.max(1, SZ(it2) * 0.03), dash: d, alpha: la });
  });
}, { minDur: 0.7 });
reg('flood', '輪郭→満ちる', ['emotional', 'editorial', 'pop'], 0.9, (env, it, p) => {
  const d = E.outCubic(clamp(p / 0.4));
  const la = 1 - sm(0.85, 1, p);
  chain(it, 'pre', (env2, it2, m) => {
    if (env2.pass !== 'main' || d <= 0) return;
    rawGlyphs(env2, it2, m, { color: colOf(env2, it2), lw: Math.max(1, SZ(it2) * 0.035), dash: d, alpha: la });
  });
  fn(it, (i, g, n) => {
    const f = E.inOutSine(L.stagger(clamp((p - 0.3) / 0.7), i, n, 0.35));
    if (f >= 1) return null;
    return { clipY: [0.62 - 1.24 * f, 0.62] };
  });
}, { minDur: 0.7 });
reg('glyphOutline', '字ごと線→塗り', ['editorial', 'graphic', 'cyber'], 0.9, (env, it, p) => {
  const acc = env.sc.accent, col = colOf(env, it);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.6);
    if (s <= 0) return { hide: true };
    if (s < 0.55) return { outline: true, clipX: [-0.6, -0.6 + 1.2 * E.outQuad(s / 0.55)], color: acc };
    const f = (s - 0.55) / 0.45;
    return { color: L.mix(acc, col, E.outQuad(f)), s: 1 + 0.08 * (1 - f) };
  });
});

/* ================================================================ タイプ系 */
reg('typeCursor', 'タイプ+カーソル', ['cyber', 'editorial', 'calm'], 1, (env, it, p) => {
  const m = meas(it);
  const { ord, N } = ordinals(it, m);
  const q = clamp(p / 0.82);
  const shown = Math.min(N, Math.floor(q * N + 0.5));
  fn(it, i => (ord[i] >= shown ? { hide: true } : null));
  const ca = sm(0, 0.05, p) * (1 - sm(0.86, 1, p));
  const blinkOn = q < 1 || (env.step % 8) < 5;
  if (!blinkOn || ca <= 0.01) return;
  let last = null;
  for (const g of m.lay) if (!g.space && ord[g.i] === shown - 1) last = g;
  const first = m.lay.find(g => !g.space);
  chain(it, 'post', (env2, it2, m2) => {
    const s = SZ(it2);
    const acc = env2.sc.accent;
    if (it2.vertical) {
      const g = last || first; if (!g) return;
      const y = last ? g.y + s * 0.58 : g.y - s * 0.5;
      env2.rect(g.x - s * 0.45, y, s * 0.9, s * 0.42, acc, ca, false);
    } else {
      const g = last || first; if (!g) return;
      const x = last ? g.x + g.w / 2 + s * 0.06 : g.x - g.w / 2;
      env2.rect(x, g.y - s * 0.48, s * 0.5, s * 0.96, acc, ca, false);
    }
  });
}, { minDur: 1.0 });
reg('typeRandom', 'ランダム打字', ['cyber', 'pop', 'glitch'], 0.9, (env, it, p, c) => {
  const seed = sd(env, c), acc = env.sc.accent;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.88, 'random', seed);
    if (s <= 0) return { hide: true };
    return s >= 1 ? null : { s: 1 + 0.4 * (1 - E.outCubic(s)), color: s < 0.5 ? acc : null };
  });
});
reg('typeWave', '波形タイプ', ['cyber', 'pop', 'emotional'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step;
  const m = meas(it);
  const { ord, N } = ordinals(it, m);
  const q = clamp(p / 0.75);
  const pos = q * N;
  const amp = SZ(it) * 0.34 * Math.pow(1 - p, 1.3);
  const vert = !!it.vertical;
  fn(it, i => {
    const o = ord[i];
    if (o < 0) return null;
    const f = clamp(pos - o);
    if (f <= 0) return { hide: true };
    const w = Math.sin(o * 0.9 + st * 1.3) * (0.5 + 0.5 * L.r(seed, o, st, 'tw')) * amp;
    const r = { a: f };
    if (vert) r.dx = w; else r.dy = w;
    if (f < 1) r.sy = 0.4 + 0.6 * f;
    return r;
  });
});
reg('typeChunk', '語ごと表示', ['editorial', 'calm', 'emotional'], 1, (env, it, p) => {
  const m = meas(it);
  const { gi, G } = groupsOf(it, m);
  const span = G > 1 ? Math.min(0.35, 0.75 / (G - 1)) : 0;
  fn(it, i => {
    const t0 = G > 1 ? gi[i] * span : 0;
    const f = E.outCubic(clamp((p - t0) / (G > 1 ? 0.25 : 1)));
    if (f <= 0) return { hide: true };
    return f >= 1 ? null : { dy: (1 - f) * SZ(it) * 0.45, a: f };
  });
});

/* ================================================================ 帯 */
reg('bandSlide', '帯ずれ収束', ['graphic', 'cyber', 'editorial'], 1, (env, it, p) => {
  const W = env.W;
  L.itemBands(env, it, 6, (i, n) => (i % 2 ? 1 : -1) * (1 - E.outExpo(L.stagger(p, i, n, 0.4))) * W * 0.6);
  bandsDone(it);
  mulA(it, sm(0, 0.12, p));
});
reg('vbandDrop', '縦帯落下', ['graphic', 'pop'], 0.8, (env, it, p) => {
  const s = SZ(it);
  L.itemVBands(env, it, 8, (i, n) => -(1 - E.outBounce(clamp(L.stagger(p, i, n, 0.5) / 0.9))) * s * 2.6);
  bandsDone(it);
  mulA(it, sm(0, 0.12, p));
});
reg('interlace', 'インターレース', ['cyber', 'glitch', 'editorial'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step;
  const n = 14;
  const b = [];
  for (let i = 0; i < n; i++) {
    const even = i % 2 === 0, j = even ? i / 2 : (i - 1) / 2, cnt = Math.ceil(n / 2);
    const t0 = (even ? 0 : 0.42) + 0.4 * (j / cnt);
    const f = clamp((p - t0) / 0.18);
    if (f <= 0) continue;
    b.push([i / n, (i + 1) / n, L.rs(seed, i, st, 'il') * SZ(it) * 0.45 * (1 - f) * (1 - p)]);
  }
  it.bands = b.length ? b : [[0, 0, 0]];
});

/* ================================================================ 明滅 */
reg('neon', 'ネオン点灯', ['cyber', 'dark', 'emotional'], 1, (env, it, p, c) => {
  const seed = sd(env, c), st = env.step;
  const pr = Math.pow(sm(0, 0.8, p), 0.7);
  const dim = 0.12 * sm(0, 0.2, p);
  fn(it, (i, g, n) => {
    if (p > 0.8) return null;
    const on = L.r(seed, i, st, 'ne') < pr;
    return on ? null : { a: dim };
  });
  it.shadow = { color: L.rgba(env.sc.accent, 0.9 * (1 - sm(0.75, 1, p))), blur: SZ(it) * 0.45, dx: 0, dy: 0 };
  mulA(it, sm(0, 0.04, p));
});
reg('crt', 'CRT点灯', ['cyber', 'glitch', 'dark'], 0.9, (env, it, p) => {
  const q1 = clamp(p / 0.35), q2 = clamp((p - 0.35) / 0.65);
  const w = hot(env);
  const v = !!it.vertical;
  const a = Math.max(0.001, E.outCubic(q1)), b = 0.03 + 0.97 * Math.max(0, E.outBack(q2, 1.3));
  if (v) mulS(it, b, a); else mulS(it, a, b);
  it.color = L.mix(w, colOf(env, it), sm(0.1, 0.9, q2));
  it.shadow = { color: L.rgba(w, 0.8 * (1 - q2)), blur: SZ(it) * 0.5, dx: 0, dy: 0 };
  mulA(it, sm(0, 0.08, p));
});
reg('strobe', 'ストロボ', ['glitch', 'dark', 'pop'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c), st = Math.floor(env.step / 4);   // 点滅は最大6状態/秒=3回/秒(光過敏対策)
  if (p < 0.82) {
    const on = L.r(seed, st, 'so') < 0.3 + 0.6 * p;
    if (!on) { it.alpha = 0; return; }
    if (L.r(seed, st, 'sc') < 0.5) it.color = env.sc.accent;
    mulS(it, 1 + 0.06 * L.r(seed, st, 'ss'));
  }
  mulA(it, sm(0, 0.03, p));
}, { emph: 1.3 });

/* ================================================================ 字間 */
reg('trackIn', '字間収束', ['editorial', 'calm', 'emotional'], 1.2, (env, it, p) => {
  const e = E.outQuart(p), k = 1.3 * (1 - e);
  const vert = !!it.vertical;
  fn(it, (i, g) => (vert ? { dy: g.y * k } : { dx: g.x * k }));
  mulA(it, E.outQuad(p));
});
reg('collapse', '両側から寄る', ['graphic', 'pop', 'cyber'], 0.9, (env, it, p) => {
  const vert = !!it.vertical;
  const far = vert ? env.H * 0.6 : env.W * 0.6;
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.5, 'edges');
    if (s <= 0) return { hide: true };
    const side = (vert ? g.y : g.x) < 0 ? -1 : 1;
    const d = side * (1 - E.outExpo(s)) * far;
    return vert ? { dy: d, a: sm(0, 0.2, s) } : { dx: d, a: sm(0, 0.2, s) };
  });
});

/* ================================================================ 残像 */
reg('echoZoom', '残像ズーム', ['cyber', 'graphic', 'emotional'], 0.9, (env, it, p) => {
  const e = E.outCubic(p), q = 1 - e;
  mulS(it, 1 + 0.25 * q);
  mulA(it, sm(0, 0.3, p));
  if (q > 0.01) it.echo = { n: 4, dx: 0, dy: 0, scale: 0.3 * q, a: 0.9 * q, decay: 0.7, outline: true, color: env.sc.accent };
});
reg('afterimage', '残像スライド', ['pop', 'cyber', 'emotional'], 0.9, (env, it, p) => {
  const e = E.outQuart(p), q = 1 - e;
  const vert = !!it.vertical;
  const d = q * SZ(it) * 4;
  const gap = q * SZ(it) * 0.8;
  if (vert) it.y += d; else it.x -= d;
  mulA(it, sm(0, 0.15, p));
  if (q > 0.01) it.echo = { n: 5, dx: vert ? 0 : -gap, dy: vert ? gap : 0, a: 0.55, decay: 0.72, color: env.sc.accent2 };
});

/* ================================================================ 経路・並べ替え */
reg('shuffle', '入れ替わり', ['pop', 'glitch', 'graphic'], 0.8, (env, it, p, c) => {
  const seed = sd(env, c);
  const m = meas(it);
  const idx = m.lay.filter(g => !g.space).map(g => g.i);
  const perm = idx.slice().sort((a, b) => L.r(seed, a, 'sh') - L.r(seed, b, 'sh'));
  const map = new Map(); idx.forEach((k, j) => map.set(k, m.lay[perm[j]]));
  const e = E.inOutCubic(clamp((p - 0.18) / 0.82));
  const s = SZ(it);
  fn(it, (i, g) => {
    const t = map.get(i);
    if (!t) return null;
    const q = 1 - e;
    return { dx: (t.x - g.x) * q, dy: (t.y - g.y) * q + Math.sin(PI * e) * s * 0.6 * (i % 2 ? 1 : -1), a: sm(0, 0.18, p) };
  });
}, { maxChars: 20 });
reg('orbit', '軌道から着地', ['pop', 'emotional', 'cyber'], 0.8, (env, it, p) => {
  const s0 = SZ(it);
  fn(it, (i, g, n) => {
    const s = L.stagger(p, i, n, 0.5);
    if (s <= 0) return { hide: true };
    const e = E.outCubic(s), q = 1 - e;
    const r = Math.hypot(g.x, g.y);
    const a0 = r > 1e-3 ? Math.atan2(g.y, g.x) : i * 2.4;
    const phi = q * PI * 1.05 * (i % 2 ? 1 : -1);
    const rs = r + Math.max(s0 * 1.6, r * 0.35);
    const cr = r + (rs - r) * q, ca = a0 + phi;
    return { dx: Math.cos(ca) * cr - g.x, dy: Math.sin(ca) * cr - g.y, rot: phi * 0.5, a: sm(0, 0.2, s) };
  });
});
})();
