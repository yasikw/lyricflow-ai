/* LyricFlow 演出パック: p_hm_type — Hallmark タイポ(アンチAIスロップの文字組みを歌詞の動きへ)
   契約: docs/COMPOSE_PACKS.md  (layout h_* / enter・exit・treat hm* / style hm*)
   Hallmark の原則: 2+1 書体(display + body + mono 1つ)、極端な太さ(900 と 200/300)、比率のサイズ段、
   文字数でサイズを決める、サイズで変わる行送り/字間、斜体・グラデ・光彩・跳ねる動きは使わない、差し色は約5%、
   入りは指数 ease-out・出は ease-in、字の時間差は合計0.5秒まで、副テキストは cut から作るものだけ(偽の数値を作らない)。
   実装は LyricFlow 独自。core の組版レイヤーには依存しない(明示の track / lead を渡す)。 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_hm_type';
const clamp = L.clamp;

/* ================================================================ helpers */
const mOf = env => Math.min(env.W, env.H);
const hair = env => Math.max(1, env.u * 1.6);
const lsz = env => Math.max(6, mOf(env) * 0.021);                 // 小さなラベル
const thinW = font => (/Noto Sans JP/.test(font) ? 200 : 300);
const isMincho = font => /Mincho|Serif|明朝/i.test(font || '');
const RATIOS = [1.25, 1.333, 1.5, 1.618];
const RSTR = ['1.25', '1.333', '1.5', '1.618'];
const pad2 = v => String(Math.max(0, v | 0)).padStart(2, '0');
const hasCJK = t => /[぀-ヿ一-鿿]/.test(t || '');
const isLatinText = t => L.hasLatinWords(t) && !hasCJK(t);
const dTrack = t => (isLatinText(t) ? -0.02 : -0.03);               // 大見出しは詰める
const joinerOf = t => (L.hasLatinWords(t) && /\s/.test(t) ? ' ' : '');
const typoKey = () => (L.TYPO ? L.TYPO.mode : '');
const famName = f => String(f || '').split(',')[0].replace(/['"]/g, '').trim();
const accentOn = env => L.fitContrast(env.sc.accent, env.sc.bg, 3);
/* 文字数でサイズ上限を決める(MV サイズ。長い行ほど段階的に下げる=長い行を特大にしない) */
const capFor = (env, n) => mOf(env) * (n <= 2 ? 0.55 : n <= 5 ? 0.42 : n <= 8 ? 0.34 : n <= 16 ? 0.27 : n <= 24 ? 0.17 : 0.13);
/* 安全余白(4% 以上) */
const margins = env => ({ mx: env.W * 0.06, my: env.H * (env.portrait ? 0.06 : 0.08) });

/* 計測キャッシュ */
const twCache = new Map(), memo = new Map(), colCache = new Map(), mapCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { twCache.clear(); memo.clear(); });
const tw = (text, font, weight, size, track) => {
  const k = [text, font, weight, size.toFixed(1), track, typoKey()].join('|');
  let v = twCache.get(k);
  if (v === undefined) {
    v = L.measure({ text, font, weight, size, track, lead: 1 }).w;
    if (twCache.size > 4000) twCache.clear();
    twCache.set(k, v);
  }
  return v;
};
const cache = (key, fn) => {
  let v = memo.get(key);
  if (!v) { v = fn(); if (memo.size > 400) memo.clear(); memo.set(key, v); }
  return v;
};
/* 行の束を maxW × maxH に収める共通サイズ(実寸で測り直す) */
const fitRows = (rows, font, weight, track, lead, maxW, maxH, cap) => {
  let wmax = 0;
  for (const r of rows) wmax = Math.max(wmax, tw(r, font, weight, 100, track));
  let s = Math.min(cap, wmax > 0 ? maxW * 100 / wmax : cap, maxH / (1 + lead * Math.max(0, rows.length - 1)));
  s = Math.max(4, s);
  let w2 = 0;
  for (const r of rows) w2 = Math.max(w2, tw(r, font, weight, s, track));
  if (w2 > maxW) s *= maxW / w2;
  return Math.max(4, s);
};
/* 約物だけの行(「」」だけ等)は前の行に戻す */
const noPunctRows = rows => {
  const out = [];
  for (const r of rows) {
    if (out.length && L.glyphs(r).every(c => L.isPunct(c) || L.isSpace(c))) out[out.length - 1] += r;
    else if (out.length === 1 && L.glyphs(out[0]).every(c => L.isPunct(c) || L.isSpace(c))) out[0] += r;
    else out.push(r);
  }
  return out;
};
/* 句を k 行以内に(語順維持・字数バランス) */
const rowsOf = (text, k) => noPunctRows(rowsOf0(text, k));
const rowsOf0 = (text, k) => {
  const src = String(text || '').trim();
  if (!src) return [];
  if (k <= 1) return [src];
  const ch = L.chunks(src);
  const n = L.glyphCount(src);
  if (ch.length <= 1) { const r = L.splitLines(src, Math.ceil(n / k)); return r.length ? r : [src]; }
  if (ch.length <= k) return ch;
  const j = joinerOf(src), out = [];
  let cur = '', acc = 0;
  ch.forEach((c, i) => {
    cur = cur ? cur + j + c : c; acc += L.glyphCount(c);
    const remain = ch.length - i - 1, rowsLeft = k - out.length - 1;
    if (remain > 0 && rowsLeft > 0 && (acc >= n * (out.length + 1) / k - 0.5 || remain <= rowsLeft)) { out.push(cur); cur = ''; }
  });
  if (cur) out.push(cur);
  return out;
};
/* 1〜maxRows 行の組み方から一番大きく組めるものを選ぶ(行を増やすのは 12% 以上大きくなる時だけ) */
const fitBestCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fitBestCache.clear());
const fitBest = (text, font, weight, track, lead, maxW, maxH, cap, maxRows = 3) => {
  // 同じ引数なら同じ結果なので覚えておく(毎フレームの測り直しを省く)
  const T = L.TYPO || {};
  const key = [text, font, weight, track, lead, Math.round(maxW), Math.round(maxH), Math.round(cap), maxRows, T.mode, T.ref, T.lockKey].join('\u0001');
  const hit = fitBestCache.get(key);
  if (hit) return { rows: hit.rows.slice(), size: hit.size };
  const r = fitBestRaw(text, font, weight, track, lead, maxW, maxH, cap, maxRows);
  if (fitBestCache.size > 3000) fitBestCache.clear();
  fitBestCache.set(key, { rows: r.rows.slice(), size: r.size });
  return r;
};
const fitBestRaw = (text, font, weight, track, lead, maxW, maxH, cap, maxRows = 3) => {
  const n = L.glyphCount(text);
  let best = null;
  const seen = new Set();
  for (let k = 1; k <= Math.min(maxRows, Math.max(1, n)); k++) {
    const rows = rowsOf(text, k);
    const key = rows.join('\n');
    if (!rows.length || seen.has(key)) continue;
    seen.add(key);
    const size = fitRows(rows, font, weight, track, lead, maxW, maxH, cap);
    if (!best || size > best.size * 1.12) best = { rows, size };
  }
  return best || { rows: [String(text || '')], size: 4 };
};
/* 幅に収まるまで行を増やす */
const wrapTo = (text, font, weight, size, track, maxW, maxRows = 4) => {
  const src = String(text || '').trim();
  if (!src) return [];
  const n = L.glyphCount(src);
  for (let k = 1; k <= maxRows; k++) {
    const rows = k === 1 ? [src] : L.splitLines(src, Math.ceil(n / k));
    if (rows.every(r => tw(r, font, weight, size, track) <= maxW)) return rows;
  }
  return L.splitLines(src, Math.ceil(n / maxRows));
};
/* 各行が元の文字列の何字目から始まるか(空白を飛ばして順に探す) */
const rowStarts = (text, rows) => {
  const g = L.glyphs(text);
  let j = 0;
  return rows.map(r => {
    const rg = L.glyphs(r);
    if (!rg.length) return -1;
    let k = j;
    while (k < g.length && g[k] !== rg[0]) k++;
    if (k >= g.length) return -1;
    j = k + rg.length;
    return k;
  });
};
/* 核になる語: 強調(emphIdx)の最初の連なり、無ければ最長の句 */
const coreSpan = (cut, last = false) => {
  const g = L.glyphs(cut.text);
  const ei = (cut.emphIdx || []).filter(i => i >= 0 && i < g.length);
  if (ei.length) {
    const set = new Set(ei);
    let s = ei[0], e = s;
    while (set.has(e + 1)) e++;
    return { s, e: e + 1, emph: true };
  }
  const ch = L.chunks(cut.text);
  if (!ch.length) return { s: 0, e: g.length, emph: false };
  const st = rowStarts(cut.text, ch);
  let bi = last ? ch.length - 1 : 0;
  if (!last) ch.forEach((c, i) => { if (L.glyphCount(c) > L.glyphCount(ch[bi])) bi = i; });
  const s = Math.max(0, st[bi]);
  return { s, e: Math.min(g.length, s + L.glyphs(ch[bi]).length), emph: false };
};
/* 左揃え1行の項目 */
const itemL = (text, font, weight, size, track, x0, y, o) =>
  Object.assign({ text, font, weight, size, track, lead: 1.1, align: 'left', x: x0 + tw(text, font, weight, size, track) / 2, y }, o || {});
const itemR = (text, font, weight, size, track, x1, y, o) =>
  Object.assign({ text, font, weight, size, track, lead: 1.1, align: 'left', x: x1 - tw(text, font, weight, size, track) / 2, y }, o || {});
const drawAll = (env, items) => { let bb = null; for (const it of items) bb = L.unionBB(bb, L.mainDraw(env, it)); return bb; };
/* 副ラベル(mono・字間を開ける・ゴースト無し) */
const lab = (env, text, x, y, o = {}) => {
  const a = o.a == null ? 1 : o.a;
  if (a <= 0.004 || text == null || text === '') return null;
  const font = o.font || L.roleFont(env, 'mono');
  const size = o.size || lsz(env);
  const track = o.track == null ? 0.12 : o.track;
  const weight = o.weight || 400;
  const it = { text: String(text), font, weight, size, x, y, color: o.color || env.sc.sub, alpha: a, ghost: false, track, lead: 1.3 };
  if (o.align === 'left') it.x = x + tw(it.text, font, weight, size, track) / 2;
  else if (o.align === 'right') it.x = x - tw(it.text, font, weight, size, track) / 2;
  return env.text(it);
};
/* 1本の罫を e(0..1) まで引く */
const rule = (env, x0, y0, x1, y1, e, color, lw, a) => {
  if (e <= 0.002 || a <= 0.004) return;
  env.polyPartial([[x0, y0], [x1, y1]], e, color, lw, a, false);
};
const romOf = text => {
  if (isLatinText(text)) return null;
  const r = L.romaji(String(text || '').replace(/\s+/g, ''));
  return r && r.length >= 2 ? r : null;
};
const ENTER_BIAS = { hmRise: 1.7, hmMaskLine: 1.7, hmTrackIn: 1.4, hmHairline: 1.3 };
const regLayout = (key, def) => L.register('layout', key, Object.assign({ enterBias: ENTER_BIAS }, def), P);

/* ================================================================ layouts */
/* MV サイズ: 歌詞は幅を使い切る(短い行は幅の6〜8割、1〜2字は高さの4〜5割)。字の高さは min(W,H) の 11%(16字以下)/7% 以上を目安。
   副テキスト(ラベル・注・キャプション・細字の段)は小さくてよいが、歌詞の面積を削らない。 */

/* 1. 比率の段: 行ごとに比率スケールで大→小(小→大)。最小の行は body の細字(それでも 7% 以上) */
regLayout('h_scaleSteps', {
  name: '比率の段', tags: ['editorial', 'graphic', 'calm'], w: 1.1, fits: n => n >= 3,
  plan: rng => ({ r: rng.int(0, 3), dir: rng.pick(['down', 'down', 'up']), yb: rng.pick([0.5, 0.52, 0.48]) }),
  render(env) {
    const { W, H, cut } = env, p = cut.params || {}, m = mOf(env);
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), body = L.roleFont(env, 'body');
    const ls = lsz(env);
    const G = cache(['ss2', cut.text, W, H, disp, body, p.r, p.dir, p.yb, typoKey()].join('|'), () => {
      const n = cut.n;
      const maxW = W - mx * 2, maxH = H - my * 2 - ls * 2.6;
      const build = (rows, ri) => {
        const K = rows.length, r = RATIOS[ri];
        const f = rows.map((_, i) => Math.pow(r, -(p.dir === 'up' ? K - 1 - i : i)));
        const fmin = Math.min(...f), fmax = Math.max(...f);
        const spec = rows.map((t, i) => {
          const small = K > 1 && f[i] === fmin;
          return { t, small, font: small ? body : disp, weight: small ? thinW(body) : 900, track: small ? (isLatinText(t) ? 0.04 : 0.02) : dTrack(t), lead: small ? 1.3 : 1.08 };
        });
        let s0 = capFor(env, L.glyphCount(rows[f.indexOf(fmax)]));
        spec.forEach((s, i) => { const w = tw(s.t, s.font, s.weight, 100, s.track); if (w > 0) s0 = Math.min(s0, maxW * 100 / (w * f[i])); });
        s0 = Math.min(s0, maxH / f.reduce((a, fi, i) => a + fi * spec[i].lead, 0));
        spec.forEach((s, i) => { const w = tw(s.t, s.font, s.weight, s0 * f[i], s.track); if (w > maxW) s0 *= maxW / w; });
        return { f, spec, s0, ri, small: s0 * fmin };
      };
      // 最小の段が 7% を割るなら比率を下げ、それでも足りなければ段を減らす
      let best = null;
      const want = m * 0.07;
      for (let k = n <= 8 ? 2 : n <= 14 ? 3 : 4; k >= 1 && !(best && best.small >= want); k--) {
        let rows = rowsOf(cut.text, k);
        if (k >= 2 && rows.length < 2) rows = noPunctRows(L.splitLines(cut.text, Math.ceil(n / 2)));
        for (let ri = clamp(p.r | 0, 0, 3); ri >= 0; ri--) {
          const b = build(rows, ri);
          if (!best || b.small > best.small * 1.02) best = b;
          if (b.small >= want) { best = b; break; }
        }
      }
      const { f, spec, s0, ri } = best;
      const hs = spec.map((s, i) => s0 * f[i] * s.lead);
      const total = hs.reduce((a, b) => a + b, 0);
      const top = clamp(H * (p.yb || 0.5) - total / 2, my, Math.max(my, H - my - total - ls * 2.4));
      let y = top;
      const items = spec.map((s, i) => {
        const it = itemL(s.t, s.font, s.weight, s0 * f[i], s.track, mx, y + hs[i] / 2, { lead: s.lead, mi: i });
        y += hs[i];
        return it;
      });
      return { items, bottom: top + total, rs: spec.length > 1 ? RSTR[ri] : null };
    });
    const bb = drawAll(env, G.items);
    if (G.rs) lab(env, `1 : ${G.rs}`, mx, G.bottom + ls * 0.9, { align: 'left', a: env.inOut(0.5, 0.35) });
    return bb;
  },
});

/* 2. 極端な太さ: 核の語を 900 で特大、残りを細字で(核の 1/2)対置 */
regLayout('h_extremes', {
  name: '極端な太さ', tags: ['editorial', 'graphic', 'emotional'], w: 1.1, emph: 1.4,
  plan: rng => ({ v: rng.pick(['stack', 'stack', 'side']), after: rng.pick(['left', 'right']) }),
  render(env) {
    const { W, H, cut } = env, p = cut.params || {};
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), body = L.roleFont(env, 'body');
    const ls = lsz(env);
    const G = cache(['ex2', cut.text, (cut.emphIdx || []).join(','), W, H, disp, body, p.v, p.after, typoKey()].join('|'), () => {
      const g = L.glyphs(cut.text), cs = coreSpan(cut);
      const before = g.slice(0, cs.s).join('').trim(), after = g.slice(cs.e).join('').trim();
      const word = g.slice(cs.s, cs.e).join('').trim() || cut.text;
      const wn = L.glyphCount(word);
      const bigRows = wn > 7 ? rowsOf(word, 2) : [word];
      const maxW = W - mx * 2;
      const bt = dTrack(word), thin = thinW(body);
      const st = t => (isLatinText(t) ? 0.03 : 0.02);
      const K = 0.5;                                              // 残り = 核の 1/2(√2 の2段)
      const solo = !before && !after;
      const avail = H - my * 2 - (solo ? ls * 2.4 : 0);
      let side = p.v === 'side' && !env.portrait && W / H > 1.3 && !before && !!after;
      let S = fitRows(bigRows, disp, 900, bt, 1.04, side ? maxW * 0.6 : maxW, H * (env.portrait ? 0.42 : 0.62), capFor(env, wn) * 1.2);
      let bigW = 0, bRows = [], aRows = [];
      for (let pass = 0; pass < 3; pass++) {
        bigW = Math.max(...bigRows.map(r => tw(r, disp, 900, S, bt)));
        const s = S * K;
        const colW = side ? maxW - bigW - S * 0.18 : maxW;
        bRows = wrapTo(before, body, thin, s, st(before), colW, 3);
        aRows = wrapTo(after, body, thin, s, st(after), colW, 3);
        if (side && aRows.length > 2) { side = false; S = fitRows(bigRows, disp, 900, bt, 1.04, maxW, H * (env.portrait ? 0.42 : 0.62), capFor(env, wn) * 1.2); continue; }
        const widest = Math.max(0, ...bRows.map(r => tw(r, body, thin, s, st(before))), ...aRows.map(r => tw(r, body, thin, s, st(after))));
        let k = widest > colW ? colW / widest : 1;
        const tot = side ? S * 1.04 * bigRows.length
          : S * 1.04 * bigRows.length + s * 1.3 * (bRows.length + aRows.length) + (bRows.length ? s * 0.3 : 0) + (aRows.length ? s * 0.35 : 0);
        if (tot > avail) k = Math.min(k, avail / tot);
        if (k >= 0.999) break;
        S *= k;
      }
      bigW = Math.max(...bigRows.map(r => tw(r, disp, 900, S, bt)));
      const s = S * K, sl = s * 1.3, bl = S * 1.04;
      const items = [];
      let mi = 0;
      if (side) {
        const bigH = bl * bigRows.length;
        const top = H / 2 - bigH / 2;
        const cx = mx + bigW + S * 0.18;
        bigRows.forEach((r, i) => items.push(itemL(r, disp, 900, S, bt, mx, top + bl * (i + 0.5), { lead: 1.04, mi: mi++ })));
        const bot = top + bigH - S * 0.1;
        aRows.forEach((r, i) => items.push(itemL(r, body, thin, s, st(after), cx, bot - sl * (aRows.length - i - 0.5), { lead: 1.3, mi: mi++ })));
        return { items, labY: top + bigH + ls * 1.2, solo };
      }
      const gapA = bRows.length ? s * 0.3 : 0, gapB = aRows.length ? s * 0.35 : 0;
      const total = sl * bRows.length + gapA + bl * bigRows.length + gapB + sl * aRows.length;
      const top = clamp(H / 2 - total / 2, my, Math.max(my, H - my - total - (solo ? ls * 2.4 : 0)));
      let y = top;
      bRows.forEach(r => { items.push(itemL(r, body, thin, s, st(before), mx, y + sl / 2, { lead: 1.3, mi: mi++ })); y += sl; });
      y += gapA;
      bigRows.forEach(r => { items.push(itemL(r, disp, 900, S, bt, mx, y + bl / 2, { lead: 1.04, mi: mi++ })); y += bl; });
      y += gapB;
      aRows.forEach(r => {
        const w = tw(r, body, thin, s, st(after));
        const x1 = mx + bigW;
        items.push(p.after === 'right' && w <= bigW ? itemR(r, body, thin, s, st(after), x1, y + sl / 2, { lead: 1.3, mi: mi++ }) : itemL(r, body, thin, s, st(after), mx, y + sl / 2, { lead: 1.3, mi: mi++ }));
        y += sl;
      });
      return { items, labY: y + ls * 1.1, solo };
    });
    const bb = drawAll(env, G.items);
    if (G.solo) {
      const rom = romOf(cut.text);
      lab(env, rom || L.fmtTime(cut.start), mx, G.labY, { align: 'left', a: env.inOut(0.5, 0.3) });
    }
    return bb;
  },
});

/* 3. ぶら下がり組み: 行頭の開き括弧・行末の句読点を組み幅の外へ。細い縦の組み幅ガイド */
const OPEN_H = new Set(['「', '『', '（', '(', '【', '〈', '《', '“', '‘', '"', '\'']);
const CLOSE_H = new Set(['、', '。', '，', '．', ',', '.']);
regLayout('h_hanging', {
  name: 'ぶら下がり組み', tags: ['editorial', 'calm'], w: 0.9, fits: n => n >= 2,
  plan: rng => ({ guide: rng.pick(['both', 'left', 'both']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {};
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display');
    const ls = lsz(env);
    const G = cache(['hg2', cut.text, W, H, disp, typoKey()].join('|'), () => {
      const n = cut.n;
      const tr = dTrack(cut.text);
      const lead = isLatinText(cut.text) ? 1.06 : 1.12;
      const maxW = W - mx * 2, maxH = H - my * 2 - ls * 2.4;
      const hangOf = rows => rows.map(r => {
        const m = L.measure({ text: r, font: disp, weight: 900, size: 100, track: tr, lead: 1 });
        const a = m.lay[0], b = m.lay[m.lay.length - 1];
        const hl = a && OPEN_H.has(a.ch) ? a.w + tr * 100 : 0;
        const hr = b && CLOSE_H.has(b.ch) && m.lay.length > 1 ? b.w : 0;
        return { w: m.w, hl, hr };
      });
      const sizeOf = (hang, K) => {
        const hlMax = Math.max(0, ...hang.map(h => h.hl)), hrMax = Math.max(0, ...hang.map(h => h.hr));
        let s = capFor(env, n);
        // ぶら下がり分も安全余白(4%)の内側に
        const room = W - Math.max(mx, W * 0.04) * 2;
        hang.forEach(h => { const eff = h.w - h.hl - h.hr; if (eff > 0) s = Math.min(s, maxW * 100 / eff, room * 100 / (eff + hlMax + hrMax)); });
        return Math.min(s, maxH / (1 + lead * (K - 1)));
      };
      let best = null;
      for (let k = 1; k <= 3; k++) {
        const rows = rowsOf(cut.text, k);
        if (best && rows.join('\n') === best.rows.join('\n')) continue;
        const hang = hangOf(rows), s = sizeOf(hang, rows.length);
        if (!best || s > best.s * 1.12) best = { rows, hang, s };
      }
      const { rows, hang } = best;
      let s = best.s;
      const hl = Math.max(0, ...hang.map(h => h.hl)) * s / 100;
      const x0 = Math.max(mx, W * 0.04 + hl);
      const measure = Math.max(...hang.map(h => h.w - h.hl - h.hr)) * s / 100;
      if (x0 + measure > W - mx) s *= (W - mx - x0) / measure;
      const hs = s * lead, total = s + hs * (rows.length - 1);
      const top = clamp(H / 2 - total / 2 + ls, my + ls * 2, Math.max(my, H - my - total));
      const items = rows.map((r, i) => itemL(r, disp, 900, s, tr, x0 - hang[i].hl * s / 100, top + s / 2 + hs * i, { lead, mi: i }));
      const off = Math.max(hair(env) * 3, s * 0.06);               // 罫は字面に触れない
      return { items, x0: x0 - off, x1: Math.min(W - W * 0.04, x0 + Math.max(...hang.map(h => h.w - h.hl - h.hr)) * s / 100 + off), y0: top - s * 0.2, y1: top + total + s * 0.2 };
    });
    const io = env.inOut(0.5);
    const e = E.inOutSine(clamp(env.lt / 1.6));
    const lw = hair(env), c = sc.sub, a = 0.5 * io, tk = ls * 0.7;
    rule(env, G.x0, G.y0, G.x0, G.y1, e, c, lw, a);
    rule(env, G.x0 - tk, G.y0, G.x0 + tk, G.y0, clamp(e * 3), c, lw, a);
    if (p.guide !== 'left') {
      rule(env, G.x1, G.y0, G.x1, G.y1, e, c, lw, a * 0.8);
      rule(env, G.x1 - tk, G.y0, G.x1 + tk, G.y0, clamp(e * 3), c, lw, a * 0.8);
    }
    lab(env, `L.${pad2(cut.line + 1)}`, G.x0, G.y0 - ls * 1.1, { align: 'left', a: io });
    return drawAll(env, G.items);
  },
});

/* 4. 描いた下線: 強調語(無ければ最後の句)の下に端正な太い下線が伸びる */
regLayout('h_underline', {
  name: '描いた下線', tags: ['editorial', 'graphic', 'emotional'], w: 1.1, emph: 1.3,
  plan: rng => ({ y: rng.pick([0.46, 0.5, 0.54]) }),
  render(env) {
    const { W, H, cut } = env, p = cut.params || {};
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display');
    const G = cache(['ul2', cut.text, (cut.emphIdx || []).join(','), W, H, disp, p.y, typoKey()].join('|'), () => {
      const tr = dTrack(cut.text), lead = 1.14;
      const fb = fitBest(cut.text, disp, 900, tr, lead, W - mx * 2, H - my * 2 - H * 0.04, capFor(env, cut.n), 3);
      const rows = fb.rows, s = fb.size;
      const starts = rowStarts(cut.text, rows);
      const cs = coreSpan(cut, true);
      const hs = s * lead, total = s + hs * (rows.length - 1);
      const top = clamp(H * (p.y || 0.5) - total / 2, my, Math.max(my, H - my - total - s * 0.3));
      let seg = 0;
      const items = rows.map((r, i) => {
        const it = itemL(r, disp, 900, s, tr, mx, top + s / 2 + hs * i, { lead, mi: i });
        const st = starts[i], rg = L.glyphs(r);
        if (st < 0) return it;
        let a = Math.max(cs.s, st) - st, b = Math.min(cs.e, st + rg.length) - 1 - st;
        while (b >= a && (L.isSpace(rg[b]) || L.isPunct(rg[b]))) b--;
        while (a <= b && (L.isSpace(rg[a]) || L.isPunct(rg[a]))) a++;
        if (b < a) return it;
        const delay = seg++ * 0.12;
        it.post = (env2, it2, m) => {
          if (env2.pass !== 'main') return;
          const A = m.lay[a], B = m.lay[b];
          if (!A || !B) return;
          const e = E.outExpo(clamp((env2.lt - env2.cut.inDur * 0.85 - delay) / 0.7));
          if (e <= 0.002) return;
          const th = Math.max(2, it2.size * 0.07);
          const x0 = A.x - A.w / 2, x1 = B.x + B.w / 2, y = A.y + it2.size * 0.6;
          env2.rect(x0, y - th / 2, (x1 - x0) * e, th, accentOn(env2), it2.alpha == null ? 1 : it2.alpha, false);
        };
        return it;
      });
      return { items };
    });
    return drawAll(env, G.items);
  },
});

/* 5. ポスター組み: 1行1語(句)で積む、行送り 1.02〜1.06、下端に細い罫と小さなラベル */
regLayout('h_poster', {
  name: 'ポスター組み', tags: ['graphic', 'editorial', 'dark'], w: 1.1, portrait: 1.3, fits: n => n >= 2,
  plan: rng => ({ lab: rng.pick(['time', 'rom']), acc: rng.chance(0.5) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display');
    const ls = lsz(env);
    const ruleY = H - my - ls * 1.6;
    const G = cache(['po2', cut.text, W, H, disp, typoKey()].join('|'), () => {
      const n = cut.n;
      const latin = isLatinText(cut.text);
      const lead = latin ? 1.02 : 1.06, tr = dTrack(cut.text);
      const maxW = W - mx * 2, maxH = ruleY - ls * 0.6 - my;
      const cands = [];
      let rows = L.chunks(cut.text);
      if (rows.length > 5) rows = rowsOf(cut.text, 5);
      if (rows.length <= 1 && n > 5) rows = noPunctRows(L.splitLines(cut.text, Math.ceil(n / 2)));
      if (!rows.length) rows = [cut.text];
      cands.push(rows);
      if (rows.length > 3) cands.push(rowsOf(cut.text, 3));
      if (rows.length > 2) cands.push(rowsOf(cut.text, 2));
      const sized = cands.map(r => ({ rows: r, s: fitRows(r, disp, 900, tr, lead, maxW, maxH, capFor(env, Math.max(...r.map(x => L.glyphCount(x)))) * 1.15) }));
      const top = Math.max(...sized.map(c => c.s));
      const want = Math.max(m * (n <= 16 ? 0.11 : 0.07), top * 0.8);
      const pick = sized.find(c => c.s >= want) || sized.reduce((a, b) => (b.s > a.s ? b : a));   // 1行1語を優先、小さすぎるなら行をまとめる
      const k = pick.rows.length;
      const s = Math.min(pick.s, (ruleY - my) / (1.3 + lead * (k - 1))), hs = s * lead;   // 罫の上の余白ぶんも含めて上端を守る
      const bottom = ruleY - s * 0.3;
      const items = pick.rows.map((r, i) => itemL(r, disp, 900, s, tr, mx, bottom - s / 2 - hs * (pick.rows.length - 1 - i), { lead, mi: i }));
      return { items };
    });
    const io = env.inOut(0.45);
    rule(env, mx, ruleY, W - mx, ruleY, E.outExpo(clamp(env.lt / 0.9)), p.acc ? accentOn(env) : sc.fg, Math.max(1, env.u * 2.2), io);
    const rom = romOf(cut.text);
    lab(env, `No.${pad2(cut.line + 1)}`, mx, ruleY + ls * 1.25, { align: 'left', a: env.inOut(0.45, 0.2) });
    lab(env, p.lab === 'rom' && rom && tw(rom, L.roleFont(env, 'mono'), 400, ls, 0.12) < W * 0.5 ? rom : L.fmtTime(cut.start), W - mx, ruleY + ls * 1.25, { align: 'right', a: env.inOut(0.45, 0.28) });
    return drawAll(env, G.items);
  },
});

/* 6. 図版キャプション: 大きな歌詞を上左、細い罫と等幅の小さなキャプション列(行番号・時刻・ローマ字) */
regLayout('h_caption', {
  name: '図版キャプション', tags: ['editorial', 'graphic', 'calm', 'cyber'], w: 1,
  plan: rng => ({ y: rng.pick([0.46, 0.5]), dot: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {};
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), mono = L.roleFont(env, 'mono');
    const ls = lsz(env), Gu = ls * 1.5;
    const G = cache(['cp2', cut.text, W, H, disp, p.y, typoKey()].join('|'), () => {
      const tr = dTrack(cut.text), lead = 1.1;
      const capH = Gu * 3.4;                                       // キャプション帯(罫〜値)
      const fb = fitBest(cut.text, disp, 900, tr, lead, W - mx * 2, H - my * 2 - capH, capFor(env, cut.n), 3);
      const rows = fb.rows, s = fb.size;
      const hB = s + s * lead * (rows.length - 1);
      const total = hB + capH;
      let top = clamp(H * (p.y || 0.48) - total / 2, my, Math.max(my, H - my - total));
      top = my + Math.floor((top - my) / Gu) * Gu;                  // ベースライングリッド
      const ruleY = my + Math.ceil((top + hB + Gu * 0.5 - my) / Gu) * Gu;
      const items = rows.map((r, i) => itemL(r, disp, 900, s, tr, mx, top + s / 2 + s * lead * i, { lead, mi: i }));
      return { items, ruleY };
    });
    const io = env.inOut(0.45);
    const e = E.outExpo(clamp((env.lt - 0.1) / 0.9));
    rule(env, mx, G.ruleY, W - mx, G.ruleY, e, sc.sub, hair(env), 0.9 * io);
    if (p.dot) { const d = ls * 0.55; env.rect(mx, G.ruleY - d / 2, d, d, accentOn(env), io * clamp(e * 4), false); }
    const rom = romOf(cut.text);
    const cols = [['LINE', pad2(cut.line + 1)], ['TIME', L.fmtTime(cut.start)], rom ? ['ROMAJI', rom] : ['GLYPHS', pad2(cut.n)]];
    const colW = (W - mx * 2) / 3;
    const valC = L.mix(sc.fg, sc.bg, 0.12);
    cols.forEach(([k, v], i) => {
      const a = env.inOut(0.4, 0.2 + i * 0.08);
      const x = mx + colW * i + (i === 0 && p.dot ? ls * 1.1 : 0);
      const room = colW * 0.92 - (x - (mx + colW * i));
      let vs = ls, vt = v;
      const w = tw(vt, mono, 400, vs, 0.06);
      if (w > room) { vs = Math.max(ls * 0.7, vs * room / w); while (tw(vt, mono, 400, vs, 0.06) > room && L.glyphs(vt).length > 3) vt = L.glyphs(vt).slice(0, -2).join('') + '…'; }
      lab(env, k, x, G.ruleY + Gu * 0.85, { align: 'left', a, size: ls * 0.78, track: 0.14 });
      lab(env, vt, x, G.ruleY + Gu * 1.85, { align: 'left', a, size: vs, track: 0.06, color: valC });
    });
    return drawAll(env, G.items);
  },
});

/* 7. 余白の注: 太い縦罫の右に歌詞、左の余白に小さな注(時刻・字数・ローマ字)。縦長は注を罫の上に */
regLayout('h_margin', {
  name: '余白の注', tags: ['editorial', 'calm', 'graphic'], w: 1,
  plan: rng => ({ acc: rng.chance(0.4), rx: rng.pick([0.18, 0.2]) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), mono = L.roleFont(env, 'mono');
    const ls = lsz(env);
    const narrow = env.portrait || W / H < 1.2;
    const rx = narrow ? mx + W * 0.01 : W * (p.rx || 0.2), gap = m * 0.035;
    const G = cache(['mg2', cut.text, W, H, disp, rx, typoKey()].join('|'), () => {
      const tr = dTrack(cut.text), lead = 1.1;
      const fb = fitBest(cut.text, disp, 900, tr, lead, W - mx - rx - gap, H - my * 2 - (narrow ? ls * 3 : 0), capFor(env, cut.n), 3);
      const rows = fb.rows, s = fb.size;
      const hs = s * lead, total = s + hs * (rows.length - 1);
      const top = clamp(H / 2 - total / 2 + (narrow ? ls * 1.5 : 0), my + (narrow ? ls * 3 : 0), Math.max(my, H - my - total));
      const items = rows.map((r, i) => itemL(r, disp, 900, s, tr, rx + gap, top + s / 2 + hs * i, { lead, mi: i }));
      return { items, y0: top - s * 0.08, y1: top + total + s * 0.08 };
    });
    const io = env.inOut(0.45);
    const e = E.outExpo(clamp(env.lt / 0.8));
    const lw = Math.max(3, m * 0.011);
    if (io > 0.004 && e > 0.002) env.rect(rx - lw / 2, G.y0, lw, (G.y1 - G.y0) * e, p.acc ? accentOn(env) : sc.fg, io, false);
    const rom = romOf(cut.text);
    const notes = [L.fmtTime(cut.start), `${pad2(cut.n)} 字`];
    if (rom) notes.push(rom);
    if (narrow) {
      // 縦長・正方形: 注は罫の上の余白に横並び
      let x = rx - lw / 2;
      notes.forEach((t, k) => {
        const w = tw(t, mono, 400, ls, 0.1);
        if (x + w > W - mx) return;
        lab(env, t, x, G.y0 - ls * 1.3, { align: 'left', a: env.inOut(0.4, 0.2 + k * 0.1), track: 0.1 });
        x += w + ls * 1.6;
      });
    } else {
      const room = rx - gap - mx;
      let k = 0;
      notes.forEach(t => {
        let s = ls;
        const w = tw(t, mono, 400, s, 0.1);
        if (w > room) s *= room / w;
        if (s < ls * 0.62) return;
        lab(env, t, rx - gap, G.y0 + ls * 0.6 + k * ls * 1.7, { align: 'right', a: env.inOut(0.4, 0.2 + k * 0.1), size: s, track: 0.1 });
        k++;
      });
    }
    return drawAll(env, G.items);
  },
});

/* 8. 手紙: たっぷりの余白に大きな明朝を左寄せの一段、上に時刻、下に小さな署名的ラベル */
regLayout('h_letter', {
  name: '手紙', tags: ['calm', 'emotional', 'editorial'], w: 0.9,
  plan: rng => ({ x: rng.pick([0.1, 0.12, 0.14]), y: rng.pick([0.46, 0.5]), sig: rng.pick(['no', 'rom']) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {};
    const font = L.roleFont(env, 'serif'), body = L.roleFont(env, 'body');
    const weight = isMincho(font) ? 700 : thinW(font);
    const narrow = env.portrait || W / H < 1.2;
    const x0 = narrow ? W * 0.09 : W * (p.x || 0.12);
    const ls = lsz(env);
    const G = cache(['lt2', cut.text, W, H, font, weight, p.x, p.y, typoKey()].join('|'), () => {
      const tr = isLatinText(cut.text) ? 0 : 0.02, lead = 1.4;
      const maxW = W - x0 - (narrow ? W * 0.09 : W * 0.12);
      const maxH = H * (narrow ? 0.62 : 0.6);
      const fb = fitBest(cut.text, font, weight, tr, lead, maxW, maxH, capFor(env, cut.n) * 0.92, 3);
      const rows = fb.rows, s = fb.size;
      const hs = s * lead, total = s + hs * (rows.length - 1);
      const top = clamp(H * (p.y || 0.48) - total / 2, H * 0.14, H * 0.86 - total);
      const items = rows.map((r, i) => itemL(r, font, weight, s, tr, x0, top + s / 2 + hs * i, { lead, mi: i }));
      return { items, top, bottom: top + total, x1: x0 + Math.max(...rows.map(r => tw(r, font, weight, s, tr))) };
    });
    const bw = thinW(body);
    lab(env, L.fmtTime(cut.start), x0, G.top - ls * 2.2, { align: 'left', a: env.inOut(0.6, 0.1), font: body, weight: bw, size: ls * 1.1, track: 0.08 });
    const rom = romOf(cut.text);
    const sig = `— ${p.sig === 'rom' && rom ? rom : 'No. ' + pad2(cut.line + 1)}`;
    const sw = tw(sig, body, bw, ls * 1.05, 0.06);
    lab(env, sig, clamp(G.x1, x0 + sw, W * 0.94), G.bottom + ls * 2.2, { align: 'right', a: env.inOut(0.6, 0.35), font: body, weight: bw, size: ls * 1.05, track: 0.06, color: sc.sub });
    return drawAll(env, G.items);
  },
});

/* 9. 数字の主役: 歌詞の数字を等幅で特大に。数字が無ければ字数を数える(偽の統計は作らない)。残りの歌詞も 8% 以上 */
const toHalf = s => String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
regLayout('h_counter', {
  name: '数字の主役', tags: ['graphic', 'editorial', 'cyber'], w: 0.8, emph: 1.2,
  plan: (rng, cut) => ({ lyricNum: /[0-9０-９]/.test(cut.text || ''), rule: rng.chance(0.6) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {}, m = mOf(env);
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), mono = L.roleFont(env, 'mono'), body = L.roleFont(env, 'body');
    const wide = !env.portrait && W / H > 1.25;
    const G = cache(['ct2', cut.text, W, H, disp, mono, typoKey()].join('|'), () => {
      const mm = /[0-9０-９]+/.exec(cut.text);
      let num, rest;
      if (mm) {
        num = toHalf(mm[0]);
        const b = cut.text.slice(0, mm.index).trim(), a = cut.text.slice(mm.index + mm[0].length).trim();
        rest = b && a ? b + joinerOf(cut.text) + a : b || a;
      } else { num = pad2(cut.n); rest = cut.text; }
      const cell = L.adv(mono, 700, '0');
      const numW100 = L.glyphs(num).reduce((acc, ch) => acc + (/\d/.test(ch) ? cell : L.adv(mono, 700, ch)) * 100, 0);
      const tr = dTrack(rest), rn = L.glyphCount(rest);
      const want = m * 0.08;
      let out = null;
      for (let fr = 1; fr >= 0.55 && !out; fr -= 0.15) {
        const nbW = (wide ? W * 0.4 : (W - mx * 2) * 0.8) * fr, nbH = (wide ? H * 0.66 : H * 0.36) * fr;
        const N = Math.max(8, Math.min(nbW * 100 / numW100, nbH / 0.92, m * 0.62));
        const numW = numW100 * N / 100;
        let items = [], nx, ny, rs = 1e9;
        if (wide) {
          nx = mx; ny = H / 2;
          const rx = mx + numW + N * 0.3;                         // 単位「字」の分をあける
          if (rest) {
            const fb = fitBest(rest, disp, 900, tr, 1.1, W - mx - rx, H * 0.7, capFor(env, rn), 3);
            rs = fb.size;
            const hs = rs * 1.1, total = rs + hs * (fb.rows.length - 1);
            const top = clamp(ny + N * 0.4 - total, my, H - my - total);    // 数字の下端に揃える
            items = fb.rows.map((r, i) => itemL(r, disp, 900, rs, tr, rx, top + rs / 2 + hs * i, { lead: 1.1, mi: i + 1 }));
          }
        } else {
          nx = mx; ny = my + N * 0.5;
          if (rest) {
            const y0 = ny + N * 0.5 + m * 0.05;
            const fb = fitBest(rest, disp, 900, tr, 1.1, W - mx * 2, H - my - y0, capFor(env, rn), 3);
            rs = fb.size;
            items = fb.rows.map((r, i) => itemL(r, disp, 900, rs, tr, nx, y0 + rs / 2 + rs * 1.1 * i, { lead: 1.1, mi: i + 1 }));
          }
        }
        if (rs >= want || fr < 0.6) out = { num, lyricNum: !!mm, N, numW, cell, nx, ny, items };
      }
      return out;
    });
    const io = env.inOut(0.45);
    let bb = null;
    if (G.lyricNum) {
      bb = L.mainDraw(env, { text: G.num, font: mono, weight: 700, size: G.N, track: 0, lead: 1, align: 'left', x: G.nx + G.numW / 2, y: G.ny, mi: 0 });
    } else if (io > 0.004) {
      // 字数を数え上げる(実際の字数。出入りは io)
      const k = E.outExpo(clamp(env.lt / 0.7));
      const str = pad2(Math.round(cut.n * k));
      L.glyphs(str).forEach((ch, i) => env.text({ text: ch, font: mono, weight: 700, size: G.N, x: G.nx + G.cell * G.N * (i + 0.5), y: G.ny, color: sc.fg, alpha: io, ghost: false, track: 0, lead: 1 }));
      lab(env, '字', G.nx + G.numW + G.N * 0.04, G.ny + G.N * 0.28, { align: 'left', a: io, font: body, weight: thinW(body), size: G.N * 0.16, track: 0 });
    }
    if (p.rule) {
      const y = G.ny + G.N * 0.5;
      rule(env, G.nx, y, G.nx + G.numW, y, E.outExpo(clamp((env.lt - 0.15) / 0.8)), sc.sub, hair(env), io * 0.8);
    }
    return L.unionBB(bb, drawAll(env, G.items)) || L.itemBox({ text: G.num, font: mono, weight: 700, size: G.N, x: G.nx + G.numW / 2, y: G.ny });
  },
});

/* 10. 見出しと本文: 同じ歌詞を display の特大(幅いっぱい)と body の小さな一段で。書体の対比を見せる */
regLayout('h_specimen2', {
  name: '見出しと本文', tags: ['editorial', 'calm', 'graphic'], w: 0.9, fits: n => n >= 2,
  plan: rng => ({ order: rng.pick(['dt', 'dt', 'bt']), acc: rng.chance(0.35) }),
  render(env) {
    const { W, H, cut, sc } = env, p = cut.params || {};
    const { mx, my } = margins(env);
    const disp = L.roleFont(env, 'display'), body = L.roleFont(env, 'body');
    const thin = thinW(body), ls = lsz(env);
    const G = cache(['sp2', cut.text, W, H, disp, body, p.order, typoKey()].join('|'), () => {
      const x0 = mx, maxW = W - mx * 2;
      const tr = dTrack(cut.text);
      const labH = ls * 1.9;
      const btr = isLatinText(cut.text) ? 0.04 : 0.03;
      // 本文の段の高さを先に見積もって、残りを見出しに
      const b0 = Math.max(ls * 1.3, Math.min(W, H) * 0.035);
      const bRows0 = wrapTo(cut.text, body, thin, b0, btr, maxW, 4);
      const hB0 = b0 + b0 * 1.6 * (bRows0.length - 1);
      const gap = ls * 2.4;
      const fb = fitBest(cut.text, disp, 900, tr, 1.06, maxW, H - my * 2 - labH * 2 - gap - hB0, capFor(env, cut.n) * 1.1, 3);
      const dRows = fb.rows;
      let D = fb.size;
      const b = clamp(D / Math.pow(1.333, 4), b0, D / 2.2);
      const bRows = wrapTo(cut.text, body, thin, b, btr, maxW, 4);
      const hB = b + b * 1.6 * (bRows.length - 1);
      const roomA = H - my * 2 - labH * 2 - gap - hB;              // 本文が見積もりより増えた分は見出しを縮めて収める
      if (D * (1 + 1.06 * (dRows.length - 1)) > roomA) D = Math.max(4, roomA / (1 + 1.06 * (dRows.length - 1)));
      const hA = D + D * 1.06 * (dRows.length - 1);
      const total = labH + hA + gap + labH + hB;
      let y = clamp(H / 2 - total / 2, my, Math.max(my, H - my - total));
      const tiers = [];
      const mk = kind => {
        y += labH;
        const t0 = y;
        const its = kind === 'd'
          ? dRows.map((r, i) => itemL(r, disp, 900, D, tr, x0, t0 + D / 2 + D * 1.06 * i, { lead: 1.06 }))
          : bRows.map((r, i) => itemL(r, body, thin, b, btr, x0, t0 + b / 2 + b * 1.6 * i, { lead: 1.6 }));
        y += kind === 'd' ? hA : hB;
        tiers.push({ kind, top: t0, items: its });
      };
      const order = p.order === 'bt' ? ['b', 'd'] : ['d', 'b'];
      mk(order[0]);
      const ruleY = y + gap / 2;
      y += gap;
      mk(order[1]);
      let mi = 0;
      const items = [];
      tiers.forEach(t => t.items.forEach(it => { it.mi = mi++; items.push(it); }));
      return { items, tiers, ruleY, x0 };
    });
    const io = env.inOut(0.45);
    rule(env, mx, G.ruleY, W - mx, G.ruleY, E.outExpo(clamp((env.lt - 0.1) / 0.9)), p.acc ? accentOn(env) : sc.sub, hair(env), io * 0.85);
    G.tiers.forEach((t, i) => {
      const fam = famName(t.kind === 'd' ? disp : body).toUpperCase(), wt = t.kind === 'd' ? '900' : String(thin);
      lab(env, `${fam}  ${wt}`, G.x0, t.top - ls * 0.95, { align: 'left', a: env.inOut(0.4, 0.2 + i * 0.1), size: ls * 0.85, track: 0.12 });
    });
    return drawAll(env, G.items);
  },
});

/* ================================================================ enter / exit */
const SZ = it => Math.max(1, it.size || 40);
const tz = v => (v && Math.abs(v) >= 0.5 ? v : 0);
const mulA = (it, k) => { it.alpha = (it.alpha == null ? 1 : it.alpha) * clamp(k); };
const addFn = (it, f) => { (it.charFns || (it.charFns = [])).push(f); };
/* 字の行内の位置と行番号(lay の並びと同じ: 改行を除く字の順) */
const colInfo = it => {
  const key = (it.vertical ? 'v' : 'h') + String(it.text);
  let c = colCache.get(key);
  if (!c) {
    const lines = String(it.text == null ? '' : it.text).split('\n');
    const col = [], len = [], line = [];
    lines.forEach((ln, li) => { const gs = L.glyphs(ln); gs.forEach((_, ci) => { col.push(ci); len.push(gs.length); line.push(li); }); });
    c = { col, len, line, nl: lines.length };
    if (colCache.size > 600) colCache.clear();
    colCache.set(key, c);
  }
  return c;
};
const anchorOf = (it, len) => {
  const a = it.vertical ? (it.valign === 'top' ? 'left' : 'center') : (it.align || 'center');
  return a === 'left' ? 0 : a === 'right' ? len - 1 : (len - 1) / 2;
};
const regE = (key, def) => L.register('enter', key, def, P);
const regX = (key, def) => L.register('exit', key, def, P);

regE('hmRise', {
  name: '静かに上昇', tags: ['editorial', 'calm', 'emotional', 'graphic'], w: 1.2, stagger: 0.06,
  apply(env, it, p) {
    const dist = Math.min(env.H * 0.08, SZ(it) * 0.6);
    const ci = colInfo(it);
    if (ci.nl <= 1 || it.vertical) {
      it.y += tz((1 - E.outExpo(p)) * dist);
      mulA(it, E.outQuad(p));
      return;
    }
    addFn(it, i => {
      const ln = ci.line[i] || 0;
      const pl = L.stagger(p, ln, ci.nl, 0.3);
      if (pl >= 1) return null;
      if (pl <= 0) return { hide: true };
      return { dy: tz((1 - E.outExpo(pl)) * dist), a: E.outQuad(pl) };
    });
  },
});
regE('hmMaskLine', {
  name: '行マスク上昇', tags: ['editorial', 'graphic', 'calm'], w: 1.2, stagger: 0.06,
  apply(env, it, p) {
    const ci = colInfo(it), S = SZ(it);
    addFn(it, i => {
      const ln = ci.line[i] || 0;
      const pl = L.stagger(p, ln, ci.nl, 0.35);
      if (pl <= 0) return { hide: true };
      const e = E.outExpo(pl);
      if (e >= 0.9995) return null;
      const d = (1 - e) * 1.1;
      if (d * S < 0.5) return null;
      return { dy: d * S, clipY: [-0.62 - d, 0.62 - d] };
    });
  },
});
regE('hmTrackIn', {
  name: '字間を締める', tags: ['editorial', 'calm', 'emotional'], w: 1.1, stagger: 0.06,
  apply(env, it, p) {
    const ci = colInfo(it), S = SZ(it);
    const k = 0.25 * (1 - E.outExpo(p));
    mulA(it, E.outCubic(p));
    if (k * S < 0.02) return;
    const vert = !!it.vertical;
    addFn(it, i => {
      const off = tz((ci.col[i] - anchorOf(it, ci.len[i])) * k * S);
      return off ? (vert ? { dy: off } : { dx: off }) : null;
    });
  },
});
regE('hmHairline', {
  name: '罫から現れる', tags: ['editorial', 'graphic', 'calm'], w: 1, stagger: 0.06,
  apply(env, it, p) {
    const head = E.outExpo(clamp(p / 0.7));                      // 罫の先端
    const rev = E.outExpo(clamp((p - 0.1) / 0.75));              // 文字の見える範囲(罫の後ろ)
    const ra = 1 - L.smooth(0.62, 1, p);                        // 罫は消える
    mulA(it, clamp(0.35 + rev));
    if (it.clipFn) return;
    const vert = !!it.vertical;
    it.clipFn = (ctx, env2, it2, m) => {
      const S2 = SZ(it2), pad = S2 * 0.6, lw = Math.max(1, S2 * 0.03);
      if (!vert) {
        const bx0 = -m.w / 2 - pad, bw = m.w + pad * 2;
        ctx.rect(bx0, -m.h / 2 - pad, bw * clamp((pad + (m.w + pad) * rev) / bw), m.h + pad * 2);
        const ry = m.h / 2 + S2 * 0.08;
        ctx.rect(-m.w / 2 - lw, ry - lw * 2, m.w * head + lw * 2, lw * 4);
      } else {
        const by0 = -m.h / 2 - pad, bh = m.h + pad * 2;
        ctx.rect(-m.w / 2 - pad, by0, m.w + pad * 2, bh * clamp((pad + (m.h + pad) * rev) / bh));
        const rx = m.w / 2 + S2 * 0.08;
        ctx.rect(rx - lw * 2, -m.h / 2 - lw, lw * 4, m.h * head + lw * 2);
      }
    };
    const prev = it.post;
    it.post = (env2, it2, m) => {
      if (prev) prev(env2, it2, m);
      if (env2.pass !== 'main' || ra <= 0.004) return;
      const S2 = SZ(it2), lw = Math.max(1, S2 * 0.03);
      const col = it2.color || env2.sc.fg;
      if (!vert) { const ry = m.h / 2 + S2 * 0.08; env2.rect(-m.w / 2, ry - lw / 2, m.w * head, lw, col, ra, false); }
      else { const rx = m.w / 2 + S2 * 0.08; env2.rect(rx - lw / 2, -m.h / 2, lw, m.h * head, col, ra, false); }
    };
  },
});

regX('hmSinkOut', {
  name: '沈んで消える', tags: ['editorial', 'calm', 'emotional', 'graphic'], w: 1.2,
  apply(env, it, p) {
    it.y += tz(E.inCubic(p) * Math.min(env.H * 0.05, SZ(it) * 0.35));
    mulA(it, 1 - E.inQuad(p));
  },
});
regX('hmTrackOut', {
  name: '字間がほどける', tags: ['editorial', 'calm', 'emotional'], w: 1.1,
  apply(env, it, p) {
    const ci = colInfo(it), S = SZ(it);
    const k = 0.3 * E.inCubic(p);
    mulA(it, 1 - E.inQuad(p));
    if (k * S < 0.02) return;
    const vert = !!it.vertical;
    addFn(it, i => {
      const off = tz((ci.col[i] - anchorOf(it, ci.len[i])) * k * S);
      return off ? (vert ? { dy: off } : { dx: off }) : null;
    });
  },
});
regX('hmMaskDown', {
  name: '行マスク下降', tags: ['editorial', 'graphic', 'calm'], w: 1.1,
  apply(env, it, p) {
    const ci = colInfo(it), S = SZ(it);
    addFn(it, i => {
      const ln = ci.line[i] || 0;
      const pl = L.stagger(p, ln, ci.nl, 0.3);
      const e = E.inCubic(pl);
      if (e * 1.15 * S < 0.5) return null;
      if (e >= 1) return { hide: true };
      const d = e * 1.15;
      return { dy: d * S, clipY: [-0.62 - d, 0.62 - d] };
    });
  },
});

/* ================================================================ treat */
/* 項目の字(lay 添字) → カット文字列の添字。一致しなければ null */
const mapToCut = (cutText, itemText) => {
  const key = cutText + '\u0001' + itemText;
  if (mapCache.has(key)) return mapCache.get(key);
  const cg = L.glyphs(cutText), ig = L.glyphs(itemText).filter(c => c !== '\n');
  const first = ig.findIndex(c => !L.isSpace(c));
  let res = null;
  if (first >= 0 && cg.length <= 200) {
    for (let j = 0; j < cg.length && !res; j++) {
      if (cg[j] !== ig[first]) continue;
      const out = new Array(ig.length).fill(-1);
      let k = j, ok = true;
      for (let i = first; i < ig.length; i++) {
        if (L.isSpace(ig[i])) { if (k < cg.length && L.isSpace(cg[k])) k++; continue; }
        while (k < cg.length && L.isSpace(cg[k])) k++;
        if (k >= cg.length || cg[k] !== ig[i]) { ok = false; break; }
        out[i] = k++;
      }
      if (ok) res = out;
    }
  }
  if (mapCache.size > 600) mapCache.clear();
  mapCache.set(key, res);
  return res;
};
const regT = (key, def) => L.register('treat', key, def, P);

regT('hmUnderlineEmph', {
  name: '強調の下線', tags: ['editorial', 'graphic', 'emotional'], w: 0.6, needsEmph: true,
  apply(env, it) {
    const cut = env.cut, ei = cut.emphIdx;
    if (!ei || !ei.length) return;
    const map = mapToCut(cut.text, String(it.text));
    if (!map) return;
    const set = new Set(ei);
    const hit = map.map(j => j >= 0 && set.has(j));
    if (!hit.some(Boolean)) return;
    const vert = !!it.vertical;
    const prev = it.post;
    it.post = (env2, it2, m) => {
      if (prev) prev(env2, it2, m);
      if (env2.pass !== 'main') return;
      const e = E.outExpo(clamp((env2.lt - env2.cut.inDur * 0.7) / 0.55));
      if (e <= 0.002) return;
      const S2 = SZ(it2), th = Math.max(1.5, S2 * 0.07), a = it2.alpha == null ? 1 : it2.alpha;
      const col = accentOn(env2);
      const lay = m.lay;
      let i = 0;
      while (i < lay.length) {
        if (!hit[i] || lay[i].space) { i++; continue; }
        let j = i;
        while (j + 1 < lay.length && hit[j + 1] && lay[j + 1].line === lay[i].line) j++;
        let b = j;
        while (b > i && (lay[b].space || L.isPunct(lay[b].ch))) b--;
        const A = lay[i], B = lay[b];
        if (!vert) { const x0 = A.x - A.w / 2, x1 = B.x + B.w / 2; env2.rect(x0, A.y + S2 * 0.6 - th / 2, (x1 - x0) * e, th, col, a, false); }
        else { const y0 = A.y - S2 / 2, y1 = B.y + S2 / 2; env2.rect(A.x + S2 * 0.62 - th / 2, y0, th, (y1 - y0) * e, col, a, false); }
        i = j + 1;
      }
    };
  },
});
regT('hmAccentWord', {
  name: '一語だけ差し色', tags: ['editorial', 'graphic', 'calm', 'emotional'], w: 0.8,
  apply(env, it) {
    const cut = env.cut;
    const col = accentOn(env);
    if (it.color && L.hex(it.color) === L.hex(col)) return;
    const map = mapToCut(cut.text, String(it.text));
    if (!map) return;
    const cs = coreSpan(cut);
    if (!cs.emph && cs.e - cs.s >= L.glyphs(cut.text).length) return;   // 全体が1語なら色を変えない(差し色は一部だけ)
    const set = cs.emph ? new Set(cut.emphIdx) : null;
    let ce = cs.e;
    if (!set) {                                                 // 語尾の助詞は差し色から外す(差し色は語の芯だけ)
      const w = L.glyphs(cut.text).slice(cs.s, cs.e).join('');
      const core = w.replace(/(まで|から|だけ|より|ほど|など|って|の|は|が|を|に|で|と|へ|や|も|ね|よ)+$/, '');
      if (core && L.glyphCount(core) >= 1) ce = cs.s + L.glyphs(core).length;
    }
    const hit = map.map(j => j >= 0 && (set ? set.has(j) : j >= cs.s && j < ce));
    if (!hit.some(Boolean)) return;
    addFn(it, i => (hit[i] ? { color: col } : null));
  },
});

/* ================================================================ styles */
const LINE_DECOR = { cropMarks: 1.6, rulerEdge: 1.4, dimLines: 1.2, cornerBrackets: 0.7, coordRead: 0.5, frameCount: 0.4 };
const decorMap = extra => {
  const o = {};
  for (const k of L.keys('decor')) o[k] = 0.2;                  // 線以外の装飾は控えめ
  return Object.assign(o, LINE_DECOR, extra || {});
};
const HKEYS = ['h_scaleSteps', 'h_extremes', 'h_hanging', 'h_underline', 'h_poster', 'h_caption', 'h_margin', 'h_letter', 'h_counter', 'h_specimen2'];
const BOUNCY = { enter: ['spring', 'elastic', 'jelly', 'dropBounce', 'squash'], exit: ['bounceOut', 'hopAway'], hold: ['jelly', 'beatBounce', 'bassSquash'] };
/* 他パックの構図・動きは控えめに(このパックは最後に読み込まれるので全キーが見える)。
   h_ 構図と hm 動きを優遇し、バウンス系は他の0.3倍 */
const OTHER = 0.4;
const biasFor = lay => {
  const b = { layout: {}, enter: {}, exit: {}, hold: {} };
  for (const g of ['layout', 'enter', 'exit']) for (const k of L.keys(g)) b[g][k] = OTHER;
  HKEYS.forEach(k => { b.layout[k] = 5; });
  Object.entries(lay || {}).forEach(([k, v]) => { b.layout[k] = v; });
  Object.assign(b.enter, { fade: 1, hmRise: 6, hmMaskLine: 6, hmTrackIn: 4.5, hmHairline: 4 });
  Object.assign(b.exit, { fade: 1, hmSinkOut: 6, hmTrackOut: 4.5, hmMaskDown: 4.5 });
  BOUNCY.enter.forEach(k => { b.enter[k] = OTHER * 0.3; });
  BOUNCY.exit.forEach(k => { b.exit[k] = OTHER * 0.3; });
  BOUNCY.hold.forEach(k => { b.hold[k] = 0.3; });
  b.treat = { hmUnderlineEmph: 3, hmAccentWord: 3 };          // (core の計画は treat の bias を見ない。将来用)
  return b;
};
const MONO = "'Space Mono', monospace";
const style = (key, def) => L.registerStyle(key, Object.assign({}, def, { decor: decorMap(def.decorExtra) }));

style('hmSpecimen', {
  name: 'スペシメン', desc: '明るい紙に高コントラストの明朝と角ゴシック本文、暖色の差し色一点。書体見本帳の組み',
  moods: ['editorial', 'calm'],
  colors: { bg1: '#f8f1e5', bg2: '#efe7d9', accent: '#fc4c02', accent2: '#48413b', text: '#16100b' },
  fonts: { display: "'Shippori Mincho', serif", serif: "'Shippori Mincho', serif", body: "'Zen Kaku Gothic New', sans-serif", mono: MONO, hand: "'Zen Kaku Gothic New', sans-serif" },
  ghost: 0.1, ghostA: '#fc4c02', ghostB: '#6e6862',
  bias: biasFor({ h_specimen2: 8.5, h_scaleSteps: 8, h_extremes: 7.5 }),
});
style('hmNewsprint', {
  name: '新聞', desc: '灰色がかった紙に墨の明朝。差し色はほぼ使わず、罫と小さなキャプションで組む紙面',
  moods: ['editorial', 'calm'],
  colors: { bg1: '#e6dcd2', bg2: '#dacfc3', accent: '#8f3126', accent2: '#645450', text: '#160605' },
  fonts: { display: "'Zen Old Mincho', serif", serif: "'Zen Old Mincho', serif", body: "'Noto Sans JP', sans-serif", mono: MONO, hand: "'Zen Old Mincho', serif" },
  ghost: 0.08, ghostA: '#645450', ghostB: '#8f3126',
  bias: biasFor({ h_caption: 8.5, h_margin: 8, h_letter: 7.5, h_hanging: 7.5 }),
});
style('hmManifesto', {
  name: 'マニフェスト', desc: '黒と生成りに極太ゴシック。1行1語で積むポスターの断言、赤は一点だけ',
  moods: ['graphic', 'dark', 'editorial'],
  colors: { bg1: '#0a0806', bg2: '#12100d', accent: '#e51a1a', accent2: '#857f79', text: '#f4f1ea' },
  fonts: { display: "'Dela Gothic One', sans-serif", serif: "'Dela Gothic One', sans-serif", body: "'Zen Kaku Gothic New', sans-serif", mono: MONO, hand: "'Zen Kaku Gothic New', sans-serif" },
  ghost: 0.12, ghostA: '#e51a1a', ghostB: '#857f79',
  bias: biasFor({ h_poster: 9, h_extremes: 8, h_underline: 7.5 }),
});
style('hmTerminal', {
  name: 'ターミナル', desc: '黒地に燐光の緑。ドット書体と等幅だけの端末の組み、注とキャプションで情報を添える',
  moods: ['cyber', 'dark'],
  colors: { bg1: '#020602', bg2: '#060e06', accent: '#75d350', accent2: '#394e35', text: '#9be97f' },
  fonts: { display: "'DotGothic16', sans-serif", serif: "'DotGothic16', sans-serif", body: "'DotGothic16', sans-serif", mono: MONO, hand: "'DotGothic16', sans-serif" },
  ghost: 0.22, ghostA: '#75d350', ghostB: '#394e35',
  bias: biasFor({ h_caption: 8.5, h_margin: 8.5, h_counter: 8 }),
});
style('hmRiso', {
  name: 'リソ', desc: '生成りの紙に青インクと蛍光ピンクの2色刷り。版ずれ気味の色ずれと太いゴシック',
  moods: ['pop', 'graphic'],
  colors: { bg1: '#f6eedc', bg2: '#efe3cf', accent: '#f83599', accent2: '#1545a2', text: '#1545a2' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Zen Old Mincho', serif", body: "'Zen Old Mincho', serif", mono: MONO, hand: "'Zen Old Mincho', serif" },
  ghost: 0.5, ghostA: '#f83599', ghostB: '#1545a2',
  bias: biasFor({ h_poster: 8, h_extremes: 8, h_underline: 7.5, h_scaleSteps: 7.5 }),
});
style('hmGrid', {
  name: 'グリッド', desc: '白・黒・赤一点のスイス。角ゴシックの極端な太さと等幅の小さなラベルを格子に揃える',
  moods: ['editorial', 'graphic'],
  colors: { bg1: '#fafcfe', bg2: '#f4f6f8', accent: '#d01e1c', accent2: '#5b5e61', text: '#0a0e12' },
  fonts: { display: "'Zen Kaku Gothic New', sans-serif", serif: "'Zen Kaku Gothic New', sans-serif", body: "'Zen Kaku Gothic New', sans-serif", mono: MONO, hand: "'Zen Kaku Gothic New', sans-serif" },
  ghost: 0.08, ghostA: '#d01e1c', ghostB: '#5b5e61',
  bias: biasFor({ h_caption: 8.5, h_scaleSteps: 8, h_specimen2: 7.5, h_counter: 7.5 }),
});
})();
