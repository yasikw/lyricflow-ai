/* LyricFlow 演出パック: p_cam_trans_styles — カメラ・つなぎ・配色スタイル
   契約: docs/COMPOSE_PACKS.md  (group: cam+trans+style) */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_cam_trans_styles';
const clamp = L.clamp;
const TAU = Math.PI * 2;

/* ================================================================ cam (カメラ)
   get(env, P) → {x, y, s, rot(度), sx, sy, skx(度)}。x/y は実ピクセル。
   通常は |x|,|y| ≤ 5%、s 0.92〜1.15、rot ≤ 5°。strong は短い衝撃のみ範囲外を許し、必ず収束させる。 */
const cam = (key, def) => {
  const get = def.get;
  const strong = !!def.strong;
  L.register('cam', key, Object.assign({}, def, {
    get(env, Pp) {
      const o = get(env, Pp || {}) || {};
      if (!strong) {               // 通常カメラは安全範囲に丸める
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
const prog = env => clamp(env.lt / Math.max(0.3, env.cut.dur));
const lt0 = env => Math.max(0, env.lt);
/* 拍: bpm 無しでもカット内の擬似拍(0.5秒)で動く */
const beatOf = env => {
  if (env.beat && env.beat.len > 0.05) return { since: Math.max(0, env.beat.since), len: env.beat.len, index: env.beat.index };
  const len = 0.5, lt = lt0(env);
  return { since: lt % len, len, index: Math.floor(lt / len) };
};
/* -1..1 の2オクターブノイズ */
const n2 = (x, seed) => (L.noise1(x, seed) - 0.5) * 1.4 + (L.noise1(x * 2.3 + 7.1, seed + 17) - 0.5) * 0.6;

cam('pushIn', {
  name: 'ゆっくり寄る', tags: ['calm', 'emotional', 'editorial', 'graphic', 'pop'], w: 1.5,
  plan: rng => ({ a: rng.range(0.04, 0.07), rise: rng.range(0.004, 0.012) }),
  get(env, p) { const k = E.inOutSine(prog(env)); return { s: 1 + p.a * k, y: -env.H * p.rise * k }; },
});

cam('pullOut', {
  name: 'ゆっくり引く', tags: ['calm', 'emotional', 'editorial'], w: 1.1,
  plan: rng => ({ a: rng.range(0.06, 0.1) }),
  get(env, p) { return { s: 1 + p.a * (1 - E.outCubic(prog(env))) }; },
});

cam('driftPan', {
  name: '流しパン', tags: ['calm', 'editorial', 'emotional', 'graphic'], w: 1.1,
  plan: rng => ({ dir: rng.sign(), diag: rng.chance(0.35) ? rng.sign() : 0, amt: rng.range(0.025, 0.04) }),
  get(env, p) {
    const k = E.inOutSine(prog(env)) * 2 - 1;            // -1 → 1
    return { x: p.dir * env.W * p.amt * k, y: p.diag * env.H * 0.02 * k, s: 1.02 };
  },
});

cam('dutchSettle', {
  name: 'ダッチ傾き', tags: ['emotional', 'glitch', 'graphic', 'dark'], w: 0.9,
  plan: rng => ({ dir: rng.sign(), end: rng.range(1.6, 2.6) }),
  get(env, p) {
    const k = 1 - E.outCubic(clamp(lt0(env) / 0.9));
    return { rot: p.dir * (p.end + 2.4 * k), s: 1.02 + 0.025 * prog(env), x: -p.dir * env.W * 0.006 * k };
  },
});

cam('handheld', {
  name: '手持ち', tags: ['emotional', 'calm', 'editorial', 'dark'], w: 1.1,
  plan: rng => ({ seed: rng.int(1, 9999), amp: rng.range(0.7, 1.1) }),
  get(env, p) {
    const t = env.ltb * 1.4, m = Math.min(env.W, env.H) * 0.024 * p.amp;
    return { x: n2(t, p.seed) * m, y: n2(t + 31.7, p.seed) * m * 0.8, rot: n2(t * 0.8 + 63, p.seed) * 1.3 * p.amp, s: 1.025 };
  },
});

cam('beatPunch', {
  name: '拍ズーム', tags: ['pop', 'glitch', 'graphic', 'cyber'], w: 0.9,
  plan: rng => ({ a: rng.range(0.035, 0.055), lift: rng.chance(0.5) }),
  get(env, p) {
    const b = beatOf(env);
    const k = Math.exp(-b.since * 9) * (0.6 + 0.4 * (env.energy == null ? 0.5 : env.energy));
    return { s: 1 + p.a * k, y: p.lift ? -env.H * 0.008 * k : 0 };
  },
});

cam('beatShake', {
  name: '拍ゆれ', tags: ['glitch', 'dark', 'cyber', 'pop'], w: 0.7,
  plan: rng => ({ seed: rng.int(1, 9999), vert: rng.chance(0.5) }),
  get(env, p) {
    const b = beatOf(env);
    const d = Math.exp(-b.since * 12), m = Math.min(env.W, env.H) * 0.024 * d;
    const j = Math.floor(b.since * 30);                    // 1拍の中で30Hzで跳ねる
    return {
      x: L.rs(p.seed, b.index, j, 'x') * m * (p.vert ? 0.4 : 1),
      y: L.rs(p.seed, b.index, j, 'y') * m * (p.vert ? 1 : 0.4),
      rot: L.rs(p.seed, b.index, j, 'r') * 0.8 * d,
    };
  },
});

cam('whipSettle', {
  name: 'ホイップ着地', tags: ['pop', 'glitch', 'graphic'], w: 0.7, strong: true,
  plan: rng => ({ dir: rng.sign(), vert: rng.chance(0.25), dur: rng.range(0.5, 0.65) }),
  get(env, p) {
    const q = clamp(lt0(env) / p.dur);
    const k = Math.pow(1 - q, 4);                              // 1 → 0 で着地
    const off = p.dir * 0.16 * k;
    return p.vert
      ? { y: off * env.H, s: 1 + 0.05 * k, sy: 1 + 0.08 * k }
      : { x: off * env.W, skx: -p.dir * 12 * k, s: 1 + 0.04 * k, sx: 1 + 0.1 * k };
  },
});

cam('snapZoom', {
  name: 'スナップズーム', tags: ['pop', 'graphic', 'glitch', 'dark'], w: 0.7, strong: true,
  plan: rng => ({ a: rng.range(0.2, 0.28), tilt: rng.sign() * rng.range(0, 2.5) }),
  get(env, p) {
    const t = lt0(env);
    const k = Math.exp(-t * 8.5);
    return { s: 1 + p.a * k * Math.cos(t * 13), rot: p.tilt * k };
  },
});

cam('orbitSway', {
  name: '周回ゆれ', tags: ['calm', 'emotional', 'pop'], w: 0.9,
  plan: rng => ({ dir: rng.sign(), per: rng.range(4.5, 7), ph: rng.range(0, TAU) }),
  get(env, p) {
    const a = p.ph + p.dir * TAU * env.ltb / p.per;
    const ramp = E.outCubic(clamp(lt0(env) / 0.6));
    return { x: Math.cos(a) * env.W * 0.018 * ramp, y: Math.sin(a) * env.H * 0.022 * ramp, rot: Math.sin(a) * 0.9 * ramp, s: 1.02 };
  },
});

cam('floatV', {
  name: 'ふわり浮遊', tags: ['calm', 'emotional', 'pop'], w: 1,
  plan: rng => ({ per: rng.range(2.6, 3.8), ph: rng.range(0, TAU), seed: rng.int(1, 999) }),
  get(env, p) {
    const a = p.ph + TAU * env.ltb / p.per;
    const ramp = E.outCubic(clamp(lt0(env) / 0.5));
    return { y: Math.sin(a) * env.H * 0.02 * ramp, x: n2(env.ltb * 0.4, p.seed) * env.W * 0.006, s: 1 + 0.012 * Math.sin(a * 0.5) };
  },
});

cam('slowRoll', {
  name: 'スローロール', tags: ['emotional', 'calm', 'glitch', 'dark'], w: 0.8,
  plan: rng => ({ dir: rng.sign(), a: rng.range(1.6, 2.8) }),
  get(env, p) { const k = prog(env) * 2 - 1; return { rot: p.dir * p.a * k, s: 1.03 }; },
});

cam('impactShake', {
  name: '衝撃ゆれ', tags: ['dark', 'glitch', 'pop', 'graphic'], w: 0.6, strong: true,
  plan: rng => ({ seed: rng.int(1, 9999) }),
  get(env, p) {
    const cut = env.cut, t = lt0(env);
    const hard = !!(cut.impact || cut.emph || cut.emphMark);
    // 冒頭の一撃 + (衝撃カットは)語の頭で小さく再打
    let d = Math.exp(-t * 6.5) * (hard ? 1 : 0.6);
    if (hard && cut.words) {
      for (const w of cut.words) {
        const dt = env.t - w.start;
        if (dt >= 0 && dt < 0.4 && w.start > cut.start + 0.15) d = Math.max(d, 0.35 * Math.exp(-dt * 10));
      }
    }
    if (d < 0.004) return { s: 1 };
    const j = env.step, m = Math.min(env.W, env.H) * 0.04 * d;
    return {
      x: L.rs(p.seed, j, 'x') * m, y: L.rs(p.seed, j, 'y') * m,
      rot: L.rs(p.seed, j, 'r') * 3 * d, s: 1 + 0.06 * d,
    };
  },
});

cam('breathZoom', {
  name: '呼吸ズーム', tags: ['calm', 'emotional', 'pop', 'cyber'], w: 0.9,
  plan: rng => ({ per: rng.range(2, 3.2) }),
  get(env, p) {
    const e = env.energy == null ? 0.5 : clamp(env.energy);
    const wave = 0.5 - 0.5 * Math.cos(TAU * env.ltb / p.per);
    return { s: 1 + (0.012 + 0.035 * e) * wave };
  },
});

cam('parallaxSkew', {
  name: '視差スキュー', tags: ['graphic', 'cyber', 'editorial', 'glitch'], w: 0.7,
  plan: rng => ({ dir: rng.sign(), per: rng.range(3.5, 5.5) }),
  get(env, p) {
    const a = Math.sin(TAU * env.ltb / p.per) * E.outCubic(clamp(lt0(env) / 0.6));
    return { skx: p.dir * 4 * a, x: -p.dir * env.W * 0.02 * a, sy: 1 - 0.015 * Math.abs(a), s: 1.02 };
  },
});

cam('tiltRise', {
  name: 'ティルトアップ', tags: ['calm', 'emotional', 'editorial'], w: 0.9,
  plan: rng => ({ dir: rng.chance(0.7) ? 1 : -1, a: rng.range(0.03, 0.045) }),
  get(env, p) {
    const k = 1 - E.outQuart(clamp(lt0(env) / Math.min(2.2, env.cut.dur * 0.8)));
    return { y: p.dir * env.H * p.a * k, s: 1 + 0.035 * k };
  },
});

cam('stepZoom', {
  name: '段階ズーム', tags: ['pop', 'graphic', 'glitch', 'cyber'], w: 0.7,
  plan: rng => ({ n: rng.int(2, 3), a: rng.range(0.035, 0.05) }),
  get(env, p) {
    // カットを n+1 区間に分け、境目で段がつく(拍があれば拍にスナップ)
    const cut = env.cut, n = p.n || 2, seg = cut.dur / (n + 1);
    let lvl = 0;
    for (let i = 1; i <= n; i++) {
      let tb = seg * i;
      if (env.beat && env.beat.len > 0.05) { const bl = env.beat.len; tb = Math.round(tb / bl) * bl; }
      const dt = env.lt - tb;
      if (dt > 0) lvl += E.outBack(clamp(dt / 0.16), 2.2);
    }
    return { s: 1 + p.a * lvl };
  },
});

/* ================================================================ trans (つなぎ)
   A=前カットの静止レイヤー、B=今カット。ctx は単位行列。p=0→A、p=1→B を厳密に。 */
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
/* 画面中心まわりに変形して描く */
const put = (ctx, img, info, o = {}) => {
  const a = o.a == null ? 1 : o.a;
  if (a <= 0.002) return;
  const cw = info.cw, ch = info.ch;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cw / 2 + (o.x || 0), ch / 2 + (o.y || 0));
  if (o.rot) ctx.rotate(o.rot);
  const s = o.s == null ? 1 : o.s;
  ctx.scale(s * (o.sx == null ? 1 : o.sx), s * (o.sy == null ? 1 : o.sy));
  ctx.drawImage(img, -cw / 2, -ch / 2);
  ctx.restore();
};
const bump = p => Math.sin(Math.PI * p);                       // 0→1→0
const edgeCol = info => info.sc.accent;

trans('pushSide', {
  name: '横プッシュ', tags: ['graphic', 'pop', 'editorial'], w: 1.2, dur: 0.38,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, P) {
    const e = E.inOutCubic(p), d = P.dir || 1, cw = info.cw;
    put(ctx, A, info, { x: -d * cw * e });
    put(ctx, B, info, { x: d * cw * (1 - e) });
  },
});

trans('pushUp', {
  name: '縦プッシュ', tags: ['graphic', 'pop', 'calm'], w: 1, dur: 0.4,
  plan: rng => ({ dir: rng.chance(0.7) ? 1 : -1 }),
  draw(ctx, A, B, p, info, P) {
    const e = p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2, d = P.dir || 1, ch = info.ch;
    put(ctx, A, info, { y: -d * ch * e });
    put(ctx, B, info, { y: d * ch * (1 - e) });
  },
});

trans('slideOver', {
  name: 'スライドオーバー', tags: ['editorial', 'calm', 'graphic'], w: 1, dur: 0.42,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, P) {
    const e = E.outQuart(p), d = P.dir || 1;
    put(ctx, A, info, { s: 1 - 0.05 * e, x: -d * info.cw * 0.06 * e, a: 1 - E.outQuad(clamp(p * 1.4)) });
    put(ctx, B, info, { x: d * info.cw * 0.55 * (1 - e), a: E.outCubic(clamp(p * 2.2)) });
  },
});

trans('wipeLine', {
  name: 'ワイプ', tags: ['graphic', 'editorial', 'pop'], w: 1.2, dur: 0.36,
  plan: rng => ({ dir: rng.pick([0, 0, 1, 2, 3]) }),     // 0:→ 1:← 2:↓ 3:↑
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, e = E.inOutCubic(p), d = P.dir || 0;
    const horiz = d < 2, rev = d === 1 || d === 3;
    const len = horiz ? cw : ch, cut = rev ? len * (1 - e) : len * e;
    const rB = horiz ? (rev ? [cut, 0, cw - cut, ch] : [0, 0, cut, ch]) : (rev ? [0, cut, cw, ch - cut] : [0, 0, cw, cut]);
    const rA = horiz ? (rev ? [0, 0, cut, ch] : [cut, 0, cw - cut, ch]) : (rev ? [0, 0, cw, cut] : [0, cut, cw, ch - cut]);
    ctx.save(); ctx.beginPath(); ctx.rect(...rA); ctx.clip(); ctx.drawImage(A, 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(...rB); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    const lw = Math.max(2, info.u * 6);
    ctx.globalAlpha = bump(p);
    ctx.fillStyle = edgeCol(info);
    if (horiz) ctx.fillRect(cut - lw / 2, 0, lw, ch); else ctx.fillRect(0, cut - lw / 2, cw, lw);
    ctx.globalAlpha = bump(p) * 0.5;
    const off = (rev ? 1 : -1) * lw * 3;
    if (horiz) ctx.fillRect(cut + off - lw / 4, 0, lw / 2, ch); else ctx.fillRect(0, cut + off - lw / 4, cw, lw / 2);
  },
});

trans('wipeDiag', {
  name: '斜めワイプ', tags: ['pop', 'graphic', 'cyber'], w: 1, dur: 0.4,
  plan: rng => ({ dir: rng.sign(), slant: rng.range(0.3, 0.55) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, e = E.inOutCubic(p);
    const sl = ch * (P.slant || 0.4);
    const X = e * (cw + sl);                                 // 上端での境界位置
    const flip = (P.dir || 1) < 0;
    const fx = x => (flip ? cw - x : x);
    const regionB = () => { ctx.beginPath(); ctx.moveTo(fx(-sl - 2), 0); ctx.lineTo(fx(X), 0); ctx.lineTo(fx(X - sl), ch); ctx.lineTo(fx(-sl - 2), ch); ctx.closePath(); };
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.moveTo(fx(-sl - 2), 0); ctx.lineTo(fx(-sl - 2), ch); ctx.lineTo(fx(X - sl), ch); ctx.lineTo(fx(X), 0); ctx.closePath();
    ctx.clip('evenodd'); ctx.drawImage(A, 0, 0); ctx.restore();
    ctx.save(); regionB(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    // 境界の前を走る2色の帯
    const bw = Math.max(3, info.u * 14), b = bump(p);
    const band = (o, w, col, a) => {
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(fx(X + o), 0); ctx.lineTo(fx(X + o + w), 0); ctx.lineTo(fx(X + o + w - sl), ch); ctx.lineTo(fx(X + o - sl), ch); ctx.closePath(); ctx.fill();
    };
    band(0, bw, info.sc.accent, 0.9 * b);
    band(bw * 1.8, bw * 0.35, info.sc.accent2, 0.8 * b);
  },
});

trans('iris', {
  name: 'アイリス', tags: ['emotional', 'pop', 'editorial', 'calm'], w: 0.9, dur: 0.45,
  plan: rng => ({ cx: rng.range(0.35, 0.65), cy: rng.range(0.4, 0.6) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch;
    const cx = cw * (P.cx == null ? 0.5 : P.cx), cy = ch * (P.cy == null ? 0.5 : P.cy);
    const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) * 1.02;
    const r = R * E.inOutCubic(p);
    // A は円の外、B は円の内
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.arc(cx, cy, r, 0, TAU); ctx.clip('evenodd');
    ctx.drawImage(A, 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    ctx.drawImage(B, 0, 0); ctx.restore();
    const b = bump(p);
    ctx.globalAlpha = b; ctx.strokeStyle = info.sc.accent; ctx.lineWidth = Math.max(1.5, info.u * 5);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = b * 0.6; ctx.strokeStyle = info.sc.accent2; ctx.lineWidth = Math.max(1, info.u * 2);
    ctx.beginPath(); ctx.arc(cx, cy, r + info.u * 16, 0, TAU); ctx.stroke();
  },
});

trans('doors', {
  name: '観音開き', tags: ['graphic', 'pop', 'emotional'], w: 0.8, dur: 0.5,
  plan: rng => ({ vert: rng.chance(0.3) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, e = E.inOutCubic(p);
    put(ctx, B, info, { s: 0.92 + 0.08 * E.outCubic(p), a: E.outQuad(clamp((p - 0.15) / 0.85)) });
    const aA = 1 - E.inQuad(clamp((p - 0.3) / 0.7));
    if (aA <= 0.002) return;
    ctx.globalAlpha = aA;
    if (!P.vert) {
      const hw = cw / 2, sq = 1 - 0.55 * e, sh = cw * 0.56 * e;
      ctx.drawImage(A, 0, 0, hw, ch, hw - hw * sq - sh, 0, hw * sq, ch);          // 左扉
      ctx.drawImage(A, hw, 0, hw, ch, hw + sh, 0, hw * sq, ch);                   // 右扉
      ctx.globalAlpha = bump(p) * 0.8; ctx.fillStyle = info.sc.accent;
      const lw = Math.max(2, info.u * 4);
      ctx.fillRect(hw - sh - lw, 0, lw, ch); ctx.fillRect(hw + sh, 0, lw, ch);
    } else {
      const hh = ch / 2, sq = 1 - 0.55 * e, sh = ch * 0.56 * e;
      ctx.drawImage(A, 0, 0, cw, hh, 0, hh - hh * sq - sh, cw, hh * sq);
      ctx.drawImage(A, 0, hh, cw, hh, 0, hh + sh, cw, hh * sq);
      ctx.globalAlpha = bump(p) * 0.8; ctx.fillStyle = info.sc.accent;
      const lw = Math.max(2, info.u * 4);
      ctx.fillRect(0, hh - sh - lw, cw, lw); ctx.fillRect(0, hh + sh, cw, lw);
    }
  },
});

trans('blinds', {
  name: 'ブラインド', tags: ['graphic', 'editorial', 'calm'], w: 0.8, dur: 0.5,
  plan: rng => ({ n: rng.int(6, 10), vert: rng.chance(0.35) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, n = Math.max(3, Math.min(14, P.n || 8)), vert = !!P.vert;
    const d = 0.5 / n, span = 1 - d * (n - 1);
    const len = vert ? cw : ch;
    for (let i = 0; i < n; i++) {
      const a0 = Math.round(len * i / n), a1 = Math.round(len * (i + 1) / n), h = a1 - a0;
      const q = clamp((p - d * i) / span);
      const e = E.inOutSine(q);
      const img = e < 0.5 ? A : B;
      const k = e < 0.5 ? 1 - e * 2 : e * 2 - 1;
      if (k <= 0.004) continue;
      const hh = h * k, c = a0 + h / 2;
      if (vert) ctx.drawImage(img, a0, 0, h, ch, c - hh / 2, 0, hh, ch);
      else ctx.drawImage(img, 0, a0, cw, h, 0, c - hh / 2, cw, hh);
    }
  },
});

trans('flash', {
  name: '白フラッシュ', tags: ['emotional', 'pop', 'calm', 'graphic'], w: 1, dur: 0.34,
  draw(ctx, A, B, p, info) {
    put(ctx, A, info, { a: 1 - L.smooth(0.3, 0.55, p), s: 1 + 0.03 * E.inQuad(clamp(p * 2)) });
    put(ctx, B, info, { a: L.smooth(0.45, 0.7, p), s: 1.03 - 0.03 * E.outCubic(clamp(p * 2 - 1)) });
    const col = info.sc.dark ? L.mix('#ffffff', info.sc.accent, 0.1) : L.mix('#ffffff', info.sc.accent, 0.35);
    const f = Math.pow(bump(p), 4);
    ctx.globalAlpha = f * (info.sc.dark ? 0.9 : 0.75);
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, info.cw, info.ch);
  },
});

trans('glitchSwap', {
  name: 'グリッチ入替', tags: ['glitch', 'cyber', 'dark'], w: 0.9, dur: 0.4,
  plan: rng => ({ n: rng.int(10, 16), k: rng.int(1, 9999) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, n = Math.max(4, Math.min(20, P.n || 12)), s = info.seed + (P.k || 0);
    const amp = Math.pow(bump(p), 0.7), st = info.step;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const h = i === n - 1 ? ch - y : Math.round(ch / n * (0.55 + 0.9 * L.r(s, i, 'h')));
      if (h <= 0) break;
      const tSw = 0.2 + 0.6 * L.r(s, i, 'sw');
      const img = p > tSw ? B : A;
      const jump = L.r(s, i, st, 'j') < 0.55;
      const dx = jump ? L.rs(s, i, st, 'dx') * cw * 0.09 * amp : 0;
      ctx.drawImage(img, 0, y, cw, h, dx, y, cw, h);
      if (jump && amp > 0.2 && L.r(s, i, st, 'g') < 0.4) {       // ずれた残像
        ctx.globalAlpha = 0.35 * amp;
        ctx.drawImage(img, 0, y, cw, h, dx + cw * 0.02 * L.rs(s, i, 'gg'), y, cw, h);
        ctx.globalAlpha = 1;
      }
      y += h;
      if (y >= ch) break;
    }
    // 走査ブロック
    for (let j = 0; j < 4; j++) {
      if (L.r(s, j, st, 'b') > 0.55 * amp) continue;
      const by = ch * L.r(s, j, st, 'by'), bh = ch * (0.01 + 0.03 * L.r(s, j, st, 'bh'));
      const bx = cw * L.r(s, j, st, 'bx') * 0.7, bw = cw * (0.1 + 0.3 * L.r(s, j, st, 'bw'));
      ctx.globalAlpha = 0.55 * amp; ctx.fillStyle = j % 2 ? info.sc.accent2 : info.sc.accent;
      ctx.fillRect(bx, by, bw, bh);
    }
  },
});

trans('zoomThrough', {
  name: 'ズームスルー', tags: ['pop', 'emotional', 'glitch', 'cyber'], w: 1, dur: 0.42,
  draw(ctx, A, B, p, info) {
    const a = clamp(p / 0.7), b = clamp((p - 0.25) / 0.75);
    put(ctx, B, info, { s: 0.55 + 0.45 * E.outCubic(b), a: E.outQuad(b) });
    put(ctx, A, info, { s: 1 + 0.9 * E.inCubic(a), a: 1 - E.inQuad(a) });
  },
});

trans('crossScale', {
  name: 'スケールクロス', tags: ['calm', 'emotional', 'editorial'], w: 1.1, dur: 0.5,
  plan: rng => ({ rise: rng.chance(0.5) }),
  draw(ctx, A, B, p, info, P) {
    const e = E.inOutSine(p);
    put(ctx, A, info, { s: 1 - 0.06 * e, a: 1 - e, y: P.rise ? -info.ch * 0.02 * e : 0 });
    put(ctx, B, info, { s: 1.08 - 0.08 * E.outCubic(p), a: e, y: P.rise ? info.ch * 0.03 * (1 - E.outCubic(p)) : 0 });
  },
});

trans('stripShuffle', {
  name: '短冊シャッフル', tags: ['graphic', 'pop', 'editorial'], w: 0.8, dur: 0.5,
  plan: rng => ({ n: rng.int(7, 12), k: rng.int(1, 9999) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch, n = Math.max(3, Math.min(16, P.n || 9)), s = info.seed + (P.k || 0);
    // 順番をハッシュで並べ替え
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => L.r(s, a) - L.r(s, b));
    const d = 0.45 / n, span = 1 - d * (n - 1);
    order.forEach((i, rank) => {
      const x0 = Math.round(cw * i / n), x1 = Math.round(cw * (i + 1) / n), w = x1 - x0;
      const q = clamp((p - d * rank) / span);
      const dir = i % 2 ? 1 : -1;
      if (q < 1) {
        const ya = -dir * ch * E.inCubic(q);
        ctx.drawImage(A, x0, 0, w, ch, x0, ya, w, ch);
      }
      if (q > 0) {
        const yb = dir * ch * (1 - E.outCubic(q));
        ctx.drawImage(B, x0, 0, w, ch, x0, yb, w, ch);
      }
    });
  },
});

trans('rotateSwap', {
  name: '回転スワップ', tags: ['pop', 'glitch', 'graphic'], w: 0.8, dur: 0.48,
  plan: rng => ({ dir: rng.sign() }),
  draw(ctx, A, B, p, info, P) {
    const d = P.dir || 1, a = clamp(p / 0.6), b = clamp((p - 0.35) / 0.65);
    put(ctx, A, info, { rot: -d * 0.42 * E.inCubic(a), s: 1 - 0.35 * E.inCubic(a), a: 1 - E.inQuad(a) });
    put(ctx, B, info, { rot: d * 0.42 * (1 - E.outBack(b, 1.4)), s: 0.72 + 0.28 * E.outCubic(b), a: E.outQuad(clamp(b * 1.6)) });
  },
});

trans('squeeze', {
  name: 'スクイーズ', tags: ['pop', 'graphic', 'cyber'], w: 0.9, dur: 0.4,
  plan: rng => ({ vert: rng.chance(0.3) }),
  draw(ctx, A, B, p, info, P) {
    const v = !!P.vert;
    if (p < 0.5) {
      const q = E.inCubic(p * 2), k = Math.max(0.002, 1 - q);
      put(ctx, A, info, v ? { sy: k, sx: 1 + 0.1 * q } : { sx: k, sy: 1 + 0.1 * q });
    } else {
      const q = (p - 0.5) * 2, k = Math.max(0.002, E.outBack(q, 2));
      put(ctx, B, info, v ? { sy: k, sx: 1 + 0.1 * (1 - q) } : { sx: k, sy: 1 + 0.1 * (1 - q) });
    }
    // 潰れ切る瞬間の光る線
    const f = Math.max(0, 1 - Math.abs(p - 0.5) / 0.18);
    if (f > 0) {
      ctx.globalAlpha = f * 0.9; ctx.fillStyle = info.sc.accent;
      const lw = Math.max(2, info.u * 5) * f;
      if (v) ctx.fillRect(info.cw * 0.1, info.ch / 2 - lw / 2, info.cw * 0.8, lw);
      else ctx.fillRect(info.cw / 2 - lw / 2, info.ch * 0.1, lw, info.ch * 0.8);
    }
  },
});

trans('inkBleed', {
  name: 'インク滲み', tags: ['emotional', 'calm', 'wa', 'editorial'], w: 0.8, dur: 0.6,
  plan: rng => ({ cx: rng.range(0.3, 0.7), cy: rng.range(0.35, 0.65), k: rng.int(1, 9999) }),
  draw(ctx, A, B, p, info, P) {
    const cw = info.cw, ch = info.ch;
    const cx = cw * (P.cx == null ? 0.5 : P.cx), cy = ch * (P.cy == null ? 0.5 : P.cy);
    const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) / 0.7;
    const e = E.inOutCubic(p), s = (P.k || 1) + info.seed;
    const N = 56;
    const blob = (r, wob, add) => {
      if (!add) ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = TAU * i / N;
        const nz = (L.noise1(i * 0.45 + p * 1.5, s) - 0.5) * 2 * 0.6 + (L.noise1(i * 1.3, s + 5) - 0.5) * 2 * 0.4;
        const rr = r * (1 + wob * nz);
        const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    const r = R * e;
    // A は滲みの外側だけ
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch); blob(r * 1.12, 0.3, true); ctx.clip('evenodd'); ctx.drawImage(A, 0, 0); ctx.restore();
    // 滲みの縁(薄い B)
    ctx.save(); blob(r * 1.12, 0.3); ctx.clip(); ctx.globalAlpha = 0.45; ctx.drawImage(B, 0, 0); ctx.restore();
    // 本体
    ctx.save(); blob(r, 0.28); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    ctx.globalAlpha = bump(p) * 0.5; ctx.strokeStyle = info.sc.accent; ctx.lineWidth = Math.max(1, info.u * 3);
    blob(r * 1.05, 0.29); ctx.stroke();
  },
});

trans('mosaic', {
  name: 'モザイク', tags: ['glitch', 'pop', 'cyber'], w: 0.7, dur: 0.44,
  draw(ctx, A, B, p, info) {
    const cw = info.cw, ch = info.ch;
    const maxB = Math.max(4, Math.min(cw, ch) / 12);
    const blk = 1 + (maxB - 1) * Math.pow(bump(p), 0.8);
    const tmp = info.tmp(cw, ch);                          // 同サイズで固定(毎フレームの再確保をしない)
    const tc = tmp.getContext('2d');
    const sw = Math.max(1, Math.ceil(cw / blk)), sh = Math.max(1, Math.ceil(ch / blk));
    const bw = cw / sw, bh = ch / sh;
    const aB = L.smooth(0.38, 0.62, p);
    const layer = (img, a) => {
      if (a <= 0.002) return;
      if (blk < 1.5) { ctx.globalAlpha = a; ctx.drawImage(img, 0, 0); return; }
      tc.clearRect(0, 0, sw + 2, sh + 2);
      tc.imageSmoothingEnabled = true;
      tc.drawImage(img, 0, 0, cw, ch, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a;
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, sw * bw, sh * bh);
      ctx.imageSmoothingEnabled = true;
    };
    layer(A, 1 - aB);
    layer(B, aB);
  },
});

/* ================================================================ style (配色セット) */
const F = {
  dela: "'Dela Gothic One', sans-serif", reggae: "'Reggae One', sans-serif", rnr: "'RocknRoll One', sans-serif",
  rampart: "'Rampart One', sans-serif", train: "'Train One', sans-serif",
  kaku: "'Zen Kaku Gothic New', sans-serif", noto: "'Noto Sans JP', sans-serif", biz: "'BIZ UDPGothic', sans-serif",
  mplus: "'M PLUS Rounded 1c', sans-serif", maru: "'Zen Maru Gothic', sans-serif",
  notoSerif: "'Noto Serif JP', serif", shippori: "'Shippori Mincho', serif", zenOld: "'Zen Old Mincho', serif",
  tokumin: "'Kaisei Tokumin', serif", tegomin: "'New Tegomin', serif", antique: "'Zen Antique', serif",
  hina: "'Hina Mincho', serif", decol: "'Kaisei Decol', serif",
  mochiy: "'Mochiy Pop One', sans-serif", hachi: "'Hachi Maru Pop', cursive", klee: "'Klee One', cursive",
  syuku: "'Yuji Syuku', serif", mai: "'Yuji Mai', serif", yomogi: "'Yomogi', cursive", dot: "'DotGothic16', sans-serif",
  // 欧文フェイス + 日本語フォールバック(mono 用)
  anton: "'Anton', 'Zen Kaku Gothic New', sans-serif", bebas: "'Bebas Neue', 'Zen Kaku Gothic New', sans-serif",
  oswald: "'Oswald', 'Zen Kaku Gothic New', sans-serif", zenDots: "'Zen Dots', 'DotGothic16', sans-serif",
};
const LIVELY = { enter: { fade: 0.6 }, exit: { fade: 0.6 }, hold: { still: 0.75 } };
const QUIET = { enter: { fade: 1.4 }, exit: { fade: 1.4 }, hold: { still: 1.3 } };
const style = (key, def) => L.registerStyle(key, Object.assign({ decor: {} }, def));

style('rockRedBlack', {
  name: '赤黒ロック', desc: '黒地に血のような赤。極太ゴシックで叩きつける。',
  moods: ['dark', 'graphic'],
  colors: { bg1: '#0b0707', bg2: '#2a0a0d', accent: '#e3202f', accent2: '#f2ece2', text: '#f7f2ea' },
  fonts: { display: F.dela, serif: F.zenOld, body: F.kaku, mono: F.anton, hand: F.reggae },
  ghost: 0.55, ghostA: '#e3202f', ghostB: '#5a0a12', bias: LIVELY,
});
style('neonCyber', {
  name: 'ネオンサイバー', desc: '紺黒にシアンとマゼンタの発光。色ずれ強め。',
  moods: ['cyber', 'glitch'],
  colors: { bg1: '#05060f', bg2: '#101238', accent: '#00eaff', accent2: '#ff2bd6', text: '#eafcff' },
  fonts: { display: F.kaku, serif: F.notoSerif, body: F.biz, mono: F.dot, hand: F.klee },
  ghost: 0.85, ghostA: '#00eaff', ghostB: '#ff2bd6', bias: LIVELY,
});
style('paperEditorial', {
  name: '紙の誌面', desc: '生成りの紙に墨色の明朝。朱と藍を差し色に。',
  moods: ['editorial', 'calm'],
  colors: { bg1: '#f3eee4', bg2: '#e4dccb', accent: '#c8361f', accent2: '#1f3a68', text: '#17140f' },
  fonts: { display: F.zenOld, serif: F.shippori, body: F.kaku, mono: F.oswald, hand: F.klee },
  ghost: 0.08, bias: { layout: { center: 0.85 }, enter: { fade: 1.2 }, exit: { fade: 1.2 } },
});
style('pastelPop', {
  name: 'パステルポップ', desc: '桜色と水色の明るい地に、丸いポップ体。',
  moods: ['pop'],
  colors: { bg1: '#fff0f6', bg2: '#e3f1ff', accent: '#ff5f9e', accent2: '#4db8f0', text: '#3a2148' },
  fonts: { display: F.mochiy, serif: F.decol, body: F.maru, mono: F.mplus, hand: F.hachi },
  ghost: 0.3, ghostA: '#ff9cc4', ghostB: '#8fd3ff', bias: LIVELY,
});
style('midnightBallad', {
  name: '深夜のバラード', desc: '深い紺に街灯の琥珀。細い明朝でしっとり。',
  moods: ['calm', 'emotional'],
  colors: { bg1: '#0a0f1f', bg2: '#1c2442', accent: '#9fb8ff', accent2: '#f2c28b', text: '#eef1fa' },
  fonts: { display: F.shippori, serif: F.zenOld, body: F.kaku, mono: F.oswald, hand: F.klee },
  ghost: 0.18, ghostA: '#9fb8ff', ghostB: '#f2c28b', bias: QUIET,
});
style('y2kChrome', {
  name: 'Y2Kクローム', desc: '銀の金属地に電子ブルーとピンク。立体ゴシック。',
  moods: ['pop', 'cyber'],
  colors: { bg1: '#e1e7ef', bg2: '#a9b6c7', accent: '#2a5cff', accent2: '#ff2f9a', text: '#0b1122' },
  fonts: { display: F.rampart, serif: F.decol, body: F.mplus, mono: F.zenDots, hand: F.hachi },
  ghost: 0.4, ghostA: '#2a5cff', ghostB: '#ff2f9a', bias: LIVELY,
});
style('vhsRetro', {
  name: 'VHSレトロ', desc: 'ビデオ画面の黒紫にOSD風ドット文字。赤青のにじみ。',
  moods: ['glitch', 'dark'],
  colors: { bg1: '#100f16', bg2: '#2a1a33', accent: '#ffcc33', accent2: '#35e0c9', text: '#f3eee0' },
  fonts: { display: F.dot, serif: F.notoSerif, body: F.kaku, mono: F.dot, hand: F.yomogi },
  ghost: 0.9, ghostA: '#ff3b3b', ghostB: '#35c8ff', bias: { hold: { still: 0.8 } },
});
style('monoMinimal', {
  name: 'モノクロミニマル', desc: '黒と白だけ。飾らない太ゴシックと余白。',
  moods: ['dark', 'editorial'],
  colors: { bg1: '#0c0c0c', bg2: '#1b1b1b', accent: '#ffffff', accent2: '#8c8c8c', text: '#f2f2f2' },
  fonts: { display: F.noto, serif: F.notoSerif, body: F.noto, mono: F.bebas, hand: F.klee },
  ghost: 0.05, bias: { layout: { center: 1.2 }, enter: { fade: 1.1 }, hold: { still: 1.3 } },
});
style('sunset80s', {
  name: '80sサンセット都市', desc: '紫からマゼンタの夕景に、橙と水色のネオン。',
  moods: ['pop', 'emotional'],
  colors: { bg1: '#1c0b33', bg2: '#5c1848', accent: '#ff8a3d', accent2: '#3fd0ff', text: '#fff3e8' },
  fonts: { display: F.reggae, serif: F.tokumin, body: F.mplus, mono: F.bebas, hand: F.hachi },
  ghost: 0.5, ghostA: '#ff8a3d', ghostB: '#c33cff', bias: LIVELY,
});
style('sumiWashi', {
  name: '墨と和紙', desc: '和紙の地に筆の墨文字。朱の落款を差し色に。',
  moods: ['wa', 'calm'],
  colors: { bg1: '#f4efe3', bg2: '#e5dccb', accent: '#b3302c', accent2: '#3a342c', text: '#15120e' },
  fonts: { display: F.syuku, serif: F.shippori, body: F.kaku, mono: F.antique, hand: F.mai },
  ghost: 0.06, bias: QUIET,
});
style('kurenai', {
  name: '紅', desc: '闇に紅と金。重い明朝で情念を。',
  moods: ['wa', 'dark', 'emotional'],
  colors: { bg1: '#130407', bg2: '#3d0912', accent: '#e8313c', accent2: '#d8b26a', text: '#fcefe6' },
  fonts: { display: F.tokumin, serif: F.shippori, body: F.kaku, mono: F.antique, hand: F.syuku },
  ghost: 0.35, ghostA: '#e8313c', ghostB: '#d8b26a', bias: {},
});
style('forestMist', {
  name: '森と霧', desc: '深い緑に霧の白。丸みのあるゴシックで静かに。',
  moods: ['calm', 'emotional'],
  colors: { bg1: '#122019', bg2: '#2d4238', accent: '#a8d4b9', accent2: '#e4d9b2', text: '#eef4ee' },
  fonts: { display: F.maru, serif: F.zenOld, body: F.kaku, mono: F.oswald, hand: F.klee },
  ghost: 0.15, bias: QUIET,
});
style('grunge', {
  name: 'グランジ', desc: '煤けた黒茶に酸っぱい黄緑と錆色。荒れた書体。',
  moods: ['dark', 'glitch'],
  colors: { bg1: '#18150f', bg2: '#322b20', accent: '#c7d23a', accent2: '#b5552b', text: '#ece5d4' },
  fonts: { display: F.reggae, serif: F.tegomin, body: F.kaku, mono: F.anton, hand: F.yomogi },
  ghost: 0.6, ghostA: '#c7d23a', ghostB: '#b5552b', bias: LIVELY,
});
style('brutalism', {
  name: 'ブルータリズム', desc: '黒・白・黄の3色だけ。極太で無骨に。',
  moods: ['graphic', 'editorial'],
  colors: { bg1: '#0a0a0a', bg2: '#171717', accent: '#ffe500', accent2: '#f4f4f0', text: '#f4f4f0' },
  fonts: { display: F.dela, serif: F.zenOld, body: F.biz, mono: F.oswald, hand: F.yomogi },
  ghost: 0.12, ghostA: '#ffe500', ghostB: '#555555', bias: { layout: { center: 0.7 }, enter: { fade: 0.5 }, exit: { fade: 0.5 } },
});
style('liquidGrad', {
  name: '液体グラデ', desc: '紫から青緑へ溶けるグラデに、ピンクとミントの光。',
  moods: ['pop', 'cyber', 'emotional'],
  colors: { bg1: '#1d0f40', bg2: '#0b3d5e', accent: '#ff7ad9', accent2: '#64f0d8', text: '#ffffff' },
  fonts: { display: F.mplus, serif: F.decol, body: F.maru, mono: F.zenDots, hand: F.hachi },
  ghost: 0.45, ghostA: '#ff7ad9', ghostB: '#64f0d8', bias: {},
});
style('candy', {
  name: 'キャンディ', desc: 'クリームと苺ミルクの地に、ビビッドな飴色。',
  moods: ['pop'],
  colors: { bg1: '#fff5d9', bg2: '#ffd6ea', accent: '#ff2f78', accent2: '#12a9bb', text: '#2c1433' },
  fonts: { display: F.rnr, serif: F.decol, body: F.maru, mono: F.dot, hand: F.hachi },
  ghost: 0.35, ghostA: '#ff2f78', ghostB: '#12a9bb', bias: LIVELY,
});
style('deepSea', {
  name: '深海', desc: '光の届かない群青に、青白い発光。静かな明朝。',
  moods: ['calm', 'emotional', 'cyber'],
  colors: { bg1: '#020b18', bg2: '#062a4a', accent: '#3fb6ff', accent2: '#7ff0e0', text: '#e4f5ff' },
  fonts: { display: F.notoSerif, serif: F.shippori, body: F.kaku, mono: F.oswald, hand: F.klee },
  ghost: 0.25, ghostA: '#3fb6ff', ghostB: '#1a4a8a', bias: QUIET,
});
style('embers', {
  name: '残り火', desc: '焦げた闇に燃え残る橙。古風な明朝で切なく。',
  moods: ['dark', 'emotional'],
  colors: { bg1: '#0e0806', bg2: '#2c130b', accent: '#ff6a2b', accent2: '#ffc46b', text: '#fff1e2' },
  fonts: { display: F.antique, serif: F.zenOld, body: F.kaku, mono: F.bebas, hand: F.klee },
  ghost: 0.4, ghostA: '#ff6a2b', ghostB: '#7a1e08', bias: { enter: { fade: 1.25 }, hold: { still: 1.1 } },
});
style('aurora', {
  name: 'オーロラ', desc: '極夜の空に緑と紫の光の帯。柔らかな装飾明朝。',
  moods: ['calm', 'emotional', 'pop'],
  colors: { bg1: '#06111d', bg2: '#0f3036', accent: '#5dffb4', accent2: '#b48cff', text: '#effff8' },
  fonts: { display: F.decol, serif: F.shippori, body: F.maru, mono: F.oswald, hand: F.klee },
  ghost: 0.4, ghostA: '#5dffb4', ghostB: '#b48cff', bias: { enter: { fade: 1.2 } },
});
style('undergroundIdol', {
  name: '地下アイドル', desc: '暗いライブハウスにショッキングピンクと水色。ドットのノイズ。',
  moods: ['pop', 'glitch'],
  colors: { bg1: '#13061d', bg2: '#300b42', accent: '#ff4fb8', accent2: '#7dfcff', text: '#fff4fb' },
  fonts: { display: F.mochiy, serif: F.decol, body: F.mplus, mono: F.dot, hand: F.hachi },
  ghost: 0.75, ghostA: '#ff4fb8', ghostB: '#7dfcff', bias: LIVELY,
});

/* 開発シート(dev/compose/)でだけ、スタイルのフォントを先読みする(アプリ本体では何もしない。
   アプリは描画時の遅延読込 + 書き出し前の L.fontsUsed で足りる) */
try {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load && typeof location !== 'undefined' && /\/dev\/compose\//.test(location.pathname)) {
    const fams = new Set();
    for (const k of L.STYLE_ORDER) {
      const st = L.STYLES[k];
      for (const f of Object.values((st && st.fonts) || {})) [].concat(f).forEach(x => fams.add(x));
    }
    fams.forEach(f => { for (const w of [400, 900]) document.fonts.load(`${w} 40px ${f}`, '夜明けまで走り出せ君の名前ひかりA1').catch(() => {}); });
  }
} catch (e) { /* noop */ }
})();
