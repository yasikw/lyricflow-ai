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
// 和のモチーフ(暖簾・扇・家紋・和柄・桜・市松・円窓・原稿用紙…= wa:true)は登録しない。
// 方針(2026-09-26): 日本的な装飾要素は使わない。コードは残すが一覧・おまかせ・保存済みの案のどこにも出ない(案は既定にフォールバック)
L.register = (group, key, def, pack = 'core') => {
  if (def && def.wa) return;
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
/* ---------------------------------------------------------------- Hallmark 組版レイヤー
   Hallmark(アンチAIスロップ・デザインスキル)の文字組みの原則を歌詞の描画に適用する。L.render が毎フレーム設定する。
   mode: 'off' | 'set'(既定: 組版だけ) | 'full'(組版 + 書体を役割フォントに固定 + 動きの抑制)
   - 約物詰め: 全角の括弧・句読点・中黒を半角送りに(字面は送りの中へ寄せる)
   - かな詰め: 見出しサイズのかなを少し詰める(プロポーショナル組みの近似)。小書きかなはさらに
   - サイズ別の字間/行送り: 見出しは字間を詰め行送り 1.1(欧文大文字は 1.04)、小さな欧文ラベルは字間を開ける
   明示した track / lead はそのまま尊重する(自動になるのは未指定のときだけ) */
L.TYPO = { mode: 'set', ref: 1080, lock: null, lockKey: '' };
L.typoOn = () => L.TYPO.mode !== 'off';
L.typoClass = size => { const r = size / (L.TYPO.ref || 1080); return r >= 0.06 ? 'display' : r < 0.032 ? 'label' : 'text'; };
L.setTypo = (cm, st, W, H) => {
  const T = L.TYPO;
  T.mode = (cm && cm.typo) || 'set';
  T.ref = Math.max(1, Math.min(W || 1920, H || 1080));
  const lock = T.mode === 'full' ? Object.assign({}, L.DEFAULT_FONTS, (st && st.fonts) || {}) : null;
  const key = lock ? JSON.stringify(lock) : '';
  if (key !== T.lockKey) { T.lock = lock; T.lockKey = key; lockCache.clear(); }
};
const OPEN_P = new Set(['「', '『', '（', '【', '〈', '《', '〔', '［', '｛']);
const CLOSE_P = new Set(['」', '』', '）', '】', '〉', '》', '〕', '］', '｝', '、', '。', '，', '．']);
const MID_P = new Set(['・', '：', '；']);
/* 書体の固定(Hallmark 2+1 / 固定トークン): 役割フォント以外の直書き書体を、系統の近い役割フォントへ置き換える */
const lockCache = new Map();
L.lockFont = f => {
  const T = L.TYPO;
  if (!T.lock || !f) return f;
  let v = lockCache.get(f);
  if (v === undefined) {
    // 2+1: display(見出し) + body(本文) + mono(1つだけの外れ値)。serif と hand の役割はこの3つへ畳む
    const first = r => [].concat(r)[0];
    const R = T.lock, disp = first(R.display), body = first(R.body) || disp, mono = first(R.mono) || body;
    const isSerif = x => /Mincho|Serif|Antique|Tegomin|Tokumin|Decol|Hina|Garamond|Playfair|serif\s*$/i.test(String(x || '')) && !/sans-serif\s*$/i.test(String(x || ''));
    const serifTo = isSerif(disp) ? disp : isSerif(body) ? body : disp;
    if (f === disp || f === body || f === mono) v = f;
    else if ([].concat(R.serif).includes(f)) v = serifTo;
    else if ([].concat(R.hand).includes(f)) v = body;
    else if ([].concat(R.display).includes(f)) v = disp;
    else if (/DotGothic|Mono|Courier|monospace/i.test(f)) v = mono;
    else if (isSerif(f)) v = serifTo;
    else if (/Yomogi|Klee|Kurenaido|Hachi Maru|Yusei|Syuku|Yuji|cursive/i.test(f)) v = body;
    else v = disp;
    lockCache.set(f, v);
  }
  return v;
};
L.fontStr = it => `${it.italic && !L.typoOn() ? 'italic ' : ''}${it.weight == null ? 900 : it.weight} ${Math.max(1, it.size || 10).toFixed(2)}px ${L.fontFam(L.lockFont(it.font))}`;

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
  const font = L.lockFont(it.font || L.DEFAULT_FONTS.display);
  const weight = it.weight == null ? 900 : it.weight;
  const text = String(it.text == null ? '' : it.text);
  const lines = text.split('\n');
  const lay = [];
  const typo = L.typoOn() && !it.noTypo;
  const cls = typo ? (it._cls || L.typoClass(size)) : 'text';
  const latin = typo && !/[぀-ヿ一-鿿]/.test(text) && /[A-Za-z]/.test(text);
  const caps = latin && text === text.toUpperCase();
  // 1字あたりの送り係数(約物詰め・かな詰め)と字面の寄せ(ox: em 比)
  const kern = ch => {
    if (!typo) return null;
    if (OPEN_P.has(ch)) return { k: 0.5, ox: -0.25 };
    if (CLOSE_P.has(ch)) return { k: 0.5, ox: 0.25 };
    if (MID_P.has(ch)) return { k: 0.5, ox: 0 };
    if (cls === 'display' && L.isSmallKana(ch)) return { k: 0.84, ox: 0 };
    if (cls === 'display' && (L.isHira(ch) || L.isKata(ch)) && ch !== 'ー') return { k: 0.93, ox: 0 };
    return null;
  };
  let W = 0, H = 0;
  if (!it.vertical) {
    const lead = it.lead != null ? it.lead : !typo ? 1.18 : cls === 'display' ? (caps ? 1.04 : 1.1) : cls === 'label' ? 1.3 : 1.18;
    const lh = size * lead;
    const trk = it.track != null ? it.track : !typo ? 0 : cls === 'display' && latin ? -0.025 : cls === 'label' && caps ? 0.1 : 0;
    const track = trk * size;
    const rows = lines.map(line => {
      const gs = L.glyphs(line);
      const oxs = [];
      const ws = gs.map((ch, gi) => {
        if (L.isSpace(ch)) { oxs.push(0); return size * 0.32; }
        const a = L.adv(font, weight, ch);
        const kk = a >= 0.9 ? kern(ch) : null;           // 全角送りの字だけ詰める(プロポーショナル書体は触らない)
        oxs.push(kk && kk.ox ? kk.ox * a * size : 0);
        return a * size * (kk ? kk.k : 1);
      });
      const w = ws.reduce((a, b) => a + b, 0) + track * Math.max(0, gs.length - 1);
      return { gs, ws, oxs, w };
    });
    W = rows.reduce((m, r) => Math.max(m, r.w), 0);
    H = lh * rows.length;
    rows.forEach((r, li) => {
      let x = it.align === 'left' ? -W / 2 : it.align === 'right' ? W / 2 - r.w : -r.w / 2;
      const y = -H / 2 + lh * (li + 0.5);
      r.gs.forEach((ch, gi) => {
        const w = r.ws[gi];
        const g = { ch, x: x + w / 2, y, w, h: size, line: li, i: lay.length, space: L.isSpace(ch) };
        if (r.oxs[gi]) g.ox = r.oxs[gi];
        lay.push(g);
        x += w + track;
      });
    });
  } else {
    const cw = size * (it.lead || 1.25);
    const step = size * (1 + (it.track || 0));
    // 縦書きの約物詰め: 括弧と句読点は半分の送り(字面は送りの中へ)
    const vk = ch => (!typo ? 1 : OPEN_P.has(ch) || CLOSE_P.has(ch) || MID_P.has(ch) ? 0.5 : 1);
    const cols = lines.map(line => L.glyphs(line));
    const colLen = cols.map(gs => gs.reduce((s, ch) => s + step * vk(ch), 0));
    const maxL = colLen.reduce((m, c) => Math.max(m, c), 0);
    W = cw * cols.length;
    H = maxL;
    cols.forEach((gs, ci) => {
      const x = W / 2 - cw * (ci + 0.5);                 // 縦書きは右の列から
      let y = it.valign === 'top' ? -H / 2 : -colLen[ci] / 2;
      gs.forEach(ch => {
        const k = vk(ch), h = step * k;
        const g = {
          ch, x, y: y + h / 2, w: size, h: size, line: ci, i: lay.length, space: L.isSpace(ch),
          vrot: V_ROT.has(ch) || (L.isLatin(ch) && it.vlatin === 'rot'),
          vshift: V_SHIFT.has(ch) ? 1 : L.isSmallKana(ch) ? 0.45 : 0,
        };
        if (k < 1) { if (OPEN_P.has(ch)) g.oy = -step * 0.25; else if (CLOSE_P.has(ch) && !V_SHIFT.has(ch)) g.oy = step * 0.25; }
        lay.push(g);
        y += h;
      });
    });
  }
  return { w: W, h: H, lay };
};

/* maxW × maxH に収まる最大サイズ(線形なので1回の計測で決まる) */
/* fitSize は同じ引数なら同じ結果(純関数)なので覚えておく。構図は毎フレーム同じ文字を測り直すため、これだけで重い構図が軽くなる。
   フォントの読み込み完了・組版モードの変化で作り直す */
const fitCache = new Map();
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fitCache.clear());
L.fitSize = (text, font, maxW, maxH, o = {}) => {
  const T = L.TYPO;
  const key = text + '\u0001' + font + '\u0001' + Math.round(maxW * 10) + '\u0001' + Math.round(maxH * 10) + '\u0001' + (o.weight ?? '') + '|' + (o.track ?? '') + '|' + (o.lead ?? '') + '|' + (o.vertical ? 1 : 0) + '|' + (o.sx ?? '') + '|' + (o.sy ?? '') + '|' + (o.max ?? '') + '|' + T.mode + '|' + T.ref + '|' + T.lockKey;
  let v = fitCache.get(key);
  if (v === undefined) {
    v = fitSizeRaw(text, font, maxW, maxH, o);
    if (fitCache.size > 6000) fitCache.clear();
    fitCache.set(key, v);
  }
  return v;
};
const fitSizeRaw = (text, font, maxW, maxH, o = {}) => {
  const base = 100;
  const sx = o.sx || 1, sy = o.sy || 1;
  // 組版レイヤーは字の大きさで字間/行送りが変わるので、結果のサイズ区分で測り直す(最大2回)
  const fit = cls => {
    const m = L.measure({ text, font, weight: o.weight, size: base, track: o.track, lead: o.lead, vertical: o.vertical, _cls: cls });
    const kw = m.w > 0 ? maxW / (m.w * sx) : 1e9;
    const kh = m.h > 0 ? maxH / (m.h * sy) : 1e9;
    return Math.max(4, Math.min(Math.min(kw, kh) * base, o.max || 1e9));   // max はピクセル上限
  };
  if (!L.typoOn()) return fit('text');
  const s1 = fit('display');
  const c = L.typoClass(s1);
  return c === 'display' ? s1 : fit(c);
};

/* 日本語向けのバランス改行: 理想位置±3字の中から切りやすい所を選ぶ */
L.splitLines = (text, maxPer) => {
  const src = String(text || '').trim();
  const gs = L.glyphs(src);
  const n = gs.length;
  if (n <= maxPer || maxPer < 1) return [src];
  // 欧文1語(空白なし)は途中で折らない(BE/AT のような分断を防ぐ)
  if (/^[A-Za-z0-9'&.\-!?]+$/.test(src)) return [src];
  // 欧文は単語単位で詰める
  if (L.hasLatinWords(src) && /\s/.test(src) && L.typoOn()) {
    // 欧文のバランス改行: k 行ちょうどに分け、最長行が最短になる区切りを動的計画で選ぶ(孤立語・凸凹を避ける)
    const words = src.split(/\s+/).filter(Boolean);
    const k = Math.min(words.length, Math.ceil(n / maxPer));
    const len = (i, j) => { let t = j - i - 1; for (let x = i; x < j; x++) t += L.glyphs(words[x]).length; return t; };
    const N = words.length, INF = 1e9;
    const best = Array.from({ length: k + 1 }, () => new Array(N + 1).fill(INF)), prev = Array.from({ length: k + 1 }, () => new Array(N + 1).fill(-1));
    best[0][0] = 0;
    for (let l = 1; l <= k; l++) for (let j = l; j <= N; j++) for (let i = l - 1; i < j; i++) {
      if (best[l - 1][i] >= INF) continue;
      const L0 = len(i, j), v = Math.max(best[l - 1][i], L0 * 1000) + L0 * L0 * 0.01;
      if (v < best[l][j]) { best[l][j] = v; prev[l][j] = i; }
    }
    const out = []; let j = N;
    for (let l = k; l >= 1; l--) { const i = prev[l][j]; if (i < 0) return [src]; out.unshift(words.slice(i, j).join(' ')); j = i; }
    return out;
  }
  if (L.hasLatinWords(src) && /\s/.test(src)) {
    const words = src.split(/\s+/);
    const k = Math.ceil(n / maxPer);
    const target = n / k;
    const out = []; let cur = '';
    for (const w of words) {
      if (cur && L.glyphs(cur + ' ' + w).length > target * 1.15) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) out.push(cur);
    // 孤立語(最終行が1語だけ)を避ける: 前の行から1語おろす
    if (L.typoOn() && out.length >= 2) {
      const last = out[out.length - 1].split(' '), prev = out[out.length - 2].split(' ');
      if (last.length === 1 && prev.length >= 3) { last.unshift(prev.pop()); out[out.length - 2] = prev.join(' '); out[out.length - 1] = last.join(' '); }
    }
    return out;
  }
  const k = Math.ceil(n / maxPer);
  const target = n / k;
  const score = i => {
    const a = gs[i - 1], b = gs[i];
    if (!a || !b) return -99;
    if (L.isSmallKana(b) || 'ー、。，．！？!?）」』】…'.includes(b)) return -8;
    if ('「『（【〈《(['.includes(a)) return -8;                 // 開き括弧で行を終えない
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
  // 禁則: 開き括弧は次の塊の頭へ、閉じ括弧・句読点・小書きかなは前の塊の末尾へ寄せる
  const OPEN = /^[「『（【〈《〔［(\[]+$/, OPEN_T = /[「『（【〈《〔［(\[]+$/, CLOSE_H = /^[」』）】〉》〕］)\]、。，．,.！？!?…‥ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョ]+/;
  const fixed = [];
  let carry = '';
  for (let s0 of segs) {
    if (!s0.trim()) { continue; }
    s0 = carry + s0; carry = '';
    const h = fixed.length ? s0.match(CLOSE_H) : null;
    if (h && h[0].length < s0.length + 1) { fixed[fixed.length - 1] += h[0]; s0 = s0.slice(h[0].length); if (!s0) continue; }
    if (OPEN.test(s0)) { carry = s0; continue; }
    const t = s0.match(OPEN_T);
    if (t && t[0].length < s0.length) { carry = t[0]; s0 = s0.slice(0, -t[0].length); }
    fixed.push(s0);
  }
  if (carry) { if (fixed.length) fixed[fixed.length - 1] += carry; else fixed.push(carry); }
  segs = fixed;
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

/* 大きな字の縁取り(strokeText)は GPU で毎コマ輪郭を作り直すので重い(194px×26字で 60→38fps)。
   プレビューでは「縁取りだけ」を字ごとの画像にして使い回す(書き出しは従来どおり毎コマ strokeText で正確に描く)。
   画像は今の拡大率以上の解像度(2^(1/4) 刻みで切り上げ)で作るので、縮小表示になりぼやけない */
const strokeCache = new Map();
let strokeCachePx = 0;
const STROKE_CACHE_MAX_PX = 12e6;          // 合計 約 1200 万画素(≒48MB)まで
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { strokeCache.clear(); strokeCachePx = 0; });
L._sfFast = false; L._sfMiss = 0;
L._strokeText = (env, ctx, ch, x, y) => {
  const ss = ctx.strokeStyle;
  if (!L._sfFast || typeof ss !== 'string' || ctx.getLineDash().length || L._sfMiss > 24 || ctx.textAlign !== 'center' || ctx.textBaseline !== 'middle') { ctx.strokeText(ch, x, y); return; }
  const tr = ctx.getTransform();
  const sc = Math.sqrt(Math.abs(tr.a * tr.d - tr.b * tr.c));
  if (!(sc > 0.02)) return;
  const b = Math.pow(2, Math.ceil(Math.log2(sc) * 4 - 1e-6) / 4);
  const key = ch + '\u0001' + ctx.font + '|' + ctx.lineWidth + '|' + ss + '|' + ctx.lineJoin + '|' + ctx.miterLimit + '|' + b;
  let e = strokeCache.get(key);
  if (e) { strokeCache.delete(key); strokeCache.set(key, e); }
  else {
    L._sfMiss++;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = ctx.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const mt = g.measureText(ch), pad = ctx.lineWidth / 2 + 2;
    const l = (mt.actualBoundingBoxLeft || 0) + pad, r = (mt.actualBoundingBoxRight || 0) + pad;
    const t = (mt.actualBoundingBoxAscent || 0) + pad, d = (mt.actualBoundingBoxDescent || 0) + pad;
    const cw = Math.ceil((l + r) * b), chh = Math.ceil((t + d) * b);
    if (cw < 1 || chh < 1 || cw > 2048 || chh > 2048) { ctx.strokeText(ch, x, y); return; }
    c.width = cw; c.height = chh;
    g.scale(b, b); g.translate(l, t);
    g.font = ctx.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = ctx.lineWidth; g.lineJoin = ctx.lineJoin; g.miterLimit = ctx.miterLimit; g.strokeStyle = ss;
    g.strokeText(ch, 0, 0);
    e = { c, l, t, w: cw / b, h: chh / b, px: cw * chh };
    strokeCache.set(key, e); strokeCachePx += e.px;
    for (const [k, v] of strokeCache) { if (strokeCachePx <= STROKE_CACHE_MAX_PX) break; strokeCache.delete(k); strokeCachePx -= v.px; }
  }
  ctx.drawImage(e.c, x - e.l, y - e.t, e.w, e.h);
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
  if (hasStroke && filled && it.strokeUnder !== false) L._strokeText(env, ctx, ch, x, y);
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
    L._strokeText(env, ctx, ch, x, y);
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
  if (L._collect && pass === 'main') L._collect.push({ it, bb, m, main: !!it._main, alpha });
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
    if (g.ox || g.oy) ctx.translate(g.ox || 0, g.oy || 0);   // 約物詰めの字面の寄せ
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
  if (L.typoOn()) {
    // Hallmark: 見出しに斜体を使わない / 光彩は控えめに(強い glow は AI 臭)
    it.italic = false;
    if (it.shadow && it.shadow.blur > it.size * 0.22) it.shadow = Object.assign({}, it.shadow, { blur: it.size * 0.22 });
  }
  it._main = true;
  return L.drawItem(env, it);
};

/* ================================================================ styles (配色セット + 役割フォント) */
L.STYLES = L.STYLES || {};
L.STYLE_ORDER = L.STYLE_ORDER || [];
L.registerStyle = (key, def) => {
  if (L.STYLES[key]) return;
  if ((def.moods || []).includes('wa')) return;             // 和風配色(墨と和紙・紅)も使わない
  L.STYLES[key] = Object.assign({ key, moods: [], ghost: 0.5 }, def);
  L.STYLE_ORDER.push(key);
};
L.MOODS = [
  ['pop', 'ポップ'], ['calm', 'しっとり'], ['emotional', 'エモ'], ['glitch', 'グリッチ'],
  ['graphic', 'グラフィック'], ['editorial', 'エディトリアル'], ['cyber', 'サイバー'], ['dark', 'ダーク'],
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

/* 背景の明るさに合わせた配色: 背景が暗い所では白系、明るい所では暗い文字にする。
   tn = { light: 背景が明るいか, bg: 文字の下の背景の平均色 }(FXEngine._toneFor が測って渡す)。
   今の文字色がすでに向きに合っていて読めるならそのまま使う(ユーザーが選んだ色を尊重) */
const TONE_DARK = '#15171c', TONE_LIGHT = '#ffffff';
L.toneScheme = (sc, tn) => {
  if (!tn) return sc;
  const fgDark = L.lum(sc.fg) < 0.18;
  const ok = fgDark === !!tn.light && L.contrast(sc.fg, tn.bg) >= 3;
  const fg = ok ? sc.fg : (tn.light ? TONE_DARK : TONE_LIGHT);
  // 縁取り・下地に使う bg は文字と逆の明るさにそろえる(暗い文字なら明るい縁)
  const bgDark = L.lum(sc.bg) < 0.45;
  const bg = ok || bgDark === !tn.light ? sc.bg : (tn.light ? L.mix(tn.bg, '#ffffff', 0.7) : L.mix(tn.bg, '#000000', 0.7));
  const accent = L.fitContrast(sc.accent, tn.bg, 2.4), accent2 = L.fitContrast(sc.accent2, tn.bg, 2.4);
  return Object.assign({}, sc, {
    fg, bg, bg2: bg === sc.bg ? sc.bg2 : bg, accent, accent2,
    sub: L.mix(fg, bg, 0.42), dim: L.mix(bg, fg, 0.13),
    ink: accent, onInk: L.onColor(accent), onAccent2: L.onColor(accent2),
    dark: !tn.light,
  });
};
const TONE_KEYS = ['fg', 'bg', 'bg2', 'accent', 'accent2', 'sub', 'dim', 'ink'];
L.toneBlend = (sc, tn) => {
  if (!tn) return sc;
  const b = L.toneScheme(sc, tn);
  if (!tn.from || !(tn.k < 1)) return b;
  const a = L.toneScheme(sc, tn.from), o = Object.assign({}, b);
  for (const k of TONE_KEYS) o[k] = L.mix(a[k], b[k], tn.k);
  o.onInk = L.onColor(o.ink); o.onAccent2 = L.onColor(o.accent2);
  return o;
};

/* ================================================================ cuts: 歌詞→カット */
const PUNCT_TRIM = /^[\s　]+|[\s　]+$/g;
function joinWords(ws) {
  let s = '';
  ws.forEach((w, i) => {
    const t = String(w.word || '');
    if (i && /[A-Za-z0-9][*\/]*$/.test(s) && /^\**[A-Za-z0-9]/.test(t)) s += ' ';   // 記法の * / を挟んでも欧文の語間を保つ
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
/* Hallmark 'full' の抑制: 跳ねる/弾む動き・光彩/グラデ/クロームの文字・常時揺れる保持は控えめに
   (禁止ではなく重みを下げる。強調カットでは戻す) */
const HM_BOUNCY = /spring|elastic|jelly|[bB]ounce|squash|[rR]ubber|hop|pendulum|tumble|balloon/;
const HM_GLOWY = new Set(['glowShadow', 'gradAccent', 'chrome', 'longShadow', 'extrude3d', 'patternFill', 'jitter', 'baseWave']);
// 数値を作り出すデータ系の構図(歌詞に数字が無いのに統計・割合・グラフを見せる = Hallmark「偽の数値」)
const HM_FAKENUM = /^n_(stats|pctswap|waffle|donut|bars|linegraph|hbar|odometer|countup|countdown|tally)$/;
const HM_BUSYHOLD = /shake|tremble|jelly|flicker|glowPulse|kickFlash|charSwap|glitchSlip|skewWobble|wobble|bassSquash|handheld/i;
L.hmMult = (g, key, emph) => {
  if (g === 'treat' && HM_GLOWY.has(key)) return emph ? 0.5 : 0.15;
  if ((g === 'enter' || g === 'exit') && HM_BOUNCY.test(key)) return emph ? 0.6 : 0.25;
  if (g === 'hold' && HM_BUSYHOLD.test(key)) return emph ? 0.5 : 0.2;
  if (g === 'hold' && key === 'still') return 1.8;
  return 1;
};
/* 文字の大きさ(MV): 構図ごとの実測占有率(size_table.js の L.SIZE)で重みを変える。小物/UI系の小さな組みは控えめに */
L.sizeMult = key => {
  const c = L.SIZE && L.SIZE[key];
  if (c == null) return 1;
  return c < 0.4 ? 0.15 : c < 0.5 ? 0.4 : c < 0.6 ? 0.75 : c >= 0.85 ? 1.4 : c >= 0.72 ? 1.15 : 1;
};
L.planCut = (cut, ctx) => {
  const { rng, st, moods, cm, portrait, recent, W, H, keep, prevCut } = ctx;
  const emph = !!(cut.emph || cut.emphMark || cut.impact);
  const out = Object.assign({}, keep || {});
  const hm = cm.typo === 'full';
  const hmM = (g, k) => (hm ? L.hmMult(g, k, emph) : 1);
  const moodMult = tags => (moods.length ? (hasTag(tags, moods) ? 1.6 : 0.75) : 1);
  const recentMult = (g, k) => { const r = recent[g] || []; const i = r.lastIndexOf(k); return i < 0 ? 1 : i >= r.length - 2 ? 0.04 : 0.35; };
  const bias = (g, k) => (st && st.bias && st.bias[g] && st.bias[g][k] != null ? st.bias[g][k] : 1);
  if (!out.layout) {
    const d = pickW(rng, 'layout', def => {
      if (!L.allowed(def, cm)) return 0;
      if (def.fits && !def.fits(cut.n)) return 0;
      if (def.minDur && cut.dur < def.minDur) return 0;
      let w = def.w * moodMult(def.tags) * bias('layout', def.key) * recentMult('layout', def.key);
      if (hm && HM_FAKENUM.test(def.key) && !/[0-9０-９]/.test(cut.text)) w *= 0.1;
      if (cm.textSize !== 'normal') w *= L.sizeMult(def.key);          // 文字の大きさ=大きめ(MV): 歌詞を大きく組む構図を優先
      if (ctx.avoidChars && def.busy) w *= 0.2;                         // キャラを避ける時は、画面いっぱいで避けられない構図を控える
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
      let w = def.w * moodMult(def.tags) * bias(g, def.key) * recentMult(g, def.key) * hmM(g, def.key);
      if (g === 'enter' && lay.enterBias && lay.enterBias[def.key] != null) w *= lay.enterBias[def.key];
      if (emph && def.emph != null) w *= def.emph;
      return w;
    });
    out[g] = d ? d.key : null;
  }
  if (!out.decor) {
    out.decor = [];
    const dens = cm.decor == null ? 0.6 : cm.decor;
    let n = rng() < dens * 0.8 ? (rng() < dens * 0.5 ? 2 : 1) : 0;
    if (hm && !emph) n = Math.min(n, 1);                // 「10の小さな動きより1つの振付」
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
      const d = pickW(rng, 'treat', def => (L.allowed(def, cm) && (lay.treat !== 'safe' || def.safe) && !(def.needsEmph && !cut.emphMark) ? def.w * moodMult(def.tags) * recentMult('treat', def.key) * hmM('treat', def.key) * bias('treat', def.key) : 0));
      if (d) { out.treat = d.key; out.treatP = d.plan ? d.plan(rng, st || {}) : {}; }
    }
  }
  if (out.cam === undefined) {
    out.cam = null;
    if (rng() < (cm.camera == null ? 0.5 : cm.camera) * (hm && !emph ? 0.6 : 1)) {
      const d = pickW(rng, 'cam', def => (L.allowed(def, cm) ? def.w * moodMult(def.tags) * (def.strong && !emph ? (hm ? 0.12 : 0.4) : 1) : 0));
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

/* キャラ(前景画像/3Dダンス/Live2D)がいて、文字がキャラの前で、「キャラを避けて置く」が有効か */
L.avoidingChars = tl => !!(tl && (tl.subject || (tl.dance && tl.dance.enabled) || (tl.live2d && tl.live2d.enabled)) && tl.avoidChars !== false && tl.textLayer !== 'behind');

/* 全カットを計画する。opts.only = 'layout'|'motion'|'decor'|'cam' で一部だけ振り直し */
L.planAll = (tl, opts = {}) => {
  const cm = tl.compose = tl.compose || {};
  const seed = opts.seed != null ? opts.seed : (cm.seed != null ? cm.seed : 1);
  const st = L.getStyle(cm.style);
  const moods = [].concat(cm.mood ? [cm.mood] : [], (st && st.moods) || []);
  const cuts = L.buildCuts(tl);
  const W = opts.W || 1920, H = opts.H || 1080;
  L.setTypo(cm, st, W, H);
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
    plans[key] = L.planCut(cut, { rng, st, moods, cm, portrait, recent, W, H, keep, prevCut: cuts[i - 1], seed, avoidChars: L.avoidingChars(tl) });
    if (old && old.reroll) plans[key].reroll = old.reroll;
    if (old && old.textLayer && !old.textLayerAuto) plans[key].textLayer = old.textLayer;   // 人が決めた前後は振り直しても残す(おまかせで決めた分は決め直す)
  });
  cm.cuts = plans;
  cm.seed = seed;
  L.assignTextLayers(tl);
  cm.planVersion = (cm.planVersion || 0) + 1;
  return cm;
};

/* おまかせで「文字をキャラの前/後ろ」をカットごとに決める(cm.randomTextLayer、既定オン・キャラがいる時だけ)。
   人が選んだカット(textLayerAuto でない textLayer)は触らない。決定論(種・カット・振り直し回数)。
   画面いっぱいの構図は後ろに回すと映えるので後ろ寄り、強調カットも少し後ろ寄り。同じ側が続きすぎないように */
L.hasChars = tl => !!(tl && (tl.subject || (tl.dance && tl.dance.enabled) || (tl.live2d && tl.live2d.enabled)));
L.assignTextLayers = tl => {
  const cm = tl.compose || {};
  const plans = cm.cuts || {};
  const on = cm.randomTextLayer !== false && L.hasChars(tl);
  const cuts = L.buildCuts(tl);
  let prev = null, run = 0, n = 0;
  for (const cut of cuts) {
    const key = cut.line + ':' + cut.part, p = plans[key];
    if (!p) continue;
    if (p.textLayer && !p.textLayerAuto) { prev = p.textLayer; run = 1; continue; }
    if (!on) { if (p.textLayerAuto) { delete p.textLayer; delete p.textLayerAuto; } continue; }
    const lay = L.get('layout', p.layout);
    let pb = lay && lay.busy ? 0.6 : 0.32;
    if (cut.emph || cut.emphMark || cut.impact) pb += 0.12;
    if (prev === 'behind' && run >= 2) pb = 0.1;
    if (prev === 'front' && run >= 4) pb = 0.75;
    const v = L.r('textLayer', cm.seed || 1, cut.line, cut.part, p.reroll || 0) < pb ? 'behind' : 'front';
    p.textLayer = v; p.textLayerAuto = true; n++;
    run = v === prev ? run + 1 : 1; prev = v;
  }
  return n;
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
    sc: L.toneBlend(L.schemeFor(tl, st), cut && eng._toneFor ? eng._toneFor('c' + cut.line + ':' + cut.part, t) : null), st: st || { fonts: {} },
    fx: { motion: cm.motion == null ? 1 : cm.motion, glitch: cm.glitch == null ? 0.5 : cm.glitch, decor: cm.decor == null ? 0.6 : cm.decor, density: cm.density == null ? 0.5 : cm.density },
    cut, energy: energy == null ? 0.5 : energy, boost: boost || 1, beat: L.beatAt(tl, t),
    scale: 1, allowFilter: eng.quality !== 'draft', pass: 'main', ghostColor: '#ffffff', ghostAlpha: 0.5,
    lt: 0, ltb: 0, pIn: 1, pOut: 0, step: 0, lyricFont: (tl.lyricStyle && tl.lyricStyle.font) || null,
    bpm: tl.bpm || null, songDur: tl.duration || 0,
    totalBeats: tl.bpm && tl.duration ? Math.max(1, Math.round(tl.duration * tl.bpm / 60)) : null,
  };
  L.makeHelpers(env);
  L._sfFast = !eng.exporting; L._sfMiss = 0;     // 縁取りの画像キャッシュ: プレビューだけ使う(コマごとに作り直し数を数え直す)
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
  L.setTypo(cm, cm.fonts ? { fonts: Object.assign({}, (L.getStyle(cm.style) || {}).fonts || {}, cm.fonts) } : L.getStyle(cm.style), W, H);
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
