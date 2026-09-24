/* LyricFlow 演出パック: p_layouts_a — 構図A（中央/字幕帯/誌面/帯・マーキー/円環）
   契約: docs/COMPOSE_PACKS.md  (group: layout) */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_layouts_a';
const clamp = L.clamp, TAU = L.TAU, DEG = L.DEG;

/* ================================================================ helpers */
const pad2 = v => String(Math.max(0, Math.floor(v))).padStart(2, '0');
const lineNo = cut => pad2(((cut.lineIdx != null ? cut.lineIdx : cut.idx) || 0) + 1);
const isLat = s => L.hasLatinWords(s);
const F = (env, role, i) => L.roleFont(env, role, i);
const acc = env => L.fitContrast(env.sc.accent, env.sc.bg, 2.4);
const mOf = env => Math.min(env.W, env.H);
const hair = env => Math.max(1, env.u * 2);
const romajiOf = text => {
  if (isLat(text)) return null;
  const r = L.romaji(text);
  return r && r.trim().length >= 2 ? r.trim() : null;
};
const nonSpace = s => L.glyphs(s).filter(c => !L.isSpace(c));
const sepOf = s => (isLat(s) ? '   ●   ' : '　・　');
const sameAsBg = (env, c) => L.contrast(c, env.sc.bg) < 1.25;
/* L.fitSize の max は比率と比べられて効かないので、上限はここで px として掛ける */
const fsz = (t, f, w, h, o = {}) => Math.min(L.fitSize(t, f, w, h, Object.assign({}, o, { max: 0 })), o.max || 1e9);
/* 出だしだけのアニメ量 / 退場のフェード量(プレートは退場で縮めずに消す) */
const kIn = (env, d = 0.3, delay = 0) => E.outCubic(clamp((env.lt - delay) / d));
const kOut = env => 1 - E.inCubic(env.pOut);

/* 1..rows 行の中から一番大きく収まる改行を選ぶ(行数が増えるなら 12% 以上大きい時だけ) */
function fit(text, font, maxW, maxH, o = {}) {
  const len = L.glyphs(text).length, n = L.glyphCount(text);
  // 欧文は単語の途中で折らない(語数まで)。和文は 1 行あたり 2.5 字以上
  const cap = isLat(text) || /^[\x21-\x7e]+$/.test(text) ? String(text).trim().split(/\s+/).length : Math.floor(n / 2.5);
  const maxRows = Math.max(1, Math.min(o.rows || 3, cap));
  let best = null;
  for (let r = 1; r <= maxRows; r++) {
    const t = r === 1 ? text : L.splitLines(text, Math.ceil(len / r)).join('\n');
    if (best && t === best.text) continue;
    const size = fsz(t, font, maxW, maxH, { weight: o.weight, track: o.track, lead: o.lead, vertical: o.vertical, max: o.max });
    if (!best || size > best.size * (o.bias || 1.12)) best = { text: t, size, rows: t.split('\n').length };
  }
  return best;
}
/* 句を k 行以内にまとめる */
function groupChunks(text, k) {
  const ch = L.chunks(text);
  if (!ch.length) return [text];
  if (ch.length <= k) return ch;
  const join = isLat(text) ? ' ' : '';
  const total = ch.reduce((s, c) => s + L.glyphCount(c), 0), target = total / k;
  const out = [];
  let cur = '', curN = 0;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], gc = L.glyphCount(c);
    if (cur && out.length < k - 1 && (curN + gc / 2 > target || ch.length - i <= k - out.length - 1)) { out.push(cur); cur = ''; curN = 0; }
    cur = cur ? cur + join + c : c; curN += gc;
  }
  if (cur) out.push(cur);
  return out;
}
/* 複数行を同じサイズで積むときのサイズ */
function stackFit(lines, font, maxW, maxH, lead, o = {}) {
  let s = maxH / (lines.length * lead);
  for (const ln of lines) s = Math.min(s, fsz(ln, font, maxW, 1e9, { track: o.track, weight: o.weight }));
  return Math.min(s, o.max || 1e9);
}
/* 句のまとめ方(1..kMax 行)の中で一番大きく積めるもの */
function bestStack(text, font, maxW, maxH, lead, kMax, o = {}) {
  let best = null;
  for (let k = 1; k <= kMax; k++) {
    const lines = groupChunks(text, k);
    if (best && lines.length === best.lines.length) continue;
    const size = stackFit(lines, font, maxW, maxH, lead, o);
    if (!best || size > best.size * (o.bias || 1.1)) best = { lines, size };
  }
  return best;
}
const setLeft = (it, x) => { it.align = 'left'; it.x = x + L.measure(it).w / 2; return it; };
const setRight = (it, x) => { it.align = 'right'; it.x = x - L.measure(it).w / 2; return it; };
const mw = it => L.measure(it).w;

/* 副テキスト(ゴーストなし) */
function lab(env, text, x, y, size, o = {}) {
  if (text == null || text === '' || (o.a != null && o.a <= 0.01) || size < 1) return null;
  const it = {
    text: String(text), x, y, size, font: o.font || F(env, o.role || 'body'), weight: o.weight == null ? 700 : o.weight,
    color: o.color || env.sc.sub, track: o.track == null ? 0.1 : o.track, alpha: o.a == null ? 1 : o.a, ghost: false, rot: o.rot || 0,
  };
  if (o.italic) it.italic = true;
  if (o.charFns) it.charFns = o.charFns;
  if (o.sx) { it.sx = o.sx; it.sy = o.sx; }
  if (o.fill === false) { it.fill = false; it.stroke = o.stroke || 1; it.strokeColor = it.color; it.strokeUnder = false; }
  if (o.align === 'left') setLeft(it, x); else if (o.align === 'right') setRight(it, x);
  return env.text(it);
}
/* 1字ずつの歌詞項目(円環など)。mi を詰めて最大 ~7 段のずれに収める */
function drawGlyphs(env, list, base) {
  let bb = null;
  const N = list.length;
  for (let j = 0; j < N; j++) {
    const g = list[j];
    const r = L.mainDraw(env, Object.assign({}, base, { text: g.ch, x: g.x, y: g.y, rot: g.rot || 0, size: g.size || base.size, mi: N > 1 ? j * Math.min(1, 7 / N) : 0 }));
    if (r) bb = L.unionBB(bb, r);
  }
  return bb;
}
/* 繰り返し文字列の横スクロール(main パス専用・ctx 直描き) */
const TW = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => TW.clear());
function tw(ctx, fs, s) {
  const k = fs + '|' + s;
  let v = TW.get(k);
  if (v === undefined) { ctx.font = fs; v = ctx.measureText(s).width; if (TW.size > 3000) TW.clear(); TW.set(k, v); }
  return v;
}
function scrollRow(env, s, x0, x1, y, size, font, color, alpha, off, o = {}) {
  if (env.pass !== 'main' || alpha <= 0.003 || size < 1) return;
  const ctx = env.ctx;
  const fs = `${o.weight || 900} ${size.toFixed(1)}px ${font}`;
  const w = tw(ctx, fs, s);
  if (!(w > 1)) return;
  ctx.font = fs; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = clamp(alpha);
  if (o.stroke) { ctx.strokeStyle = color; ctx.lineWidth = o.stroke; ctx.lineJoin = 'round'; } else ctx.fillStyle = color;
  let x = x0 - (((off % w) + w) % w);
  for (let g = 0; x < x1 && g < 40; g++, x += w) { if (o.stroke) ctx.strokeText(s, x, y); else ctx.fillText(s, x, y); }
  ctx.globalAlpha = 1;
}
/* 紙プレート(明るい背景で紙=背景色になる時は輪郭を足す) */
function plate(env, x, y, w, h, fill, a, ghost = true, outline = true) {
  env.rect(x, y, w, h, fill, a, ghost);
  if (outline && sameAsBg(env, fill)) env.rrect(x, y, w, h, 0, null, a, false, env.sc.sub, hair(env));
}
function blinkA(env, hz = 1) { return 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(env.t * Math.PI * 2 * hz)); }

/* ================================================================ 1. 中央ブロック + 注記 */

L.register('layout', 'a_timecode', {
  name: 'タイムコード', tags: ['cyber', 'editorial', 'graphic'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'body', 'display']), seg: rng.chance(0.5) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.82, H * (env.portrait ? 0.3 : 0.36), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * 0.5 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.4, 0.08);
    if (k <= 0.002) return bb;
    const A = acc(env), ls = m * 0.03;
    const rw = Math.max(b.w, m * 0.6), x0 = W / 2 - rw / 2, x1 = W / 2 + rw / 2;
    const yT = b.y0 - m * 0.06 + (1 - k) * m * 0.02, yB = b.y1 + m * 0.06;
    env.circle(x0 + ls * 0.35, yT, ls * 0.3, A, null, 1, k * blinkA(env));
    lab(env, 'REC', x0 + ls * 0.95, yT, ls, { align: 'left', a: k, role: 'mono' });
    lab(env, L.fmtTime(env.t), x1, yT, ls, { align: 'right', a: k, color: sc.fg, role: 'mono', track: 0.04 });
    const pr = clamp(env.lt / Math.max(0.1, cut.dur));
    if (p.seg) {
      const N = 24, gw = rw / N;
      for (let i = 0; i < N; i++) {
        const on = (i + 0.5) / N <= pr;
        env.rect(x0 + i * gw + gw * 0.14, yB - ls * 0.26, gw * 0.72, ls * 0.52, on ? A : sc.sub, (on ? 1 : 0.28) * clamp(k * 1.6 - (i / N) * 0.6), false);
      }
    } else {
      env.line([[x0, yB], [x0 + rw * k, yB]], sc.sub, hair(env), 0.45 * k);
      env.line([[x0, yB], [x0 + rw * pr * k, yB]], A, Math.max(2, u * 5), k);
      for (let i = 0; i <= 10; i++) { const x = x0 + rw * i / 10; env.line([[x, yB + ls * 0.3], [x, yB + ls * (i % 5 ? 0.55 : 0.8)]], sc.sub, hair(env), 0.6 * k); }
    }
    lab(env, 'LINE ' + lineNo(cut), x0, yB + ls * 1.5, ls * 0.85, { align: 'left', a: k, role: 'mono' });
    lab(env, cut.dur.toFixed(2) + 's', x1, yB + ls * 1.5, ls * 0.85, { align: 'right', a: k, role: 'mono' });
    return bb;
  },
}, P);

L.register('layout', 'a_romaji', {
  name: '読み添え', tags: ['calm', 'pop', 'editorial', 'emotional'], w: 0.9, fits: n => n >= 1 && n <= 22,
  plan: (rng, cut) => {
    // 読み(かなのみの行) → ローマ字。欧文 → 小文字の字間広げ。漢字まじり → 字を1字ずつ離した小さな写し
    const ro = romajiOf(cut.text);
    const cap = ro || (isLat(cut.text) ? cut.text.toLowerCase() : nonSpace(cut.text).join(' '));
    return { role: rng.pick(['display', 'serif', 'display']), ro: cap, above: rng.chance(0.3) };
  },
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * (p.above ? 0.54 : 0.46) };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.35, 0.15);
    if (k <= 0.002) return bb;
    const ys = p.above ? b.y0 - m * 0.065 : b.y1 + m * 0.07;
    const A = acc(env);
    let r = null;
    if (p.ro) {
      const rf = F(env, 'body');
      const rs = Math.min(m * 0.036, fsz(p.ro, rf, W * 0.7, m, { weight: 500, track: 0.32 }));
      const shown = L.glyphs(p.ro).length * clamp((env.lt - 0.2) / 0.7);
      r = lab(env, p.ro, W / 2, ys, rs, {
        weight: 500, track: 0.32, font: rf, a: 1 - E.inCubic(env.pOut),
        charFns: [i => (i >= shown ? { hide: true } : i > shown - 1 ? { a: shown - i } : null)],
      });
    } else {
      r = lab(env, 'No.' + lineNo(cut), W / 2, ys, m * 0.03, { track: 0.3, a: k, role: 'mono' });
    }
    if (r) {
      const d = m * 0.06 * k, g = m * 0.028;
      env.line([[r.x0 - g - d, ys], [r.x0 - g, ys]], A, Math.max(1, u * 2.5), k);
      env.line([[r.x1 + g, ys], [r.x1 + g + d, ys]], A, Math.max(1, u * 2.5), k);
    }
    return bb;
  },
}, P);

L.register('layout', 'a_brackets', {
  name: '角括弧', tags: ['graphic', 'cyber', 'editorial', 'pop'], w: 1.1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']), side: rng.chance(0.4), hot: rng.chance(0.5) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.72, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.19, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.45, 0.05);
    if (k <= 0.002) return bb;
    const pad = Math.max(m * 0.045, f.size * 0.22);
    const x0 = Math.max(b.x0 - pad, W * 0.04), x1 = Math.min(b.x1 + pad, W * 0.96);
    const y0 = b.y0 - pad * 0.8, y1 = b.y1 + pad * 0.8;
    const col = p.hot ? acc(env) : sc.fg, lw = Math.max(1.5, u * 4), d = (1 - k) * m * 0.08;
    if (!p.side) {
      const arm = Math.max(m * 0.03, Math.min(x1 - x0, y1 - y0) * 0.28);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = (sx < 0 ? x0 : x1) + sx * d, cy = (sy < 0 ? y0 : y1) + sy * d;
        env.line([[cx, cy - sy * arm], [cx, cy], [cx - sx * arm, cy]], col, lw, k);
      }
    } else {
      const arm = m * 0.03;
      for (const sx of [-1, 1]) { const cx = (sx < 0 ? x0 : x1) + sx * d; env.line([[cx - sx * arm, y0], [cx, y0], [cx, y1], [cx - sx * arm, y1]], col, lw, k); }
    }
    const ls = m * 0.026;
    lab(env, lineNo(cut), x0 - d, y0 - d - ls * 1.3, ls, { align: 'left', a: k, role: 'mono', color: col });
    lab(env, L.fmtTime(cut.start), x1 + d, y1 + d + ls * 1.3, ls, { align: 'right', a: k, role: 'mono' });
    return bb;
  },
}, P);

L.register('layout', 'a_rulelabel', {
  name: '罫線ラベル', tags: ['editorial', 'calm', 'graphic'], w: 1.1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'serif', 'serif']), word: rng.pick(['LYRIC', 'LINE', 'VERSE', 'TRACK']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.28 : 0.32), { max: m * 0.19, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k1 = env.inOut(0.5, 0.04), k2 = env.inOut(0.5, 0.14);
    if (k1 <= 0.002) return bb;
    const x0 = W * 0.07, x1 = W * 0.93, cx = W / 2, ls = m * 0.028;
    const yT = b.y0 - m * 0.075, yB = b.y1 + m * 0.07;
    const txt = `${p.word || 'LYRIC'}  No.${lineNo(cut)}`;
    const lw = mw({ text: txt, size: ls, font: F(env, 'body'), weight: 700, track: 0.22 }), g = ls * 0.9;
    env.polyPartial([[cx - lw / 2 - g, yT], [x0, yT]], k1, sc.fg, hair(env), 0.8);
    env.polyPartial([[cx + lw / 2 + g, yT], [x1, yT]], k1, sc.fg, hair(env), 0.8);
    lab(env, txt, cx, yT, ls, { track: 0.22, a: k1, color: sc.fg });
    env.polyPartial([[x0, yB], [x1, yB]], k2, sc.fg, Math.max(1.5, u * 4), 1);
    env.polyPartial([[x1, yB + Math.max(3, u * 9)], [x0, yB + Math.max(3, u * 9)]], k2, sc.sub, hair(env), 0.8);
    lab(env, L.fmtTime(cut.start), x0, yB + ls * 1.7, ls * 0.9, { align: 'left', a: k2, role: 'mono' });
    lab(env, `${(cut.part || 0) + 1} / ${cut.parts || 1}`, x1, yB + ls * 1.7, ls * 0.9, { align: 'right', a: k2, role: 'mono' });
    return bb;
  },
}, P);

L.register('layout', 'a_bignum', {
  name: '大番号', tags: ['graphic', 'editorial', 'pop'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ solid: rng.chance(0.5), side: rng.chance(0.5), role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const df = F(env, 'display'), font = F(env, p.role || 'display'), num = lineNo(cut);
    const k = env.inOut(0.6, 0);
    let it;
    if (!p.side) {
      const ns = fsz(num, df, W * 0.86, H * 0.84);
      const nit = { text: num, font: df, weight: 900, size: ns, x: W / 2, y: H / 2, sx: 1 + (1 - k) * 0.12, sy: 1 + (1 - k) * 0.12, alpha: k, track: -0.02 };
      if (p.solid) nit.color = sc.dim; else Object.assign(nit, { color: sc.sub, alpha: k * 0.55, fill: false, stroke: Math.max(1, u * 3), strokeColor: sc.sub, strokeUnder: false });
      if (k > 0.002) env.text(Object.assign(nit, { ghost: false }));
      const f = fit(cut.text, font, W * 0.8, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
      it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    } else if (!env.portrait) {
      const ns = fsz(num, df, W * 0.34, H * 0.7);
      const nx = W * 0.25;
      const nit = { text: num, font: df, weight: 900, size: ns, x: nx - (1 - k) * m * 0.05, y: H / 2, alpha: k, ghost: false, color: acc(env), track: -0.02 };
      if (!p.solid) Object.assign(nit, { fill: false, stroke: Math.max(1.5, u * 4), strokeColor: acc(env), strokeUnder: false });
      else nit.alpha = k * 0.35;
      if (k > 0.002) { const nb = env.text(nit); if (nb) lab(env, 'No.', nb.x0, nb.y0 - m * 0.01, m * 0.03, { align: 'left', a: k, role: 'mono' }); }
      const f = fit(cut.text, font, W * 0.46, H * 0.62, { max: m * 0.2, rows: 4 });
      it = setLeft({ text: f.text, font, size: f.size, y: H / 2 }, W * 0.48);
    } else {
      const ns = fsz(num, df, W * 0.66, H * 0.24);
      const nit = { text: num, font: df, weight: 900, size: ns, x: W / 2, y: H * 0.27 - (1 - k) * m * 0.05, alpha: k, ghost: false, color: acc(env), track: -0.02 };
      if (!p.solid) Object.assign(nit, { fill: false, stroke: Math.max(1.5, u * 4), strokeColor: acc(env), strokeUnder: false });
      else nit.alpha = k * 0.35;
      if (k > 0.002) env.text(nit);
      const f = fit(cut.text, font, W * 0.86, H * 0.36, { max: m * 0.24, rows: 4, bias: 1.05 });
      it = { text: f.text, font, size: f.size, x: W / 2, y: H * 0.64 };
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_dimension', {
  name: '寸法線', tags: ['graphic', 'cyber', 'editorial'], w: 0.9, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.64 : 0.68), H * (env.portrait ? 0.28 : 0.3), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2 - m * 0.03, y: H * 0.46 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.55, 0.12);
    if (k <= 0.002) return bb;
    const A = acc(env), lw = hair(env), ls = m * 0.026, ah = m * 0.018, dash = [u * 7, u * 6];
    const yD = b.y1 + m * 0.09, xD = b.x1 + m * 0.075;
    env.line([[b.x0, b.y1 + m * 0.015], [b.x0, yD + m * 0.02]], sc.sub, lw, 0.7 * k, false, dash);
    env.line([[b.x1, b.y1 + m * 0.015], [b.x1, yD + m * 0.02]], sc.sub, lw, 0.7 * k, false, dash);
    const cx = (b.x0 + b.x1) / 2;
    env.polyPartial([[cx, yD], [b.x0, yD]], k, A, lw * 1.4);
    env.polyPartial([[cx, yD], [b.x1, yD]], k, A, lw * 1.4);
    const ka = clamp(k * 3 - 2);
    env.poly([[b.x0, yD], [b.x0 + ah, yD - ah * 0.42], [b.x0 + ah, yD + ah * 0.42]], A, ka);
    env.poly([[b.x1, yD], [b.x1 - ah, yD - ah * 0.42], [b.x1 - ah, yD + ah * 0.42]], A, ka);
    lab(env, isLat(cut.text) ? `${cut.n} CHARS` : `${cut.n}字`, cx, yD + ls * 1.3, ls, { a: k, role: 'mono' });
    env.line([[b.x1 + m * 0.015, b.y0], [xD + m * 0.02, b.y0]], sc.sub, lw, 0.7 * k, false, dash);
    env.line([[b.x1 + m * 0.015, b.y1], [xD + m * 0.02, b.y1]], sc.sub, lw, 0.7 * k, false, dash);
    const cy = (b.y0 + b.y1) / 2;
    env.polyPartial([[xD, cy], [xD, b.y0]], k, A, lw * 1.4);
    env.polyPartial([[xD, cy], [xD, b.y1]], k, A, lw * 1.4);
    env.poly([[xD, b.y0], [xD - ah * 0.42, b.y0 + ah], [xD + ah * 0.42, b.y0 + ah]], A, ka);
    env.poly([[xD, b.y1], [xD - ah * 0.42, b.y1 - ah], [xD + ah * 0.42, b.y1 - ah]], A, ka);
    lab(env, cut.dur.toFixed(2) + ' s', xD + ls * 1.2, cy, ls, { a: k, role: 'mono', rot: Math.PI / 2 });
    return bb;
  },
}, P);

L.register('layout', 'a_quote', {
  name: '引用符', tags: ['emotional', 'calm', 'editorial'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: (rng, cut) => ({ marks: isLat(cut.text) ? '“”' : rng.pick(['「」', '『』', '“”']), role: rng.pick(['serif', 'serif', 'display']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const f = fit(cut.text, font, W * 0.68, H * (env.portrait ? 0.3 : 0.36), { max: m * 0.19, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * 0.47 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.45, 0.1);
    if (k <= 0.002) return bb;
    const mk = L.glyphs(p.marks || '“”'), latinQ = mk[0] === '“';
    const qs = clamp(f.size * 1.3, m * 0.12, m * 0.24), qf = F(env, 'serif'), A = acc(env), d = (1 - k) * m * 0.05;
    // 「 は字面が右上、」 は左下に寄るので、それぞれ角に合わせて置く
    const ox = latinQ ? qs * 0.42 : qs * 0.3, oy = latinQ ? qs * 0.12 : qs * 0.12;
    const x0 = Math.max(W * 0.03 + qs * 0.3, b.x0 - ox), x1 = Math.min(W * 0.97 - qs * 0.3, b.x1 + ox);
    lab(env, mk[0], x0 - d, b.y0 + oy - d - (latinQ ? 0 : qs * 0.15), qs, { font: qf, weight: 700, color: A, a: k, track: 0 });
    lab(env, mk[1], x1 + d, b.y1 - oy + d + (latinQ ? qs * 0.3 : qs * 0.15), qs, { font: qf, weight: 700, color: A, a: k, track: 0 });
    const ya = b.y1 + Math.max(m * 0.1, qs * 0.7);
    lab(env, '— LINE ' + lineNo(cut), W / 2, ya, m * 0.028, { a: k, track: 0.25, role: 'body' });
    return bb;
  },
}, P);

L.register('layout', 'a_track', {
  name: 'トラック表記', tags: ['editorial', 'pop', 'graphic'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ side: rng.pick(['SIDE A', 'SIDE B']), role: rng.pick(['display', 'body', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const x0 = W * (env.portrait ? 0.08 : 0.1), maxW = W * (env.portrait ? 0.84 : 0.8);
    const hn = m * (env.portrait ? 0.12 : 0.13), gap = m * 0.04, ls = hn * 0.22;
    const f = fit(cut.text, font, maxW, H * (env.portrait ? 0.34 : 0.36), { max: m * 0.16, rows: env.portrait ? 4 : 3 });
    const it = { text: f.text, font, size: f.size };
    const lm = L.measure(it);
    const T = hn * 0.9 + gap * 2 + lm.h;
    const yTop = Math.max(H * 0.07, (H - T) / 2);
    const k1 = env.inOut(0.45, 0), k2 = env.inOut(0.5, 0.1);
    const numY = yTop + hn * 0.45;
    let hw = 0;
    if (k1 > 0.002) {
      const nit = { text: lineNo(cut), font: F(env, 'display'), weight: 900, size: hn, y: numY, color: acc(env), alpha: k1, ghost: false, track: -0.02 };
      setLeft(nit, x0 - (1 - k1) * m * 0.04);
      const nb = env.text(nit);
      const px = (nb ? nb.x1 : x0 + hn) + m * 0.035, pad = ls * 0.8;
      const tw1 = mw({ text: 'TRACK', size: ls, font: F(env, 'body'), weight: 700, track: 0.25 });
      env.rrect(px, numY - hn * 0.2 - ls * 0.85, tw1 + pad * 2, ls * 1.7, ls * 0.85, null, k1, false, sc.fg, hair(env));
      lab(env, 'TRACK', px + pad, numY - hn * 0.2, ls, { align: 'left', track: 0.25, a: k1, color: sc.fg });
      lab(env, `${p.side || 'SIDE A'}  ・  ${L.fmtTime(cut.start)}`, px, numY + hn * 0.24, ls * 0.95, { align: 'left', a: k1, role: 'mono' });
      hw = px + tw1 + pad * 2 - x0;
    }
    const ry = yTop + hn * 0.9 + gap;
    env.polyPartial([[x0, ry], [x0 + Math.max(lm.w, hw, m * 0.3), ry]], k2, sc.sub, hair(env), 0.8);
    setLeft(it, x0);
    it.y = ry + gap + lm.h / 2;
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 2. 画面端のテロップ・キャプション */

L.register('layout', 'a_telop', {
  name: '下帯テロップ', tags: ['pop', 'calm', 'editorial'], w: 1.2, treat: 'safe', emph: 0.8, fits: n => n >= 4 && n <= 30,
  plan: rng => ({ kind: rng.pick(['ink', 'shade', 'paper']), mid: rng.chance(0.4), role: rng.pick(['body', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'body');
    const f = fit(cut.text, font, W * 0.86, m * (env.portrait ? 0.2 : 0.15), { max: m * (env.portrait ? 0.075 : 0.085), rows: env.portrait ? 3 : 2, bias: 1.3 });
    const lh = f.size * 1.18 * f.rows, bh = lh + f.size * 0.85;
    const yc = H * (env.portrait ? 0.84 : 0.9) - bh / 2;
    const k = kIn(env, 0.28), ko = kOut(env), k2 = env.inOut(0.35, 0.15);
    let fill = sc.ink, txt = sc.onInk, fa = 1;
    if (p.kind === 'shade') { fill = '#000000'; txt = '#ffffff'; fa = sc.dark ? 0.55 : 0.72; }
    else if (p.kind === 'paper') { fill = sc.paper; txt = sc.onPaper; }
    const bw = W * k, bx = p.mid ? (W - bw) / 2 : 0;
    if (k * ko > 0.002) {
      plate(env, bx, yc - bh / 2, bw, bh, fill, fa * ko, true, p.kind === 'paper');
      if (p.kind !== 'ink') env.rect(bx, yc - bh / 2 - Math.max(2, u * 5), bw, Math.max(2, u * 5), sc.accent, ko, false);
      if (k2 > 0.002) {
        const cs = m * 0.024, t = 'No.' + lineNo(cut), cw = mw({ text: t, size: cs, font: F(env, 'mono'), weight: 700, track: 0.1 }) + cs * 1.4;
        const cy0 = yc - bh / 2 - Math.max(2, u * 5) - cs * 1.7;
        env.rect(W * 0.05, cy0, cw, cs * 1.7 * k2, sc.accent2, 1, false);
        lab(env, t, W * 0.05 + cw / 2, cy0 + cs * 0.85, cs, { a: k2, color: sc.onAccent2, role: 'mono' });
      }
    }
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: yc, color: txt });
  },
}, P);

L.register('layout', 'a_captionstack', {
  name: '隅キャプション', tags: ['editorial', 'calm', 'cyber'], w: 1, emph: 0.6, fits: n => n >= 4 && n <= 30,   // 1〜3字だと主役が小さすぎる
  plan: rng => ({ right: rng.chance(0.35), role: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const mx = W * 0.07, my = H * (env.portrait ? 0.07 : 0.09), ls = m * 0.028;
    const f = fit(cut.text, font, W * (env.portrait ? 0.84 : 0.6), H * (env.portrait ? 0.28 : 0.36), { max: m * 0.12, rows: 3 });
    const it = { text: f.text, font, size: f.size };
    const lm = L.measure(it);
    if (p.right) setRight(it, W - mx); else setLeft(it, mx);
    it.y = my + ls * 2.4 + lm.h / 2;
    const k = env.inOut(0.4, 0), k2 = env.inOut(0.45, 0.15), A = acc(env);
    if (k > 0.002) {
      const sq = ls * 0.7, t = `LYRIC — ${lineNo(cut)}`;
      if (p.right) { env.rect(W - mx - sq, my + ls * 0.5 - sq / 2, sq, sq, A, k, false); lab(env, t, W - mx - sq * 1.8, my + ls * 0.5, ls, { align: 'right', a: k, track: 0.2 }); }
      else { env.rect(mx, my + ls * 0.5 - sq / 2, sq, sq, A, k, false); lab(env, t, mx + sq * 1.8, my + ls * 0.5, ls, { align: 'left', a: k, track: 0.2 }); }
    }
    const bb = L.mainDraw(env, it);
    if (k2 > 0.002) {
      const uy = it.y + lm.h / 2 + m * 0.03, uw = Math.max(lm.w, m * 0.2) * k2, th = Math.max(2, u * 5);
      env.rect(p.right ? W - mx - uw : mx, uy - th / 2, uw, th, A, 1, false);
      lab(env, L.fmtTime(cut.start), p.right ? W - mx : mx, uy + ls * 1.4, ls * 0.9, { align: p.right ? 'right' : 'left', a: k2, role: 'mono' });
    }
    return bb;
  },
}, P);

L.register('layout', 'a_lowerthird', {
  name: 'ローワーサード', tags: ['editorial', 'calm', 'pop'], w: 1, treat: 'safe', emph: 0.7, fits: n => n >= 4 && n <= 30,
  plan: rng => ({ plate: rng.pick(['paper', 'ink', 'paper']), role: rng.pick(['body', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'body');
    const x0 = W * 0.06;
    const f = fit(cut.text, font, W * (env.portrait ? 0.72 : 0.58), m * 0.2, { max: m * (env.portrait ? 0.075 : 0.08), rows: env.portrait ? 3 : 2, bias: 1.25 });
    const ink = p.plate === 'ink';
    const it = { text: f.text, font, size: f.size, color: ink ? sc.onInk : sc.onPaper };
    const lm = L.measure(it);
    const padx = f.size * 0.5, pady = f.size * 0.34, pw = lm.w + padx * 2, ph = lm.h + pady * 2, barW = m * 0.014;
    const subH = m * 0.05, y1 = H * (env.portrait ? 0.86 : 0.9), subY0 = y1 - subH, py1 = subY0 - m * 0.012, py0 = py1 - ph;
    const k1 = kIn(env, 0.18), k2 = kIn(env, 0.28, 0.04), ko = kOut(env), k3 = env.inOut(0.35, 0.18);
    if (k1 * ko > 0.002) env.rect(x0, py1 - ph * k1, barW, ph * k1, ink ? sc.accent2 : sc.accent, ko, false);
    if (k2 * ko > 0.002) plate(env, x0 + barW, py0, pw * k2, ph, ink ? sc.ink : sc.paper, ko, true);
    if (k3 > 0.002) {
      const t = `LINE ${lineNo(cut)}  ・  ${L.fmtTime(cut.start)}`, ts = subH * 0.46;
      const sw = mw({ text: t, size: ts, font: F(env, 'mono'), weight: 700, track: 0.1 }) + subH;
      env.rect(x0 + barW, subY0, sw * k3, subH, sc.dark ? '#000000' : sc.fg, sc.dark ? 0.55 : 0.9, false);
      lab(env, t, x0 + barW + subH / 2, subY0 + subH / 2, ts, { align: 'left', a: k3, role: 'mono', color: sc.dark ? sc.fg : sc.bg });
    }
    setLeft(it, x0 + barW + padx);
    it.y = py0 + ph / 2;
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_sidecap', {
  name: '縦キャプション', tags: ['calm', 'emotional', 'editorial', 'wa'], w: 0.9, portrait: 1.2, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ left: rng.chance(0.35), role: rng.pick(['serif', 'display', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const lat = isLat(cut.text), colW = W * (env.portrait ? 0.3 : 0.17);
    let it, vis;
    if (!lat) {
      const len = L.glyphs(cut.text).length;
      const t = cut.n > 11 ? L.splitLines(cut.text, Math.ceil(len / 2)).join('\n') : cut.text;
      const size = fsz(t, font, colW, H * 0.76, { vertical: true, max: m * 0.16 });
      it = { text: t, font, size, vertical: true };
      vis = L.measure(it).w;
    } else {
      const size = fsz(cut.text, font, H * 0.76, colW, { max: m * 0.12 });
      it = { text: cut.text, font, size, rot: p.left ? -Math.PI / 2 : Math.PI / 2 };
      vis = L.measure(it).h;
    }
    const cx = p.left ? W * 0.07 + vis / 2 : W * 0.93 - vis / 2;
    it.x = cx; it.y = H / 2;
    const k = env.inOut(0.55, 0.05);
    if (k > 0.002) {
      const s = p.left ? 1 : -1, rx = cx + s * (vis / 2 + m * 0.045), y0 = H * 0.1, y1 = H * 0.9, ls = m * 0.026;
      env.polyPartial([[rx, y0], [rx, y1]], k, sc.sub, hair(env), 0.85);
      for (let i = 0; i <= 8; i++) { if (i / 8 > k) break; const y = y0 + (y1 - y0) * i / 8; env.line([[rx, y], [rx + s * m * (i % 4 ? 0.012 : 0.024), y]], sc.sub, hair(env), 0.8 * k); }
      lab(env, 'No.' + lineNo(cut), rx + s * m * 0.035, y0 + ls * 0.6, ls, { align: p.left ? 'left' : 'right', a: k, role: 'mono', color: acc(env) });
      lab(env, L.fmtTime(cut.start), rx + s * m * 0.035, y1 - ls * 0.6, ls, { align: p.left ? 'left' : 'right', a: k, role: 'mono' });
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_cinema', {
  name: 'シネマ字幕', tags: ['emotional', 'calm', 'dark'], w: 1, treat: 'safe', emph: 0.6, fits: n => n >= 4 && n <= 30,
  plan: rng => ({ inbar: rng.chance(0.4), role: rng.pick(['serif', 'body', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const f = fit(cut.text, font, W * 0.84, m * 0.15, { max: m * (env.portrait ? 0.072 : 0.066), rows: env.portrait ? 3 : 2, weight: 700, bias: env.portrait ? 1.08 : 1.3 });
    const lh = f.size * 1.18 * f.rows, base = H * (env.portrait ? 0.1 : 0.12);
    const barB = p.inbar ? Math.max(base, lh + m * 0.08) : base;
    const k = env.inOut(0.55, 0);
    if (k > 0.002) {
      env.rect(0, 0, W, base * k, '#000000', 1, false);
      env.rect(0, H - barB * k, W, barB * k, '#000000', 1, false);
      const ls = Math.min(m * 0.022, base * 0.3), ka = k * k * 0.75;
      lab(env, 'SCENE ' + lineNo(cut), W * 0.05, base * k - base / 2, ls, { align: 'left', a: ka, color: '#ffffff', role: 'mono', track: 0.2 });
      lab(env, L.fmtTime(env.t), W * 0.95, base * k - base / 2, ls, { align: 'right', a: ka, color: '#ffffff', role: 'mono' });
    }
    const it = { text: f.text, font, weight: 700, size: f.size, x: W / 2, y: p.inbar ? H - barB / 2 : H - barB - m * 0.04 - lh / 2, color: p.inbar ? '#ffffff' : sc.fg };
    if (!p.inbar && sc.dark) it.shadow = { color: 'rgba(0,0,0,0.65)', blur: 10 * u, dy: 2 * u };
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_cornerlabel', {
  name: '隅ラベル+大文字', tags: ['graphic', 'editorial', 'pop', 'dark'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ flip: rng.chance(0.4), tag: rng.pick(['LIVE', 'ON AIR', 'REC']), role: rng.pick(['display', 'display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const mx = W * 0.07, my = H * (env.portrait ? 0.07 : 0.08), ls = m * 0.03;
    const f = fit(cut.text, font, W * (env.portrait ? 0.86 : 0.76), H * (env.portrait ? 0.46 : 0.54), { max: m * 0.26, rows: env.portrait ? 4 : 3 });
    const it = { text: f.text, font, size: f.size };
    const lm = L.measure(it);
    if (!p.flip) { setRight(it, W - mx); it.y = H - my - lm.h / 2; } else { setLeft(it, mx); it.y = my + lm.h / 2; }
    const ib = L.itemBox(it);
    const k = env.inOut(0.4, 0), k2 = env.inOut(0.55, 0.15);
    if (k > 0.002) {
      const tag = p.tag || 'LIVE';
      const tw1 = mw({ text: tag, size: ls, font: F(env, 'body'), weight: 800, track: 0.2 });
      const bw = tw1 + ls * 2.4, bh = ls * 1.8;
      const bx = p.flip ? W - mx - bw : mx, by = p.flip ? H - my - bh - ls * 1.6 : my;
      env.rrect(bx, by, bw, bh, ls * 0.3, null, k, false, sc.fg, Math.max(1, u * 2.5));
      env.circle(bx + ls * 0.8, by + bh / 2, ls * 0.28, acc(env), null, 1, k * blinkA(env));
      lab(env, tag, bx + ls * 1.4, by + bh / 2, ls, { align: 'left', a: k, color: sc.fg, weight: 800, track: 0.2 });
      const ty = p.flip ? by + bh + ls * 0.95 : by + bh + ls * 0.95;
      lab(env, L.fmtTime(env.t), p.flip ? bx + bw : bx, ty, ls * 0.85, { align: p.flip ? 'right' : 'left', a: k, role: 'mono' });
      // L字の接続線
      const g = m * 0.03, A = acc(env);
      if (!p.flip) {
        const sx = bx + ls * 0.8, sy = ty + ls * 1.2, ey = ib.y0 + f.size * 0.55, ex = ib.x0 - g;
        if (ey > sy + g) {
          const pts = ex > sx + g ? [[sx, sy], [sx, ey], [ex, ey]] : [[sx, sy], [sx, ib.y0 - g]];
          if (pts.length === 3 || ib.y0 - g > sy + g) { env.polyPartial(pts, k2, A, hair(env) * 1.3, 0.9); if (k2 > 0.98) env.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], m * 0.007, A, null, 1, 1); }
        }
      } else {
        const sx = bx + bw - ls * 0.8, sy = by - g * 0.5, ey = ib.y1 - f.size * 0.55, ex = ib.x1 + g;
        if (ey < sy - g) {
          const pts = ex < sx - g ? [[sx, sy], [sx, ey], [ex, ey]] : [[sx, sy], [sx, ib.y1 + g]];
          if (pts.length === 3 || ib.y1 + g < sy - g) { env.polyPartial(pts, k2, A, hair(env) * 1.3, 0.9); if (k2 > 0.98) env.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], m * 0.007, A, null, 1, 1); }
        }
      }
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_newsband', {
  name: 'ニュース帯', tags: ['pop', 'editorial', 'cyber'], w: 0.9, treat: 'safe', fits: n => n >= 4 && n <= 30,
  plan: rng => ({ tag: rng.pick(['LIVE', 'NOW', 'ON AIR']), role: rng.pick(['body', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'body');
    const x0 = W * 0.05, x1 = W * 0.95, tabW = m * (env.portrait ? 0.17 : 0.19), padx = m * 0.045;
    const f = fit(cut.text, font, x1 - x0 - tabW - padx * 2, m * 0.24, { max: m * 0.075, rows: env.portrait ? 3 : 2, bias: env.portrait ? 1.05 : 1.25 });
    const lh = f.size * 1.18 * f.rows, bh = Math.max(lh + f.size * 0.9, m * 0.13);
    const yc = H * (env.portrait ? 0.78 : 0.8), y0 = yc - bh / 2, sh = m * 0.045;
    const k1 = kIn(env, 0.18), k2 = kIn(env, 0.26, 0.05), ko = kOut(env), k3 = env.inOut(0.35, 0.2);
    if (k1 * ko > 0.002) {
      env.rect(x0, y0 + bh * (1 - k1), tabW, bh * k1, sc.ink, ko, true);
      const tag = p.tag || 'LIVE', ts = fsz(tag, F(env, 'body'), tabW * 0.72, bh * 0.3, { max: m * 0.042, track: 0.1 });
      lab(env, tag, x0 + tabW / 2, yc - bh * 0.12, ts, { a: k1 * ko, color: sc.onInk, weight: 900 });
      lab(env, L.fmtTime(cut.start), x0 + tabW / 2, yc + bh * 0.22, ts * 0.62, { a: k1 * ko * 0.85, color: sc.onInk, role: 'mono' });
    }
    if (k2 * ko > 0.002) plate(env, x0 + tabW, y0, (x1 - x0 - tabW) * k2, bh, sc.paper, ko, true);
    if (k3 > 0.002) {
      env.rect(x0, y0 + bh, (x1 - x0) * k3, sh, sc.accent2, 1, false);
      lab(env, `LINE ${lineNo(cut)}   ◆   ${(cut.part || 0) + 1}/${cut.parts || 1}`, x0 + tabW + padx, y0 + bh + sh / 2, sh * 0.5, { align: 'left', a: k3, color: sc.onAccent2, role: 'mono', track: 0.15 });
    }
    const it = setLeft({ text: f.text, font, size: f.size, color: sc.onPaper }, x0 + tabW + padx);
    it.y = yc;
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_viewfinder', {
  name: 'ファインダー', tags: ['cyber', 'dark', 'graphic'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'body']), grid: rng.chance(0.5) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const k = env.inOut(0.45, 0);
    const i0 = m * 0.06, x0 = i0, x1 = W - i0, y0 = i0, y1 = H - i0, arm = m * 0.075, lw = Math.max(1.5, u * 3.5);
    if (k > 0.002) {
      if (p.grid) {
        for (const t of [1 / 3, 2 / 3]) {
          env.line([[W * t, y0], [W * t, y0 + (y1 - y0) * k]], sc.sub, hair(env), 0.22);
          env.line([[x0, H * t], [x0 + (x1 - x0) * k, H * t]], sc.sub, hair(env), 0.22);
        }
      }
      const d = (1 - k) * m * 0.05;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = (sx < 0 ? x0 : x1) + sx * d, cy = (sy < 0 ? y0 : y1) + sy * d;
        env.line([[cx, cy - sy * arm], [cx, cy], [cx - sx * arm, cy]], sc.fg, lw, 0.85 * k);
      }
      const t = m * 0.025;
      env.line([[W / 2, y0], [W / 2, y0 + t]], sc.fg, lw, 0.7 * k); env.line([[W / 2, y1], [W / 2, y1 - t]], sc.fg, lw, 0.7 * k);
      env.line([[x0, H / 2], [x0 + t, H / 2]], sc.fg, lw, 0.7 * k); env.line([[x1, H / 2], [x1 - t, H / 2]], sc.fg, lw, 0.7 * k);
      const ls = m * 0.028, ix = x0 + m * 0.035, iy = y0 + m * 0.045;
      env.circle(ix + ls * 0.3, iy, ls * 0.32, acc(env), null, 1, k * blinkA(env));
      lab(env, 'REC', ix + ls * 0.9, iy, ls, { align: 'left', a: k, color: sc.fg, role: 'mono' });
      lab(env, L.fmtTime(env.t), x1 - m * 0.035, iy, ls, { align: 'right', a: k, color: sc.fg, role: 'mono' });
      lab(env, 'AF  ・  24P', ix, y1 - m * 0.045, ls * 0.9, { align: 'left', a: k, role: 'mono' });
      const bw = ls * 1.8, bh2 = ls * 0.9, bx = x1 - m * 0.035 - bw, by = y1 - m * 0.045 - bh2 / 2;
      env.rrect(bx, by, bw, bh2, bh2 * 0.15, null, k, false, sc.sub, hair(env));
      env.rect(bx + bw, by + bh2 * 0.3, bh2 * 0.15, bh2 * 0.4, sc.sub, k, false);
      for (let i = 0; i < 3; i++) env.rect(bx + bh2 * 0.15 + i * bw * 0.3, by + bh2 * 0.18, bw * 0.24, bh2 * 0.64, sc.sub, k * 0.9, false);
      lab(env, 'L-' + lineNo(cut), bx - ls * 0.6, y1 - m * 0.045, ls * 0.9, { align: 'right', a: k, role: 'mono' });
    }
    const f = fit(cut.text, font, W * 0.72, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H / 2 });
  },
}, P);

/* ================================================================ 3. 誌面・グリッド */

L.register('layout', 'a_headline', {
  name: '見出し+リード', tags: ['editorial', 'graphic', 'pop'], w: 1.1, fits: n => n >= 1 && n <= 26,
  plan: (rng, cut) => ({ role: rng.pick(['display', 'serif', 'display']), ro: romajiOf(cut.text), kick: rng.pick(['LYRIC', 'FEATURE', 'TRACK']), seed: rng.int(1, 999) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const x0 = W * 0.08, meas = W * 0.84, ks = m * 0.028, gap = m * 0.035;
    const f = fit(cut.text, font, meas, H * (env.portrait ? 0.34 : 0.4), { max: m * 0.3, rows: env.portrait ? 4 : 3 });
    const it = { text: f.text, font, size: f.size };
    const lm = L.measure(it);
    const leadS = m * 0.03, rowG = m * 0.034;
    const leadH = (p.ro ? leadS * 1.6 : 0) + rowG * 2;
    const T = ks * 1.7 + gap + lm.h + gap + leadH + gap;
    const top = Math.max(H * 0.07, (H - T) / 2);
    const k1 = env.inOut(0.35, 0), k2 = env.inOut(0.5, 0.12);
    if (k1 > 0.002) {
      const kt = p.kick || 'LYRIC', kw = mw({ text: kt, size: ks, font: F(env, 'body'), weight: 800, track: 0.25 }) + ks * 1.4;
      env.rect(x0, top, kw * k1, ks * 1.7, sc.ink, 1, false);
      lab(env, kt, x0 + ks * 0.7, top + ks * 0.85, ks, { align: 'left', a: k1, color: sc.onInk, weight: 800, track: 0.25 });
      lab(env, 'No.' + lineNo(cut), x0 + kw + ks * 0.8, top + ks * 0.85, ks, { align: 'left', a: k1, role: 'mono' });
    }
    setLeft(it, x0);
    it.y = top + ks * 1.7 + gap + lm.h / 2;
    const bb = L.mainDraw(env, it);
    const ry = it.y + lm.h / 2 + gap * 0.8;
    env.polyPartial([[x0, ry], [x0 + meas, ry]], k2, sc.fg, Math.max(1.5, u * 3.5), 1);
    let y = ry + gap;
    if (p.ro) { lab(env, p.ro, x0, y + leadS * 0.6, Math.min(leadS, fsz(p.ro, F(env, 'serif'), meas, m, { weight: 500 })), { align: 'left', a: k2, font: F(env, 'serif'), weight: 500, italic: true, track: 0.05 }); y += leadS * 1.6; }
    for (let i = 0; i < 2; i++) {
      const e = clamp(k2 * 1.5 - i * 0.3), wv = meas * (i ? 0.45 + 0.3 * L.r(p.seed, i) : 0.9 + 0.1 * L.r(p.seed, 7));
      env.rect(x0, y + rowG * (i + 0.5) - m * 0.006, wv * e, m * 0.012, sc.sub, 0.35, false);
    }
    return bb;
  },
}, P);

L.register('layout', 'a_swiss', {
  name: 'スイスグリッド', tags: ['editorial', 'graphic'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'body']), sq: rng.chance(0.75) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const C = env.portrait ? 2 : (W / H < 1.2 ? 3 : 4);
    const mx = W * 0.06, my = H * 0.07, gw = (W - 2 * mx) / C, pad = m * 0.018, ls = m * 0.024;
    const yR = H * (env.portrait ? 0.2 : 0.24), yF = H * (env.portrait ? 0.84 : 0.8);
    const k = env.inOut(0.6, 0), A = acc(env);
    if (k > 0.002) {
      for (let i = 0; i <= C; i++) {
        const x = mx + i * gw;
        env.polyPartial([[x, my], [x, H - my]], clamp(k * 1.3 - i * 0.08), sc.sub, hair(env), 0.4);
        if (i < C) lab(env, pad2(i + 1), x + pad, my + ls, ls, { align: 'left', a: k, role: 'mono' });
      }
      env.polyPartial([[mx, yR], [W - mx, yR]], k, sc.fg, Math.max(2, u * 5), 1);
      env.polyPartial([[W - mx, yF], [mx, yF]], k, sc.fg, hair(env), 0.8);
      if (p.sq) { const s = Math.min(gw * 0.3, (yR - my) * 0.42) * k; env.rect(mx + (C - 1) * gw + pad, yR - pad - s, s, s, A, 1, false); }
      const cxl = mx + (C - 1) * gw + pad;
      lab(env, 'LINE ' + lineNo(cut), cxl, yF + ls * 1.5, ls, { align: 'left', a: k, role: 'mono' });
      lab(env, L.fmtTime(cut.start), cxl, yF + ls * 2.9, ls, { align: 'left', a: k, role: 'mono' });
      lab(env, 'LYRIC', mx + pad, yF + ls * 1.5, ls, { align: 'left', a: k, track: 0.3, color: sc.fg });
    }
    const top = yR + m * 0.045, availH = yF - top - m * 0.04;
    const { lines, size } = bestStack(cut.text, font, W - 2 * mx - pad * 2, availH, 1.08, env.portrait ? 4 : 3, { max: m * 0.3 });
    let bb = null;
    lines.forEach((ln, i) => {
      const it = setLeft({ text: ln, font, size, mi: i }, mx + pad);
      it.y = top + size * (0.55 + i * 1.08);
      bb = L.unionBB(bb, L.mainDraw(env, it));
    });
    return bb;
  },
}, P);

L.register('layout', 'a_toc', {
  name: '目次', tags: ['editorial', 'calm'], w: 0.9, fits: n => n >= 2 && n <= 30,
  plan: rng => ({ role: rng.pick(['body', 'display', 'serif']), title: rng.pick(['INDEX', 'CONTENTS']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'body');
    const rows = groupChunks(cut.text, clamp(Math.ceil(cut.n / 5), 1, env.portrait ? 5 : 4)), R = rows.length;
    const x0 = W * (env.portrait ? 0.07 : 0.12), x1 = W - x0;
    const s = Math.min(stackFit(rows, font, (x1 - x0) * 0.6, 1e9, 1, {}), H * 0.62 / ((R + 1.2) * 1.7), m * 0.12);
    const pitch = s * 1.7, ns = Math.max(s * 0.42, m * 0.022), ls = m * 0.028;
    const blockH = (R + 2) * pitch, y0 = H / 2 - blockH / 2 + ls;
    const k = env.inOut(0.5, 0), A = acc(env), cur = Math.min(R - 1, Math.floor(clamp(env.lt / Math.max(0.1, cut.dur)) * R));
    const pageW = mw({ text: '000', size: ns, font: F(env, 'mono'), weight: 700 });
    if (k > 0.002) {
      lab(env, p.title || 'INDEX', x0, y0 - ls * 2.2, ls, { align: 'left', a: k, track: 0.35, color: sc.fg });
      env.polyPartial([[x0, y0 - ls * 1.1], [x1, y0 - ls * 1.1]], k, sc.fg, Math.max(1.5, u * 3), 1);
      for (const j of [-1, R]) {
        const y = y0 + (j + 1.5) * pitch;
        env.rect(x0 + s * 1.6, y - s * 0.12, (x1 - x0) * 0.3 * k, s * 0.24, sc.sub, 0.22, false);
        lab(env, pad2(j < 0 ? 0 : R + 1), x0, y, ns, { align: 'left', a: k * 0.4, role: 'mono' });
      }
    }
    let bb = null;
    const base = ((cut.lineIdx || 0) * 12 + 4);
    rows.forEach((ln, i) => {
      const y = y0 + (i + 1.5) * pitch;
      const it = setLeft({ text: ln, font, size: s, mi: i }, x0 + s * 1.6);
      it.y = y;
      const ib = L.itemBox(it);
      const r = L.mainDraw(env, it);
      bb = L.unionBB(bb, r);
      const kr = clamp(k * 1.4 - i * 0.12);
      if (kr <= 0.002) return;
      lab(env, pad2(i + 1), x0, y, ns, { align: 'left', a: kr, role: 'mono', color: i === cur ? A : sc.sub });
      if (i === cur) env.circle(x0 - ns * 0.9, y, ns * 0.22, A, null, 1, kr);
      lab(env, String(base + i * 3), x1, y, ns, { align: 'right', a: kr, role: 'mono', color: sc.fg });
      const lx0 = ib.x1 + s * 0.4, lx1 = x1 - pageW - s * 0.4;
      if (lx1 > lx0 + s) env.line([[lx0, y + s * 0.2], [lx0 + (lx1 - lx0) * kr, y + s * 0.2]], sc.sub, Math.max(1.5, u * 3.5), 0.8 * kr, false, [0.01, Math.max(4, s * 0.3)]);
    });
    return bb;
  },
}, P);

L.register('layout', 'a_footnote', {
  name: '脚注', tags: ['editorial', 'calm', 'emotional'], w: 0.9, emph: 0.7, fits: n => n >= 1 && n <= 26,
  plan: (rng, cut) => ({ mark: rng.pick(['*1', '※1', '†']), ro: romajiOf(cut.text), role: rng.pick(['serif', 'display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const f = fit(cut.text, font, W * 0.78, H * (env.portrait ? 0.3 : 0.36), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2 - m * 0.02, y: H * 0.44 };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.4, 0.2), k2 = env.inOut(0.5, 0.3);
    if (k <= 0.002) return bb;
    const A = acc(env), mark = p.mark || '*1', ms = Math.max(f.size * 0.3, m * 0.035);
    const mw1 = mw({ text: mark, size: ms, font: F(env, 'serif'), weight: 700, track: 0 });
    const mx1 = Math.min(b.x1 + ms * 0.15 + mw1 / 2, W * 0.96 - mw1 / 2);
    lab(env, mark, mx1, b.y0 + ms * 0.55 + (1 - k) * ms * 0.6, ms, { a: k, color: A, font: F(env, 'serif'), track: 0 });
    const x0 = W * 0.08, ry = H * (env.portrait ? 0.82 : 0.78), ls = m * 0.028;
    env.polyPartial([[x0, ry], [x0 + W * (env.portrait ? 0.34 : 0.22), ry]], k2, sc.sub, hair(env), 0.9);
    lab(env, `${mark}  ${p.ro || ('LINE ' + lineNo(cut))}`, x0, ry + ls * 1.5, ls, { align: 'left', a: k2, color: sc.fg, weight: 500, font: F(env, 'body') });
    lab(env, `${L.fmtTime(cut.start)} – ${L.fmtTime(cut.end)}`, x0, ry + ls * 2.9, ls * 0.9, { align: 'left', a: k2, role: 'mono' });
    return bb;
  },
}, P);

L.register('layout', 'a_proof', {
  name: '校正紙', tags: ['editorial', 'graphic', 'calm'], w: 0.9, treat: 'safe', fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['serif', 'display', 'body']), bars: rng.chance(0.75) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const f = fit(cut.text, font, W * (env.portrait ? 0.6 : 0.54), H * (env.portrait ? 0.26 : 0.3), { max: m * 0.17, rows: env.portrait ? 4 : 3 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * 0.48, color: sc.onPaper };
    const b = L.itemBox(it);
    const pad = Math.max(m * 0.07, f.size * 0.45);
    const px0 = b.x0 - pad, px1 = b.x1 + pad, py0 = b.y0 - pad * 0.8, py1 = b.y1 + pad * 0.8, pw = px1 - px0, ph = py1 - py0, cx = W / 2, cy = (py0 + py1) / 2;
    const k1 = env.inOut(0.4, 0), k2 = env.inOut(0.45, 0.14);
    if (k1 > 0.002) {
      const s = 0.94 + 0.06 * k1;
      plate(env, cx - pw * s / 2, cy - ph * s / 2, pw * s, ph * s, sc.paper, k1, true);
    }
    const bb = L.mainDraw(env, it);
    if (k2 > 0.002) {
      const g = m * 0.022, len = m * 0.05, lw = hair(env);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx < 0 ? px0 : px1, y = sy < 0 ? py0 : py1;
        env.line([[x + sx * g, y], [x + sx * (g + len * k2), y]], sc.fg, lw, k2);
        env.line([[x, y + sy * g], [x, y + sy * (g + len * k2)]], sc.fg, lw, k2);
      }
      const rr = m * 0.016;
      for (const sx of [-1, 1]) {
        const rx = (sx < 0 ? px0 : px1) + sx * (g + rr * 1.8);
        env.circle(rx, cy, rr, null, sc.fg, lw, k2);
        env.line([[rx - rr * 1.6, cy], [rx + rr * 1.6, cy]], sc.fg, lw, k2);
        env.line([[rx, cy - rr * 1.6], [rx, cy + rr * 1.6]], sc.fg, lw, k2);
      }
      if (p.bars) {
        const cols = [sc.accent, sc.accent2, sc.fg, sc.sub, sc.dim, sc.paper], cs = m * 0.028;
        cols.forEach((c, i) => env.rect(px1 - g * 1.5 - (cols.length - i) * cs, py1 + g + len * 0.3, cs, cs, c, clamp(k2 * 2 - i * 0.15), false));
      }
      lab(env, `PROOF ${lineNo(cut)}  ・  ${L.fmtTime(cut.start)}`, px0 + m * 0.03, py0 - g - len * 0.5, m * 0.022, { align: 'left', a: k2, role: 'mono' });
    }
    return bb ? L.unionBB(bb, { x0: px0, y0: py0, x1: px1, y1: py1, w: pw, h: ph, cx, cy }) : null;
  },
}, P);

L.register('layout', 'a_poster', {
  name: 'ポスター', tags: ['graphic', 'editorial', 'pop', 'dark'], w: 1.1, emph: 1.4, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'display', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const x0 = W * 0.07, meas = W * 0.86, availH = H * (env.portrait ? 0.62 : 0.6), lead = 1.02;
    // 行数ごとに「各行を全幅に拡大 → 高さに収める」を試し、インクの面積が最大の組を選ぶ
    let rows = [cut.text], sizes = null, bestA = -1;
    for (let R = 1; R <= (env.portrait ? 5 : 4); R++) {
      const rs = groupChunks(cut.text, R);
      if (sizes && rs.length === rows.length) continue;
      let ss = rs.map(r => Math.min(fsz(r, font, meas, 1e9, { track: -0.02 }), H * 0.55));
      const sum = ss.reduce((a, b) => a + b * lead, 0);
      if (sum > availH) ss = ss.map(s => s * availH / sum);
      const area = rs.reduce((a, r, i) => a + mw({ text: r, font, size: ss[i], track: -0.02 }) * ss[i], 0) * Math.pow(0.93, rs.length);
      if (area > bestA) { bestA = area; rows = rs; sizes = ss; }
    }
    const tot = sizes.reduce((a, b) => a + b * lead, 0);
    let y = H * 0.44 - tot / 2;
    let bb = null;
    rows.forEach((r, i) => {
      const it = setLeft({ text: r, font, size: sizes[i], track: -0.02, lead: 1, mi: i }, x0);
      it.y = y + sizes[i] * lead / 2;
      y += sizes[i] * lead;
      bb = L.unionBB(bb, L.mainDraw(env, it));
    });
    const k = env.inOut(0.5, 0.15);
    if (k > 0.002) {
      const ry = H * (env.portrait ? 0.84 : 0.82), ls = m * 0.022;
      env.polyPartial([[x0, ry], [x0 + meas, ry]], k, sc.fg, Math.max(1.5, u * 3), 1);
      const cols = [['LYRIC VIDEO', 'SIDE A'], ['No.' + lineNo(cut), L.fmtTime(cut.start)], [`${(cut.part || 0) + 1} / ${cut.parts || 1}`, 'STEREO']];
      cols.forEach((c, i) => c.forEach((t, j) => {
        const x = i === 2 ? x0 + meas : x0 + meas * (i * 0.36);
        lab(env, t, x, ry + ls * (1.5 + j * 1.4), ls, { align: i === 2 ? 'right' : 'left', a: clamp(k * 1.5 - i * 0.2), role: j ? 'mono' : 'body', color: j ? sc.sub : sc.fg, track: 0.15 });
      }));
    }
    return bb;
  },
}, P);

L.register('layout', 'a_spread', {
  name: '見開き', tags: ['editorial', 'calm', 'emotional'], w: 0.9, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ tintLeft: rng.chance(0.5), role: rng.pick(['serif', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const port = env.portrait;
    const len = L.glyphs(cut.text).length;
    let lines = cut.n >= 2 ? L.splitLines(cut.text, Math.ceil(len / 2)) : [cut.text];
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(isLat(cut.text) ? ' ' : '')];
    const A = port ? { x0: W * 0.08, x1: W * 0.92, y0: H * 0.08, y1: H * 0.47 } : { x0: W * 0.06, x1: W * 0.46, y0: H * 0.12, y1: H * 0.88 };
    const B = port ? { x0: W * 0.08, x1: W * 0.92, y0: H * 0.53, y1: H * 0.92 } : { x0: W * 0.54, x1: W * 0.94, y0: H * 0.12, y1: H * 0.88 };
    const k = env.inOut(0.5, 0), ls = m * 0.024;
    if (k > 0.002) {
      const T = p.tintLeft ? A : B;
      if (port) { const h = (p.tintLeft ? H / 2 : H / 2) * k; env.rect(0, p.tintLeft ? H / 2 - h : H / 2, W, h, sc.dim, 0.6, false); }
      else { const w = W / 2 * k; env.rect(p.tintLeft ? W / 2 - w : W / 2, 0, w, H, sc.dim, 0.6, false); }
      if (port) { env.polyPartial([[W / 2, H / 2], [0, H / 2]], k, sc.sub, hair(env), 0.8); env.polyPartial([[W / 2, H / 2], [W, H / 2]], k, sc.sub, hair(env), 0.8); }
      else { env.polyPartial([[W / 2, H / 2], [W / 2, 0]], k, sc.sub, hair(env), 0.8); env.polyPartial([[W / 2, H / 2], [W / 2, H]], k, sc.sub, hair(env), 0.8); }
      void T;
      const pg = ((cut.lineIdx || 0) * 2 + 2);
      lab(env, 'LYRIC', A.x0, A.y0 - ls * (port ? 0.6 : 1.8), ls, { align: 'left', a: k, track: 0.3 });
      lab(env, 'No.' + lineNo(cut), B.x1, (port ? A.y0 : B.y0) - ls * (port ? 0.6 : 1.8), ls, { align: 'right', a: k, role: 'mono' });
      lab(env, pad2(pg), A.x0, port ? A.y1 - ls * 0.2 : A.y1 + ls * 1.8, ls, { align: 'left', a: k, role: 'mono' });
      lab(env, pad2(pg + 1), B.x1, B.y1 + ls * (port ? 0.8 : 1.8), ls, { align: 'right', a: k, role: 'mono' });
    }
    const boxIn = (Q, t, o = {}) => fit(t, font, (Q.x1 - Q.x0) * 0.86, (Q.y1 - Q.y0) * (o.h || 0.6), { max: m * 0.2, rows: port ? 2 : 3, bias: 1.2 });
    if (lines.length === 2) {
      const fa = boxIn(A, lines[0]), fb = boxIn(B, lines[1]);
      const s = Math.min(fa.size, fb.size);
      const a = L.mainDraw(env, { text: fa.text, font, size: s, x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2, mi: 0 });
      const b = L.mainDraw(env, { text: fb.text, font, size: s, x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2, mi: 1 });
      return L.unionBB(a, b);
    }
    if (k > 0.002) {
      const df = F(env, 'display'), num = lineNo(cut), ns = fsz(num, df, (A.x1 - A.x0) * 0.7, (A.y1 - A.y0) * 0.7);
      env.text({ text: num, font: df, weight: 900, size: ns, x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2, fill: false, stroke: Math.max(1, u * 3), strokeColor: sc.sub, strokeUnder: false, color: sc.sub, alpha: k * 0.7, ghost: false });
    }
    const fb = boxIn(B, lines[0]);
    return L.mainDraw(env, { text: fb.text, font, size: fb.size, x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 });
  },
}, P);

L.register('layout', 'a_dictionary', {
  name: '辞書項目', tags: ['editorial', 'calm', 'pop'], w: 0.8, fits: n => n >= 1 && n <= 20,
  plan: (rng, cut) => ({ ro: romajiOf(cut.text), role: rng.pick(['serif', 'display']), defs: rng.int(2, 3), seed: rng.int(1, 999) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'serif');
    const x0 = W * (env.portrait ? 0.08 : 0.1), meas = W * (env.portrait ? 0.74 : 0.7);
    const f = fit(cut.text, font, meas, H * (env.portrait ? 0.26 : 0.3), { max: m * 0.16, rows: env.portrait ? 3 : 2 });
    const it = { text: f.text, font, size: f.size };
    const lm = L.measure(it);
    const rs = m * 0.032, D = p.defs || 2, rowH = m * 0.058;
    const T = lm.h + m * 0.04 + rs * 1.4 + m * 0.03 + D * rowH;
    const top = Math.max(H * 0.07, (H - T) / 2);
    setLeft(it, x0);
    it.y = top + lm.h / 2;
    const k1 = env.inOut(0.4, 0.1), k2 = env.inOut(0.5, 0.2), A = acc(env);
    if (k1 > 0.002) {
      // つめ見出し(サムインデックス)
      const tw1 = m * (env.portrait ? 0.075 : 0.095), th = m * 0.2, ch = nonSpace(cut.text)[0] || '';
      env.rect(W - tw1 * k1, it.y - th / 2, tw1 * 1.2, th, sc.ink, 1, false);
      lab(env, isLat(ch) ? ch.toUpperCase() : ch, W - tw1 * k1 + tw1 * 0.48, it.y, tw1 * 0.62, { a: k1, color: sc.onInk, font: F(env, 'display'), weight: 900, track: 0 });
    }
    const bb = L.mainDraw(env, it);
    const ry = top + lm.h + m * 0.04 + rs * 0.7;
    if (k1 > 0.002) {
      env.rrect(x0, ry - rs * 0.7, rs * 1.4, rs * 1.4, rs * 0.18, null, k1, false, sc.sub, hair(env));
      lab(env, isLat(cut.text) ? 'n.' : '名', x0 + rs * 0.7, ry, rs * 0.85, { a: k1, color: sc.fg, track: 0, font: F(env, 'serif') });
      if (p.ro) lab(env, `［ ${p.ro.toLowerCase()} ］`, x0 + rs * 2, ry, Math.min(rs, fsz(`［ ${p.ro} ］`, F(env, 'serif'), meas - rs * 2, m, { weight: 500 })), { align: 'left', a: k1, italic: true, weight: 500, font: F(env, 'serif'), track: 0.04 });
      else env.polyPartial([[x0 + rs * 2, ry], [x0 + meas * 0.5, ry]], k1, sc.sub, hair(env), 0.6);
    }
    for (let i = 0; i < D; i++) {
      const e = clamp(k2 * 1.6 - i * 0.25);
      if (e <= 0.002) continue;
      const y = ry + rs * 0.7 + m * 0.03 + (i + 0.5) * rowH;
      lab(env, String(i + 1), x0 + rs * 0.5, y, rs * 0.95, { a: e, color: A, weight: 900, track: 0 });
      const w1 = meas * (0.45 + 0.4 * L.r(p.seed, i, 'a')), w2 = meas * (0.12 + 0.18 * L.r(p.seed, i, 'b'));
      env.rect(x0 + rs * 1.5, y - rs * 0.18, w1 * e, rs * 0.36, sc.sub, 0.32, false);
      if (w1 + w2 + rs * 2 < meas) env.rect(x0 + rs * 1.5 + w1 + rs * 0.5, y - rs * 0.18, w2 * e, rs * 0.36, sc.sub, 0.2, false);
    }
    return bb;
  },
}, P);

/* ================================================================ 4. 帯・マーキー */

L.register('layout', 'a_marquee', {
  name: 'マーキー帯', tags: ['pop', 'graphic', 'cyber'], w: 1.1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ below: rng.chance(0.65), dir: rng.sign(), role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const hb = m * (env.portrait ? 0.11 : 0.13), gap = m * 0.07;
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2 };
    const lh = L.measure(it).h, T = lh + gap + hb;
    it.y = p.below ? H / 2 - T / 2 + lh / 2 : H / 2 + T / 2 - lh / 2;
    const yb = p.below ? H / 2 + T / 2 - hb / 2 : H / 2 - T / 2 + hb / 2;
    const k = env.inOut(0.4, 0);
    if (k > 0.002) {
      const h = hb * k;
      env.rect(0, yb - h / 2, W, h, sc.ink, 1, true);
      if (env.pass === 'main') {
        const ctx = env.ctx;
        ctx.save(); ctx.beginPath(); ctx.rect(0, yb - h / 2, W, h); ctx.clip();
        const t = Math.max(1, u * 2.5);
        ctx.globalAlpha = 0.6 * k; ctx.fillStyle = sc.onInk;
        ctx.fillRect(0, yb - hb * 0.36 - t, W, t); ctx.fillRect(0, yb + hb * 0.36, W, t);
        scrollRow(env, cut.text + sepOf(cut.text), 0, W, yb, hb * 0.44, F(env, 'display'), sc.onInk, k, (p.dir || 1) * env.ltb * m * 0.22);
        ctx.restore();
      }
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_diagband', {
  name: '斜め帯', tags: ['pop', 'graphic', 'glitch'], w: 1, emph: 1.4, treat: false, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ ang: rng.sign() * rng.range(8, 14), dir: rng.sign(), role: rng.pick(['display', 'display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const k = env.inOut(0.45, 0);
    if (k > 0.002 && env.pass === 'main') {
      const ctx = env.ctx, bh = m * 0.2, len = Math.hypot(W, H) * 1.1, bw = len * k;
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate((p.ang || 10) * DEG);
      ctx.globalAlpha = 1; ctx.fillStyle = sc.ink; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
      ctx.fillStyle = sc.onInk; ctx.globalAlpha = 0.55;
      const t = Math.max(1, u * 2.5);
      ctx.fillRect(-bw / 2, -bh * 0.4, bw, t); ctx.fillRect(-bw / 2, bh * 0.4 - t, bw, t);
      scrollRow(env, cut.text + sepOf(cut.text), -len / 2, len / 2, 0, bh * 0.42, F(env, 'display'), sc.onInk, 0.62 * k, (p.dir || 1) * env.ltb * m * 0.3);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    const f = fit(cut.text, font, W * 0.78, H * (env.portrait ? 0.3 : 0.34), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H / 2, stroke: f.size * 0.16, strokeColor: sc.bg, ghostStroke: false });
  },
}, P);

L.register('layout', 'a_crossbands', {
  name: '逆走2本帯', tags: ['pop', 'graphic', 'cyber', 'glitch'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ ro: romajiOf(cut.text), role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.26 : 0.28), { max: m * 0.19, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H / 2 };
    const b = L.itemBox(it);
    const bh = m * (env.portrait ? 0.07 : 0.08), gap = m * 0.055;
    const yA = Math.max(H * 0.04 + bh / 2, b.y0 - gap - bh / 2), yB = Math.min(H * 0.96 - bh / 2, b.y1 + gap + bh / 2);
    const kA = env.inOut(0.45, 0), kB = env.inOut(0.45, 0.1);
    if (env.pass === 'main') {
      const ctx = env.ctx, df = F(env, 'display'), sp = m * 0.2;
      if (kA > 0.002) {
        ctx.save(); ctx.translate(W / 2 - (1 - kA) * W, yA); ctx.rotate(-2.5 * DEG);
        ctx.globalAlpha = 1; ctx.fillStyle = sc.ink; ctx.fillRect(-W * 0.62, -bh / 2, W * 1.24, bh);
        ctx.beginPath(); ctx.rect(-W * 0.62, -bh / 2, W * 1.24, bh); ctx.clip();
        scrollRow(env, cut.text + sepOf(cut.text), -W * 0.62, W * 0.62, 0, bh * 0.56, df, sc.onInk, kA, env.ltb * sp);
        ctx.restore();
      }
      if (kB > 0.002) {
        ctx.save(); ctx.translate(W / 2 + (1 - kB) * W, yB); ctx.rotate(2.5 * DEG);
        ctx.globalAlpha = 0.8 * kB; ctx.fillStyle = sc.fg;
        const t = Math.max(1, u * 2.5);
        ctx.fillRect(-W * 0.62, -bh / 2, W * 1.24, t); ctx.fillRect(-W * 0.62, bh / 2 - t, W * 1.24, t);
        ctx.beginPath(); ctx.rect(-W * 0.62, -bh / 2, W * 1.24, bh); ctx.clip();
        const s2 = (p.ro || cut.text) + sepOf(cut.text);
        scrollRow(env, s2, -W * 0.62, W * 0.62, 0, bh * 0.6, df, sc.fg, 0.85 * kB, -env.ltb * sp, { stroke: Math.max(1, u * 2.2) });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_ticker', {
  name: 'ティッカー', tags: ['cyber', 'pop', 'editorial'], w: 1, fits: n => n >= 1 && n <= 26,
  plan: (rng, cut) => ({ ro: romajiOf(cut.text), tag: rng.pick(['LIVE', 'NEWS', 'NOW']), role: rng.pick(['display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.32 : 0.38), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H * 0.45 });
    const k = env.inOut(0.4, 0.05);
    if (k > 0.002) {
      const bh = m * 0.065, yb = H - m * 0.06 - bh + (1 - k) * (bh + m * 0.08);
      const barC = sc.dark ? '#000000' : sc.fg, txtC = sc.dark ? sc.fg : sc.bg;
      env.rect(0, yb, W, bh, barC, sc.dark ? 0.55 : 0.88, false);
      env.rect(0, yb - Math.max(2, u * 4), W, Math.max(2, u * 4), sc.accent, 1, false);
      const tag = p.tag || 'LIVE', ts = bh * 0.46;
      const tabW = mw({ text: tag, size: ts, font: F(env, 'body'), weight: 900, track: 0.15 }) + bh * 1.3;
      if (env.pass === 'main') {
        const ctx = env.ctx;
        ctx.save(); ctx.beginPath(); ctx.rect(tabW, yb, W - tabW, bh); ctx.clip();
        const s = `${p.ro || cut.text}　｜　${L.fmtTime(cut.start)}　｜　LINE ${lineNo(cut)}　｜　`;
        scrollRow(env, s, tabW, W, yb + bh / 2, bh * 0.46, F(env, 'body'), txtC, k, env.ltb * m * 0.16, { weight: 700 });
        ctx.restore();
      }
      env.rect(0, yb, tabW, bh, sc.ink, 1, false);
      env.circle(bh * 0.42, yb + bh / 2, bh * 0.11, sc.onInk, null, 1, k * blinkA(env, 1.5));
      lab(env, tag, bh * 0.7, yb + bh / 2, ts, { align: 'left', color: sc.onInk, weight: 900, track: 0.15, a: k });
    }
    return bb;
  },
}, P);

L.register('layout', 'a_stackbands', {
  name: '帯の積層', tags: ['graphic', 'pop', 'glitch', 'dark'], w: 0.9, emph: 1.5, busy: true, treat: 'safe', fits: n => n >= 1 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), seed: rng.int(1, 999) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const R = env.portrait ? 9 : 7, mid = (R - 1) / 2, unit = H / (R + 1);
    if (env.pass === 'main') {
      const df = F(env, 'display'), s = cut.text + sepOf(cut.text);
      for (let j = 0; j < R; j++) {
        if (j === mid) continue;
        const kj = env.inOut(0.4, 0.035 * Math.abs(j - mid));
        if (kj <= 0.002) continue;
        const y = (j < mid ? j + 0.5 : j + 1.5) * unit;
        const dir = j % 2 ? 1 : -1, sp = m * (0.1 + 0.05 * ((j * 7 + (p.seed || 0)) % 3));
        scrollRow(env, s, 0, W, y, unit * 0.7, df, sc.fg, kj * (j % 2 ? 0.26 : 0.15), dir * env.ltb * sp + j * W * 0.13, j % 2 ? { stroke: Math.max(1, u * 2) } : {});
      }
    }
    const kb = kIn(env, 0.25) * kOut(env);
    if (kb > 0.002) env.rect(W / 2 - W * kIn(env, 0.25) / 2, H / 2 - unit, W * kIn(env, 0.25), unit * 2, sc.ink, kOut(env), true);
    const f = fit(cut.text, font, W * 0.88, unit * 1.62, { max: m * 0.2, rows: 2 });
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H / 2, color: sc.onInk });
  },
}, P);

L.register('layout', 'a_vscroll', {
  name: '縦スクロール列', tags: ['cyber', 'calm', 'wa', 'graphic'], w: 0.9, fits: n => n >= 1 && n <= 26,
  plan: rng => ({ role: rng.pick(['display', 'serif', 'body']), dir: rng.sign() }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const cw = m * (env.portrait ? 0.07 : 0.075), mx = W * 0.045;
    const xL = mx + cw / 2, xR = W - mx - cw / 2;
    const k = env.inOut(0.5, 0);
    if (k > 0.002) {
      env.line([[xL + cw * 0.95, H / 2 - H * 0.44 * k], [xL + cw * 0.95, H / 2 + H * 0.44 * k]], sc.sub, hair(env), 0.5);
      env.line([[xR - cw * 0.95, H / 2 - H * 0.44 * k], [xR - cw * 0.95, H / 2 + H * 0.44 * k]], sc.sub, hair(env), 0.5);
      if (env.pass === 'main') {
        const ctx = env.ctx, seq = nonSpace(cut.text).concat(['・']), N = seq.length;
        const gs = cw * 0.78, step = gs * 1.14, fe = H * 0.14;
        ctx.font = `900 ${gs.toFixed(1)}px ${F(env, 'display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = sc.sub;
        for (const side of [0, 1]) {
          const off = (side ? -1 : 1) * (p.dir || 1) * env.ltb * m * 0.12;
          const sft = off / step, fl = Math.floor(sft), fr = sft - fl;
          const x = side ? xR : xL;
          for (let i = -1; i <= Math.ceil(H / step) + 1; i++) {
            const y = (i + fr) * step;
            const a = k * 0.6 * L.smooth(0, fe, y) * L.smooth(0, fe, H - y);
            if (a <= 0.01) continue;
            const ch = seq[(((i - fl) % N) + N) % N];
            ctx.globalAlpha = a;
            ctx.fillText(ch, x, y);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    const inner = W - 2 * (mx + cw * 1.3) - m * 0.06;
    const f = fit(cut.text, font, inner, H * (env.portrait ? 0.4 : 0.44), { max: m * 0.2, rows: env.portrait ? 5 : 3 });
    return L.mainDraw(env, { text: f.text, font, size: f.size, x: W / 2, y: H / 2 });
  },
}, P);

L.register('layout', 'a_ribbonwave', {
  name: '波打つ帯', tags: ['pop', 'emotional', 'calm'], w: 0.9, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ up: rng.chance(0.35), dir: rng.sign(), role: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * 0.84, H * (env.portrait ? 0.3 : 0.32), { max: m * 0.2, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: W / 2, y: H * (p.up ? 0.58 : 0.42) };
    const b = L.itemBox(it);
    const bb = L.mainDraw(env, it);
    const k = env.inOut(0.5, 0.05);
    if (k <= 0.002) return bb;
    const A = m * 0.04, gs = m * 0.05, lam = env.portrait ? W * 1.1 : W * 0.55;
    const y0 = p.up ? Math.max(b.y0 - m * 0.13, H * 0.13) : Math.min(b.y1 + m * 0.13, H * 0.87);
    const ph = env.ltb * 1.3;
    const wy = x => y0 + A * Math.sin(TAU * x / lam + ph);
    const AC = acc(env);
    for (const o of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 48; i++) { const x = W * i / 48; pts.push([x, wy(x) + o * gs * 0.95]); }
      env.polyPartial(pts, k, AC, hair(env), 0.6);
    }
    if (env.pass === 'main') {
      const ctx = env.ctx, df = F(env, 'display');
      const seq = L.glyphs(cut.text + sepOf(cut.text));
      const adv = seq.map(ch => (L.isSpace(ch) ? gs * 0.32 : L.adv(df, 900, ch) * gs));
      const per = adv.reduce((a, c) => a + c, 0);
      if (per > 1) {
        ctx.font = `900 ${gs.toFixed(1)}px ${df}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = AC;
        const off = (p.dir || 1) * env.ltb * m * 0.15;
        let x = -(((off % per) + per) % per) - per, idx = 0, guard = 0;
        while (x < W + gs && guard++ < 400) {
          const ch = seq[idx], w = adv[idx];
          const cx = x + w / 2;
          if (cx > -gs && !L.isSpace(ch)) {
            const sl = A * TAU / lam * Math.cos(TAU * cx / lam + ph);
            ctx.save(); ctx.translate(cx, wy(cx)); ctx.rotate(Math.atan(sl));
            ctx.globalAlpha = k * 0.9; ctx.fillText(ch, 0, 0); ctx.restore();
          }
          x += w; idx = (idx + 1) % seq.length;
        }
        ctx.globalAlpha = 1;
      }
    }
    return bb;
  },
}, P);

/* ================================================================ 5. 円・放射 */

L.register('layout', 'a_ring', {
  name: '円環文字', tags: ['graphic', 'pop', 'cyber', 'emotional'], w: 1, treat: false, emph: 1.2, fits: n => n >= 1 && n <= 22,
  plan: rng => ({ dir: rng.sign(), role: rng.pick(['display', 'body', 'display']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const cx = W / 2, cy = H / 2, R = m * 0.34;
    const src = L.glyphs(cut.text), lat = isLat(cut.text);
    const unit = src.concat(lat ? [' ', '・', ' '] : ['・']);
    const slotsMax = Math.floor(TAU * R / (m * 0.078));
    const reps = Math.max(1, Math.floor(slotsMax / unit.length));
    const N = unit.length * reps, dA = TAU / N;
    const gs = Math.min(m * 0.1, R * dA * (lat ? 1.3 : 0.92));
    const th0 = -Math.PI / 2 - (src.length - 1) * dA / 2 + (p.dir || 1) * env.ltb * 0.22;
    const list = [], seps = [];
    for (let r = 0; r < reps; r++) {
      unit.forEach((ch, i) => {
        if (L.isSpace(ch)) return;
        const th = th0 + (r * unit.length + i) * dA;
        const g = { ch, x: cx + R * Math.cos(th), y: cy + R * Math.sin(th), rot: th + Math.PI / 2 };
        if (i >= src.length) seps.push(g); else list.push(g);
      });
    }
    const k = env.inOut(0.6, 0);
    if (k > 0.002) {
      env.arc(cx, cy, R + gs * 0.85, -90, -90 + 360 * k, sc.sub, hair(env), 0.55);
      env.arc(cx, cy, R - gs * 0.85, 90, 90 + 360 * k, sc.sub, hair(env), 0.55);
      for (const g of seps) lab(env, g.ch, g.x, g.y, gs * 0.7, { rot: g.rot, color: acc(env), a: k, track: 0, weight: 900 });
      lab(env, lineNo(cut), cx, cy - m * 0.02, m * 0.075, { a: k, color: acc(env), weight: 900, font: F(env, 'display'), track: 0 });
      lab(env, L.fmtTime(cut.start), cx, cy + m * 0.05, m * 0.026, { a: k, role: 'mono' });
    }
    const bb = drawGlyphs(env, list, { font, size: gs });
    return bb ? { x0: cx - R - gs, y0: cy - R - gs, x1: cx + R + gs, y1: cy + R + gs, w: 2 * (R + gs), h: 2 * (R + gs), cx, cy } : null;
  },
}, P);

L.register('layout', 'a_concentric', {
  name: '同心円', tags: ['graphic', 'cyber', 'calm'], w: 0.9, treat: false, fits: n => n >= 1 && n <= 22,
  plan: rng => ({ role: rng.pick(['display', 'serif', 'body']), dir: rng.sign() }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const Rt = m * 0.26, cx = W / 2, cy = H / 2 + m * 0.03;
    const s0 = Math.min(m * 0.085, fsz(cut.text, font, Rt * Math.PI * 1.15, 1e9));
    const lay = L.measure({ text: cut.text, font, size: s0 }).lay;
    const list = [];
    for (const g of lay) {
      if (g.space) continue;
      const th = -Math.PI / 2 + g.x / Rt;
      list.push({ ch: g.ch, x: cx + Rt * Math.cos(th), y: cy + Rt * Math.sin(th), rot: th + Math.PI / 2 });
    }
    const k = env.inOut(0.6, 0), k2 = env.inOut(0.6, 0.12);
    const R0 = Rt - s0 * 0.85, R1 = Rt + s0 * 0.85, R2 = Rt + s0 * 1.5, R3 = Math.max(m * 0.06, R0 * 0.55);
    if (k > 0.002) {
      env.arc(cx, cy, R1, -90, -90 + 360 * k, sc.sub, hair(env), 0.6);
      env.arc(cx, cy, R0, 270 - 360 * k, 270, sc.sub, hair(env), 0.6);
      if (env.pass === 'main') {
        const ctx = env.ctx, rot = (p.dir || 1) * env.ltb * 6 * DEG, A = acc(env);
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = sc.sub; ctx.lineWidth = hair(env); ctx.globalAlpha = 0.7 * k2;
        ctx.beginPath();
        for (let i = 0; i < 72; i++) {
          const a = rot + i * TAU / 72, l = i % 6 ? m * 0.014 : m * 0.03;
          ctx.moveTo(cx + R2 * Math.cos(a), cy + R2 * Math.sin(a)); ctx.lineTo(cx + (R2 + l) * Math.cos(a), cy + (R2 + l) * Math.sin(a));
        }
        ctx.stroke();
        ctx.strokeStyle = A; ctx.lineWidth = Math.max(1.5, u * 3); ctx.globalAlpha = 0.8 * k2;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = -rot * 1.6 + i * TAU / 16; ctx.moveTo(cx + R3 * Math.cos(a), cy + R3 * Math.sin(a)); ctx.arc(cx, cy, R3, a, a + TAU / 32); }
        ctx.stroke();
        ctx.restore();
      }
      lab(env, lineNo(cut), cx, cy - m * 0.005, m * 0.05, { a: k2, color: acc(env), weight: 900, font: F(env, 'display'), track: 0 });
      lab(env, L.fmtTime(cut.start), cx, cy + (R0 + R3) / 2, m * 0.024, { a: k2, role: 'mono' });
    }
    const bb = drawGlyphs(env, list, { font, size: s0 });
    const RR = R2 + m * 0.03;
    return bb ? L.unionBB(bb, { x0: cx - RR, y0: cy - RR, x1: cx + RR, y1: cy + RR, w: RR * 2, h: RR * 2, cx, cy }) : null;
  },
}, P);

L.register('layout', 'a_window', {
  name: '円窓', tags: ['calm', 'pop', 'emotional', 'wa'], w: 1.1, treat: 'safe', fits: n => n >= 1 && n <= 24,
  plan: rng => ({ kind: rng.pick(['ink', 'paper', 'ring']), role: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const cx = W / 2, cy = H / 2, R = m * (env.portrait ? 0.4 : W > H * 1.3 ? 0.34 : 0.32);
    const k1 = env.inOut(0.45, 0), k2 = env.inOut(0.6, 0.1);
    let txt = sc.fg;
    if (p.kind === 'ink') txt = sc.onInk; else if (p.kind === 'paper') txt = sc.onPaper;
    if (k1 > 0.002) {
      const rr = R * (0.35 + 0.65 * E.outBack(k1, 1.4));
      if (p.kind === 'ink') env.circle(cx, cy, rr, sc.ink, null, 1, 1, true);
      else if (p.kind === 'paper') env.circle(cx, cy, rr, sc.paper, sameAsBg(env, sc.paper) ? sc.sub : null, hair(env), 1, true);
      else env.circle(cx, cy, rr, null, acc(env), Math.max(2, u * 7), k1, false);
      if (k2 > 0.002 && env.pass === 'main') {
        const ctx = env.ctx, Rt = R + m * 0.035, nn = Math.floor(60 * k2);
        ctx.save(); ctx.strokeStyle = sc.sub; ctx.lineWidth = hair(env); ctx.globalAlpha = 0.8; ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let i = 0; i < nn; i++) { const a = -Math.PI / 2 + i * TAU / 60, l = i % 5 ? m * 0.012 : m * 0.026; ctx.moveTo(cx + Rt * Math.cos(a), cy + Rt * Math.sin(a)); ctx.lineTo(cx + (Rt + l) * Math.cos(a), cy + (Rt + l) * Math.sin(a)); }
        ctx.stroke(); ctx.restore();
      }
      const ls = m * 0.026, off = R + m * 0.1;
      if (W > H * 1.3) {
        lab(env, 'No.' + lineNo(cut), cx - off, cy, ls, { align: 'right', a: k2, role: 'mono' });
        lab(env, L.fmtTime(cut.start), cx + off, cy, ls, { align: 'left', a: k2, role: 'mono' });
      } else {
        lab(env, 'No.' + lineNo(cut), cx, cy - off, ls, { a: k2, role: 'mono' });
        lab(env, L.fmtTime(cut.start), cx, cy + off, ls, { a: k2, role: 'mono' });
      }
    }
    const f = fit(cut.text, font, R * 1.42, R * 1.0, { max: R * 0.7, rows: 4 });
    const bb = L.mainDraw(env, { text: f.text, font, size: f.size, x: cx, y: cy, color: txt });
    return bb ? L.unionBB(bb, { x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R, w: 2 * R, h: 2 * R, cx, cy }) : null;
  },
}, P);

L.register('layout', 'a_sunburst', {
  name: '放射光', tags: ['pop', 'graphic', 'emotional'], w: 1, emph: 1.5, treat: 'safe', busy: true, fits: n => n >= 1 && n <= 24,
  plan: (rng, cut) => ({ rays: rng.pick([16, 20, 24, 28]), disc: cut.n <= 6 && rng.chance(0.5), dir: rng.sign(), role: rng.pick(['display', 'display', 'body']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const cx = W / 2, cy = H / 2, k = env.inOut(0.55, 0);
    const f = fit(cut.text, font, W * (p.disc ? 0.56 : 0.8), H * (p.disc ? 0.36 : 0.4), { max: m * 0.22, rows: env.portrait ? 4 : 2 });
    const it = { text: f.text, font, size: f.size, x: cx, y: cy };
    const b = L.itemBox(it);
    if (k > 0.002 && env.pass === 'main') {
      const ctx = env.ctx, N = p.rays || 20, Rm = Math.hypot(W, H) * 0.6 * k, r0 = m * 0.05, hw = TAU / N / 4;
      const rot = (p.dir || 1) * env.ltb * 0.08;
      ctx.save();
      ctx.fillStyle = sc.accent; ctx.globalAlpha = sc.dark ? 0.17 : 0.24;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = rot + i * TAU / N;
        ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
        ctx.lineTo(cx + Rm * Math.cos(a - hw), cy + Rm * Math.sin(a - hw));
        ctx.lineTo(cx + Rm * Math.cos(a + hw), cy + Rm * Math.sin(a + hw));
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }
    if (p.disc && k > 0.002) {
      const rr = Math.hypot(b.w, b.h) / 2 * 1.12 * E.outBack(k, 1.3);
      env.circle(cx, cy, rr, sc.ink, null, 1, 1, true);
      it.color = sc.onInk;
    } else {
      it.stroke = f.size * 0.12; it.strokeColor = sc.bg; it.ghostStroke = false;
    }
    return L.mainDraw(env, it);
  },
}, P);

L.register('layout', 'a_clock', {
  name: '時計盤', tags: ['graphic', 'calm', 'cyber'], w: 0.8, treat: false, fits: n => n >= 2 && n <= 12,
  plan: rng => ({ role: rng.pick(['display', 'body', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const cx = W / 2, cy = H / 2, R = m * 0.4, gl = nonSpace(cut.text), n = gl.length;
    const Rg = R * 0.72, gs = Math.min(R * 0.27, TAU * Rg / Math.max(1, n) * 0.6);
    const k = env.inOut(0.55, 0), A = acc(env);
    if (k > 0.002) {
      env.arc(cx, cy, R, -90, -90 + 360 * k, sc.sub, hair(env), 0.8);
      if (env.pass === 'main') {
        const ctx = env.ctx, nn = Math.floor(60 * k);
        ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = sc.sub;
        for (const major of [false, true]) {
          ctx.lineWidth = major ? Math.max(2, u * 5) : hair(env); ctx.globalAlpha = major ? 0.95 : 0.6;
          ctx.beginPath();
          for (let i = 0; i < nn; i++) {
            if ((i % 5 === 0) !== major) continue;
            const a = -Math.PI / 2 + i * TAU / 60, r0 = R - (major ? R * 0.09 : R * 0.04);
            ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      const ah = -Math.PI / 2 + TAU * clamp(env.lt / Math.max(0.1, cut.dur)), hl = Math.max(R * 0.2, Rg - gs * 0.9);
      env.line([[cx, cy], [cx + hl * Math.cos(ah), cy + hl * Math.sin(ah)]], sc.fg, Math.max(2, u * 7), k);
      const as = -Math.PI / 2 + env.ltb * TAU / 3;
      env.line([[cx - R * 0.12 * Math.cos(as), cy - R * 0.12 * Math.sin(as)], [cx + R * 0.9 * Math.cos(as), cy + R * 0.9 * Math.sin(as)]], A, Math.max(1, u * 2.5), k);
      env.circle(cx, cy, Math.max(2, u * 9), A, null, 1, k);
      lab(env, L.fmtTime(env.t), cx, cy + R * 0.34, m * 0.024, { a: k, role: 'mono' });
    }
    const list = gl.map((ch, j) => { const a = -Math.PI / 2 + j * TAU / n; return { ch, x: cx + Rg * Math.cos(a), y: cy + Rg * Math.sin(a) }; });
    const bb = drawGlyphs(env, list, { font, size: gs });
    return bb ? { x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R, w: 2 * R, h: 2 * R, cx, cy } : null;
  },
}, P);

L.register('layout', 'a_orbit', {
  name: '軌道', tags: ['pop', 'cyber', 'emotional', 'graphic'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 20,
  plan: rng => ({ tilt: rng.sign() * rng.range(5, 11), dir: rng.sign(), role: rng.pick(['display', 'display', 'serif']) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const f = fit(cut.text, font, W * (env.portrait ? 0.66 : 0.56), H * (env.portrait ? 0.24 : 0.28), { max: m * 0.22, rows: env.portrait ? 4 : 2 });
    const cx = W / 2, cy = H / 2;
    const it = { text: f.text, font, size: f.size, x: cx, y: cy };
    const b = L.itemBox(it);
    const tl = (p.tilt || 8) * DEG, ct = Math.cos(tl), st = Math.sin(tl);
    const gs = m * 0.055;
    // 楕円の中に歌詞の箱(+余白)が収まるよう rx, ry を決める(軌道が文字を横切らない)
    const hw = b.w / 2 + gs * 0.8, hh = b.h / 2 + gs * 0.8;
    const rx = clamp(hw + m * 0.12, m * 0.3, W * 0.47);
    let ry = m * 0.1;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * hw * ct + sy * hh * st, y = -sx * hw * st + sy * hh * ct;
      const q = 1 - (x / rx) * (x / rx);
      ry = Math.max(ry, q > 0.05 ? Math.abs(y) / Math.sqrt(q) : H);
    }
    ry = Math.min(ry, H * 0.45);
    const k = env.inOut(0.6, 0), A = acc(env);
    const gl = nonSpace(cut.text), Ns = clamp(gl.length, 6, 12);
    const sats = [];
    for (let j = 0; j < Ns; j++) {
      const ph = (p.dir || 1) * env.ltb * 0.55 + j * TAU / Ns;
      const ex = rx * Math.cos(ph), ey = ry * Math.sin(ph);
      sats.push({ ch: gl[j % gl.length], x: cx + ex * ct - ey * st, y: cy + ex * st + ey * ct, d: Math.sin(ph) });
    }
    const drawSats = front => {
      if (k <= 0.002) return;
      for (const s of sats) {
        if ((s.d > 0) !== front) continue;
        lab(env, s.ch, s.x, s.y, gs * (0.78 + 0.35 * s.d), { a: k * (front ? 0.95 : 0.35 + 0.25 * (1 + s.d)), color: front ? A : sc.sub, weight: 900, font: F(env, 'display'), track: 0 });
      }
    };
    if (k > 0.002 && env.pass === 'main') {
      const ctx = env.ctx;
      ctx.save(); ctx.globalAlpha = 0.45 * k; ctx.strokeStyle = sc.sub; ctx.lineWidth = hair(env);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, tl, 0, TAU); ctx.stroke(); ctx.restore();
    }
    drawSats(false);
    const bb = L.mainDraw(env, it);
    drawSats(true);
    return bb;
  },
}, P);

L.register('layout', 'a_radar', {
  name: 'レーダー', tags: ['cyber', 'dark', 'graphic'], w: 0.8, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ role: rng.pick(['display', 'body']), seed: rng.int(1, 999) }),
  render(env) {
    const { W, H, u, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const font = F(env, p.role || 'display');
    const land = W > H * 1.2;
    let cx, cy, R, it;
    if (land) {
      R = Math.min(H * 0.4, W * 0.24); cx = W * 0.07 + R; cy = H / 2;
      const x0 = cx + R + m * 0.1;
      const f = fit(cut.text, font, W * 0.93 - x0, H * 0.6, { max: m * 0.2, rows: 4 });
      it = setLeft({ text: f.text, font, size: f.size, y: H / 2 }, x0);
    } else {
      R = Math.min(W * 0.36, H * 0.25); cx = W / 2; cy = H * 0.06 + R + m * 0.02;
      const top = cy + R + m * 0.07, bot = H * 0.94;
      const f = fit(cut.text, font, W * 0.86, bot - top, { max: m * 0.2, rows: 4 });
      it = { text: f.text, font, size: f.size, x: W / 2, y: (top + bot) / 2 };
    }
    const k = env.inOut(0.55, 0), A = acc(env);
    if (k > 0.002 && env.pass === 'main') {
      const ctx = env.ctx, sw = env.ltb * TAU / 2.4 - Math.PI / 2;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = sc.sub; ctx.lineWidth = hair(env);
      ctx.beginPath();
      for (const f2 of [1, 0.66, 0.33]) { ctx.moveTo(cx + R * f2 * k, cy); ctx.arc(cx, cy, R * f2 * k, 0, TAU); }
      ctx.moveTo(cx - R * k, cy); ctx.lineTo(cx + R * k, cy); ctx.moveTo(cx, cy - R * k); ctx.lineTo(cx, cy + R * k);
      ctx.globalAlpha = 0.55 * k; ctx.stroke();
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(sw - 1.05, cx, cy), span = 1.05 / TAU;
        g.addColorStop(0, L.rgba(sc.accent, 0)); g.addColorStop(span, L.rgba(sc.accent, 0.42)); g.addColorStop(Math.min(1, span + 0.001), L.rgba(sc.accent, 0)); g.addColorStop(1, L.rgba(sc.accent, 0));
        ctx.globalAlpha = k; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.fill();
      }
      ctx.restore();
      env.line([[cx, cy], [cx + R * k * Math.cos(sw), cy + R * k * Math.sin(sw)]], A, Math.max(1.5, u * 3), k);
      for (let i = 0; i < 6; i++) {
        const ba = L.r(p.seed, i, 'a') * TAU, br = R * (0.2 + 0.72 * L.r(p.seed, i, 'r'));
        const d = (((sw - ba) % TAU) + TAU) % TAU;
        env.circle(cx + br * Math.cos(ba), cy + br * Math.sin(ba), Math.max(1.5, u * 6), A, null, 1, k * Math.exp(-d * 1.4));
      }
      lab(env, 'SCAN ' + lineNo(cut), cx, cy + R + m * 0.04, m * 0.024, { a: k, role: 'mono', track: 0.2 });
    }
    return L.mainDraw(env, it);
  },
}, P);
})();
