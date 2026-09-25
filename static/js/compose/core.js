/* LyricFlow 演出エンジン (Compose) — コア
   歌詞を「カット」に分け、カットごとに
     layout(構図) + enter/hold/exit(登場/保持/退場) + decor(装飾) + treat(文字加工) + cam(カメラ) + trans(つなぎ)
   を割り当てて Canvas2D に描く。全てシード決定論(同じ時刻 → 同じ絵。書き出しとプレビューが一致)。
   演出はレジストリにパック単位で登録する(static/js/compose/p_*.js)。契約は docs/COMPOSE_PACKS.md。
   設計の参考: JIZURA (MIT License, © hakoniwa) の「カット×演出パック」構造。実装は LyricFlow 独自。 */
(() => {
'use strict';
const L = window.LFC = window.LFC || {};

/* ================================================================ registry */
const REG = {}, ORD = {};
L.GROUPS = ['layout', 'enter', 'hold', 'exit', 'decor', 'treat', 'cam', 'trans'];
for (const g of L.GROUPS) { REG[g] = {}; ORD[g] = []; }
L.register = (group, key, def, pack = 'core') => {
  if (!REG[group]) { REG[group] = {}; ORD[group] = []; }
  if (REG[group][key]) { console.warn('[LFC] duplicate key', group, key); return; }
  REG[group][key] = Object.assign({ key, pack, w: 1, tags: [] }, def);
  ORD[group].push(key);
};
L.get = (g, k) => (REG[g] && k) ? REG[g][k] || null : null;
L.keys = g => (ORD[g] || []).slice();
L.list = g => (ORD[g] || []).map(k => REG[g][k]);
L.count = () => { const o = {}; let total = 0; for (const g of L.GROUPS) { o[g] = (ORD[g] || []).length; total += o[g]; } o.style = Object.keys(L.STYLES).length; o.total = total + o.style; return o; };

/* ================================================================ math / easing */
const clamp = L.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
L.lerp = (a, b, t) => a + (b - a) * t;
L.smooth = (a, b, x) => { const t = clamp((x - a) / ((b - a) || 1e-6)); return t * t * (3 - 2 * t); };
L.TAU = Math.PI * 2;
L.DEG = Math.PI / 180;
const E = L.E = {
  lin: x => x,
  inQuad: x => x * x, outQuad: x => 1 - (1 - x) * (1 - x), inOutQuad: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: x => x * x * x, outCubic: x => 1 - Math.pow(1 - x, 3), inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inQuart: x => x * x * x * x, outQuart: x => 1 - Math.pow(1 - x, 4),
  outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)), inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  outElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  outBounce: x => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
  inSine: x => 1 - Math.cos(x * Math.PI / 2), outSine: x => Math.sin(x * Math.PI / 2), inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
};

/* ================================================================ hash / rng / noise (決定論) */
L.h = (...args) => {
  let h = 2166136261 >>> 0;
  for (const v of args) {
    const s = typeof v === 'number' ? String(Math.round(v * 1000)) : String(v);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 2246822507) >>> 0;
  }
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return h >>> 0;
};
L.r = (...a) => L.h(...a) / 4294967296;            // 0..1
L.rs = (...a) => L.r(...a) * 2 - 1;                // -1..1
L.rr = (lo, hi, ...a) => lo + (hi - lo) * L.r(...a);
L.rng = seed => {
  let s = (typeof seed === 'number' ? seed : L.h(seed)) >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
};
L.noise1 = (x, seed = 0) => {                       // なめらかな1Dノイズ 0..1
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = L.r('n', i, seed), b = L.r('n', i + 1, seed);
  return a + (b - a) * u;
};

/* ================================================================ colour */
L.rgb = c => {
  if (Array.isArray(c)) return c;
  c = String(c || '#ffffff').trim();
  let m = /^#([\da-f])([\da-f])([\da-f])$/i.exec(c);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16), 1];
  m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(c);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), m[4] ? parseInt(m[4], 16) / 255 : 1];
  m = /rgba?\(([^)]+)\)/i.exec(c);
  if (m) { const p = m[1].split(',').map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]]; }
  return [255, 255, 255, 1];
};
const hx = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
L.hex = c => { const [r, g, b] = L.rgb(c); return '#' + hx(r) + hx(g) + hx(b); };
L.lum = c => {
  const [r, g, b] = L.rgb(c).map((v, i) => (i < 3 ? v / 255 : v));
  const f = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
L.mix = (a, b, t) => { const A = L.rgb(a), B = L.rgb(b); return '#' + hx(A[0] + (B[0] - A[0]) * t) + hx(A[1] + (B[1] - A[1]) * t) + hx(A[2] + (B[2] - A[2]) * t); };
L.rgba = (c, a) => { const [r, g, b] = L.rgb(c); return `rgba(${r | 0},${g | 0},${b | 0},${clamp(a).toFixed(3)})`; };
L.contrast = (a, b) => { const x = L.lum(a), y = L.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
L.fitContrast = (c, bg, ratio = 3) => {
  if (L.contrast(c, bg) >= ratio) return L.hex(c);
  const toward = L.lum(bg) < 0.4 ? '#ffffff' : '#000000';
  for (let t = 0.1; t <= 1.001; t += 0.1) { const m = L.mix(c, toward, t); if (L.contrast(m, bg) >= ratio) return m; }
  return toward;
};
L.onColor = bg => (L.lum(bg) > 0.42 ? '#0b0d12' : '#ffffff');   // 塗りの上に載せる文字色

/* ================================================================ text: chars / fonts / measure */
L.isKanji = ch => /[一-鿿㐀-䶿々-〇豈-﫿]/.test(ch);
L.isHira = ch => /[ぁ-ゟ]/.test(ch);
L.isKata = ch => /[゠-ヿㇰ-ㇿｦ-ﾟ]/.test(ch);
L.isLatin = ch => /[A-Za-z0-9À-ɏ]/.test(ch);
L.isPunct = ch => /[、。，．,.!！?？・：；:;「」『』（）()【】〈〉《》…‥〜～ー－—―\-'"“”]/.test(ch);
L.isSmallKana = ch => /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ]/.test(ch);
L.isSpace = ch => /\s/.test(ch);
L.glyphs = s => Array.from(String(s == null ? '' : s));
L.glyphCount = s => L.glyphs(s).filter(c => !L.isSpace(c)).length;
L.hasLatinWords = s => /[A-Za-z]{2,}/.test(s || '');
const V_ROT = new Set(['ー', '－', '—', '―', '〜', '～', '…', '‥', '-', '=', '（', '）', '(', ')', '「', '」', '『', '』', '【', '】', '〈', '〉', '《', '》', '[', ']', '<', '>', '→', '←', '~', ':', '：']);
const V_SHIFT = new Set(['、', '。', '，', '．', ',', '.']);

L.DEFAULT_FONTS = {
  display: "'Zen Kaku Gothic New', sans-serif",   // 漢字の収録が広い極太ゴシック(Dela Gothic One は一部漢字が無い)
  serif: "'Shippori Mincho', serif",
  body: "'Zen Kaku Gothic New', sans-serif",
  mono: "'DotGothic16', sans-serif",
  hand: "'Yomogi', cursive",
};
L.roleFont = (env, role = 'display', i = 0) => {
  const st = env && env.st;
  const f = (st && st.fonts && st.fonts[role]) || L.DEFAULT_FONTS[role] || L.DEFAULT_FONTS.display;
  return Array.isArray(f) ? f[Math.abs(i | 0) % f.length] : f;
};
/* 収録字が少ない書体の欠け字を、同系統の日本語書体で補う(ゴシック系→Zen角ゴシック、明朝系→Noto Serif JP) */
const famCache = new Map();
L.fontFam = f => {
  f = f || L.DEFAULT_FONTS.display;
  let v = famCache.get(f);
  if (v === undefined) {
    if (/Zen Kaku Gothic New|Noto Sans JP|Noto Serif JP/.test(f)) v = f;
    else {
      const serif = /(^|,)\s*serif\s*$/.test(f);
      const fb = serif ? "'Noto Serif JP'" : "'Zen Kaku Gothic New'";
      v = /,\s*(sans-serif|serif|cursive|monospace)\s*$/.test(f) ? f.replace(/,\s*(sans-serif|serif|cursive|monospace)\s*$/, `, ${fb}, $1`) : `${f}, ${fb}, sans-serif`;
    }
    famCache.set(f, v);
  }
  return v;
};
L.fontStr = it => `${it.italic ? 'italic ' : ''}${it.weight == null ? 900 : it.weight} ${Math.max(1, it.size || 10).toFixed(2)}px ${L.fontFam(it.font)}`;

const mcanvas = document.createElement('canvas');
const mctx = mcanvas.getContext('2d');
const advCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => advCache.clear());
L.adv = (font, weight, ch) => {                         // 1em あたりの送り幅
  const k = font + '|' + weight + '|' + ch;
  let v = advCache.get(k);
  if (v === undefined) {
    mctx.font = `${weight} 100px ${L.fontFam(font)}`;
    v = mctx.measureText(ch).width / 100;
    if (!(v > 0)) v = 1;
    if (advCache.size > 30000) advCache.clear();
    advCache.set(k, v);
  }
  return v;
};

/* テキスト項目のレイアウト(項目中心が原点)。{w,h,lay:[{ch,x,y,w,h,i,line,space,vrot,vshift}]} */
L.measure = it => {
  const size = Math.max(1, it.size || 10);
  const font = it.font || L.DEFAULT_FONTS.display;
  const weight = it.weight == null ? 900 : it.weight;
  const lines = String(it.text == null ? '' : it.text).split('\n');
  const lay = [];
  let W = 0, H = 0;
  if (!it.vertical) {
    const lh = size * (it.lead || 1.18);
    const track = (it.track || 0) * size;
    const rows = lines.map(line => {
      const gs = L.glyphs(line);
      const ws = gs.map(ch => (L.isSpace(ch) ? size * 0.32 : L.adv(font, weight, ch) * size));
      const w = ws.reduce((a, b) => a + b, 0) + track * Math.max(0, gs.length - 1);
      return { gs, ws, w };
    });
    W = rows.reduce((m, r) => Math.max(m, r.w), 0);
    H = lh * rows.length;
    rows.forEach((r, li) => {
      let x = it.align === 'left' ? -W / 2 : it.align === 'right' ? W / 2 - r.w : -r.w / 2;
      const y = -H / 2 + lh * (li + 0.5);
      r.gs.forEach((ch, gi) => {
        const w = r.ws[gi];
        lay.push({ ch, x: x + w / 2, y, w, h: size, line: li, i: lay.length, space: L.isSpace(ch) });
        x += w + track;
      });
    });
  } else {
    const cw = size * (it.lead || 1.25);
    const step = size * (1 + (it.track || 0));
    const cols = lines.map(line => L.glyphs(line));
    const maxN = cols.reduce((m, c) => Math.max(m, c.length), 0);
    W = cw * cols.length;
    H = step * maxN;
    cols.forEach((gs, ci) => {
      const x = W / 2 - cw * (ci + 0.5);                 // 縦書きは右の列から
      const colH = step * gs.length;
      const y0 = (it.valign === 'top' ? -H / 2 : -colH / 2) + step * 0.5;
      gs.forEach((ch, gi) => {
        lay.push({
          ch, x, y: y0 + step * gi, w: size, h: size, line: ci, i: lay.length, space: L.isSpace(ch),
          vrot: V_ROT.has(ch) || (L.isLatin(ch) && it.vlatin === 'rot'),
          vshift: V_SHIFT.has(ch) ? 1 : L.isSmallKana(ch) ? 0.45 : 0,
        });
      });
    });
  }
  return { w: W, h: H, lay };
};

/* maxW × maxH に収まる最大サイズ(線形なので1回の計測で決まる) */
L.fitSize = (text, font, maxW, maxH, o = {}) => {
  const base = 100;
  const m = L.measure({ text, font, weight: o.weight, size: base, track: o.track || 0, lead: o.lead, vertical: o.vertical });
  const sx = o.sx || 1, sy = o.sy || 1;
  const kw = m.w > 0 ? maxW / (m.w * sx) : 1e9;
  const kh = m.h > 0 ? maxH / (m.h * sy) : 1e9;
  return Math.max(4, Math.min(Math.min(kw, kh) * base, o.max || 1e9));   // max はピクセル上限
};

/* 日本語向けのバランス改行: 理想位置±3字の中から切りやすい所を選ぶ */
L.splitLines = (text, maxPer) => {
  const src = String(text || '').trim();
  const gs = L.glyphs(src);
  const n = gs.length;
  if (n <= maxPer || maxPer < 1) return [src];
  // 欧文は単語単位で詰める
  if (L.hasLatinWords(src) && /\s/.test(src)) {
    const words = src.split(/\s+/);
    const k = Math.ceil(n / maxPer);
    const target = n / k;
    const out = []; let cur = '';
    for (const w of words) {
      if (cur && L.glyphs(cur + ' ' + w).length > target * 1.15) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) out.push(cur);
    return out;
  }
  const k = Math.ceil(n / maxPer);
  const target = n / k;
  const score = i => {
    const a = gs[i - 1], b = gs[i];
    if (!a || !b) return -99;
    if (L.isSmallKana(b) || 'ー、。，．！？!?）」』】…'.includes(b)) return -8;
    if (L.isSpace(a) || L.isSpace(b)) return 4;
    if ('、。，,!！?？…」』）'.includes(a)) return 4;
    if (/[はがをにでともへやの]/.test(a) && !L.isHira(b)) return 3;
    if (L.isHira(a) && (L.isKanji(b) || L.isKata(b))) return 2;
    if (L.isKata(a) !== L.isKata(b)) return 1;
    return 0;
  };
  const cuts = [];
  let last = 0;
  for (let j = 1; j < k; j++) {
    const ideal = Math.round(target * j);
    let best = ideal, bs = -1e9;
    for (let i = Math.max(last + 1, ideal - 3); i <= Math.min(n - 1, ideal + 3); i++) {
      const s = score(i) - Math.abs(i - ideal) * 0.7;
      if (s > bs) { bs = s; best = i; }
    }
    cuts.push(best); last = best;
  }
  const out = []; let s = 0;
  for (const c of cuts) { out.push(gs.slice(s, c).join('').trim()); s = c; }
  out.push(gs.slice(s).join('').trim());
  return out.filter(Boolean);
};

/* 句(チャンク)分割: 助詞・送り仮名を前の語に寄せる(語単位レイアウト用) */
L.chunks = text => {
  const src = String(text || '').trim();
  if (!src) return [];
  if (L.hasLatinWords(src) && /\s/.test(src)) return src.split(/\s+/).filter(Boolean);
  let segs = null;
  try {
    if (window.Intl && Intl.Segmenter) segs = Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(src)).map(s => s.segment);
  } catch (e) { segs = null; }
  if (!segs) segs = L.splitLines(src, 4);
  const out = [];
  for (const s of segs) {
    if (!s.trim()) continue;
    const g = L.glyphs(s);
    const attach = out.length && (g.every(c => L.isHira(c) || L.isPunct(c)) && g.length <= 3);
    if (attach && L.glyphCount(out[out.length - 1] + s) <= 8) out[out.length - 1] += s;
    else out.push(s);
  }
  // 長すぎる塊は分ける
  const res = [];
  for (const c of out) { if (L.glyphCount(c) > 9) res.push(...L.splitLines(c, 5)); else res.push(c); }
  return res;
};

/* かな→ローマ字(装飾の副テキスト用)。漢字を含む場合は null */
const ROMA = (() => {
  const base = 'あa い i う u え e お o か ka き ki く ku け ke こ ko さ sa し shi す su せ se そ so た ta ち chi つ tsu て te と to な na に ni ぬ nu ね ne の no は ha ひ hi ふ fu へ he ほ ho ま ma み mi む mu め me も mo や ya ゆ yu よ yo ら ra り ri る ru れ re ろ ro わ wa を wo ん n が ga ぎ gi ぐ gu げ ge ご go ざ za じ ji ず zu ぜ ze ぞ zo だ da ぢ ji づ zu で de ど do ば ba び bi ぶ bu べ be ぼ bo ぱ pa ぴ pi ぷ pu ぺ pe ぽ po ぁ a ぃ i ぅ u ぇ e ぉ o ゃ ya ゅ yu ょ yo ゎ wa ゔ vu';
  const m = {};
  const p = base.split(/\s+/);
  for (let i = 0; i + 1 < p.length; i += 2) m[p[i]] = p[i + 1];
  return m;
})();
L.romaji = s => {
  const gs = L.glyphs(s);
  if (gs.some(c => L.isKanji(c))) return null;
  let out = '';
  for (let i = 0; i < gs.length; i++) {
    let c = gs[i];
    if (L.isKata(c) && c !== 'ー' && c !== '・') c = String.fromCharCode(c.charCodeAt(0) - 0x60);
    const nx = gs[i + 1] ? (L.isKata(gs[i + 1]) ? String.fromCharCode(gs[i + 1].charCodeAt(0) - 0x60) : gs[i + 1]) : '';
    if (c === 'っ') { const r = ROMA[nx]; out += r ? r[0] : ''; continue; }
    if (c === 'ー') { out += out.slice(-1); continue; }
    if ('ゃゅょ'.includes(nx) && ROMA[c] && /i$/.test(ROMA[c])) { const stem = ROMA[c].slice(0, -1); out += (/^(sh|ch|j)$/.test(stem) ? stem : stem + 'y') + ROMA[nx].slice(-1); i++; continue; }
    out += ROMA[c] != null ? ROMA[c] : (L.isLatin(c) || L.isSpace(c) ? c : '');
  }
  return out.toUpperCase();
};
L.fmtTime = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };

/* ================================================================ drawing: text items */
const patCache = new Map();
L._pattern = (ctx, kind, color, bg) => {
  const key = kind + '|' + color + '|' + (bg || '');
  let c = patCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 12;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 12, 12); }
    g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 2;
    if (kind === 'dots') { g.beginPath(); g.arc(6, 6, 2.6, 0, L.TAU); g.fill(); }
    else if (kind === 'stripes') { g.beginPath(); g.moveTo(-2, 14); g.lineTo(14, -2); g.moveTo(-8, 8); g.lineTo(8, -8); g.moveTo(4, 20); g.lineTo(20, 4); g.stroke(); }
    else if (kind === 'hatch') { g.beginPath(); g.moveTo(0, 12); g.lineTo(12, 0); g.moveTo(0, 0); g.lineTo(12, 12); g.stroke(); }
    else if (kind === 'grid') { g.fillRect(0, 0, 12, 1.5); g.fillRect(0, 0, 1.5, 12); }
    else if (kind === 'lines') { g.fillRect(0, 0, 12, 3); }
    else { g.fillRect(0, 0, 12, 12); }
    patCache.set(key, c);
  }
  return ctx.createPattern(c, 'repeat');
};

L._glyph = (env, ctx, ch, x, y, it, color, a, outline, m) => {
  const main = env.pass === 'main';
  const size = it.size;
  ctx.globalAlpha = clamp(a);
  // 立体押し出し(extrude)
  if (it.extrude && main) {
    const e = it.extrude;
    const n = Math.min(40, e.n || 6);
    ctx.fillStyle = e.color || L.mix(color, '#000000', 0.6);
    for (let k = n; k >= 1; k--) {
      ctx.globalAlpha = clamp(a * (e.fade ? 1 - k / (n + 1) : 1) * (e.a == null ? 1 : e.a));
      ctx.fillText(ch, x + (e.dx || 1) * k, y + (e.dy || 1) * k);
    }
    ctx.globalAlpha = clamp(a);
  }
  if (it.shadow && main) {
    const s = it.shadow;
    ctx.shadowColor = s.color || 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = (s.blur || 0) * (env.scale || 1);
    ctx.shadowOffsetX = (s.dx || 0) * (env.scale || 1);
    ctx.shadowOffsetY = (s.dy || 0) * (env.scale || 1);
  }
  const hasStroke = it.stroke > 0 && (main || it.ghostStroke !== false);
  if (hasStroke) {
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    ctx.lineWidth = it.stroke;
    ctx.strokeStyle = main ? (it.strokeColor || env.sc.bg) : color;
    if (it.strokeDash) ctx.setLineDash(it.strokeDash); else ctx.setLineDash([]);
  }
  const filled = it.fill !== false && !outline;
  if (hasStroke && filled && it.strokeUnder !== false) ctx.strokeText(ch, x, y);
  if (filled) {
    let fs = color;
    if (main && it.gradient) {
      const gg = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
      const st = it.gradient;
      if (typeof st[0] === 'string') { st.forEach((c, i) => gg.addColorStop(st.length === 1 ? 0 : i / (st.length - 1), c)); }
      else for (const [o, c] of st) gg.addColorStop(clamp(o), c);
      fs = gg;
    }
    if (main && it.pattern) fs = L._pattern(ctx, it.pattern, it.patternColor || color, it.patternBg) || fs;
    ctx.globalAlpha = clamp(a * (it.fillAlpha == null ? 1 : it.fillAlpha));
    ctx.fillStyle = fs;
    ctx.fillText(ch, x, y);
    ctx.globalAlpha = clamp(a);
  }
  if (it.shadow && main) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  if ((hasStroke && (!filled || it.strokeUnder === false)) || (outline && !hasStroke)) {
    if (!hasStroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, size * 0.035); ctx.strokeStyle = color; ctx.setLineDash([]); }
    if (it.dash != null && it.dash < 1) {                     // 線の描き起こし(0..1)
      const L0 = size * 7;
      ctx.setLineDash([L0 * clamp(it.dash), L0]);
      ctx.lineDashOffset = 0;
    }
    ctx.strokeText(ch, x, y);
    ctx.setLineDash([]);
  }
};

/* 1項目を描画(残像/帯/クリップ/字ごとの関数を含む)。bbox を返す */
L.drawItem = (env, it) => {
  if (!it || it.hide || it.text == null || it.text === '') return null;
  const pass = env.pass || 'main';
  const bb = L.itemBox(it);
  if (pass !== 'main' && it.ghost === false) return bb;
  const alpha = (it.alpha == null ? 1 : it.alpha) * (pass === 'main' ? 1 : env.ghostAlpha);
  if (alpha <= 0.002) return bb;
  const m = it._m || L.measure(it);
  if (it.echo && it.echo.n > 0) {
    const e = it.echo;
    for (let k = Math.min(12, e.n); k >= 1; k--) {
      const c = Object.assign({}, it, {
        echo: null, streak: null, bands: null, _m: m,
        x: it.x + (e.dx || 0) * k, y: it.y + (e.dy || 0) * k,
        sx: (it.sx == null ? 1 : it.sx) * (1 + (e.scale || 0) * k), sy: (it.sy == null ? 1 : it.sy) * (1 + (e.scale || 0) * k),
        rot: (it.rot || 0) + (e.rot || 0) * k,
      });
      if (e.outline) { c.fill = false; c.stroke = c.stroke || Math.max(1, it.size * 0.03); c.strokeColor = e.color || it.color; c.strokeUnder = false; }
      else if (e.color) c.color = e.color;
      L._drawCore(env, c, m, alpha * (e.a == null ? 0.5 : e.a) * Math.pow(e.decay == null ? 0.62 : e.decay, k - 1), null);
    }
  }
  if (it.streak && it.streak.n > 0) {
    const s = it.streak;
    for (let k = Math.min(16, s.n); k >= 1; k--) {
      const c = Object.assign({}, it, { echo: null, streak: null, bands: null, _m: m, x: it.x - (s.dx || 0) * k / s.n, y: it.y - (s.dy || 0) * k / s.n, charFns: it.charFns });
      L._drawCore(env, c, m, alpha * (s.a == null ? 0.35 : s.a) * (1 - k / (s.n + 1)), null);
    }
  }
  if (it.bands && it.bands.length) {
    for (const b of it.bands) L._drawCore(env, it, m, alpha, b);
  } else {
    L._drawCore(env, it, m, alpha, null);
  }
  return bb;
};

L._drawCore = (env, it, m, alpha, band) => {
  const ctx = env.ctx;
  const pass = env.pass || 'main';
  ctx.save();
  ctx.translate(it.x || 0, it.y || 0);
  if (it.rot) ctx.rotate(it.rot);
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew), 1, 0, 0);
  if (it.skewY) ctx.transform(1, Math.tan(it.skewY), 0, 1, 0, 0);
  const sx = it.sx == null ? 1 : it.sx, sy = it.sy == null ? 1 : it.sy;
  if (sx !== 1 || sy !== 1) ctx.scale(sx || 1e-4, sy || 1e-4);
  const w = m.w, h = m.h, pad = it.size * 0.6;
  if (it.clip || it.clipY || band || it.clipFn) {
    ctx.beginPath();
    if (it.clipFn) it.clipFn(ctx, env, it, m);
    else {
      const bx0 = -w / 2 - pad, bw = w + pad * 2, by0 = -h / 2 - pad, bh = h + pad * 2;
      let x0 = it.clip ? bx0 + bw * it.clip[0] : bx0 - w * 4, x1 = it.clip ? bx0 + bw * it.clip[1] : bx0 + bw + w * 4;
      let y0 = it.clipY ? by0 + bh * it.clipY[0] : by0 - h * 4, y1 = it.clipY ? by0 + bh * it.clipY[1] : by0 + bh + h * 4;
      if (band) { y0 = Math.max(y0, by0 + bh * band[0]); y1 = Math.min(y1, by0 + bh * band[1]); }
      if (band && band.vertical) { x0 = Math.max(x0, bx0 + bw * band[0]); x1 = Math.min(x1, bx0 + bw * band[1]); y0 = by0 - h * 4; y1 = by0 + bh + h * 4; }
      ctx.rect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    }
    ctx.clip();
    if (band) { if (band.vertical) ctx.translate(0, band[2] || 0); else ctx.translate(band[2] || 0, 0); }
  }
  if (it.blur > 0.3 && env.allowFilter) ctx.filter = `blur(${(it.blur * (env.scale || 1)).toFixed(1)}px)`;
  if (it.blend && pass === 'main') ctx.globalCompositeOperation = it.blend;
  if (it.pre) it.pre(env, it, m);
  ctx.font = L.fontStr(it);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const color = pass === 'main' ? (it.color || env.sc.fg) : env.ghostColor;
  const lay = m.lay, n = lay.length, fns = it.charFns;
  for (let gi = 0; gi < n; gi++) {
    const g = lay[gi];
    if (g.space) continue;
    let dx = 0, dy = 0, rot = 0, s = 1, gsx = 1, gsy = 1, a = 1, col = null, ch = g.ch, gblur = 0, gskew = 0, outline = false, cX = null, cY = null, hide = false;
    if (fns && fns.length) {
      for (const f of fns) {
        const r = f(g.i, g, n);
        if (!r) continue;
        if (r.dx) dx += r.dx; if (r.dy) dy += r.dy; if (r.rot) rot += r.rot;
        if (r.s != null) s *= r.s; if (r.sx != null) gsx *= r.sx; if (r.sy != null) gsy *= r.sy;
        if (r.a != null) a *= r.a; if (r.color) col = r.color; if (r.ch != null) ch = r.ch;
        if (r.hide) hide = true; if (r.blur) gblur += r.blur; if (r.skew) gskew += r.skew;
        if (r.outline) outline = true; if (r.clipX) cX = r.clipX; if (r.clipY) cY = r.clipY;
      }
    }
    if (hide) continue;
    const ga = alpha * a;
    if (ga <= 0.003 || !ch) continue;
    ctx.save();
    ctx.translate(g.x + dx, g.y + dy);
    if (rot) ctx.rotate(rot);
    if (gskew) ctx.transform(1, 0, Math.tan(gskew), 1, 0, 0);
    if (s !== 1 || gsx !== 1 || gsy !== 1) ctx.scale((s * gsx) || 1e-4, (s * gsy) || 1e-4);
    if (g.vrot) ctx.rotate(Math.PI / 2);
    const ox = g.vshift ? it.size * 0.3 * g.vshift : 0, oy = g.vshift ? -it.size * 0.3 * g.vshift : 0;
    if (cX || cY) {
      ctx.beginPath();
      const xa = cX ? cX[0] * g.w : -g.w * 2, xb = cX ? cX[1] * g.w : g.w * 2;
      const ya = cY ? cY[0] * it.size : -it.size * 2, yb = cY ? cY[1] * it.size : it.size * 2;
      ctx.rect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
      ctx.clip();
    }
    if (gblur > 0.3 && env.allowFilter) ctx.filter = `blur(${(gblur * (env.scale || 1)).toFixed(1)}px)`;
    L._glyph(env, ctx, ch, ox, oy, it, pass === 'main' ? (col || color) : env.ghostColor, ga, outline, m);
    ctx.restore();
  }
  if (it.post) it.post(env, it, m);
  ctx.restore();
};

L.itemBox = it => {
  if (!it) return null;
  const m = it._m || L.measure(it);
  const hw = m.w * Math.abs(it.sx == null ? 1 : it.sx) / 2, hh = m.h * Math.abs(it.sy == null ? 1 : it.sy) / 2;
  const r = it.rot || 0, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const bw = hw * c + hh * s, bh = hw * s + hh * c;
  const x = it.x || 0, y = it.y || 0;
  return { x0: x - bw, y0: y - bh, x1: x + bw, y1: y + bh, w: bw * 2, h: bh * 2, cx: x, cy: y };
};
L.unionBB = (a, b) => {
  if (!a) return b || null;
  if (!b) return a;
  const x0 = Math.min(a.x0, b.x0), y0 = Math.min(a.y0, b.y0), x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
L.centerBB = (env, bb) => bb || { x0: env.W * 0.3, y0: env.H * 0.42, x1: env.W * 0.7, y1: env.H * 0.58, w: env.W * 0.4, h: env.H * 0.16, cx: env.W / 2, cy: env.H / 2 };

/* 字ごとの進行度(スライド窓式スタッガー): 全字が p=1 で必ず揃う。
   order: 'lr'(左→右) 'rl' 'center'(中央から) 'edges'(両端から) 'random' 数値配列 のいずれか */
L.stagger = (p, i, n, spread = 0.5, order = 'lr', seed = 0) => {
  if (n <= 1) return clamp(p);
  let o;
  if (order === 'rl') o = (n - 1 - i) / (n - 1);
  else if (order === 'center') o = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  else if (order === 'edges') o = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  else if (order === 'random') o = L.r('stg', seed, i);
  else if (Array.isArray(order)) o = clamp(order[i] || 0);
  else o = i / (n - 1);
  const sp = clamp(spread, 0, 0.95);
  return clamp((p - sp * o) / (1 - sp));
};

/* 帯・縦帯のヘルパ: fn(i,n) → ずらし量(px) */
L.itemBands = (env, it, n, fn) => { it.bands = []; for (let i = 0; i < n; i++) it.bands.push([i / n, (i + 1) / n, fn(i, n)]); };
L.itemVBands = (env, it, n, fn) => { it.bands = []; for (let i = 0; i < n; i++) { const b = [i / n, (i + 1) / n, fn(i, n)]; b.vertical = true; it.bands.push(b); } };

/* ================================================================ env helpers (ゴーストパス対応) */
L.makeHelpers = env => {
  const ctx = env.ctx;
  const main = () => env.pass === 'main';
  const skip = ghost => !main() && !ghost;
  const col = c => (main() ? c : env.ghostColor);
  const ga = a => clamp(main() ? a : a * env.ghostAlpha);
  env.rect = (x, y, w, h, c, a = 1, ghost = true) => {
    if (skip(ghost) || a <= 0.002) return;
    ctx.globalAlpha = ga(a); ctx.fillStyle = col(c); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  };
  env.rrect = (x, y, w, h, r, fill, a = 1, ghost = true, stroke = null, lw = 2) => {
    if (skip(ghost) || a <= 0.002) return;
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.globalAlpha = ga(a);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    if (fill) { ctx.fillStyle = col(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = col(stroke); ctx.lineWidth = lw; ctx.stroke(); }
    ctx.globalAlpha = 1;
  };
  env.line = (pts, c, lw = 2, a = 1, ghost = false, dash = null) => {
    if (skip(ghost) || a <= 0.002 || !pts || pts.length < 2) return;
    ctx.globalAlpha = ga(a); ctx.strokeStyle = col(c); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); if (dash) ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  env.polyPartial = (pts, e, c, lw = 2, a = 1, ghost = false) => {       // 折れ線を e(0..1) まで描く
    if (skip(ghost) || a <= 0.002 || !pts || pts.length < 2 || e <= 0) return;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    let left = total * clamp(e);
    ctx.globalAlpha = ga(a); ctx.strokeStyle = col(c); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const d = seg[i - 1];
      if (left >= d) { ctx.lineTo(pts[i][0], pts[i][1]); left -= d; }
      else { const f = left / d; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); left = 0; }
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  env.circle = (cx, cy, r, fill, stroke = null, lw = 2, a = 1, ghost = false) => {
    if (skip(ghost) || a <= 0.002 || r <= 0) return;
    ctx.globalAlpha = ga(a); ctx.beginPath(); ctx.arc(cx, cy, r, 0, L.TAU);
    if (fill) { ctx.fillStyle = col(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = col(stroke); ctx.lineWidth = lw; ctx.stroke(); }
    ctx.globalAlpha = 1;
  };
  env.arc = (cx, cy, r, a0, a1, c, lw = 2, a = 1, ghost = false) => {   // 角度は度
    if (skip(ghost) || a <= 0.002 || r <= 0) return;
    ctx.globalAlpha = ga(a); ctx.strokeStyle = col(c); ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0 * L.DEG, a1 * L.DEG); ctx.stroke(); ctx.globalAlpha = 1;
  };
  env.poly = (pts, c, a = 1, ghost = false) => {
    if (skip(ghost) || a <= 0.002 || !pts || pts.length < 3) return;
    ctx.globalAlpha = ga(a); ctx.fillStyle = col(c);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  };
  env.text = it => L.drawItem(env, Object.assign({ color: env.sc.sub, weight: 700 }, it));
  // 装飾の出入り量(0..1): 冒頭 dIn 秒で出現、退場に合わせて消える
  env.inOut = (dIn = 0.35, delay = 0) => E.outCubic(clamp((env.lt - delay) / dIn)) * (1 - E.inCubic(env.pOut));
  return env;
};

/* ================================================================ mainDraw: 歌詞本体(加工→登場→保持→退場) */
L.mainDraw = (env, it0) => {
  if (!it0) return null;
  const cut = env.cut;
  const it = Object.assign({}, it0);
  it.charFns = it0.charFns ? it0.charFns.slice() : [];
  if (it.color == null) it.color = env.sc.fg;
  const mi = it.mi || 0;
  const treat = it.plain ? null : cut.treatDef;
  if (treat && it.fill !== false && (it.alpha == null ? 1 : it.alpha) > 0.25) {
    try { treat.apply(env, it, cut.treatP || {}); } catch (e) { /* 加工の失敗で歌詞を落とさない */ }
  }
  const enterDef = it.enter ? L.get('enter', it.enter) : cut.enterDef;
  const exitDef = it.exit ? L.get('exit', it.exit) : cut.exitDef;
  const holdDef = it.hold ? L.get('hold', it.hold) : cut.holdDef;
  const stagger = enterDef && enterDef.stagger != null ? enterDef.stagger : 0.07;
  const delay = (it.delay || 0) + stagger * mi;
  const inDur = Math.max(0.05, cut.inDur), outDur = Math.max(0.05, cut.outDur);
  const lt = env.lt;
  const mctx = { dur: cut.dur, inDur, outDur, n: L.glyphCount(it.text), mi };
  const pIn = cut.noEnter ? 1 : clamp((lt - delay) / inDur);
  const pOut = cut.noExit ? 0 : clamp((lt - (cut.dur - outDur)) / outDur);
  if (enterDef && pIn <= 0) return null;
  if (pOut >= 1) return null;                     // 退場の終端は必ず不可視
  try {
    if (enterDef && pIn < 1) enterDef.apply(env, it, pIn, mctx);
    if (holdDef && !it.noHold) {
      const amt = Math.min(E.outCubic(clamp((lt - delay - inDur) / 0.4)), 1 - pOut) * (env.fx.motion == null ? 1 : env.fx.motion);
      if (amt > 0.001) holdDef.apply(env, it, amt, mctx);
    }
    if (exitDef && pOut > 0) exitDef.apply(env, it, pOut, mctx);
  } catch (e) {
    if (!L._warned) { L._warned = true; console.warn('[LFC] motion error', e); }
  }
  if (it.hide || (it.alpha == null ? 1 : it.alpha) <= 0.002) return null;
  // 強調カットはサイズ由来の要素に脈動を少し
  return L.drawItem(env, it);
};

/* ================================================================ styles (配色セット + 役割フォント) */
L.STYLES = L.STYLES || {};
L.STYLE_ORDER = L.STYLE_ORDER || [];
L.registerStyle = (key, def) => {
  if (L.STYLES[key]) return;
  L.STYLES[key] = Object.assign({ key, moods: [], ghost: 0.5 }, def);
  L.STYLE_ORDER.push(key);
};
L.MOODS = [
  ['pop', 'ポップ'], ['calm', 'しっとり'], ['emotional', 'エモ'], ['glitch', 'グリッチ'],
  ['graphic', 'グラフィック'], ['editorial', 'エディトリアル'], ['cyber', 'サイバー'], ['dark', 'ダーク'], ['wa', '和風'],
];
L.getStyle = key => L.STYLES[key] || null;

/* 配色(scheme): プロジェクトの colors を基本に、スタイルがあれば上書き */
L.schemeFor = (tl, st) => {
  // スタイル適用時に tl.colors へ写すので、ユーザーの色調整が優先される
  const c = tl.colors || (st && st.colors) || {};
  const bg = c.bg1 || '#0d1117';
  const fg = c.text || '#ffffff';
  const accent = c.accent || '#00d4ff';
  const accent2 = c.accent2 || '#7b2ff7';
  return {
    bg, bg2: c.bg2 || bg, fg, accent, accent2,
    sub: L.mix(fg, bg, 0.42), dim: L.mix(bg, fg, 0.13),
    ink: accent, onInk: L.onColor(accent), onAccent2: L.onColor(accent2),
    paper: L.lum(bg) > 0.5 ? bg : '#f1ece1', onPaper: '#15120e',
    ghostA: (st && st.ghostA) || accent, ghostB: (st && st.ghostB) || accent2,
    dark: L.lum(bg) < 0.45,
  };
};

/* ================================================================ cuts: 歌詞→カット */
const PUNCT_TRIM = /^[\s　]+|[\s　]+$/g;
function joinWords(ws) {
  let s = '';
  ws.forEach((w, i) => {
    const t = String(w.word || '');
    if (i && /[A-Za-z0-9]$/.test(s) && /^[A-Za-z0-9]/.test(t)) s += ' ';
    s += t;
  });
  return s;
}
/* 記法: *強調* / 末尾! = 衝撃 / 文|注釈 / 「/」= カット分割 */
L.parseNotation = raw => {
  let s = String(raw || '');
  let note = '';
  const bar = s.indexOf('|');
  if (bar >= 0) { note = s.slice(bar + 1).trim(); s = s.slice(0, bar); }
  // 半角 ! を行末に付けると「衝撃」マーカー(表示しない)。全角！は歌詞の一部としてそのまま表示
  const impact = /!\s*$/.test(s) && s.replace(/[!\s]/g, '').length > 0;
  const emphIdx = [];
  let plain = '';
  let inE = false;
  for (const ch of L.glyphs(s)) {
    if (ch === '*') { inE = !inE; continue; }
    if (ch === '/') continue;
    if (inE) emphIdx.push(L.glyphs(plain).length);
    plain += ch;
  }
  if (impact) plain = plain.replace(/!\s*$/, '');
  return { text: plain.replace(PUNCT_TRIM, ''), note, impact, emph: emphIdx.length > 0, emphIdx };
};

L.buildCuts = tl => {
  const words = (tl.tracks && tl.tracks.lyrics) || [];
  const cm = tl.compose || {};
  let sig = words.length + '|' + (cm.density == null ? 0.5 : cm.density) + '|' + (tl.bpm || 0) + '|' + (tl.beatOffset || 0) + '|' + (cm.beatLock ? 1 : 0);
  let acc = 0;
  for (const w of words) acc += (w.start || 0) * 7.13 + (w.end || 0) * 3.7 + (w.line || 0) * 1.1 + String(w.word || '').length;
  sig += '|' + Math.round(acc * 100);
  if (tl._lfcCuts && tl._lfcCuts.sig === sig) return tl._lfcCuts.cuts;
  const byLine = new Map();
  for (const w of words) {
    if (!w || w.word == null) continue;
    const k = w.line == null ? 0 : w.line;
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k).push(w);
  }
  const lines = Array.from(byLine.entries()).map(([line, ws]) => {
    ws.sort((a, b) => a.start - b.start);
    return { line, ws, start: ws[0].start, end: ws.reduce((m, w) => Math.max(m, w.end || w.start), 0) };
  }).sort((a, b) => a.start - b.start);
  const density = cm.density == null ? 0.5 : cm.density;
  const target = L.lerp(5.2, 1.5, clamp(density));       // 1カットの目安秒数(密度が高いほど短く)
  const bpm = tl.bpm, off = tl.beatOffset || 0;
  const lock = !!(cm.beatLock && bpm);          // モーショングラフィックス: 全カットを拍に固定
  const snap = t => {
    if (!bpm) return t;
    const p = 60 / bpm, k = Math.round((t - off) / p), bt = off + k * p;
    return lock || Math.abs(bt - t) < 0.13 ? bt : t;
  };
  const cuts = [];
  lines.forEach((ln, li) => {
    const raw = joinWords(ln.ws);
    // 語を「/」または目安秒数で束ねてカット化
    const groups = [];
    let cur = [];
    const sung = Math.max(0.2, ln.end - ln.start);
    const k = Math.max(1, Math.min(4, Math.round(sung / target)));
    const per = sung / k;
    ln.ws.forEach(w => {
      const manual = /\/\s*$/.test(String(w.word || ''));
      cur.push(w);
      const elapsed = (w.end || w.start) - (groups.length ? groups[groups.length - 1].end : ln.start);
      const enough = k > 1 && elapsed >= per * 0.92 && groups.length < k - 1;
      if (manual || enough) { groups.push({ ws: cur, end: w.end || w.start }); cur = []; }
    });
    if (cur.length) groups.push({ ws: cur, end: cur[cur.length - 1].end || cur[cur.length - 1].start });
    const nextStart = li + 1 < lines.length ? lines[li + 1].start : Infinity;
    groups.forEach((g, gi) => {
      const parsed = L.parseNotation(joinWords(g.ws));
      if (!parsed.text) return;
      let start = snap(g.ws[0].start - 0.06);
      const isLast = gi === groups.length - 1;
      let end = isLast ? Math.min(nextStart - 0.02, ln.end + 1.5) : snap((groups[gi + 1].ws[0].start) - 0.02);
      if (isLast) end = Math.max(end, Math.min(nextStart - 0.02, ln.end + 0.25));
      const beatLen = bpm ? 60 / bpm : 0.5;
      if (lock) {
        // 拍ロック: 次のカットの頭の拍の直前まで表示(曲の終わりは2拍)
        const nextCut = !isLast ? snap(groups[gi + 1].ws[0].start - 0.06)
          : (Number.isFinite(nextStart) ? snap(nextStart - 0.06) : snap(ln.end + beatLen * 2));
        end = Math.max(start + beatLen, nextCut - 0.001);
      }
      if (end - start < 0.4) end = start + 0.4;
      const dur = end - start;
      cuts.push({
        idx: cuts.length, line: ln.line, lineIdx: li, part: gi, parts: groups.length,
        text: parsed.text, lineText: L.parseNotation(raw).text, note: parsed.note, impact: parsed.impact,
        emphMark: parsed.emph, emphIdx: parsed.emphIdx,
        n: L.glyphCount(parsed.text), start, end, dur,
        inDur: lock ? Math.min(beatLen, dur * 0.4) : clamp(dur * 0.3, 0.14, 0.55),
        outDur: lock ? Math.min(beatLen * 0.5, dur * 0.25) : clamp(dur * 0.2, 0.12, 0.4),
        beat0: bpm ? Math.round((start - off) / beatLen) : null,
        words: g.ws.map(w => ({ text: L.parseNotation(String(w.word || '')).text, start: w.start, end: w.end })),
      });
    });
  });
  // キャッシュはプロジェクト保存(JSON)に含めない(非列挙)
  Object.defineProperty(tl, '_lfcCuts', { value: { sig, cuts }, writable: true, configurable: true, enumerable: false });
  return cuts;
};

L.cutAt = (cuts, t) => {
  let lo = 0, hi = cuts.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cuts[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
};

L.beatAt = (tl, t) => {
  if (!tl.bpm) return null;
  const p = 60 / tl.bpm, off = tl.beatOffset || 0;
  const k = Math.floor((t - off) / p);
  return { since: t - (off + k * p), len: p, index: k };
};

/* ================================================================ planner (おまかせ) */
const hasTag = (tags, moods) => (tags || []).some(t => moods.includes(t));
L.allowed = (def, cm) => {
  if (!def) return false;
  if (def.wa && cm && cm.useWa === false) return false;
  if (def.disabled) return false;
  return true;
};
function pickW(rng, group, weightFn) {
  const defs = L.list(group);
  let total = 0;
  const ws = defs.map(d => { const w = Math.max(0, weightFn(d) || 0); total += w; return w; });
  if (total <= 0) return null;
  let x = rng() * total;
  for (let i = 0; i < defs.length; i++) { x -= ws[i]; if (x <= 0) return defs[i]; }
  return defs[defs.length - 1];
}
L.pickW = pickW;

/* 1カット分の案。keep = 維持するフィールド(ここだけ変える用) */
L.planCut = (cut, ctx) => {
  const { rng, st, moods, cm, portrait, recent, W, H, keep, prevCut } = ctx;
  const emph = !!(cut.emph || cut.emphMark || cut.impact);
  const out = Object.assign({}, keep || {});
  const moodMult = tags => (moods.length ? (hasTag(tags, moods) ? 1.6 : 0.75) : 1);
  const recentMult = (g, k) => { const r = recent[g] || []; const i = r.lastIndexOf(k); return i < 0 ? 1 : i >= r.length - 2 ? 0.04 : 0.35; };
  const bias = (g, k) => (st && st.bias && st.bias[g] && st.bias[g][k] != null ? st.bias[g][k] : 1);
  if (!out.layout) {
    const d = pickW(rng, 'layout', def => {
      if (!L.allowed(def, cm)) return 0;
      if (def.fits && !def.fits(cut.n)) return 0;
      if (def.minDur && cut.dur < def.minDur) return 0;
      let w = def.w * moodMult(def.tags) * bias('layout', def.key) * recentMult('layout', def.key);
      if (portrait && def.portrait != null) w *= def.portrait;
      if (emph && def.emph != null) w *= def.emph;
      return w;
    }) || L.get('layout', 'center');
    out.layout = d.key;
    out.params = d.plan ? d.plan(rng, { text: cut.text, n: cut.n, W, H, dur: cut.dur, portrait, emph, words: cut.words }, st || {}) : {};
  }
  const lay = L.get('layout', out.layout) || L.get('layout', 'center');
  for (const g of ['enter', 'hold', 'exit']) {
    if (out[g]) continue;
    const d = pickW(rng, g, def => {
      if (!L.allowed(def, cm)) return 0;
      if (def.minDur && cut.dur < def.minDur) return 0;
      if (def.maxChars && cut.n > def.maxChars) return 0;
      let w = def.w * moodMult(def.tags) * bias(g, def.key) * recentMult(g, def.key);
      if (g === 'enter' && lay.enterBias && lay.enterBias[def.key] != null) w *= lay.enterBias[def.key];
      if (emph && def.emph != null) w *= def.emph;
      return w;
    });
    out[g] = d ? d.key : null;
  }
  if (!out.decor) {
    out.decor = [];
    const dens = cm.decor == null ? 0.6 : cm.decor;
    const n = rng() < dens * 0.8 ? (rng() < dens * 0.5 ? 2 : 1) : 0;
    for (let i = 0; i < n; i++) {
      const d = pickW(rng, 'decor', def => {
        if (!L.allowed(def, cm)) return 0;
        if (lay.busy && !def.subtle) return 0;
        if (out.decor.some(x => x.key === def.key)) return 0;
        const sw = st && st.decor && st.decor[def.key] != null ? st.decor[def.key] : 1;
        return def.w * moodMult(def.tags) * sw * recentMult('decor', def.key);
      });
      if (d) out.decor.push({ key: d.key, P: { seed: L.h(rng(), i), v: Math.floor(rng() * 6), r: rng(), right: rng() < 0.5, low: rng() < 0.5, accent: rng() < 0.45, big: rng() < 0.3, n: 1 + Math.floor(rng() * 3), corner: Math.floor(rng() * 4) } });
    }
  }
  if (out.treat === undefined) {
    out.treat = null;
    if (lay.treat !== false && rng() < (emph ? 0.55 : 0.32)) {
      const d = pickW(rng, 'treat', def => (L.allowed(def, cm) && (lay.treat !== 'safe' || def.safe) ? def.w * moodMult(def.tags) * recentMult('treat', def.key) : 0));
      if (d) { out.treat = d.key; out.treatP = d.plan ? d.plan(rng, st || {}) : {}; }
    }
  }
  if (out.cam === undefined) {
    out.cam = null;
    if (rng() < (cm.camera == null ? 0.5 : cm.camera)) {
      const d = pickW(rng, 'cam', def => (L.allowed(def, cm) ? def.w * moodMult(def.tags) * (def.strong && !emph ? 0.4 : 1) : 0));
      if (d) { out.cam = d.key; out.camP = d.plan ? d.plan(rng, st || {}) : {}; }
    }
  }
  if (out.trans === undefined) {
    out.trans = null;
    if (prevCut && cut.start - prevCut.end < 0.25 && rng() < (cm.trans == null ? 0.28 : cm.trans)) {
      const d = pickW(rng, 'trans', def => (L.allowed(def, cm) ? def.w * moodMult(def.tags) : 0));
      if (d) { out.trans = d.key; out.transP = d.plan ? d.plan(rng, st || {}) : {}; }
    }
  }
  for (const g of ['layout', 'enter', 'hold', 'exit']) { recent[g] = recent[g] || []; if (out[g]) { recent[g].push(out[g]); if (recent[g].length > 6) recent[g].shift(); } }
  for (const d of out.decor || []) { recent.decor = recent.decor || []; recent.decor.push(d.key); if (recent.decor.length > 6) recent.decor.shift(); }
  if (out.treat) { recent.treat = recent.treat || []; recent.treat.push(out.treat); if (recent.treat.length > 4) recent.treat.shift(); }
  out.seed = L.h(ctx.seed, 'cut', cut.idx);
  return out;
};

/* 全カットを計画する。opts.only = 'layout'|'motion'|'decor'|'cam' で一部だけ振り直し */
L.planAll = (tl, opts = {}) => {
  const cm = tl.compose = tl.compose || {};
  const seed = opts.seed != null ? opts.seed : (cm.seed != null ? cm.seed : 1);
  const st = L.getStyle(cm.style);
  const moods = [].concat(cm.mood ? [cm.mood] : [], (st && st.moods) || []);
  const cuts = L.buildCuts(tl);
  const W = opts.W || 1920, H = opts.H || 1080;
  const portrait = H > W;
  const recent = {};
  const prevPlans = cm.cuts || {};
  const plans = {};
  cuts.forEach((cut, i) => {
    const key = cut.line + ':' + cut.part;
    const old = prevPlans[key];
    if (old && old.locked) { plans[key] = old; return; }
    const rng = L.rng(L.h(seed, 'plan', cut.line, cut.part, (old && old.reroll) || 0));
    let keep = null;
    if (old && opts.only) {
      keep = Object.assign({}, old);
      if (opts.only === 'layout') { delete keep.layout; delete keep.params; }
      if (opts.only === 'motion') { delete keep.enter; delete keep.hold; delete keep.exit; }
      if (opts.only === 'decor') { delete keep.decor; delete keep.treat; delete keep.treatP; }
      if (opts.only === 'cam') { delete keep.cam; delete keep.camP; delete keep.trans; delete keep.transP; }
    }
    cut.emph = !!(opts.emphFn && opts.emphFn(cut));
    plans[key] = L.planCut(cut, { rng, st, moods, cm, portrait, recent, W, H, keep, prevCut: cuts[i - 1], seed });
    if (old && old.reroll) plans[key].reroll = old.reroll;
  });
  cm.cuts = plans;
  cm.seed = seed;
  cm.planVersion = (cm.planVersion || 0) + 1;
  return cm;
};

/* カットに案(defs)を解決して付与。案が無ければその場で決定論的に作る(保存はしない) */
L.resolveCut = (tl, cut, cuts, W, H) => {
  const cm = tl.compose || {};
  const key = cut.line + ':' + cut.part;
  let p = cm.cuts && cm.cuts[key];
  if (!p) {
    if (!cut._auto || cut._autoSeed !== cm.seed || cut._autoStyle !== cm.style) {
      const st = L.getStyle(cm.style);
      const moods = [].concat(cm.mood ? [cm.mood] : [], (st && st.moods) || []);
      const rng = L.rng(L.h(cm.seed || 1, 'plan', cut.line, cut.part, 0));
      cut._auto = L.planCut(cut, { rng, st, moods, cm, portrait: H > W, recent: {}, W, H, keep: null, prevCut: cuts[cut.idx - 1], seed: cm.seed || 1 });
      cut._autoSeed = cm.seed; cut._autoStyle = cm.style;
    }
    p = cut._auto;
  }
  if (cut._planRef !== p || cut._planVer !== cm.planVersion) {
    cut._planRef = p; cut._planVer = cm.planVersion;
    cut.plan = p;
    cut.layoutDef = L.get('layout', p.layout) || L.get('layout', 'center');
    cut.enterDef = L.get('enter', p.enter);
    cut.holdDef = L.get('hold', p.hold);
    cut.exitDef = L.get('exit', p.exit);
    cut.treatDef = L.get('treat', p.treat);
    cut.treatP = p.treatP || {};
    cut.camDef = L.get('cam', p.cam);
    cut.camP = p.camP || {};
    cut.transDef = L.get('trans', p.trans);
    cut.transP = p.transP || {};
    cut.decorList = (p.decor || []).map(d => ({ def: L.get('decor', d.key), P: d.P || {} })).filter(d => d.def);
    cut.params = p.params || {};
    cut.seed = p.seed || L.h(cut.idx);
    // つなぎがあるカットは、前カットの退場・自カットの登場を省く(つなぎが担う)
    cut.noEnter = !!cut.transDef;
    if (cut.transDef && cuts[cut.idx - 1]) cuts[cut.idx - 1].noExit = true;
  }
  return cut;
};

/* ================================================================ render */
const layerCache = {};
function layer(name, W, H) {
  let c = layerCache[name];
  if (!c) { c = layerCache[name] = document.createElement('canvas'); }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return c;
}

L.makeEnv = (eng, ctx, t, W, H, cut, energy, boost) => {
  const tl = eng.timeline;
  const cm = tl.compose || {};
  const st0 = L.getStyle(cm.style);
  // ユーザーが選んだ役割フォント(cm.fonts)はスタイルより優先
  const st = cm.fonts ? Object.assign({}, st0 || {}, { fonts: Object.assign({}, (st0 && st0.fonts) || {}, cm.fonts) }) : st0;
  const env = {
    ctx, W, H, t, u: Math.min(W, H) / 1080, portrait: H > W,
    sc: L.schemeFor(tl, st), st: st || { fonts: {} },
    fx: { motion: cm.motion == null ? 1 : cm.motion, glitch: cm.glitch == null ? 0.5 : cm.glitch, decor: cm.decor == null ? 0.6 : cm.decor, density: cm.density == null ? 0.5 : cm.density },
    cut, energy: energy == null ? 0.5 : energy, boost: boost || 1, beat: L.beatAt(tl, t),
    scale: 1, allowFilter: eng.quality !== 'draft', pass: 'main', ghostColor: '#ffffff', ghostAlpha: 0.5,
    lt: 0, ltb: 0, pIn: 1, pOut: 0, step: 0, lyricFont: (tl.lyricStyle && tl.lyricStyle.font) || null,
    bpm: tl.bpm || null, songDur: tl.duration || 0,
    totalBeats: tl.bpm && tl.duration ? Math.max(1, Math.round(tl.duration * tl.bpm / 60)) : null,
  };
  L.makeHelpers(env);
  return env;
};

function setPass(env, pass, lag, t) {
  const cut = env.cut;
  env.pass = pass;
  env.lt = t - cut.start - lag;
  env.ltb = env.lt;
  env.t = t - lag;
  env.pIn = cut.noEnter ? 1 : clamp(env.lt / Math.max(0.05, cut.inDur));
  env.pOut = cut.noExit ? 0 : clamp((env.lt - (cut.dur - cut.outDur)) / Math.max(0.05, cut.outDur));
  env.step = Math.floor(env.t * 24);
  env.ghostColor = pass === 'A' ? env.sc.ghostA : pass === 'B' ? env.sc.ghostB : env.sc.fg;
}

/* 1カットを(ゴーストパス込みで)描く */
L.drawCut = (env, t, opts = {}) => {
  const cut = env.cut;
  const ctx = env.ctx;
  const W = env.W, H = env.H;
  const st = env.st || {};
  const cm = opts.cm || {};
  const ghostAmt = opts.noGhost ? 0 : clamp((st.ghost == null ? 0.5 : st.ghost) * (cm.ghost == null ? 1 : cm.ghost));
  const passes = ghostAmt > 0.04 && env.allowFilter !== false ? [['B', 0.075 * ghostAmt + 0.02, -1], ['A', 0.04 * ghostAmt + 0.01, 1], ['main', 0, 0]] : [['main', 0, 0]];
  let mainBB = null;
  for (const [pass, lag, dir] of passes) {
    setPass(env, pass, lag, t);
    if (opts.forceRest) { env.lt = Math.max(cut.inDur + 0.4, cut.dur - cut.outDur - 0.01); env.pIn = 1; env.pOut = 0; }
    env.ghostAlpha = 0.42 * ghostAmt + 0.1;
    if (env.lt < -0.05) continue;
    ctx.save();
    if (pass !== 'main') ctx.translate(dir * env.u * (1.5 + 3 * ghostAmt), 0);
    if (cut.camDef) {
      try {
        const c = cut.camDef.get(env, cut.camP) || {};
        const mo = env.fx.motion;
        const s = 1 + ((c.s == null ? 1 : c.s) - 1) * mo;
        ctx.translate(W / 2 + (c.x || 0) * mo, H / 2 + (c.y || 0) * mo);
        if (c.rot) ctx.rotate(c.rot * L.DEG * mo);
        if (c.skx) ctx.transform(1, 0, Math.tan(c.skx * L.DEG * mo), 1, 0, 0);
        ctx.scale(s * (c.sx || 1), s * (c.sy || 1));
        ctx.translate(-W / 2, -H / 2);
      } catch (e) { /* noop */ }
    }
    const bbPrev = cut._lastBB || null;
    for (const d of cut.decorList) if (d.def.layer === 'back') { try { d.def.draw(env, bbPrev, d.P); } catch (e) { /* noop */ } }
    let bb = null;
    try { bb = cut.layoutDef.render(env); } catch (e) {
      if (!L._lwarn) { L._lwarn = true; console.warn('[LFC] layout error', cut.layoutDef && cut.layoutDef.key, e); }
      bb = L.get('layout', 'center').render(env);
    }
    for (const d of cut.decorList) if (d.def.layer !== 'back') { try { d.def.draw(env, bb, d.P); } catch (e) { /* noop */ } }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    if (pass === 'main') mainBB = bb;
  }
  if (mainBB) cut._lastBB = mainBB;
  return mainBB;
};

/* FXEngine から毎フレーム呼ばれる入口 */
L.render = (eng, ctx, t, W, H, energy, boost) => {
  const tl = eng.timeline;
  if (!tl) return null;
  const cm = tl.compose || {};
  const cuts = L.buildCuts(tl);
  if (!cuts.length) return null;
  const ci = L.cutAt(cuts, t);
  if (ci < 0) return null;
  const cut = cuts[ci];
  const emphFn = c => { const sc = eng.sceneAt && eng.sceneAt((c.start + c.end) / 2); return !!(sc && sc.label === 'Chorus'); };
  for (const c of [cuts[ci - 1], cut, cuts[ci + 1]]) if (c) { c.emph = c.emph || emphFn(c); L.resolveCut(tl, c, cuts, W, H); }
  if (t > cut.end) return null;
  const env = L.makeEnv(eng, ctx, t, W, H, cut, energy, boost);
  // つなぎ(トランジション): 前カットの静止画(A)と今カット(B)を合成
  const tr = cut.transDef;
  const prev = cuts[ci - 1];
  const tDur = tr ? (tr.dur || 0.35) : 0;
  if (tr && prev && t - cut.start < tDur && eng.quality !== 'draft') {
    const A = layer('A', W, H), B = layer('B', W, H);
    const actx = A.getContext('2d'), bctx = B.getContext('2d');
    actx.clearRect(0, 0, W, H); bctx.clearRect(0, 0, W, H);
    const envA = L.makeEnv(eng, actx, t, W, H, prev, energy, boost);
    L.drawCut(envA, t, { cm, forceRest: true });
    const envB = L.makeEnv(eng, bctx, t, W, H, cut, energy, boost);
    const bb = L.drawCut(envB, t, { cm });
    const p = clamp((t - cut.start) / tDur);
    try {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      tr.draw(ctx, A, B, p, { cw: W, ch: H, sc: env.sc, st: env.st, P: cut.transP, step: Math.floor(t * 24), t, seed: cut.seed, u: env.u, tmp: (w, h) => layer('T', w, h) });
      ctx.restore();
    } catch (e) { ctx.restore(); ctx.drawImage(B, 0, 0); }
    return bb;
  }
  return L.drawCut(env, t, { cm });
};

/* 使っているフォント一覧(書き出し前の先読み用) */
L.fontsUsed = tl => {
  const cm = tl.compose || {};
  const st = L.getStyle(cm.style);
  const out = new Set(Object.values(L.DEFAULT_FONTS));
  if (st && st.fonts) for (const v of Object.values(st.fonts)) [].concat(v).forEach(f => out.add(f));
  if (cm.fonts) for (const v of Object.values(cm.fonts)) [].concat(v).forEach(f => f && out.add(f));
  return Array.from(out);
};

/* ================================================================ 基本エントリ(パックが無くても動く最小セット) */
L.register('layout', 'center', {
  name: '中央', tags: ['calm', 'pop', 'editorial', 'emotional', 'graphic', 'glitch'], w: 1.1, fits: n => n >= 1,
  plan: (rng, cut) => ({ role: rng() < 0.7 ? 'display' : 'serif', rows: cut.n > 11 ? 2 : 1 }),
  render(env) {
    const { W, H, cut } = env;
    const P = cut.params || {};
    const font = L.roleFont(env, P.role || 'display');
    const lines = L.splitLines(cut.text, P.rows === 2 ? Math.ceil(cut.n / 2) : 99).join('\n');
    const size = L.fitSize(lines, font, W * 0.84, H * (env.portrait ? 0.4 : 0.5), { max: Math.min(W, H) * 0.22 });
    return L.mainDraw(env, { text: lines, font, size, x: W / 2, y: H / 2 });
  },
}, 'core');
L.register('enter', 'fade', { name: 'フェード', tags: ['calm', 'emotional', 'editorial'], w: 1, apply(env, it, p) { it.alpha = (it.alpha == null ? 1 : it.alpha) * E.outCubic(p); } }, 'core');
L.register('exit', 'fade', { name: 'フェード', tags: ['calm', 'emotional', 'editorial'], w: 1, apply(env, it, p) { it.alpha = (it.alpha == null ? 1 : it.alpha) * (1 - E.inCubic(p)); } }, 'core');
L.register('hold', 'still', { name: '静止', tags: ['calm', 'editorial', 'pop', 'graphic', 'emotional', 'glitch'], w: 1.4, apply() {} }, 'core');
})();
