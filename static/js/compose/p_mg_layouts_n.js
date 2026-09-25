/* LyricFlow 演出パック: p_mg_layouts_n — MGレイアウトN（数字・データ・タイポ）
   契約: docs/COMPOSE_PACKS.md  (group: layout)  共通ヘルパー: L.mg (p_motion_graphics.js)
   拍グリッド(env.beat / env.bpm)に乗って、数字が数え上がり、グラフが伸び、語が一拍ずつ組まれる。実装はLyricFlow独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_mg_layouts_n';
const clamp = L.clamp, lerp = L.lerp, TAU = L.TAU;

/* ================================================================ helpers */
const mOf = env => Math.min(env.W, env.H);
const lsz = env => Math.max(7, mOf(env) * 0.022);
const hair = env => Math.max(1, env.u * 1.6);
const NF = ["'Anton', sans-serif", "'Bebas Neue', sans-serif", "'Oswald', sans-serif"];
const NW = [400, 400, 700];
const numF = p => { const i = Math.abs((p && p.nf) | 0) % NF.length; return { font: NF[i], weight: NW[i] }; };
const pad3 = n => String(Math.max(0, n | 0)).padStart(3, '0');
const wide = env => !env.portrait && env.W / env.H > 1.2;

/* 拍グリッド(カット開始基準)。div=2 で裏拍も刻む。
   n=始まった拍の数(拍の途中で始まったカットは開始時も1歩)、s=拍ごとにイージングで進む連続値、at(k)=k歩目の時刻 */
const grid = (env, div = 1, span = 0.45, ease = E.outExpo) => {
  const len = M.beatLen(env) / div, lt = env.lt;
  const s0 = env.beat ? env.beat.since % len : ((lt % len) + len) % len;
  const last = lt - s0;
  const eps = len * 0.2;
  const o1 = last - Math.floor((last + eps) / len) * len;
  const virt = o1 > len * 0.35;
  const at = k => (virt ? (k <= 1 ? 0 : o1 + (k - 2) * len) : o1 + (k - 1) * len);
  const onsets = last >= o1 - 1e-6 ? Math.round((last - o1) / len) + 1 : 0;
  const n = onsets + (virt && lt >= 0 ? 1 : 0);
  const since = onsets ? s0 : Math.max(0, lt);
  const e = n ? ease(clamp(since / (len * span))) : 0;
  return { n, s: Math.max(0, n - 1 + e), e, since, len, at, kick: n ? Math.exp(-since / 0.12) : 0 };
};
/* count 歩をカットの frac 以内に収めるための分割(遅いBPMなら裏拍まで刻む。0.2秒未満には刻まない) */
const divFor = (env, count, frac = 0.35) => {
  const len = M.beatLen(env);
  return count * len > env.cut.dur * frac && len / 2 >= 0.2 ? 2 : 1;
};
/* 項目の登場を t 秒後に(mi のスタッガー分を差し引く) */
const dly = (env, t, mi = 0) => {
  const d = env.cut.enterDef, stg = d && d.stagger != null ? d.stagger : 0.07;
  return Math.max(0, t - stg * mi);
};
/* 字ごとのマスク上昇(e 0→1)。窓は静止位置に固定 */
const withRise = (it, e, dir = 1) => {
  if (e >= 1) return it;
  const d = (1 - e) * 1.2 * dir;
  it.charFns = (it.charFns || []).concat([() => ({ dy: d * it.size, clipY: [-0.72 - d, 0.72 - d] })]);
  return it;
};
/* 副ラベル(等幅) */
const lab = (env, text, x, y, o = {}) => {
  const it = { text: String(text), font: M.MONO, weight: o.weight || 700, size: o.size || lsz(env), x, y, color: o.color || env.sc.sub, alpha: o.a == null ? 1 : o.a, ghost: false, track: o.track == null ? 0.08 : o.track };
  if (it.alpha <= 0.002) return null;
  return o.align && o.align !== 'center' ? M.anchored(env, it, o.align) : env.text(it);
};
const mw = it => L.measure(it).w * Math.abs(it.sx == null ? 1 : it.sx);
const setLeft = (it, x) => { it.x = x + mw(it) / 2; return it; };
const setRight = (it, x) => { it.x = x - mw(it) / 2; return it; };
/* 句を R 行以内にまとめる(語順維持・字数バランス) */
const joinerOf = text => (L.hasLatinWords(text) && /\s/.test(text) ? ' ' : '');
const rowsOf = (text, maxRows) => {
  const ch = L.chunks(text);
  if (!ch.length) return [String(text || '')];
  const R = Math.max(1, Math.min(maxRows, ch.length));
  if (ch.length <= R) return ch;
  const j = joinerOf(text), tot = L.glyphCount(text), out = [];
  let cur = '', acc = 0;
  ch.forEach((c, i) => {
    cur = cur ? cur + j + c : c; acc += L.glyphCount(c);
    const remain = ch.length - i - 1, rowsLeft = R - out.length - 1;
    if (remain > 0 && rowsLeft > 0 && (acc >= tot * (out.length + 1) / R - 0.5 || remain <= rowsLeft)) { out.push(cur); cur = ''; }
  });
  if (cur) out.push(cur);
  return out;
};
/* 行の束を maxW×maxH に収める共通サイズ */
const stackSize = (rows, font, maxW, maxH, lead = 1.15, o = {}) => {
  let wmax = 0;
  for (const r of rows) wmax = Math.max(wmax, L.measure({ text: r, font, size: 100, track: o.track || 0, weight: o.weight }).w);
  const s = Math.min(wmax > 0 ? maxW / wmax * 100 : 1e9, maxH / (rows.length * lead));
  return Math.max(4, Math.min(s, o.max || 1e9));
};
/* 数字を等幅セルで並べる(桁が変わっても揺れない)。colorAt(i,ch) */
const digitsW = (str, font, weight, size) => L.glyphs(str).reduce((a, ch) => a + (/\d/.test(ch) ? L.adv(font, weight, '0') : L.adv(font, weight, ch)) * size, 0);
const digitRow = (env, str, o) => {
  let x = o.x;
  L.glyphs(str).forEach((ch, i) => {
    const w = (/\d/.test(ch) ? L.adv(o.font, o.weight, '0') : L.adv(o.font, o.weight, ch)) * o.size;
    const a = o.alphaAt ? o.alphaAt(i, ch) : 1;
    if (a > 0.002) env.text({ text: ch, font: o.font, weight: o.weight, size: o.size, x: x + w / 2, y: o.y, color: o.colorAt ? o.colorAt(i, ch) : (o.color || env.sc.fg), alpha: (o.alpha == null ? 1 : o.alpha) * a, ghost: !!o.ghost ? undefined : false, sy: o.sy, sx: o.sx });
    x += w;
  });
  return x - o.x;
};
const lead0 = (str, i) => { const k = L.glyphs(str).findIndex(c => /[1-9]/.test(c)); return k < 0 ? i < L.glyphs(str).length - 1 : i < k; };
const dimOf = env => L.rgba(env.sc.fg, env.sc.dark ? 0.2 : 0.16);

/* ================================================================ 1. 数字カウント */
L.register('layout', 'n_countup', {
  name: '数字カウント', tags: ['graphic', 'editorial', 'cyber'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ nf: rng.int(0, 2), mode: rng.pick(['ms', 'pct', 'beats', 'glyph']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.4);
    const len = M.beatLen(env);
    let target, digits, unit, label;
    if (p.mode === 'pct') { target = 100; digits = 3; unit = '%'; label = 'PROGRESS'; }
    else if (p.mode === 'beats') { target = Math.max(1, Math.round(cut.dur / len)); digits = 2; unit = 'BT'; label = 'BEATS IN CUT'; }
    else if (p.mode === 'glyph') { target = cut.n; digits = 2; unit = 'CH'; label = 'GLYPH COUNT'; }
    else { target = Math.min(9999, Math.round(cut.dur * 1000)); digits = 4; unit = 'MS'; label = 'DURATION'; }
    const B = clamp(Math.round(cut.dur / len * 0.4), 2, 6);
    const g = grid(env, divFor(env, B, 0.5), 0.55, E.outExpo);
    const pr = clamp(g.s / B), done = g.n > B;
    const val = Math.round(target * pr);
    const str = String(val).padStart(digits, '0');
    const { font: nfont, weight: nw } = numF(p);
    const wd = wide(env);
    const ax = W * 0.07, aw = wd ? W * 0.44 : W * 0.86, ah = wd ? H * 0.46 : H * (env.portrait ? 0.2 : 0.28);
    const cy = wd ? H * 0.47 : H * (env.portrait ? 0.34 : 0.33);
    const unitK = 0.26;
    const w100 = digitsW('0'.repeat(digits), nfont, nw, 100) + L.adv(M.MONO, 700, 'M') * 100 * unitK * 2.4;
    const size = Math.min(aw / w100 * 100, ah / 0.95);
    const numW = digitsW(str, nfont, nw, size);
    const x0 = wd ? ax : W / 2 - (numW + size * unitK * 2.4 * 0.62) / 2;
    const pop = 1 + g.kick * 0.05;
    if (io > 0.002) {
      const yy = cy + (1 - io) * m * 0.05;
      digitRow(env, str, { font: nfont, weight: nw, size, x: x0, y: yy, sy: pop, alpha: io, colorAt: (i) => (lead0(str, i) ? dimOf(env) : done ? sc.accent : sc.fg) });
      lab(env, unit, x0 + numW + size * 0.08, yy - size * 0.28, { size: size * unitK, align: 'left', a: io, color: sc.accent, track: 0.02 });
      // 目盛りバー: B 区切り、進んだ分を塗る
      const by = yy + size * 0.56, bw = numW + size * unitK * 1.6;
      env.rect(x0, by, bw * io, Math.max(1, u * 2), sc.sub, 0.5 * io, false);
      env.rect(x0, by - Math.max(1, u * 2), bw * pr, Math.max(2, u * 5), sc.accent, io, false);
      for (let i = 0; i <= B; i++) env.rect(x0 + bw * i / B - Math.max(1, u), by - u * 8, Math.max(1, u * 2), u * 14, sc.fg, io * (i <= g.s + 0.01 ? 0.9 : 0.3), false);
      const stepTxt = `${M.pad2(Math.min(B, g.n))}/${M.pad2(B)}`;
      const roomy = mw({ text: label + '  ' + stepTxt, font: M.MONO, weight: 700, size: lsz(env), track: 0.2 }) < bw;
      if (roomy) lab(env, label, x0, by + lsz(env) * 1.6, { align: 'left', a: io, track: 0.2 });
      lab(env, stepTxt, x0 + bw, by + lsz(env) * 1.6, { align: 'right', a: io, color: done ? sc.accent : sc.sub });
    }
    const font = L.roleFont(env, 'display');
    if (wd) {
      const bx = W * 0.56, bw2 = W * 0.37;
      const f = M.fitLines(env, cut.text, font, bw2, H * 0.5, m * 0.2, 3);
      const it = setLeft({ text: f.text, font, size: f.size, y: H * 0.47, align: 'left' }, bx);
      return L.mainDraw(env, it);
    }
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * (env.portrait ? 0.24 : 0.22), m * 0.2, 3);
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H * (env.portrait ? 0.7 : 0.74) });
  },
}, P);

/* ================================================================ 2. 3-2-1 カウントダウン */
L.register('layout', 'n_countdown', {
  name: '321カウント', tags: ['graphic', 'pop', 'cyber'], w: 0.9, emph: 1.4, fits: n => n >= 1 && n <= 20, minDur: 1.2,
  plan: rng => ({ nf: rng.int(0, 2), frame: rng.pick(['square', 'circle']), dir: rng.sign() }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.3);
    const len = M.beatLen(env);
    const div = 3 * len > cut.dur * 0.32 && len / 2 >= 0.2 ? 2 : 1;
    const K = clamp(Math.floor(cut.dur * 0.32 / (len / div)), 1, 3);
    const g = grid(env, div, 0.5, E.outExpo);
    const land = g.at(K + 1);
    const t2 = clamp((env.lt - land) / (len * 0.7));
    const e2 = E.outExpo(t2);
    const font = L.roleFont(env, 'display');
    const f = M.fitLines(env, cut.text, font, W * 0.78, H * (env.portrait ? 0.3 : 0.34), m * 0.22, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2, delay: dly(env, land) };
    const lb = L.itemBox(it);
    const S = m * 0.36, pad = m * 0.04;
    const fw = lerp(S, lb.w + pad * 2, e2), fh = lerp(S, lb.h + pad * 1.6, e2);
    const rot = (p.dir || 1) * Math.min(g.s, K) * Math.PI / 2 * (1 - e2);
    const { font: nfont, weight: nw } = numF(p);
    if (io > 0.002 && env.pass === 'main' && g.n > 0) {
      const ctx = env.ctx;
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(rot);
      ctx.globalAlpha = io;
      ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(2, u * 5);
      const sc0 = E.outBack(clamp(env.lt / 0.3), 1.6);
      if (p.frame === 'circle' && e2 < 0.02) {
        ctx.beginPath(); ctx.arc(0, 0, S / 2 * sc0, 0, TAU); ctx.globalAlpha = io * 0.3; ctx.stroke();
        // 1歩の間に一周する弧
        const fr = g.n <= K ? clamp(g.since / g.len) : 1;
        ctx.globalAlpha = io; ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(3, u * 9);
        ctx.beginPath(); ctx.arc(0, 0, S / 2 * sc0, -Math.PI / 2, -Math.PI / 2 + TAU * E.outCubic(fr)); ctx.stroke();
      } else {
        const r = p.frame === 'circle' ? Math.min(fw, fh) / 2 * (1 - e2) : 0;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-fw / 2 * sc0, -fh / 2 * sc0, fw * sc0, fh * sc0, r); else ctx.rect(-fw / 2 * sc0, -fh / 2 * sc0, fw * sc0, fh * sc0);
        ctx.stroke();
        // 四隅の角マーク(アクセント)
        ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(3, u * 8);
        const cl = Math.min(fw, fh) * 0.16;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = sx * fw / 2 * sc0, y = sy * fh / 2 * sc0;
          ctx.beginPath(); ctx.moveTo(x, y - sy * cl); ctx.lineTo(x, y); ctx.lineTo(x - sx * cl, y); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // 数字: 各歩で弾んで入れ替わり、着地で拡大しながら抜ける
    if (g.n >= 1 && io > 0.002) {
      const d = g.n <= K ? K - g.n + 1 : 1;
      const pe = g.n <= K ? g.e : 1;
      const zs = (1.3 - 0.3 * pe) * (1 + E.inCubic(t2) * 1.8);
      const a = io * (1 - E.outCubic(t2));
      if (a > 0.002) env.text({ text: String(d), font: nfont, weight: nw, size: S * 0.62, x: W / 2, y: H / 2, sx: zs, sy: zs, color: sc.accent, alpha: a * clamp(pe * 3), ghost: false });
      lab(env, g.n <= K ? `T-${d}` : 'GO', W / 2 - fw / 2, H / 2 - fh / 2 - lsz(env) * 1.2, { align: 'left', a: io, color: g.n > K ? sc.accent : sc.sub, track: 0.2 });
      lab(env, `${M.pad2(Math.min(g.n, K + 1))}/${M.pad2(K + 1)}`, W / 2 + fw / 2, H / 2 + fh / 2 + lsz(env) * 1.2, { align: 'right', a: io });
    }
    return L.mainDraw(env, it) || lb;
  },
}, P);

/* ================================================================ 3. パーセント→語 */
L.register('layout', 'n_pctswap', {
  name: '百分率→語', tags: ['graphic', 'cyber', 'editorial'], w: 0.9, emph: 1.2, fits: n => n >= 1 && n <= 20, minDur: 1.2,
  plan: rng => ({ nf: rng.int(0, 2), side: rng.pick(['left', 'right']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.35);
    const B = 4;
    const g = grid(env, divFor(env, B, 0.3), 0.5, E.outExpo);
    const pr = clamp(g.s / B);
    const land = g.at(B) + g.len * 0.6;
    const sw = E.inOutExpo(clamp((env.lt - land) / (g.len * 0.9)));
    const font = L.roleFont(env, 'display');
    const boxW = W * 0.8, boxH = H * (env.portrait ? 0.26 : 0.36);
    const f = M.fitLines(env, cut.text, font, boxW, boxH, m * 0.24, 3);
    const cx = W / 2, cy = H * 0.5;
    const lb = L.itemBox({ text: f.text, font, size: f.size, x: cx, y: cy });
    const { font: nfont, weight: nw } = numF(p);
    const nsize = Math.min(boxH * 1.05, W * 0.62 / (digitsW('000%', nfont, nw, 1) || 1));
    const winH = Math.max(lb.h, nsize * 0.92) * 1.08;
    const y0 = cy - winH / 2;
    // 窓(マスク)の中で、数字が上へ抜け、歌詞が下から入る
    const str = String(Math.round(pr * 100)).padStart(3, '0') + '%';
    const nwid = digitsW(str, nfont, nw, nsize);
    if (io > 0.002 && sw < 1) {
      const ny = cy - sw * winH;
      if (env.pass === 'main') {
        const ctx = env.ctx;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, winH); ctx.clip();
        digitRow(env, str, { font: nfont, weight: nw, size: nsize, x: cx - nwid / 2, y: ny + (1 - io) * winH * 0.6, sy: 1 + g.kick * 0.04 * (1 - sw), alpha: 1, colorAt: (i, ch) => (ch === '%' ? sc.accent : lead0(str.slice(0, 3), i) ? dimOf(env) : sc.fg) });
        ctx.restore();
      }
    }
    // 窓の下: B 区切りの進捗セグメント(拍ごとに1つ埋まる)
    if (io > 0.002) {
      const rw = Math.max(nwid, lb.w, W * 0.5) * 1.05 * io, rx = cx - rw / 2, ry = y0 + winH + m * 0.02, rh = Math.max(3, m * 0.012);
      const sgw = rw / B;
      for (let i = 0; i < B; i++) {
        const q = E.outExpo(clamp(g.s - i));
        env.rect(rx + i * sgw + u * 2, ry, sgw - u * 4, rh, dimOf(env), io, false);
        if (q > 0.002) env.rect(rx + i * sgw + u * 2, ry, (sgw - u * 4) * q, rh, pr >= 1 ? sc.accent : sc.fg, io, false);
      }
      lab(env, pr >= 1 ? 'LOADED' : 'LOADING', rx, ry + rh + lsz(env) * 1.1, { align: 'left', a: io, track: 0.25, color: pr >= 1 ? sc.accent : sc.sub });
      lab(env, `STEP ${M.pad2(Math.min(g.n, B))}/${M.pad2(B)}`, rx + rw, ry + rh + lsz(env) * 1.1, { align: 'right', a: io });
    }
    const it = { text: f.text, font, size: f.size, x: cx, y: cy, delay: dly(env, land) };
    if (sw < 1) {
      const d = (1 - sw) * winH;
      it.clipFn = (ctx, e2, it2, mm) => { const sy = it2.sy == null ? 1 : it2.sy; ctx.rect(-W * 2, (y0 - it2.y) / sy, W * 4, winH / sy); };
      it.y = cy + d;
    }
    return L.mainDraw(env, it) || lb;
  },
}, P);

/* ================================================================ 4. 回転ドラム(オドメーター) */
L.register('layout', 'n_odometer', {
  name: '回転ドラム', tags: ['graphic', 'cyber', 'editorial'], w: 1, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ nf: rng.int(0, 2), digits: Array.from({ length: rng.int(4, 6) }, () => rng.int(0, 9)), tag: rng.pick(['No.', 'ID', 'REF', 'CNT']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.4);
    const dg = (p.digits && p.digits.length ? p.digits : [1, 2, 8, 0]);
    const D = dg.length;
    const g = grid(env, divFor(env, D, 0.5), 0.5, E.outExpo), g1 = grid(env, 1);
    const { font: nfont, weight: nw } = numF(p);
    const gapK = 0.1, cwK = 0.78, chK = 1.18;
    const S = Math.min(W * 0.8 / (D * cwK + (D - 1) * gapK), H * (env.portrait ? 0.2 : 0.3) / chK);
    const cw = S * cwK, ch = S * chK, gap = S * gapK;
    const totW = D * cw + (D - 1) * gap;
    const x0 = W / 2 - totW / 2, cy = H * (env.portrait ? 0.38 : 0.39);
    const R = 14;
    if (io > 0.002 && env.pass === 'main') {
      const ctx = env.ctx;
      ctx.save();
      ctx.font = L.fontStr({ font: nfont, weight: nw, size: S });
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < D; i++) {
        const k = clamp(io * 1.4 - i * 0.08);
        if (k <= 0.002) continue;
        const x = x0 + i * (cw + gap), hh = ch * E.outCubic(k);
        const top = cy - hh / 2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = sc.fg;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, top, cw, hh, S * 0.08); else ctx.rect(x, top, cw, hh); ctx.fill();
        ctx.save(); ctx.clip();
        // 回転位置: 自分の歩まで空転 → 歩で目標の字に止まる(オーバーシュート)。止まった後、最下位桁は拍ごとに1つ進む
        const ph = i * 3.3, ts = g.at(i + 1);
        let pos;
        if (env.lt < ts) pos = Math.max(0, env.lt) * R + ph;
        else {
          const p0 = ts * R + ph, base = p0 + 4;
          const pf = base + ((((dg[i] - base) % 10) + 10) % 10);
          pos = p0 + (pf - p0) * E.outBack(clamp((env.lt - ts) / (g.len * 0.8)), 1.3);
          if (i === D - 1) {                     // 止まった後は表拍ごとに1つ進む(拍カウンター)
            const tDone = ts + g.len * 0.8;
            let k0 = 1;
            while (k0 < 64 && g1.at(k0) < tDone) k0++;
            if (g1.n >= k0) pos = pf + (g1.n - k0) + E.outBack(clamp(g1.since / (g1.len * 0.3)), 1.5);
          }
        }
        const fl = Math.floor(pos), fr = pos - fl;
        ctx.fillStyle = sc.bg;
        ctx.fillText(String(((fl % 10) + 10) % 10), x + cw / 2, cy - fr * ch);
        ctx.fillText(String((((fl + 1) % 10) + 10) % 10), x + cw / 2, cy + (1 - fr) * ch);
        // 陰影と中央の継ぎ目
        const gr = ctx.createLinearGradient(0, top, 0, top + hh);
        gr.addColorStop(0, L.rgba(sc.fg, 0.9)); gr.addColorStop(0.22, L.rgba(sc.fg, 0)); gr.addColorStop(0.78, L.rgba(sc.fg, 0)); gr.addColorStop(1, L.rgba(sc.fg, 0.9));
        ctx.fillStyle = gr; ctx.fillRect(x, top, cw, hh);
        ctx.fillStyle = L.rgba(sc.bg, 0.35); ctx.fillRect(x, cy - Math.max(0.5, u), cw, Math.max(1, u * 2));
        ctx.restore();
        // 止まった桁の下にアクセントの印
        const done = env.lt >= ts ? E.outExpo(clamp((env.lt - ts) / (g.len * 0.5))) : 0;
        if (done > 0.01) { ctx.fillStyle = sc.accent; ctx.globalAlpha = io; ctx.fillRect(x + cw * (0.5 - 0.3 * done), cy + ch / 2 + S * 0.08, cw * 0.6 * done, Math.max(2, u * 5)); }
      }
      ctx.restore();
    }
    lab(env, p.tag || 'No.', x0, cy - ch / 2 - lsz(env) * 1.3, { align: 'left', a: io, track: 0.2, color: sc.accent });
    lab(env, `${M.pad2(Math.min(g.n, D))}/${M.pad2(D)} LOCKED`, x0 + totW, cy - ch / 2 - lsz(env) * 1.3, { align: 'right', a: io });
    const font = L.roleFont(env, 'display');
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * (env.portrait ? 0.24 : 0.22), m * 0.2, 3);
    const top = cy + ch / 2 + S * 0.2 + m * 0.03;
    const it = { text: f.text, font, size: f.size, x: W / 2, y: 0 };
    const hb = L.itemBox(it).h;
    it.y = Math.min(H * 0.95 - hb / 2, top + hb / 2);
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 5. 棒グラフ(歌詞は表題) */
L.register('layout', 'n_bars', {
  name: '棒グラフ', tags: ['editorial', 'graphic', 'cyber'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => {
    const nb = rng.int(5, 8);
    return { vals: Array.from({ length: nb }, (_, i) => +(0.25 + 0.7 * rng() * (0.5 + 0.5 * i / nb)).toFixed(3)), hi: rng.int(0, nb - 1), lbl: rng.pick(['alpha', 'num']), fig: rng.int(1, 9) };
  },
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const vals = p.vals && p.vals.length ? p.vals : [0.4, 0.7, 0.5, 0.9, 0.6];
    const nb = vals.length;
    const io = env.inOut(0.4);
    const per = nb > 5 ? 2 : 1;
    const g = grid(env, divFor(env, Math.ceil(nb / per)), 0.6, E.outBack);
    const x0 = W * 0.08, x1 = W * 0.92;
    const cTop = H * (env.portrait ? 0.46 : 0.42), cBot = H * (env.portrait ? 0.84 : 0.84);
    const cH = cBot - cTop;
    // グリッド線と軸
    for (let k = 0; k <= 4; k++) {
      const y = cBot - cH * k / 4;
      const e = clamp(io * 1.6 - k * 0.12);
      if (k === 0) env.line([[x0, y], [x0 + (x1 - x0) * e, y]], sc.fg, Math.max(1.5, u * 3), io);
      else env.line([[x0, y], [x0 + (x1 - x0) * e, y]], sc.sub, hair(env), 0.35 * io, false, [u * 6, u * 6]);
      if (k > 0) lab(env, String(k * 25), x1, y - lsz(env) * 0.8, { align: 'right', a: io * 0.8, size: lsz(env) * 0.85 });
    }
    const slot = (x1 - x0) / nb, bw = slot * 0.56;
    const out = 1 - E.inCubic(env.pOut);
    for (let i = 0; i < nb; i++) {
      const q = clamp(g.s - Math.floor(i / per) - (i % per) * 0.3);
      const hgt = cH * 0.92 * vals[i] * q * out * (1 + g.kick * 0.02);
      const x = x0 + slot * (i + 0.5);
      const hi = i === (p.hi || 0) % nb;
      if (hgt > 0.5) env.rect(x - bw / 2, cBot - hgt, bw, hgt, hi ? sc.accent : sc.fg, hi ? 1 : 0.88, false);
      const a = io * clamp(q * 2);
      if (a > 0.01) lab(env, String(Math.round(vals[i] * 100 * clamp(q))), x, cBot - hgt - lsz(env) * 0.9, { a, color: hi ? sc.accent : sc.fg, size: lsz(env) * 0.95 });
      lab(env, p.lbl === 'num' ? M.pad2(i + 1) : String.fromCharCode(65 + i), x, cBot + lsz(env) * 1.1, { a: io, size: lsz(env) * 0.9 });
    }
    const font = L.roleFont(env, 'display');
    const tH = cTop - H * 0.08 - lsz(env) * 3;
    const f = M.fitLines(env, cut.text, font, x1 - x0, tH, m * 0.18, env.portrait ? 3 : 2);
    const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: 0 }, x0);
    const hb = L.itemBox(it).h;
    it.y = cTop - lsz(env) * 2.6 - hb / 2;
    lab(env, `FIG.${M.pad2(p.fig || 1)} — INDEX / ${nb} ITEMS`, x0, cTop - lsz(env) * 1.3, { align: 'left', a: io, track: 0.15 });
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 6. ドーナツグラフ */
L.register('layout', 'n_donut', {
  name: 'ドーナツ', tags: ['graphic', 'editorial', 'pop'], w: 1, fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => {
    const k = rng.int(3, 5);
    const raw = Array.from({ length: k }, () => 0.4 + rng());
    const s = raw.reduce((a, b) => a + b, 0);
    return { vals: raw.map(v => +(v / s).toFixed(4)), inside: cut.n <= 5 && rng.chance(0.65), rot: rng.int(0, 3), nf: rng.int(0, 2) };
  },
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const vals = p.vals && p.vals.length ? p.vals : [0.4, 0.35, 0.25];
    const K = vals.length;
    const io = env.inOut(0.45);
    const g = grid(env, divFor(env, K), 0.7, E.outExpo);
    const wd = wide(env);
    const inside = !!p.inside;
    const ls = lsz(env);
    const font = L.roleFont(env, 'display');
    // 配置: 横長=左に円・右に歌詞と凡例 / それ以外=上に円、下に歌詞→凡例
    let R, cx, cy, lyr = null;
    if (wd) { R = Math.min(W * 0.18, H * 0.3); cx = W * 0.3; cy = H * 0.5; }
    else {
      R = Math.min(W * 0.3, H * (env.portrait ? 0.19 : inside ? 0.28 : 0.2));
      cx = W / 2; cy = H * (env.portrait ? 0.3 : inside ? 0.4 : 0.3);
      if (!inside) {
        const top = cy + R * 1.15 + m * 0.03, avail = H * 0.86 - ls * 2 - top;
        const f = M.fitLines(env, cut.text, font, W * 0.86, avail, m * 0.18, 3);
        lyr = { text: f.text, font, size: f.size, x: W / 2, y: 0 };
        lyr.y = top + L.itemBox(lyr).h / 2;
      }
    }
    const th = R * 0.3;
    const cols = [sc.accent, sc.fg, sc.accent2, sc.sub, L.mix(sc.accent, sc.fg, 0.5)];
    const rr = R * (0.6 + 0.4 * E.outBack(clamp(env.lt / 0.45), 1.4)) * (1 + g.kick * 0.015);
    const spin = ((p.rot || 0) * 90 - 90) + g.s * 8;
    env.arc(cx, cy, rr, 0, 360 * io, dimOf(env), th, io);
    let a0 = spin;
    vals.forEach((v, i) => {
      const q = E.outExpo(clamp(g.s - i));
      const sweep = 360 * v * q * io;
      if (sweep > 0.3) env.arc(cx, cy, rr, a0 + 0.8, a0 + Math.max(0.9, sweep - 0.8), cols[i % cols.length], th, 1);
      a0 += 360 * v * q;
    });
    const { font: nfont, weight: nw } = numF(p);
    // 凡例: ■ A 34%  を横並び(横長は縦並び)
    const entry = i => `${String.fromCharCode(65 + i)} ${Math.round(vals[i] * 100 * E.outExpo(clamp(g.s - i)))}%`;
    const ew = mw({ text: 'E 00%', font: M.MONO, weight: 700, size: ls, track: 0.08 }) + ls * 1.4;
    let legX, legY, stepX, stepY;
    if (wd) { legX = W * 0.55; legY = inside ? H * 0.5 - (K - 1) * ls * 0.95 : H * 0.62; stepX = 0; stepY = ls * 1.9; }
    else {
      const gapE = ls * 1.2, tot = K * ew + (K - 1) * gapE;
      stepX = ew + gapE; stepY = 0;
      legX = W / 2 - tot / 2;
      legY = inside ? cy + R + th / 2 + m * 0.06 : (lyr ? L.itemBox(lyr).y1 + ls * 2 : H * 0.8);
      if (tot > W * 0.9) { stepX = 0; stepY = ls * 1.7; legX = W / 2 - ew / 2; }
    }
    vals.forEach((v, i) => {
      const a = io * clamp(clamp(g.s - i) * 3);
      if (a < 0.01) return;
      const x = legX + i * stepX, y = legY + i * stepY;
      env.rect(x, y - ls * 0.45, ls * 0.9, ls * 0.9, cols[i % cols.length], a, false);
      lab(env, entry(i), x + ls * 1.4, y, { align: 'left', a, color: sc.fg });
    });
    if (inside) {
      const f = M.fitLines(env, cut.text, font, (rr - th / 2) * 1.35, (rr - th / 2) * 1.0, rr * 0.6, 2);
      return L.mainDraw(env, { text: f.text, font, size: f.size, x: cx, y: cy });
    }
    // 中央に最初の区分の百分率
    const pc = `${Math.round(vals[0] * 100 * E.outExpo(clamp(g.s)))}`;
    const ns = (rr - th / 2) * 0.9;
    env.text({ text: pc, font: nfont, weight: nw, size: ns, x: cx, y: cy, color: sc.fg, alpha: io, ghost: false });
    lab(env, 'SHARE A', cx, cy + ns * 0.62, { a: io, size: ls * 0.8 });
    if (wd) {
      const f = M.fitLines(env, cut.text, font, W * 0.38, H * 0.34, m * 0.18, 3);
      const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: 0 }, W * 0.55);
      it.y = legY - ls * 1.6 - L.itemBox(it).h / 2;
      return L.mainDraw(env, it);
    }
    return L.mainDraw(env, lyr);
  },
}, P);

/* ================================================================ 7. 折れ線グラフ */
L.register('layout', 'n_linegraph', {
  name: '折れ線', tags: ['editorial', 'cyber', 'graphic'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => {
    const k = rng.int(6, 9);
    let v = rng.range(0.15, 0.35);
    const vals = [];
    for (let i = 0; i < k; i++) { vals.push(+v.toFixed(3)); v = clamp(v + rng.range(-0.16, 0.24), 0.08, 0.95); }
    return { vals, area: rng.chance(0.6) };
  },
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const vals = p.vals && p.vals.length ? p.vals : [0.2, 0.3, 0.25, 0.5, 0.45, 0.7];
    const K = vals.length;
    const io = env.inOut(0.4);
    const g = grid(env, divFor(env, K - 1, 0.55), 0.6, E.outCubic);
    const x0 = W * 0.08, x1 = W * 0.9;
    const cTop = H * (env.portrait ? 0.46 : 0.42), cBot = H * 0.84, cH = cBot - cTop;
    const pts = vals.map((v, i) => [x0 + (x1 - x0) * i / (K - 1), cBot - cH * v]);
    for (let k = 0; k <= 3; k++) {
      const y = cBot - cH * k / 3;
      env.line([[x0, y], [x0 + (x1 - x0) * io, y]], k ? sc.sub : sc.fg, k ? hair(env) : Math.max(1.5, u * 3), (k ? 0.3 : 1) * io, false, k ? [u * 4, u * 8] : null);
    }
    pts.forEach(([x], i) => lab(env, M.pad2(i + 1), x, cBot + lsz(env) * 1.1, { a: io * (i <= g.s + 0.5 ? 1 : 0.4), size: lsz(env) * 0.85 }));
    const prog = clamp(g.s / (K - 1)) * (1 - E.inCubic(env.pOut) * 0);
    const seg = Math.min(K - 2, Math.floor(g.s)), fr = clamp(g.s - seg);
    const head = g.s >= K - 1 ? pts[K - 1] : [lerp(pts[seg][0], pts[seg + 1][0], fr), lerp(pts[seg][1], pts[seg + 1][1], fr)];
    const drawn = pts.slice(0, Math.min(K, seg + 1)).concat(g.s >= K - 1 ? [] : [head]);
    if (p.area && drawn.length > 1 && io > 0.002) env.poly(drawn.concat([[head[0], cBot], [x0, cBot]]), L.rgba(sc.accent, 0.16 * io), 1);
    if (drawn.length > 1) env.line(drawn, sc.accent, Math.max(2, u * 5), io);
    for (let i = 0; i <= seg && i < K; i++) {
      const q = E.outBack(clamp((g.s - i) * 2.5), 2);
      env.circle(pts[i][0], pts[i][1], Math.max(2, u * 7) * q, sc.bg, sc.fg, Math.max(1.5, u * 3), io);
    }
    // 先頭の値タグ
    if (io > 0.01 && g.n > 0) {
      const vi = clamp((cBot - head[1]) / cH);
      const tx = Math.min(head[0], x1 - m * 0.05), ty = head[1] - m * 0.07;
      env.line([[head[0], head[1]], [head[0], cBot]], sc.accent, hair(env), 0.5 * io, false, [u * 3, u * 4]);
      env.circle(head[0], head[1], Math.max(3, u * 10) * (1 + g.kick * 0.4), sc.accent, null, 1, io);
      const tw = lsz(env) * 4.6, thh = lsz(env) * 1.7;
      env.rrect(tx - tw / 2, ty - thh / 2, tw, thh, thh * 0.2, sc.accent, io, false);
      lab(env, `+${(vi * 100).toFixed(1)}`, tx, ty, { a: io, color: sc.onInk });
    }
    void prog;
    const font = L.roleFont(env, 'display');
    const tH = cTop - H * 0.08 - lsz(env) * 3;
    const f = M.fitLines(env, cut.text, font, x1 - x0, tH, m * 0.18, env.portrait ? 3 : 2);
    const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: 0 }, x0);
    it.y = cTop - lsz(env) * 2.6 - L.itemBox(it).h / 2;
    lab(env, `TREND — ${K} POINTS`, x0, cTop - lsz(env) * 1.3, { align: 'left', a: io, track: 0.15 });
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 8. 語の横棒ランキング */
L.register('layout', 'n_hbar', {
  name: '語の横棒', tags: ['editorial', 'graphic', 'pop'], w: 1, fits: n => n >= 2 && n <= 28,
  plan: rng => ({ vals: Array.from({ length: 5 }, () => +rng.range(0.35, 1).toFixed(3)), role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const rows = rowsOf(cut.text, env.portrait ? 5 : 4);
    const R = rows.length;
    const vals = (p.vals || [1, 0.8, 0.6, 0.5, 0.4]).slice(0, R);
    const vmax = Math.max(...vals);
    const io = env.inOut(0.4);
    const g = grid(env, divFor(env, R), 0.6, E.outExpo);
    const font = L.roleFont(env, p.role || 'display');
    const x0 = W * 0.08, x1 = W * 0.92;
    const wd = wide(env);
    const ls = lsz(env);
    let bb = null;
    if (wd) {
      const labW = W * 0.4;
      const rowH = Math.min(H * 0.72 / R, m * 0.22);
      const s = stackSize(rows, font, labW - ls * 3, rowH * R, 1 / 0.62, { max: m * 0.14 });
      const y0 = H / 2 - rowH * R / 2;
      const bx = x0 + labW + m * 0.02, bmax = x1 - bx - ls * 3;
      rows.forEach((r, i) => {
        const cy = y0 + rowH * (i + 0.5);
        const q = clamp(g.s - i);
        lab(env, M.pad2(i + 1), x0, cy, { align: 'left', a: io, color: i === 0 ? sc.accent : sc.sub });
        const it = setRight({ text: r, font, size: s, y: cy, mi: i, delay: dly(env, g.at(i + 1), i) }, bx - m * 0.02);
        bb = L.unionBB(bb, L.mainDraw(env, withRise(it, E.outExpo(clamp(q * 1.6)))));
        const bw = bmax * vals[i] / vmax * E.outExpo(q) * (1 - E.inCubic(env.pOut));
        env.rect(bx, cy - s * 0.32, bmax * io, s * 0.64, dimOf(env), io * 0.6, false);
        if (bw > 0.5) env.rect(bx, cy - s * 0.32, bw, s * 0.64, i === 0 ? sc.accent : sc.fg, 1, false);
        if (q > 0.02) lab(env, String(Math.round(vals[i] / vmax * 100 * E.outExpo(q))), bx + bw + ls * 0.6, cy, { align: 'left', a: io, color: sc.fg });
      });
    } else {
      const rowH = Math.min(H * 0.7 / R, W * 0.3);
      const s = stackSize(rows, font, x1 - x0 - ls * 3, rowH * R * 0.55, 1, { max: m * 0.13 });
      const y0 = H / 2 - rowH * R / 2;
      const bmax = x1 - x0 - ls * 3;
      rows.forEach((r, i) => {
        const ty = y0 + rowH * i + s * 0.62, by = ty + s * 0.72;
        const q = clamp(g.s - i);
        const it = setLeft({ text: r, font, size: s, y: ty, mi: i, delay: dly(env, g.at(i + 1), i) }, x0 + ls * 2.2);
        lab(env, M.pad2(i + 1), x0, ty, { align: 'left', a: io, color: i === 0 ? sc.accent : sc.sub });
        bb = L.unionBB(bb, L.mainDraw(env, withRise(it, E.outExpo(clamp(q * 1.6)))));
        const bw = bmax * vals[i] / vmax * E.outExpo(q) * (1 - E.inCubic(env.pOut)), bh = Math.max(3, rowH * 0.12);
        env.rect(x0, by, bmax * io, bh, dimOf(env), io * 0.6, false);
        if (bw > 0.5) env.rect(x0, by, bw, bh, i === 0 ? sc.accent : sc.fg, 1, false);
        if (q > 0.02) lab(env, String(Math.round(vals[i] / vmax * 100 * E.outExpo(q))), x0 + bw + ls * 0.5, by + bh / 2, { align: 'left', a: io, size: ls * 0.85, color: sc.fg });
      });
    }
    return bb;
  },
}, P);

/* ================================================================ 9. ワッフルチャート */
L.register('layout', 'n_waffle', {
  name: 'ワッフル表', tags: ['graphic', 'editorial', 'pop'], w: 0.9, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ pct: rng.int(38, 92), nf: rng.int(0, 2), order: rng.pick(['rows', 'snake', 'cols']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const pct = p.pct || 64;
    const io = env.inOut(0.4);
    const B = 4;
    const g = grid(env, divFor(env, B, 0.45), 0.5, E.lin);
    const wd = wide(env);
    const side = wd ? Math.min(H * 0.62, W * 0.34) : Math.min(W * 0.58, H * (env.portrait ? 0.32 : 0.4));
    const gx = wd ? W * 0.08 : W / 2 - side / 2, gy = wd ? H / 2 - side / 2 : H * (env.portrait ? 0.14 : 0.08);
    const cell = side / 10, gap = cell * 0.14;
    const filled = pct * clamp(g.s / B);
    const out = 1 - E.inCubic(env.pOut);
    for (let k = 0; k < 100; k++) {
      let r, c;
      if (p.order === 'cols') { c = Math.floor(k / 10); r = 9 - (k % 10); }
      else { r = 9 - Math.floor(k / 10); c = k % 10; if (p.order === 'snake' && Math.floor(k / 10) % 2) c = 9 - c; }
      const x = gx + c * cell + gap / 2, y = gy + r * cell + gap / 2, s = cell - gap;
      const intro = clamp(io * 1.8 - (r + c) * 0.045);
      if (intro <= 0.002) continue;
      const q = clamp((filled - k) * 1.2);
      if (q > 0.001) {
        const sz = s * E.outBack(q, 2) * out;
        env.rect(x + (s - sz) / 2, y + (s - sz) / 2, sz, sz, k === Math.ceil(filled) - 1 ? sc.accent : sc.fg, 1, false);
      } else env.rect(x + s * 0.3, y + s * 0.3, s * 0.4 * intro, s * 0.4 * intro, sc.sub, 0.5 * io, false);
    }
    const { font: nfont, weight: nw } = numF(p);
    const str = String(Math.round(filled)).padStart(2, '0');
    const ns = wd ? side * 0.34 : side * 0.3;
    const nx = wd ? gx + side + W * 0.05 : gx;
    const ny = wd ? gy + ns * 0.45 : gy + side + ns * 0.6;
    if (io > 0.002) {
      const w = digitRow(env, str, { font: nfont, weight: nw, size: ns, x: nx, y: ny, alpha: io, sy: 1 + g.kick * 0.04, color: sc.fg });
      lab(env, '%', nx + w + ns * 0.05, ny - ns * 0.2, { align: 'left', size: ns * 0.32, a: io, color: sc.accent });
      lab(env, wd ? `PER 100 — ${pct} TARGET` : 'PER 100', wd ? nx : gx + side, wd ? ny + ns * 0.55 : ny + ns * 0.18, { align: wd ? 'left' : 'right', a: io, track: 0.15 });
    }
    const font = L.roleFont(env, 'display');
    if (wd) {
      const f = M.fitLines(env, cut.text, font, W - nx - W * 0.07, H * 0.34, m * 0.18, 3);
      const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: 0 }, nx);
      it.y = gy + side - L.itemBox(it).h / 2;
      return L.mainDraw(env, it);
    }
    const top = ny + ns * 0.55;
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * 0.93 - top, m * 0.18, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: 0 };
    it.y = top + (H * 0.93 - top) / 2;
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 10. 統計カード */
L.register('layout', 'n_stats', {
  name: '統計カード', tags: ['editorial', 'cyber', 'graphic'], w: 0.9, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ nf: rng.int(0, 2), cards: [0, 1, 2].map(() => ({ v: rng.int(12, 980), d: rng.int(-24, 48), sp: Array.from({ length: 7 }, () => +rng().toFixed(3)) })) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const cards = p.cards || [{ v: 120, d: 12, sp: [0.2, 0.5, 0.3, 0.8, 0.6, 0.7, 0.9] }];
    const io = env.inOut(0.4);
    const g = grid(env, divFor(env, 3, 0.45), 0.6, E.outExpo);
    const col = !env.portrait;
    const x0 = W * 0.07, tw = W * 0.86;
    const ls = lsz(env);
    const cH = col ? H * 0.3 : H * 0.14;
    const gap = m * 0.025;
    const cW = col ? (tw - gap * 2) / 3 : tw;
    const cTop = col ? H * 0.58 : H * 0.44;
    const { font: nfont, weight: nw } = numF(p);
    cards.slice(0, 3).forEach((cd, i) => {
      const q = clamp(g.s - i);
      const k = E.outExpo(clamp(q * 1.5)) * io;
      if (k <= 0.002) return;
      const x = col ? x0 + i * (cW + gap) : x0, y = col ? cTop : cTop + i * (cH + gap);
      const dy = (1 - k) * cH * 0.3;
      env.rrect(x, y + dy, cW, cH, m * 0.012, L.rgba(sc.fg, sc.dark ? 0.07 : 0.05), k, false, L.rgba(sc.fg, 0.3), hair(env));
      env.rect(x, y + dy, cW * k, Math.max(2, u * 4), i === 0 ? sc.accent : sc.fg, k, false);
      const pad = Math.min(cW, cH) * 0.1;
      lab(env, (cW > m * 0.42 ? 'METRIC ' : '') + String.fromCharCode(65 + i), x + pad, y + dy + pad + ls * 0.5, { align: 'left', a: k, size: ls * 0.85, track: 0.2 });
      const val = Math.round(cd.v * E.outCubic(q));
      const ns = Math.min(cH * (col ? 0.36 : 0.52), cW * 0.26);
      digitRow(env, String(val).padStart(3, '0'), { font: nfont, weight: nw, size: ns, x: x + pad, y: y + dy + cH * (col ? 0.5 : 0.58), alpha: k, colorAt: (j, ch) => (lead0(String(val).padStart(3, '0'), j) ? dimOf(env) : sc.fg) });
      lab(env, `${cd.d >= 0 ? '+' : '−'}${Math.abs(cd.d)}%`, x + cW - pad, y + dy + pad + ls * 0.5, { align: 'right', a: k, size: ls * 0.85, color: cd.d >= 0 ? sc.accent : sc.sub });
      // 小さな推移線(描き起こし)
      const sp = cd.sp || [];
      const sx0 = col ? x + pad : x + cW * 0.5, sx1 = x + cW - pad;
      const sy0 = col ? y + dy + cH * 0.9 : y + dy + cH * 0.82, sh = col ? cH * 0.2 : cH * 0.5;
      const pts = sp.map((v, j) => [lerp(sx0, sx1, j / Math.max(1, sp.length - 1)), sy0 - v * sh]);
      if (pts.length > 1) env.polyPartial(pts, E.outCubic(clamp(q * 1.2)), i === 0 ? sc.accent : sc.fg, Math.max(1.5, u * 3), k);
    });
    const font = L.roleFont(env, 'display');
    const top = H * 0.07 + ls * 2, bot = cTop - m * 0.05;
    lab(env, 'OVERVIEW / REEL STATS', x0, H * 0.07 + ls * 0.5, { align: 'left', a: io, track: 0.2, color: sc.accent });
    const f = M.fitLines(env, cut.text, font, tw, bot - top, m * 0.2, 3);
    const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: 0 }, x0);
    it.y = bot - L.itemBox(it).h / 2;
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 11. 語の積み上げ */
L.register('layout', 'n_wordstack', {
  name: '語の積み上げ', tags: ['editorial', 'graphic', 'pop'], w: 1.1, emph: 1.2, fits: n => n >= 2 && n <= 30,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), alt: rng.chance(0.5), right: rng.chance(0.25) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const rows = rowsOf(cut.text, env.portrait ? 6 : 4);
    const R = rows.length;
    const io = env.inOut(0.35);
    const g = grid(env, divFor(env, R), 0.5, E.outExpo);
    const font = L.roleFont(env, p.role || 'display');
    const ls = lsz(env);
    const x0 = W * (env.portrait ? 0.08 : 0.1) + (p.right ? 0 : ls * 3), x1 = W * 0.93 - (p.right ? ls * 3.4 : 0);
    const lead = 1.22;
    const s = stackSize(rows, font, x1 - x0, H * 0.78, lead, { max: m * 0.3 });
    const pitch = s * lead, tot = pitch * R;
    const y0 = H / 2 - tot / 2;
    // 左の縦の進捗線(着地した行まで伸びる)
    const barX = p.right ? x1 + ls * 1.2 : x0 - ls * 3.2;
    const reach = clamp(g.s / R);
    env.rect(barX - Math.max(1, u * 1.5), y0, Math.max(2, u * 3), tot * io, sc.sub, 0.35, false);
    env.rect(barX - Math.max(1.5, u * 3), y0, Math.max(3, u * 6), tot * reach * (1 - E.inCubic(env.pOut)), sc.accent, 1, false);
    let bb = null;
    rows.forEach((r, i) => {
      const cy = y0 + pitch * (i + 0.5);
      const q = clamp(g.s - i);
      const ln = E.outExpo(clamp(q * 1.3)) * io;
      if (i > 0) env.line([[x0, cy - pitch / 2], [x0 + (x1 - x0) * ln, cy - pitch / 2]], sc.sub, hair(env), 0.5 * io);
      lab(env, M.pad2(i + 1), p.right ? barX + ls * 0.9 : barX + ls * 1.2, cy - s * 0.3, { align: 'left', a: io * (q > 0 ? 1 : 0.35), color: q > 0 ? sc.accent : sc.sub, size: ls * 0.9 });
      const it = { text: r, font, size: s, y: cy, mi: i, delay: dly(env, g.at(i + 1), i), color: p.alt && i % 2 ? sc.accent : sc.fg };
      if (p.right) setRight(it, x1); else setLeft(it, x0);
      bb = L.unionBB(bb, L.mainDraw(env, withRise(it, E.outExpo(clamp(q * 1.25)))));
    });
    return bb;
  },
}, P);

/* ================================================================ 12. 巨大輪郭語 */
L.register('layout', 'n_outlinecut', {
  name: '輪郭を貫く', tags: ['graphic', 'dark', 'editorial'], w: 1, emph: 1.4, fits: n => n >= 1 && n <= 20,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), vert: rng.chance(0.25) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.6);
    const g = grid(env, 1, 0.55, E.inOutExpo);
    const font = L.roleFont(env, p.role || 'display');
    const ch = L.chunks(cut.text);
    const big = (ch[0] && L.glyphCount(ch[0]) >= 1 ? ch[0] : cut.text);
    const bs = H * (env.portrait ? 0.34 : 0.7);
    const bit = { text: big, font, size: bs, x: W / 2, y: H / 2 };
    const bw = mw(bit);
    const range = Math.max(0, bw - W * 0.9);
    // 拍ごとに左端揃え↔右端揃えへ跳ぶ(収まる時は少しずつ横ずれ)
    const k = g.n, e = g.e;
    const posOf = j => (range > W * 0.05 ? (j % 2 ? -range / 2 : range / 2) : (j % 2 ? -1 : 1) * W * 0.04);
    const bx = W / 2 + lerp(posOf(Math.max(0, k - 1)), posOf(k), k ? e : 0);
    if (io > 0.002) {
      env.text(Object.assign({}, bit, { x: bx, fill: false, stroke: Math.max(1.5, bs * 0.012), strokeColor: sc.accent, color: sc.accent, strokeUnder: false, alpha: io * 0.9, ghost: false, dash: io, sy: 1 + g.kick * 0.015 }));
    }
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * (env.portrait ? 0.22 : 0.26), m * 0.2, 2);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const lb = L.itemBox(it);
    // 歌詞の上下に地色の帯(輪郭線を歌詞の後ろで切る)
    const bandH = lb.h + m * 0.04;
    const bwid = W * E.outExpo(io);
    env.rect(W / 2 - bwid / 2, H / 2 - bandH / 2, bwid, bandH, sc.bg, 0.92, false);
    env.rect(W / 2 - bwid / 2, H / 2 - bandH / 2, bwid, Math.max(1, u * 2), sc.fg, io, false);
    env.rect(W / 2 - bwid / 2, H / 2 + bandH / 2 - Math.max(1, u * 2), bwid, Math.max(1, u * 2), sc.fg, io, false);
    lab(env, `${M.pad2(k)}`, W * 0.05, H / 2 - bandH / 2 - lsz(env) * 1.1, { align: 'left', a: io, color: sc.accent });
    return L.mainDraw(env, it) || lb;
  },
}, P);

/* ================================================================ 13. 一拍一語 */
L.register('layout', 'n_onebeat', {
  name: '一拍一語', tags: ['pop', 'graphic', 'editorial'], w: 1, emph: 1.3, fits: n => n >= 3 && n <= 30, minDur: 1.2,
  plan: rng => ({ role: rng.pick(['display', 'display', 'body']), steps: rng.pick([8, 16]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const len = M.beatLen(env);
    const div = len / 2 >= 0.34 ? 2 : 1;
    const maxK = Math.max(1, Math.floor(cut.dur * 0.5 / (len / div)));
    let words = rowsOf(cut.text, Math.min(maxK, 6));
    if (words.length < 2) words = [];
    const K = words.length;
    const g = grid(env, div, 0.4, E.outExpo);
    const io = env.inOut(0.3);
    const font = L.roleFont(env, p.role || 'display');
    let bb = null;
    const final = K ? g.at(K + 1) : 0;
    // 1語ずつ同じ場所に(次の拍で消える)
    words.forEach((w, i) => {
      if (g.n < i + 1 || g.n > i + 1) return;
      const s = Math.min(L.fitSize(w, font, W * 0.84, H * 0.42), m * 0.4);
      const pop = 1.12 - 0.12 * g.e;
      const it = { text: w, font, size: s, x: W / 2, y: H * 0.46, sx: pop, sy: pop, mi: 0, delay: Math.max(0, g.at(i + 1) - (i ? cut.inDur * 0.85 : 0)), noHold: true };
      bb = L.unionBB(bb, L.mainDraw(env, it));
    });
    // 最後に行全体
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * (env.portrait ? 0.3 : 0.36), m * 0.22, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * 0.46, delay: dly(env, final) };
    if (!K || env.lt >= final - 0.05) bb = L.unionBB(bb, L.mainDraw(env, withRise(it, E.outExpo(clamp((env.lt - final) / (g.len * 0.5))))));
    // ステップシーケンサー
    const N = p.steps || 16;
    const sx0 = W * 0.1, sw = W * 0.8, cellW = sw / N, sy = H * (env.portrait ? 0.8 : 0.84), ch = Math.min(cellW * 0.7, m * 0.05);
    const cur = g.n > 0 ? (g.n - 1) % N : -1;
    for (let i = 0; i < N; i++) {
      const k = clamp(io * 2 - i * 0.04);
      if (k <= 0.002) continue;
      const on = i === cur, past = g.n > 0 && i < cur;
      const lit = on ? 1 - 0.4 * g.e : 0;
      const x = sx0 + i * cellW + cellW * 0.12, w = cellW * 0.76;
      const ww = w * k;
      env.rect(x + (w - ww) / 2, sy - ch / 2, ww, ch, on ? sc.accent : past ? sc.fg : sc.sub, on ? 0.6 + 0.4 * lit : past ? 0.55 : 0.25, false);
      if (i % 4 === 0) env.rect(x, sy + ch * 0.75, w, Math.max(1, u * 2), sc.sub, 0.6 * k, false);
    }
    lab(env, `STEP ${M.pad2(Math.max(0, cur) + 1)}/${M.pad2(N)}`, sx0, sy - ch / 2 - lsz(env) * 1.2, { align: 'left', a: io, track: 0.15 });
    lab(env, K ? `${M.pad2(Math.min(g.n, K))}/${M.pad2(K)} WORDS` : 'PHRASE', sx0 + sw, sy - ch / 2 - lsz(env) * 1.2, { align: 'right', a: io, color: g.n > K ? sc.accent : sc.sub });
    return bb;
  },
}, P);

/* ================================================================ 14. 動くマスク帯 */
L.register('layout', 'n_maskbar', {
  name: 'マスク帯', tags: ['graphic', 'pop', 'editorial'], w: 1, emph: 1.2, treat: false, fits: n => n >= 1 && n <= 20,
  plan: rng => ({ role: rng.pick(['display', 'body']), stops: rng.pick([[0.18, 0.82, 0.5], [0.82, 0.18, 0.5], [0.3, 0.7, 0.15, 0.85]]), col: rng.pick(['accent', 'fg']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.35);
    const stops = p.stops || [0.2, 0.8, 0.5];
    const S = stops.length;
    const g = grid(env, 1, 0.55, E.inOutExpo);
    const font = L.roleFont(env, p.role || 'display');
    const f = M.fitLines(env, cut.text, font, W * 0.84, H * (env.portrait ? 0.3 : 0.36), m * 0.26, 3);
    const base = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const lb = L.itemBox(base);
    const plate = p.col === 'fg' ? sc.fg : sc.accent;
    const onPlate = p.col === 'fg' ? sc.bg : sc.onInk;
    const pad = m * 0.025;
    const bx0 = lb.x0 - pad, bx1 = lb.x1 + pad, tw = bx1 - bx0;
    const barW0 = Math.max(tw * 0.26, m * 0.12);
    // 位置: 拍ごとに次の止まりへ。最後は全体を覆う
    const k = g.n;
    const posAt = j => (j <= 0 ? -0.2 : j <= S ? stops[j - 1] : 0.5);
    const wAt = j => (j > S ? tw : barW0);
    const c = lerp(posAt(k - 1), posAt(k), k ? g.e : 0);
    const bw = lerp(wAt(k - 1), wAt(k), k ? g.e : 0) * E.outCubic(io);
    const bh = (lb.h + pad * 1.6) * (0.3 + 0.7 * E.outExpo(io));
    const cx = bx0 + c * tw;
    const X0 = cx - bw / 2, X1 = cx + bw / 2, Y0 = H / 2 - bh / 2, Y1 = H / 2 + bh / 2;
    env.rect(X0, Y0, bw, bh, plate, 1, true);
    // 下の目盛りと位置
    const ty = lb.y1 + pad * 2.2;
    const rx0 = Math.min(bx0, W * 0.2), rx1 = Math.max(bx1, W * 0.8);
    env.rect(rx0, ty, (rx1 - rx0) * io, Math.max(1, u * 2), sc.sub, 0.5, false);
    env.rect(cx - Math.max(1.5, u * 3), ty - u * 8, Math.max(3, u * 6), u * 18, plate, io, false);
    lab(env, `X ${(clamp(c) * 100).toFixed(0).padStart(3, '0')}`, rx1, ty + lsz(env) * 1.3, { align: 'right', a: io });
    lab(env, k > S ? 'FULL' : `MASK ${M.pad2(k)}/${M.pad2(S)}`, rx0, ty + lsz(env) * 1.3, { align: 'left', a: io, color: k > S ? plate : sc.sub, track: 0.15 });
    const toLocal = (it2) => { const sx = it2.sx == null ? 1 : it2.sx, sy = it2.sy == null ? 1 : it2.sy; return [(X0 - it2.x) / sx, (X1 - it2.x) / sx, (Y0 - it2.y) / sy, (Y1 - it2.y) / sy]; };
    const outer = Object.assign({}, base, {
      clipFn: (ctx, e2, it2) => {
        const [a, b, c2, d] = toLocal(it2), BIG = 1e5;
        ctx.rect(-BIG, -BIG, BIG * 2, BIG * 2);
        ctx.moveTo(a, c2); ctx.lineTo(a, d); ctx.lineTo(b, d); ctx.lineTo(b, c2); ctx.closePath();
      },
    });
    const inner = Object.assign({}, base, { color: onPlate, clipFn: (ctx, e2, it2) => { const [a, b, c2, d] = toLocal(it2); ctx.rect(a, c2, Math.max(0, b - a), Math.max(0, d - c2)); } });
    const b1 = L.mainDraw(env, outer);
    const b2 = bw > 0.5 ? L.mainDraw(env, inner) : null;
    return L.unionBB(b1, b2) || lb;
  },
}, P);

/* ================================================================ 15. 文字サイズの階段 */
L.register('layout', 'n_ladder', {
  name: 'サイズ階段', tags: ['editorial', 'graphic', 'calm'], w: 0.9, fits: n => n >= 1 && n <= 14,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), asc: rng.chance(0.35), r: rng.pick([0.62, 0.66, 0.7]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.35);
    const r = p.r || 0.62;
    const font = L.roleFont(env, p.role || 'display');
    const ls = lsz(env);
    const x0 = W * 0.08, x1 = W * 0.92 - ls * 4.5;
    const text = !wide(env) && cut.n > 6 ? L.splitLines(cut.text, Math.ceil(cut.n / 2)).join('\n') : cut.text;
    const h1 = L.measure({ text, font, size: 100 }).h / 100, w1 = L.measure({ text, font, size: 100 }).w / 100;
    let N = 5;
    while (N > 2 && m * 0.3 * Math.pow(r, N - 1) < m * 0.028) N--;
    const sumR = (1 - Math.pow(r, N)) / (1 - r);
    const s0 = Math.min((x1 - x0) / w1, H * 0.84 / (h1 * sumR * 1.08), m * 0.34);
    const sizes = Array.from({ length: N }, (_, i) => s0 * Math.pow(r, i));
    const order = p.asc ? sizes.slice().reverse() : sizes;
    const tot = order.reduce((a, s) => a + s * h1 * 1.08, 0);
    const g = grid(env, divFor(env, N), 0.5, E.outExpo);
    let y = H / 2 - tot / 2, bb = null;
    order.forEach((s, j) => {
      const hh = s * h1 * 1.08, cy = y + hh / 2;
      y += hh;
      const main = s === s0;
      const rank = p.asc ? N - 1 - j : j;                 // 本体(最大)の行から順に
      const q = clamp(g.s - rank);
      const e = E.outExpo(clamp(q * 1.3));
      const it = setLeft({ text, font, size: s, y: cy, align: 'left' }, x0);
      env.line([[x0, cy + hh * 0.46], [x0 + (x1 - x0 + ls * 4.5) * e * io, cy + hh * 0.46]], main ? sc.fg : sc.sub, hair(env), (main ? 0.8 : 0.4) * io);
      lab(env, `${Math.round(s / env.u)}`, W * 0.92, cy + hh * 0.46 - ls * 0.8, { align: 'right', a: io * clamp(q * 3), color: main ? sc.accent : sc.sub, size: ls * 0.9 });
      if (main) {
        it.mi = 0; it.delay = dly(env, g.at(rank + 1));
        bb = L.unionBB(bb, L.mainDraw(env, withRise(it, e)));
      } else if (q > 0) {
        const a = io * (0.35 + 0.5 * (s / s0));
        env.text(withRise(Object.assign(it, { color: sc.fg, alpha: a, ghost: false, weight: 900 }), e));
      }
    });
    lab(env, 'TYPE SCALE ×' + r.toFixed(2), x0, H / 2 - tot / 2 - ls * 1.2, { align: 'left', a: io, track: 0.15, color: sc.accent });
    return bb;
  },
}, P);

/* ================================================================ 16. 縦の色柱 */
L.register('layout', 'n_columns', {
  name: '縦の色柱', tags: ['graphic', 'pop', 'editorial'], w: 0.9, emph: 1.2, treat: 'safe', portrait: 1.3, fits: n => n >= 2 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), pat: rng.pick([['accent', 'fg', 'none'], ['fg', 'accent', 'fg'], ['none', 'accent', 'none']]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const latin = !!joinerOf(cut.text);
    const cols = rowsOf(cut.text, env.portrait ? 4 : 5);
    const K = cols.length;
    const io = env.inOut(0.3);
    const g = grid(env, divFor(env, K), 0.6, E.outExpo);
    const font = L.roleFont(env, p.role || 'display');
    const span = W * (env.portrait ? 0.88 : Math.min(0.88, 0.2 * K + 0.1));
    const cw = span / K, x0 = W / 2 - span / 2;
    const colH = H * 0.86, yTop = H * 0.07;
    // 縦書き(和文)/90°回転(欧文)で柱に収める共通サイズ
    let s = 1e9;
    for (const c of cols) {
      if (latin) s = Math.min(s, L.fitSize(c, font, colH * 0.84, cw * 0.62));
      else s = Math.min(s, L.fitSize(c, font, cw * 0.62, colH * 0.84, { vertical: true, lead: 1 }));
    }
    s = Math.min(s, m * 0.3);
    const pat = p.pat || ['accent', 'fg', 'none'];
    let bb = null;
    cols.forEach((c, i) => {
      const kind = pat[i % pat.length];
      const q = E.outExpo(clamp(g.s - i));
      const fromTop = i % 2 === 0;
      const x = x0 + cw * i;
      const hh = colH * q * (1 - E.inCubic(env.pOut));
      const y = fromTop ? yTop : yTop + colH - hh;
      const fill = kind === 'accent' ? sc.accent : kind === 'fg' ? sc.fg : null;
      if (fill && hh > 0.5) env.rect(x + cw * 0.04, y, cw * 0.92, hh, fill, 1, true);
      if (!fill) env.line([[x + cw * 0.04, y], [x + cw * 0.04, y + hh]], sc.sub, hair(env), 0.6 * io);
      lab(env, M.pad2(i + 1), x + cw / 2, fromTop ? yTop + colH + lsz(env) * 1.1 : yTop - lsz(env) * 1.1, { a: io * clamp(q * 2), color: sc.sub });
      const color = kind === 'accent' ? sc.onInk : kind === 'fg' ? sc.bg : sc.fg;
      const it = latin ? { text: c, font, size: s, x: x + cw / 2, y: H / 2, rot: -Math.PI / 2 } : { text: c, font, size: s, x: x + cw / 2, y: H / 2, vertical: true, lead: 1 };
      Object.assign(it, { color, mi: i, delay: dly(env, g.at(i + 1), i), clipY: fromTop ? [0, clamp(q * 1.05)] : [1 - clamp(q * 1.05), 1] });
      if (latin) { delete it.clipY; it.clip = fromTop ? [1 - clamp(q * 1.05), 1] : [0, clamp(q * 1.05)]; }
      if (q > 0.001) bb = L.unionBB(bb, L.mainDraw(env, it));
    });
    return bb;
  },
}, P);

/* ================================================================ 17. 拍ルーラー */
L.register('layout', 'n_ruler', {
  name: '拍ルーラー', tags: ['cyber', 'editorial', 'graphic'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'body']), sub: rng.pick([4, 4, 2]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.45);
    const g = grid(env, 1, 0.45, E.outExpo);
    const unit = W * (env.portrait ? 0.24 : 0.13);
    const ry = H * (env.portrait ? 0.62 : 0.66);
    const base = env.beat ? env.beat.index - (g.n - 1) : 0;    // 曲の拍番号(BPM が無ければカット内の拍)
    const pos = base - 1 + g.s;
    const half = W / 2 * E.outExpo(io);
    const ls = lsz(env);
    env.rect(W / 2 - half, ry, half * 2, Math.max(1.5, u * 3), sc.fg, io, false);
    const sub = p.sub || 4;
    const j0 = Math.floor(pos - W / 2 / unit) - 1, j1 = Math.ceil(pos + W / 2 / unit) + 1;
    for (let j = j0; j <= j1; j++) {
      for (let s = 0; s < sub; s++) {
        const x = W / 2 + (j + s / sub - pos) * unit;
        if (Math.abs(x - W / 2) > half) continue;
        const major = s === 0;
        const th = major ? m * 0.05 : m * 0.02;
        env.rect(x - Math.max(0.5, u), ry - th, Math.max(1, u * 2), th, sc.fg, (major ? 0.9 : 0.45) * io, false);
        if (major && j >= 0) {
          const d = Math.abs(j - pos);
          const hl = clamp(1 - d * 2);
          lab(env, pad3(j + 1), x, ry + ls * 1.4 + hl * ls * 0.3, { a: io * (0.45 + 0.55 * hl), color: hl > 0.5 ? sc.accent : sc.sub, size: ls * (1 + 0.35 * hl) });
        }
      }
    }
    // 再生ヘッド
    const ph = m * 0.12 * (1 + g.kick * 0.08);
    env.rect(W / 2 - Math.max(1, u * 1.5), ry - ph, Math.max(2, u * 3), ph + m * 0.02, sc.accent, io, false);
    const tri = m * 0.022;
    env.poly([[W / 2 - tri, ry - ph - tri * 1.4], [W / 2 + tri, ry - ph - tri * 1.4], [W / 2, ry - ph]], sc.accent, io);
    lab(env, env.bpm ? `${Math.round(env.bpm)} BPM` : 'FREE', W * 0.06, ry + ls * 4, { align: 'left', a: io, track: 0.15 });
    lab(env, `BEAT ${pad3(Math.max(0, base + g.n - 1) + 1)}${env.totalBeats ? ' / ' + pad3(env.totalBeats) : ''}`, W * 0.94, ry + ls * 4, { align: 'right', a: io, color: sc.fg });
    const font = L.roleFont(env, p.role || 'display');
    const top = H * 0.08, bot = ry - ph - tri * 2 - m * 0.03;
    const f = M.fitLines(env, cut.text, font, W * 0.86, bot - top, m * 0.24, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: 0 };
    it.y = bot - L.itemBox(it).h / 2;
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 18. グリッド点灯 */
L.register('layout', 'n_gridlight', {
  name: 'グリッド点灯', tags: ['graphic', 'cyber', 'pop'], w: 1, emph: 1.3, busy: true, treat: 'safe', fits: n => n >= 1 && n <= 20,
  plan: rng => ({ corner: rng.int(0, 3), role: rng.pick(['display', 'body']), col: rng.pick(['accent', 'fg']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.5);
    const g = grid(env, 1, 0.5, E.outCubic);
    const C = env.portrait ? 6 : W / H < 1.2 ? 7 : 12;
    const cs = W / C, R = Math.ceil(H / cs) + 1;
    const oy = (H - R * cs) / 2;
    const font = L.roleFont(env, p.role || 'display');
    const f = M.fitLines(env, cut.text, font, W * 0.72, H * (env.portrait ? 0.26 : 0.3), m * 0.22, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const lb = L.itemBox(it);
    const c0 = Math.max(0, Math.floor((lb.x0 - m * 0.02) / cs)), c1 = Math.min(C - 1, Math.floor((lb.x1 + m * 0.02) / cs));
    const r0 = Math.max(0, Math.floor((lb.y0 - m * 0.02 - oy) / cs)), r1 = Math.min(R - 1, Math.floor((lb.y1 + m * 0.02 - oy) / cs));
    const plate = p.col === 'fg' ? sc.fg : sc.accent, onPlate = p.col === 'fg' ? sc.bg : sc.onInk;
    // 格子線
    const gl = E.outCubic(io);
    for (let c = 1; c < C; c++) env.line([[c * cs, H / 2 - H / 2 * gl], [c * cs, H / 2 + H / 2 * gl]], sc.sub, hair(env), 0.3 * io);
    for (let r = 0; r <= R; r++) env.line([[W / 2 - W / 2 * gl, oy + r * cs], [W / 2 + W / 2 * gl, oy + r * cs]], sc.sub, hair(env), 0.3 * io);
    const corner = p.corner || 0, cxr = corner % 2 ? C - 1 : 0, cyr = corner > 1 ? R - 1 : 0;
    const maxD = C + R;
    const bcx = (c0 + c1) / 2, bcy = (r0 + r1) / 2, bMax = Math.max(1, Math.hypot(c1 - c0, r1 - r0) / 2 + 0.5);
    const out = 1 - E.inCubic(env.pOut);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const x = c * cs, y = oy + r * cs;
      const inB = c >= c0 && c <= c1 && r >= r0 && r <= r1;
      if (inB) {
        // 中央ブロック: 1拍目から中心→外へ並んで点く(残る)
        const d = Math.hypot(c - bcx, r - bcy) / bMax;
        const q = E.outBack(clamp((g.s - d * 0.8) * 1.8), 1.4) * out;
        if (q > 0.002) { const s = cs * Math.min(1, q); env.rect(x + (cs - s) / 2, y + (cs - s) / 2, s, s, plate, 1, true); }
      } else if (g.n > 0) {
        // 拍ごとに隅から波が走る(柔らかく減衰)
        // 拍ごとに隅から斜めの波が走り、通った升に小さな四角が弾む
        const d = (Math.abs(c - cxr) + Math.abs(r - cyr)) / maxD;
        const w = g.since / g.len * 1.4 - d;
        const a = w > 0 ? Math.exp(-w * 7) * clamp(w * 20) : 0;
        if (a > 0.03) { const s = cs * 0.42 * a; env.rect(x + (cs - s) / 2, y + (cs - s) / 2, s, s, (c * 3 + r + g.n) % 4 === 0 ? sc.accent : sc.fg, 0.75 * io, false); }
      }
    }
    lab(env, `GRID ${C}×${R}`, W * 0.05, oy + cs * 0.5, { align: 'left', a: io, color: sc.sub });
    lab(env, `CELL ${M.pad2(c1 - c0 + 1)}×${M.pad2(r1 - r0 + 1)}`, W * 0.95, oy + (R - 0.5) * cs, { align: 'right', a: io });
    return L.mainDraw(env, Object.assign(it, { color: onPlate, delay: dly(env, g.at(1) + g.len * 0.3) })) || lb;
  },
}, P);

/* ================================================================ 19. 文字タイル */
L.register('layout', 'n_tiles', {
  name: '文字タイル', tags: ['pop', 'graphic', 'editorial'], w: 1, emph: 1.2, treat: 'safe', fits: n => n >= 2 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), seed: rng.int(1, 9999), acc: rng.range(0.25, 0.4) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.35);
    // 行ごとの字の並び(欧文は語ごとに改行)
    let rows;
    if (joinerOf(cut.text)) {
      const words = cut.text.trim().split(/\s+/);
      const maxC = Math.max(env.portrait ? 5 : W / H < 1.2 ? 6 : 9, Math.min(8, words.reduce((m2, w) => Math.max(m2, L.glyphs(w).length), 1)));
      rows = [];
      for (const w of words) { const gs = L.glyphs(w); for (let i = 0; i < gs.length; i += maxC) rows.push(gs.slice(i, i + maxC)); }
    } else {
      const gs = L.glyphs(cut.text.replace(/\s+/g, ''));
      const N0 = gs.length;
      const maxC = env.portrait ? 4 : W / H < 1.2 ? 5 : 8;
      const C0 = Math.min(N0, Math.max(Math.ceil(Math.sqrt(N0 * (env.portrait ? 0.6 : 1.6))), Math.ceil(N0 / 4)), maxC);
      rows = [];
      for (let i = 0; i < N0; i += C0) rows.push(gs.slice(i, i + C0));
    }
    const C = rows.reduce((a, r) => Math.max(a, r.length), 1), Rr = rows.length;
    const N = rows.reduce((a, r) => a + r.length, 0);
    const T = Math.min(W * 0.86 / C, H * 0.78 / Rr, m * 0.3);
    const gap = T * 0.08;
    const x0 = W / 2 - T * C / 2, y0 = H / 2 - T * Rr / 2;
    const B = Math.min(4, Rr + 1);
    const g = grid(env, divFor(env, B), 0.5, E.outBack);
    const font = L.roleFont(env, p.role || 'display');
    const seed = p.seed || 1;
    const per = Math.max(1, Math.ceil(N / B));
    let bb = null, i = 0;
    rows.forEach((row, r) => {
      row.forEach((ch, c) => {
        const x = x0 + T * (c + (C - row.length) / 2) + T / 2, y = y0 + T * r + T / 2;
        // 拍ごとに1群ずつ裏返って出る
        const grp = Math.floor(i / per);
        const tIn = g.at(grp + 1) + (i % per) * Math.min(0.035, g.len * 0.5 / per);
        const q = clamp((env.lt - tIn) / (g.len * 0.5));
        const flip = E.outBack(q, 1.6) * (1 - E.inCubic(env.pOut));
        let kind = L.r(seed, i) < (p.acc || 0.3) ? 'a' : L.r(seed, 'o', i) < 0.35 ? 'o' : 'f';
        // 出そろった後は拍ごとにアクセントの1枚が移る
        if (g.n > B && ((g.n - B) % N) === i % N) kind = 'a';
        const fill = kind === 'a' ? sc.accent : kind === 'f' ? sc.fg : null;
        const col = kind === 'a' ? sc.onInk : kind === 'f' ? sc.bg : sc.fg;
        const sq = T - gap, sw = sq * Math.max(0, flip);
        if (sw > 0.5) {
          if (fill) env.rect(x - sw / 2, y - sq / 2, sw, sq, fill, io, true);
          else env.rrect(x - sw / 2, y - sq / 2, sw, sq, 0, null, io, false, sc.fg, Math.max(1.5, u * 3));
        }
        lab(env, M.pad2(i + 1), x - sq / 2 + T * 0.1, y - sq / 2 + T * 0.1, { align: 'left', size: Math.max(6, T * 0.1), a: io * clamp(q * 2) * 0.8, color: fill ? col : sc.sub, track: 0 });
        const it = { text: ch, font, size: T * 0.6, x, y, color: col, mi: grp, delay: dly(env, tIn, grp), sx: Math.max(0.001, clamp(flip * 1.2)) };
        if (q > 0) bb = L.unionBB(bb, L.mainDraw(env, it));
        i++;
      });
    });
    return bb;
  },
}, P);

/* ================================================================ 20. ドット組版 */
const dotCache = new Map();
const dotCells = (it, per) => {
  const key = [it.text, it.font, per].join('|');
  let d = dotCache.get(key);
  if (d) return d;
  const pts = M.glyphPoints(it, 6000);
  const c1 = 1 / per, cnt = new Map();
  for (const [x, y] of pts) { const k = Math.round(x / c1) + ',' + Math.round(y / c1); cnt.set(k, (cnt.get(k) || 0) + 1); }
  let mx = 0; for (const v of cnt.values()) mx = Math.max(mx, v);
  const cells = [];
  let minX = 1e9, maxX = -1e9;
  for (const [k, v] of cnt) if (v >= mx * 0.33) { const [a, b] = k.split(',').map(Number); cells.push([a * c1, b * c1]); minX = Math.min(minX, a * c1); maxX = Math.max(maxX, a * c1); }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  d = { cells, minX, maxX, c1 };
  if (dotCache.size > 60) dotCache.clear();
  dotCache.set(key, d);
  return d;
};
L.register('layout', 'n_dotmatrix', {
  name: 'ドット組版', tags: ['cyber', 'graphic', 'pop'], w: 0.9, emph: 1.3, fits: n => n >= 1 && n <= 10,
  plan: rng => ({ per: rng.pick([9, 11]), round: rng.chance(0.5), cap: rng.pick(['DOT MATRIX', 'LED 9PX', 'PIXEL']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.4);
    const B = 4;
    const g = grid(env, divFor(env, B, 0.45), 1, E.lin);
    const font = L.roleFont(env, 'display');
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * (env.portrait ? 0.4 : 0.5), m * 0.42, env.portrait ? 3 : 2);
    const cy = H * 0.42;
    const it = { text: f.text, font, size: f.size, x: W / 2, y: cy };
    const d = dotCells(it, /[一-鿿]/.test(cut.text) ? 13 : (p.per || 9));
    const cs = d.c1 * f.size;
    const span = Math.max(1e-6, d.maxX - d.minX);
    const sweep = clamp(g.s / B) * 1.15;
    const out = 1 - E.inCubic(env.pOut);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      ctx.save();
      const hot = g.n > B ? ((g.n - B - 1) % 8) / 8 : -1;
      for (const [x, y] of d.cells) {
        const fx = (x - d.minX) / span;
        const q = clamp((sweep - fx) * 6);
        if (q <= 0.01) continue;
        const s = cs * 0.8 * E.outBack(q, 2) * out;
        const X = W / 2 + x * f.size, Y = cy + y * f.size;
        const isHot = hot >= 0 && Math.abs(fx - hot - 0.06) < 0.06;
        ctx.globalAlpha = io;
        ctx.fillStyle = isHot || (q < 0.99 && fx > sweep - 0.25) ? sc.accent : sc.fg;
        if (p.round) { ctx.beginPath(); ctx.arc(X, Y, s / 2, 0, TAU); ctx.fill(); } else ctx.fillRect(X - s / 2, Y - s / 2, s, s);
      }
      ctx.restore();
    }
    const bb0 = L.itemBox(it);
    // 走査線(スイープの先頭)
    if (sweep < 1.05 && g.n > 0) {
      const sx = bb0.x0 + (bb0.x1 - bb0.x0) * clamp(sweep);
      env.rect(sx - Math.max(1, u * 1.5), bb0.y0 - m * 0.02, Math.max(2, u * 3), bb0.h + m * 0.04, sc.accent, io * 0.8, false);
    }
    const ls = lsz(env);
    lab(env, `${p.cap || 'DOT MATRIX'} — ${d.cells.length} PX`, bb0.x0, bb0.y0 - m * 0.03 - ls * 0.6, { align: 'left', a: io, track: 0.12 });
    // 歌詞本体は下に、読みやすいキャプションとして
    const cf = M.fitLines(env, cut.text, font, W * 0.8, H * 0.12, m * 0.1, 1);
    const top = bb0.y1 + m * 0.06;
    const cit = { text: cf.text, font, size: cf.size, x: W / 2, y: Math.min(H * 0.93 - cf.size / 2, top + cf.size * 0.6), delay: dly(env, g.at(B) || 0) };
    env.rect(W / 2 - bb0.w * 0.2 * io, top - m * 0.02, bb0.w * 0.4 * io, Math.max(1, u * 2), sc.sub, 0.6, false);
    return L.unionBB(L.mainDraw(env, cit), bb0);
  },
}, P);

/* ================================================================ 21. 罫線ノート */
L.register('layout', 'n_notebook', {
  name: '罫線ノート', tags: ['calm', 'editorial', 'emotional', 'pop'], w: 0.9, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ role: rng.pick(['hand', 'hand', 'body']), mark: rng.chance(0.7) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.45);
    const rows = rowsOf(cut.text, env.portrait ? 5 : 4);
    const R = rows.length;
    const g = grid(env, divFor(env, R + 1), 0.5, E.outCubic);
    const font = L.roleFont(env, p.role || 'hand');
    const mx = W * (env.portrait ? 0.16 : 0.14), x1 = W * 0.92;
    const lines = Math.max(R + 2, env.portrait ? 7 : 4);
    const lh = Math.min(H * 0.8 / lines, m * 0.2);
    const y0 = H / 2 - lh * lines / 2;
    const hw = (p.role || 'hand') === 'hand' ? 400 : 700;
    const s = Math.min(stackSize(rows, font, x1 - mx - m * 0.03, 1e9, 1, { weight: hw }), lh * 0.72);
    const ls = lsz(env);
    for (let i = 0; i <= lines; i++) {
      const y = y0 + lh * i;
      const e = E.outCubic(clamp(io * 1.8 - i * 0.06));
      env.line([[0, y], [W * e, y]], sc.sub, hair(env), 0.45 * io);
      if (i < lines && i > 0) lab(env, M.pad2(i), mx - m * 0.03, y + lh / 2, { align: 'right', a: io * 0.7, size: ls * 0.85 });
    }
    env.line([[mx, H / 2 - H / 2 * E.outCubic(io)], [mx, H / 2 + H / 2 * E.outCubic(io)]], sc.accent, Math.max(1.5, u * 3), 0.85 * io);
    let bb = null;
    const first = 1;   // 1行目は見出し分あける
    rows.forEach((r, i) => {
      const base = y0 + lh * (first + i + 1);
      const cy = base - s * 0.52;
      const q = clamp((env.lt - g.at(i + 1)) / (g.len * 0.85));
      const it = setLeft({ text: r, font, weight: hw, size: s, y: cy, mi: i, delay: dly(env, g.at(i + 1), i) }, mx + m * 0.03);
      if (q < 1) it.clip = [0, E.inOutSine(q) * 1.02 + 0.02];
      const b = L.mainDraw(env, it);
      bb = L.unionBB(bb, b);
      // 最後の行の後、次の拍でマーカーを引く
      if (p.mark && i === R - 1 && b) {
        const mq = E.outCubic(clamp((env.lt - g.at(R + 1)) / (g.len * 0.6)));
        if (mq > 0.002) { const w = mw(it); env.rect(mx + m * 0.03, base - s * 0.42, w * mq, s * 0.36, sc.accent, 0.28 * io, false); }
      }
    });
    lab(env, `NOTE ${M.pad2((cut.idx || 0) + 1)}`, mx + m * 0.03, y0 + lh * 0.55, { align: 'left', a: io, color: sc.accent, track: 0.2 });
    lab(env, L.fmtTime(cut.start), x1, y0 + lh * 0.55, { align: 'right', a: io });
    return bb;
  },
}, P);

/* ================================================================ 22. 書体見本 */
const SPEC = [['display', 'DISPLAY'], ['serif', 'SERIF'], ['body', 'BODY'], ['hand', 'HAND'], ['mono', 'MONO']];
L.register('layout', 'n_specimen', {
  name: '書体見本', tags: ['editorial', 'graphic', 'calm'], w: 0.9, fits: n => n >= 1 && n <= 22,
  plan: rng => ({ start: rng.int(0, 3), role: rng.pick(['display', 'serif', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.4);
    const g = grid(env, 1, 0.3, E.outExpo);
    const ch = L.glyphs(cut.text).find(c => !L.isSpace(c)) || '字';
    const wd = wide(env);
    const box = wd ? { x: W * 0.28, y: H * 0.5, s: Math.min(H * 0.64, W * 0.34) } : { x: W / 2, y: H * (env.portrait ? 0.33 : 0.34), s: Math.min(W * 0.62, H * (env.portrait ? 0.34 : 0.44)) };
    const k = Math.max(0, g.n - 1);
    const [role, rname] = SPEC[((p.start || 0) + k) % SPEC.length];
    const gsz = box.s * 0.78;
    const pop = 1 + 0.06 * (1 - g.e) * (g.n > 0 ? 1 : 0);
    const half = box.s / 2;
    // 字の枠とメトリクス線
    const ex = E.outExpo(io);
    const lines = [[-0.5, 'ASC'], [-0.28, 'CAP'], [0, 'MID'], [0.36, 'BASE'], [0.5, 'DESC']];
    lines.forEach(([f, name], i) => {
      const y = box.y + f * box.s, e = clamp(ex * 1.6 - i * 0.12);
      const x0 = box.x - half - m * 0.03, x1 = box.x + half + m * 0.03;
      env.line([[x0, y], [x0 + (x1 - x0) * e, y]], name === 'BASE' ? sc.accent : sc.sub, name === 'BASE' ? Math.max(1.5, u * 3) : hair(env), (name === 'BASE' ? 0.9 : 0.5) * io, false, name === 'MID' ? [u * 5, u * 5] : null);
      lab(env, name, x1 + lsz(env) * 0.4, y, { align: 'left', a: io * clamp(e * 2), size: lsz(env) * 0.8 });
    });
    env.rrect(box.x - half, box.y - half, box.s, box.s, 0, null, io * 0.6, false, sc.sub, hair(env));
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) env.rect(box.x + sx * half - u * 5, box.y + sy * half - u * 5, u * 10, u * 10, sc.fg, io, false);
    if (io > 0.002) env.text({ text: ch, font: L.roleFont(env, role), weight: role === 'hand' || role === 'mono' ? 400 : 900, size: gsz, x: box.x, y: box.y, color: sc.fg, alpha: io, ghost: false, sx: pop, sy: pop });
    lab(env, `${rname}  ${M.pad2(k % SPEC.length + 1)}/${M.pad2(SPEC.length)}`, box.x - half, box.y - half - lsz(env) * 1.2, { align: 'left', a: io, color: sc.accent, track: 0.15 });
    lab(env, `${Math.round(gsz / env.u)} PX`, box.x + half, box.y + half + lsz(env) * 1.2, { align: 'right', a: io });
    const font = L.roleFont(env, p.role || 'display');
    if (wd) {
      const f = M.fitLines(env, cut.text, font, W * 0.36, H * 0.5, m * 0.22, 3);
      const it = setLeft({ text: f.text, font, size: f.size, align: 'left', y: H * 0.5 }, W * 0.56);
      return L.mainDraw(env, it);
    }
    const top = box.y + half + lsz(env) * 2.6;
    const f = M.fitLines(env, cut.text, font, W * 0.86, H * 0.93 - top, m * 0.2, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: 0 };
    it.y = top + (H * 0.93 - top) / 2;
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 23. 字間メーター */
L.register('layout', 'n_tracking', {
  name: '字間メーター', tags: ['editorial', 'graphic', 'cyber'], w: 0.9, fits: n => n >= 2 && n <= 16,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), seq: rng.pick([[0.3, 0.02, 0.16, 0.08], [0.02, 0.24, 0.06, 0.12], [0.2, -0.02, 0.28, 0.1]]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.4);
    const seq = p.seq || [0.3, 0.02, 0.16, 0.08];
    const g = grid(env, 1, 0.55, E.inOutExpo);
    const k = g.n;
    const tmax = Math.max(...seq);
    const tAt = j => (j <= 0 ? tmax : seq[(j - 1) % seq.length]);
    const tr = lerp(tAt(k - 1), tAt(k), k ? g.e : 1);
    const font = L.roleFont(env, p.role || 'display');
    const rowsN = env.portrait ? (cut.n > 10 ? 3 : cut.n > 4 ? 2 : 1) : cut.n > 10 ? 2 : 1;
    const text = rowsN > 1 ? L.splitLines(cut.text, Math.ceil(cut.n / rowsN)).join('\n') : cut.text;
    const s = Math.min(L.fitSize(text, font, W * 0.86, H * 0.4, { track: tmax, lead: 1.3 }), m * 0.26);
    const it = { text, font, size: s, x: W / 2, y: H * 0.46, track: tr, lead: 1.3 };
    const ms = L.measure(it);
    // 字と字の間に寸法の目盛り
    const ls = lsz(env);
    if (io > 0.002) {
      const lay = ms.lay;
      for (let i = 1; i < lay.length; i++) {
        const a = lay[i - 1], b = lay[i];
        if (a.line !== b.line || a.space || b.space) continue;
        const gx = W / 2 + (a.x + a.w / 2 + b.x - b.w / 2) / 2;
        const gy = H * 0.46 + a.y - s * 0.68;
        const hh = s * 0.12 * (1 + g.kick * 0.8);
        env.rect(gx - Math.max(0.5, u), gy - hh, Math.max(1, u * 2), hh, sc.accent, io * clamp(tr * 4 + 0.3), false);
      }
    }
    // スライダー
    const sy = H * 0.46 + ms.h / 2 + m * 0.07;
    const sx0 = W * 0.2, sx1 = W * 0.8;
    const kx = lerp(sx0, sx1, clamp((tr + 0.05) / (tmax + 0.05)));
    env.rect(sx0, sy - Math.max(1, u), (sx1 - sx0) * E.outExpo(io), Math.max(2, u * 2), sc.sub, 0.6, false);
    env.rect(sx0, sy - Math.max(1.5, u * 2), kx - sx0, Math.max(3, u * 4), sc.accent, io, false);
    env.circle(kx, sy, Math.max(3, m * 0.014) * (1 + g.kick * 0.3), sc.bg, sc.accent, Math.max(1.5, u * 3), io);
    lab(env, 'TRACKING', sx0, sy + ls * 1.5, { align: 'left', a: io, track: 0.25 });
    lab(env, `${tr >= 0 ? '+' : '−'}${String(Math.round(Math.abs(tr) * 1000)).padStart(3, '0')}`, sx1, sy + ls * 1.5, { align: 'right', a: io, color: sc.fg });
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 24. 拍のタリー */
L.register('layout', 'n_tally', {
  name: '拍のタリー', tags: ['graphic', 'editorial', 'pop'], w: 0.8, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), max: rng.pick([10, 15]) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const io = env.inOut(0.35);
    const g = grid(env, 1, 0.5, E.outCubic);
    const MAX = p.max || 10;
    const cnt = Math.min(g.n, MAX);
    const wd = wide(env);
    const groups = Math.ceil(MAX / 5);
    const gh = wd ? Math.min(H * 0.22, W * 0.5 / (groups * 1.15)) : Math.min(W * 0.8 / (groups * 1.15), H * 0.16);
    const gw = gh * 0.95, gap = gh * 0.28;
    const totW = groups * gw + (groups - 1) * gap;
    const x0 = wd ? W * 0.08 : W / 2 - totW / 2, cy = wd ? H * 0.34 : H * (env.portrait ? 0.3 : 0.26);
    const lw = Math.max(2, gh * 0.075);
    const out = 1 - E.inCubic(env.pOut);
    for (let i = 0; i < MAX; i++) {
      const grp = Math.floor(i / 5), j = i % 5;
      const gx = x0 + grp * (gw + gap);
      const q = i < cnt ? (i === cnt - 1 ? g.e : 1) : 0;
      const intro = clamp(io * 1.5 - i * 0.04);
      if (j < 4) {
        const x = gx + gw * (0.12 + j * 0.25);
        env.line([[x, cy - gh / 2], [x, cy + gh / 2]], sc.sub, Math.max(1, lw * 0.3), 0.3 * intro);
        if (q > 0) env.line([[x, cy - gh / 2], [x, cy - gh / 2 + gh * q * out]], sc.fg, lw, io);
      } else if (q > 0) {
        const a = [gx - gw * 0.02, cy + gh * 0.3], b = [gx + gw * 0.98, cy - gh * 0.3];
        env.line([a, [lerp(a[0], b[0], q * out), lerp(a[1], b[1], q * out)]], sc.accent, lw * 1.1, io);
      }
    }
    const { font: nfont, weight: nw } = numF({ nf: 0 });
    const ns = gh * 0.7;
    const nx = wd ? x0 + totW + gh * 0.4 : W / 2;
    if (io > 0.002) {
      const str = M.pad2(cnt);
      const w = digitsW(str, nfont, nw, ns);
      digitRow(env, str, { font: nfont, weight: nw, size: ns, x: wd ? nx : nx - w / 2, y: wd ? cy : cy + gh / 2 + ns * 0.75, alpha: io, sy: 1 + g.kick * 0.05, color: sc.accent });
      lab(env, `BEATS / MAX ${MAX}`, wd ? nx : W / 2, wd ? cy + ns * 0.62 : cy + gh / 2 + ns * 1.35, { align: wd ? 'left' : 'center', a: io });
    }
    const font = L.roleFont(env, p.role || 'display');
    const top = wd ? cy + gh / 2 + m * 0.08 : cy + gh / 2 + ns * 1.35 + m * 0.06;
    const f = M.fitLines(env, cut.text, font, W * 0.84, H * 0.92 - top, m * 0.2, 3);
    const it = { text: f.text, font, size: f.size, x: W / 2, y: 0, align: wd ? 'left' : 'center' };
    if (wd) setLeft(it, x0);
    it.y = top + Math.min(H * 0.92 - top, L.itemBox(it).h) / 2;
    return L.mainDraw(env, it);
  },
}, P);
})();
