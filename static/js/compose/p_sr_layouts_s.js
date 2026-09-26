/* LyricFlow 演出パック: p_sr_layouts_s — ショーリールS(アニメ原理・デザインツール・ポスター・コード・ハーフトーン・角柱・マーキー)
   契約: docs/COMPOSE_PACKS.md  (group: layout)  共通ヘルパー: L.mg (p_motion_graphics.js)
   モーションデザインのショーリールに出てくる場面の「原理」だけを参考に、全て計算(Canvas2D)で描く。
   拍(env.beat / env.bpm)に同期。副テキストは汎用語か cut から生成したもの。実装はLyricFlow独自。 */
(() => {
'use strict';
const L = window.LFC;
if (!L || !L.mg) return;
const E = L.E, M = L.mg;
const P = 'p_sr_layouts_s';
const clamp = L.clamp, lerp = L.lerp, TAU = L.TAU;

/* ---------------- helpers ---------------- */
/* カット頭からの拍位置(拍グリッドに揃う)。BPM無しは 0.5 秒拍 */
const beatPos = env => {
  const b = env.beat, c = env.cut;
  if (b && b.len > 0 && c && c.beat0 != null) return Math.max(0, b.index - c.beat0 + b.since / b.len);
  return Math.max(0, env.ltb) / M.beatLen(env);
};
const stepped = (env, fr = 0.5, ease = E.inOutCubic) => {
  const p = beatPos(env), k = Math.floor(p);
  return k + ease(clamp((p - k) / fr));
};
const kick = env => { const p = beatPos(env); return Math.exp(-(p - Math.floor(p)) * M.beatLen(env) / 0.11); };
const ih = (a, b = 0, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9e37, 668265263) ^ Math.imul((c | 0) + 0x51ed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return h >>> 0;
};
const ir = (a, b, c) => ih(a, b, c) / 4294967296;
const frac = x => x - Math.floor(x);
const seedOf = env => (env.cut.seed | 0) || 1;

const lyricItem = (env, x, y, w, h, o = {}) => {
  const font = o.font || L.roleFont(env, o.role || 'display');
  const n = env.cut.n;
  const rows = o.rows || (n > 14 ? 3 : n > 5 ? 2 : 1);
  const fit = M.fitLines(env, env.cut.text, font, w, h, o.cap || Math.min(env.W, env.H) * 0.2, rows);
  return Object.assign({ text: fit.text, font, size: fit.size, x, y }, o.item || {});
};
const label = (env, text, x, y, a, o = {}) => {
  if (a <= 0.01) return null;
  return M.anchored(env, Object.assign({ text, font: M.MONO, weight: 700, size: Math.max(8, env.u * 18), x, y, color: env.sc.sub, alpha: a, ghost: false, track: 0.12 }, o), o.anchor || 'left');
};
/* 図形領域と文字領域(横長=左右、縦長/正方形=上下) */
const split = (env, fr = 0.44, flip = false) => {
  const { W, H, portrait } = env;
  const stack = portrait || W / H < 1.3;
  const mx = W * 0.06, my = H * 0.07;
  if (stack) {
    const gh = (H - my * 2) * (portrait ? 0.5 : 0.56);
    return { stack, g: { x: W / 2, y: my + gh / 2, w: W - mx * 2, h: gh }, t: { x: W / 2, y: my + gh + (H - my * 2 - gh) / 2, w: W - mx * 2, h: (H - my * 2 - gh) * 0.84 } };
  }
  const gw = (W - mx * 2) * fr, tw = (W - mx * 2) - gw - W * 0.04;
  return { stack, g: { x: flip ? W - mx - gw / 2 : mx + gw / 2, y: H / 2, w: gw, h: H - my * 2 }, t: { x: flip ? mx + tw / 2 : W - mx - tw / 2, y: H / 2, w: tw, h: (H - my * 2) * 0.8 } };
};

/* ================================================================ 1. ボールの弾み */
const BB_TERMS = ['SQUASH & STRETCH', 'EASE OUT', 'ARC', 'TIMING', 'SLOW IN', 'SPACING', 'FOLLOW THROUGH', 'ANTICIPATION'];
L.register('layout', 's_bounceBall', {
  name: 'ボールの弾み', tags: ['pop', 'graphic', 'editorial'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 30,
  plan: rng => {
    const t0 = rng.int(0, BB_TERMS.length - 1);
    return { side: rng.pick(['below', 'below', 'above']), per: rng.pick([1, 1, 2]), dir: rng.sign(), terms: [BB_TERMS[t0], BB_TERMS[(t0 + rng.int(1, 3)) % BB_TERMS.length]], ghosts: rng.int(2, 4), hgt: rng.range(0.82, 1) };
  },
  render(env) {
    const { W, H, u, sc, cut, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.45), m = Math.min(W, H);
    const above = p.side === 'above';
    const sq = !portrait && W / H < 1.3;
    let gy, top, ty0, ty1;
    if (above) { ty0 = H * 0.06; ty1 = H * (portrait ? 0.34 : 0.36); top = ty1 + m * 0.06; gy = H * (portrait ? 0.78 : 0.82); }
    else { top = H * (portrait ? 0.16 : 0.15); gy = H * (portrait ? 0.52 : sq ? 0.58 : 0.6); ty0 = gy + m * 0.1; ty1 = H * 0.94; }
    const x0 = W * 0.07, x1 = W * 0.93;
    const r = m * (portrait ? 0.05 : 0.045);
    const Hb = Math.max(r, (gy - top - r * 2) * (p.hgt || 0.9));
    const nB = portrait || sq ? 3 : 4;
    const per = (p.per || 1) * (M.beatLen(env) < 0.36 ? 2 : 1);
    const dir = p.dir || 1;
    const xa = x0 + r * 1.6, xb = x1 - r * 1.6;
    const ph = beatPos(env) / per;
    const pos = q => {
      const f = frac(q), c = ((q / nB) % 2 + 2) % 2, tri = c < 1 ? c : 2 - c;
      return [lerp(xa, xb, dir > 0 ? tri : 1 - tri), gy - r - Hb * 4 * f * (1 - f), f];
    };
    const it = lyricItem(env, W / 2, (ty0 + ty1) / 2, W * 0.86, (ty1 - ty0) * 0.9, { cap: m * 0.2 });
    const lineE = E.outCubic(clamp(env.lt / 0.5)) * (1 - E.inCubic(env.pOut));
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx, lw = Math.max(1, u * 2);
      ctx.save();
      // 地面線と目盛り
      const gx1 = lerp(x0, x1, lineE);
      ctx.globalAlpha = io * 0.75; ctx.strokeStyle = sc.fg; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
      ctx.lineWidth = Math.max(1, u * 1.2); ctx.globalAlpha = io * 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) { const x = lerp(x0, x1, i / 32); if (x > gx1) break; const tl = i % 4 === 0 ? m * 0.016 : m * 0.008; ctx.moveTo(x, gy); ctx.lineTo(x, gy + tl); }
      ctx.stroke();
      // 着地点の目盛り(太め)
      ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1, u * 2.4); ctx.globalAlpha = io * 0.9;
      ctx.beginPath();
      for (let j = 0; j <= nB; j++) { const x = lerp(xa, xb, j / nB); if (x > gx1) break; ctx.moveTo(x, gy - m * 0.012); ctx.lineTo(x, gy + m * 0.028); }
      ctx.stroke();
      // 点線の放物線(軌跡)
      const TR = 1.7, dn = 22, rd = Math.max(0.9, r * 0.13);
      ctx.fillStyle = sc.sub;
      for (let k = Math.max(0, Math.ceil((ph - TR) * dn)); k <= Math.floor(ph * dn); k++) {
        const q = k / dn, age = ph - q, v = pos(q);
        ctx.globalAlpha = io * 0.9 * (1 - age / TR);
        ctx.beginPath(); ctx.arc(v[0], v[1], rd, 0, TAU); ctx.fill();
      }
      // オニオンスキン(頂点付近の輪郭円)
      const apex = Math.floor(ph - 0.5) + 0.5, G = p.ghosts || 3;
      ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 1.6);
      for (let j = 0; j < G; j++) {
        const q = apex + (j - (G - 1) / 2) * 0.13;
        if (q < 0 || q > ph - 0.04) continue;
        const v = pos(q);
        ctx.globalAlpha = io * 0.55 * clamp(1 - (ph - q) / 1.3);
        ctx.beginPath(); ctx.arc(v[0], v[1], r, 0, TAU); ctx.stroke();
      }
      // 本体: つぶれと伸び
      const [bx, by0, f] = pos(ph);
      const squash = f < 0.12 ? Math.pow(1 - f / 0.12, 2) : 0;
      const stt = Math.pow(Math.abs(1 - 2 * f), 2) * (1 - squash);
      const grow = E.outBack(clamp(env.lt / 0.4), 1.6) * (1 - E.inBack(clamp(env.pOut * 1.2)));
      const R0 = r * Math.max(0, grow);
      let rx, ry, rot, by;
      if (squash > 0.02) { rx = R0 * (1 + 0.5 * squash); ry = R0 * (1 - 0.42 * squash); rot = 0; by = gy - ry; }
      else {
        const k = 1 + 0.38 * stt, vx = dir * (xb - xa) / nB * (Math.floor(ph / nB) % 2 ? -1 : 1), vy = -Hb * 4 * (1 - 2 * f);
        rx = R0 * k; ry = R0 / k; rot = Math.atan2(vy, vx);
        const ext = Math.sqrt(Math.pow(rx * Math.sin(rot), 2) + Math.pow(ry * Math.cos(rot), 2));
        by = Math.min(by0, gy - ext);
      }
      // 接地の影と衝撃線
      const hgtN = clamp((gy - r - by0) / Hb);
      ctx.globalAlpha = io * 0.25 * (1 - hgtN * 0.7); ctx.fillStyle = sc.fg;
      ctx.beginPath(); ctx.ellipse(bx, gy + lw, R0 * (1.2 - hgtN * 0.6), Math.max(1, R0 * 0.14), 0, 0, TAU); ctx.fill();
      if (squash > 0.02 && ph > 0.5) {
        ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1, u * 2); ctx.globalAlpha = io * squash;
        ctx.beginPath();
        for (const s of [-1, 1]) { ctx.moveTo(bx + s * R0 * 1.7, gy - R0 * 0.2); ctx.lineTo(bx + s * R0 * 2.5, gy - R0 * 0.75); ctx.moveTo(bx + s * R0 * 1.9, gy - R0 * 0.02); ctx.lineTo(bx + s * R0 * 2.8, gy - R0 * 0.2); }
        ctx.stroke();
      }
      if (R0 > 0.3) {
        ctx.globalAlpha = io; ctx.fillStyle = sc.accent;
        ctx.beginPath(); ctx.ellipse(bx, by, rx, ry, rot, 0, TAU); ctx.fill();
      }
      // 引き出し線付きの注釈
      const terms = p.terms || BB_TERMS.slice(0, 2);
      const term = terms[Math.floor(ph / 2) % terms.length];
      const fs = Math.max(8, u * 19);
      const ly = above ? gy + m * 0.13 : top - m * 0.055, ex = x0 + m * 0.012;
      const la = io * clamp((env.lt - 0.3) / 0.3);
      if (la > 0.01 && R0 > 0.3) {
        const bdx = ex - bx, bdy = ly - by, bd = Math.hypot(bdx, bdy) || 1;
        const sx0 = bx + bdx / bd * R0 * 1.3, sy0 = by + bdy / bd * R0 * 1.3;
        ctx.globalAlpha = la * 0.8; ctx.strokeStyle = sc.fg; ctx.lineWidth = Math.max(1, u * 1.3);
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(ex, ly); ctx.stroke();
        ctx.fillStyle = sc.fg; ctx.beginPath(); ctx.arc(sx0, sy0, Math.max(1.2, u * 3), 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ex, ly, Math.max(1.2, u * 3), 0, TAU); ctx.fill();
      }
      ctx.restore();
      label(env, term, ex + m * 0.025, ly, la, { color: sc.fg, size: fs });
      if (!portrait && !sq) label(env, `BOUNCE ${M.pad2(Math.floor(ph) + 1)} · ${env.bpm ? Math.round(env.bpm) + ' BPM' : '12 FPS'}`, x1, ly, la * 0.7, { anchor: 'right', size: fs * 0.85 });
      for (let j = 0; j <= nB; j++) {
        const x = lerp(xa, xb, j / nB);
        if (x > gx1) break;
        label(env, 'F' + M.pad2(j * 12 * per), x, gy + m * 0.05, io * 0.55, { anchor: 'center', size: fs * 0.78 });
      }
    }
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 2. 選択枠 */
L.register('layout', 's_selectFrame', {
  name: '選択枠', tags: ['editorial', 'cyber', 'graphic'], w: 1, emph: 1.1, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ corner: rng.int(0, 3), loose: rng.range(1.22, 1.42), role: rng.pick(['display', 'display', 'body']), redrag: rng.chance(0.75), layer: rng.int(1, 24), guides: rng.chance(0.7) }),
  render(env) {
    const { W, H, u, sc, cut, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.3), m = Math.min(W, H);
    const base = lyricItem(env, W / 2, H * 0.47, W * 0.74, H * (portrait ? 0.28 : 0.34), { role: p.role || 'display', cap: m * 0.22 });
    const bb = L.itemBox(base);
    const pad = Math.max(u * 14, base.size * 0.14);
    const fx0 = bb.x0 - pad, fy0 = bb.y0 - pad, fw = bb.w + pad * 2, fh = bb.h + pad * 2;
    const c = (p.corner || 0) % 4;                             // ドラッグする角 0=左上 1=右上 2=右下 3=左下
    const sgx = c === 1 || c === 2 ? 1 : -1, sgy = c >= 2 ? 1 : -1;
    const ax = sgx > 0 ? fx0 : fx0 + fw, ay = sgy > 0 ? fy0 : fy0 + fh;   // 固定される対角
    // ゆるい枠 → はまる(オーバーシュート)。拍の頭で時々もう一度つまむ
    const maxS = Math.min(sgx > 0 ? (W * 0.97 - ax) / fw : (ax - W * 0.03) / fw, sgy > 0 ? (H * 0.9 - ay) / fh : (ay - H * 0.05) / fh);
    const loose = Math.max(1, Math.min(p.loose || 1.3, maxS));
    const snapP = clamp((env.lt - 0.28) / 0.55);
    let sx = lerp(loose, 1, E.outBack(snapP, 2.2)), sy = sx, drag = snapP > 0 && snapP < 1 ? 1 : 0;
    let cursorA = clamp((env.lt - 0.08) / 0.15) * (1 - clamp((env.lt - 0.95) / 0.25));
    if (p.redrag && env.lt > 1.25) {
      const bp = beatPos(env), k = Math.floor(bp), f = bp - k;
      if (k % 4 === 3) {
        const g = Math.sin(Math.PI * clamp(f / 0.85));
        sx = 1 + 0.05 * g; sy = 1 + 0.025 * g; drag = g > 0.05 ? 1 : 0;
        cursorA = Math.max(cursorA, Math.sin(Math.PI * clamp(f / 0.95)));
      }
    }
    const w = fw * sx, h = fh * sy;
    const X0 = sgx > 0 ? ax : ax - w, Y0 = sgy > 0 ? ay : ay - h;
    const cx = sgx > 0 ? ax + w : ax, cy = sgy > 0 ? ay + h : ay;   // ドラッグ中の角
    // 文字も少しだけ一緒に拡縮(対角を支点に)
    const ts = 1 + (sx - 1) * 0.35, tsy = 1 + (sy - 1) * 0.35;
    const it = Object.assign({}, base, { sx: ts, sy: tsy, x: ax + (base.x - ax) * ts, y: ay + (base.y - ay) * tsy });
    const col = sc.accent2, lw = Math.max(1, u * 2.2);
    const fa = io * clamp(env.lt / 0.18);
    if (env.pass === 'main' && fa > 0.002) {
      const ctx = env.ctx;
      ctx.save();
      // スナップガイド(はまった瞬間に中心線が光る)
      if (p.guides) {
        const ga = fa * Math.sin(Math.PI * clamp((snapP - 0.55) / 0.45)) * 0.8;
        if (ga > 0.01) {
          ctx.globalAlpha = ga; ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.max(1, u * 1.5); ctx.setLineDash([u * 8, u * 6]);
          ctx.beginPath(); ctx.moveTo(X0 + w / 2, H * 0.03); ctx.lineTo(X0 + w / 2, H * 0.97); ctx.moveTo(W * 0.03, Y0 + h / 2); ctx.lineTo(W * 0.97, Y0 + h / 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // 枠(描き起こし)
      const de = E.outCubic(clamp(env.lt / 0.3));
      const perim = [[X0, Y0], [X0 + w, Y0], [X0 + w, Y0 + h], [X0, Y0 + h], [X0, Y0]];
      ctx.globalAlpha = fa; ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      let left = (w * 2 + h * 2) * de;
      ctx.moveTo(X0, Y0);
      for (let i = 1; i < perim.length && left > 0; i++) {
        const d = Math.hypot(perim[i][0] - perim[i - 1][0], perim[i][1] - perim[i - 1][1]);
        const t = Math.min(1, left / d);
        ctx.lineTo(lerp(perim[i - 1][0], perim[i][0], t), lerp(perim[i - 1][1], perim[i][1], t));
        left -= d;
      }
      ctx.stroke();
      // 8つのハンドル
      const hs = Math.max(3, u * 11) * (1 + kick(env) * 0.18 * clamp(env.lt - 1));
      const hp = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
      hp.forEach(([a, b], i) => {
        const q = E.outBack(clamp((env.lt - 0.12 - i * 0.025) / 0.2), 2) * (1 - E.inCubic(env.pOut));
        if (q <= 0.01) return;
        const x = X0 + w * a, y = Y0 + h * b, s = hs * q;
        const hot = drag && Math.abs(x - cx) < 1 && Math.abs(y - cy) < 1;
        ctx.globalAlpha = fa;
        ctx.fillStyle = hot ? col : sc.bg; ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u * 1.8); ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      });
      // カーソル(矢印)
      if (cursorA > 0.01) {
        const off = (1 - clamp((env.lt - 0.05) / 0.22)) * m * 0.12;
        const px = cx + sgx * (hs * 0.3 + off), py = cy + sgy * (hs * 0.3 + off), S = m * 0.042;
        const ar = [[0, 0], [0, 1], [0.27, 0.76], [0.45, 1.12], [0.6, 1.05], [0.43, 0.7], [0.78, 0.7]];
        ctx.globalAlpha = io * cursorA; ctx.fillStyle = sc.fg; ctx.strokeStyle = sc.bg; ctx.lineWidth = Math.max(1, u * 2); ctx.lineJoin = 'round';
        ctx.beginPath(); ar.forEach(([a, b], i) => { const X = px + a * S, Y = py + b * S; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
        ctx.stroke(); ctx.fill();
      }
      ctx.restore();
    }
    // 寸法の札とレイヤー名
    const fs = Math.max(8, u * 19);
    const pillA = fa * clamp((env.lt - 0.2) / 0.25);
    if (pillA > 0.01) {
      const txt = `W ${Math.round(w / u)} × H ${Math.round(h / u)}`;
      const tItem = { text: txt, font: M.MONO, weight: 700, size: fs, x: X0 + w / 2, y: Y0 + h + fs * 1.5, color: sc.onAccent2, alpha: pillA, ghost: false, track: 0.04 };
      const tw = L.measure(tItem).w;
      env.rrect(tItem.x - tw / 2 - fs * 0.6, tItem.y - fs * 0.8, tw + fs * 1.2, fs * 1.6, fs * 0.8, col, pillA, false);
      env.text(tItem);
      label(env, `Text ${M.pad2(p.layer || 1)} — LYRIC`, X0, Y0 - fs * 1.05, pillA * 0.9, { color: col, size: fs * 0.9, track: 0.06 });
    }
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 3. 色面ポスター */
L.register('layout', 's_posterBlock', {
  name: '色面ポスター', tags: ['graphic', 'editorial', 'pop'], w: 1, emph: 1.4, treat: 'safe', fits: n => n >= 1 && n <= 20,
  plan: rng => ({ mode: rng.pick(['wipe', 'grow', 'split']), from: rng.int(0, 3), align: rng.pick(['left', 'center', 'left']), heavy: rng.chance(0.6), meta: rng.int(0, 99) }),
  render(env) {
    const { W, H, u, sc, cut, portrait } = env;
    const p = cut.params || {};
    const m = Math.min(W, H);
    const pin = E.outQuart(clamp(env.lt / 0.5)), pout = E.inCubic(clamp((env.pOut - 0.4) / 0.6));
    const cov = pin * (1 - pout);
    // 地の色面(ワイプ/円で広がる/上下から合わさる)
    if (env.pass === 'main' && cov > 0.002) {
      const ctx = env.ctx;
      ctx.save(); ctx.fillStyle = sc.accent;
      ctx.beginPath();
      if (p.mode === 'grow') {
        const pts = [[0, 0], [W, 0], [W, H], [0, H]], o = pts[(p.from || 0) % 4];
        const ox = lerp(o[0], W / 2, 0.15), oy = lerp(o[1], H / 2, 0.15);
        const R = Math.hypot(W, H) * 1.02 * (pout > 0 ? 1 - pout : pin);
        ctx.arc(pout > 0 ? W - ox : ox, pout > 0 ? H - oy : oy, Math.max(0, R), 0, TAU);
      } else if (p.mode === 'split') {
        const hh = H / 2 * cov;
        ctx.rect(0, 0, W, hh); ctx.rect(0, H - hh, W, hh);
      } else {
        const d = (p.from || 0) % 4;
        if (pout > 0) {                                     // 入った向きのまま抜ける
          const e = pout;
          if (d === 0) ctx.rect(W * e, 0, W * (1 - e), H); else if (d === 2) ctx.rect(0, 0, W * (1 - e), H);
          else if (d === 1) ctx.rect(0, H * e, W, H * (1 - e)); else ctx.rect(0, 0, W, H * (1 - e));
        } else {
          if (d === 0) ctx.rect(0, 0, W * pin, H); else if (d === 2) ctx.rect(W * (1 - pin), 0, W * pin, H);
          else if (d === 1) ctx.rect(0, 0, W, H * pin); else ctx.rect(0, H * (1 - pin), W, H * pin);
        }
      }
      ctx.fill(); ctx.restore();
    }
    const tc = sc.onInk;
    const font = p.heavy && cut.n <= 8 ? "'Dela Gothic One', sans-serif" : L.roleFont(env, 'display');
    const fit = M.fitLines(env, cut.text, font, W * 0.84, H * (portrait ? 0.4 : 0.5), m * 0.36, portrait ? (cut.n > 12 ? 4 : cut.n > 3 ? 3 : 1) : cut.n > 10 ? 3 : cut.n > 4 ? 2 : 1);
    const it = { text: fit.text, font, size: fit.size, x: W / 2, y: H * (portrait ? 0.46 : 0.45), color: tc, delay: 0.18, lead: 1.08 };
    const mm = L.measure(it);
    if (p.align === 'left') { it.align = 'left'; it.x = W * 0.08 + mm.w / 2; }
    const tb = L.itemBox(it);
    // 太い下線(描き起こし→退場で左から縮む)
    const ue = E.outExpo(clamp((env.lt - 0.35) / 0.55)), uo = E.inCubic(clamp(env.pOut * 1.4));
    const barH = Math.max(3, fit.size * 0.14) * (1 + kick(env) * 0.25 * ue);
    const bw = (p.align === 'left' ? Math.max(tb.w, W * 0.3) : tb.w);
    const bx0 = p.align === 'left' ? tb.x0 : tb.cx - bw / 2;
    const by = tb.y1 + fit.size * 0.18;
    if (ue > 0.001 && uo < 1) env.rect(bx0 + bw * uo, by, bw * (ue - uo), barH, tc, cov, false);
    // 四隅の等幅メタ
    const ma = cov * clamp((env.lt - 0.4) / 0.35);
    if (ma > 0.01) {
      const fs = Math.max(8, u * 18), mx = W * 0.05, my = H * 0.06 + fs * 0.5;
      const o = { color: tc, size: fs };
      label(env, `No.${M.pad2(cut.idx + 1)}`, mx, my, ma, o);
      label(env, M.tc60(cut.start).slice(3), W - mx, my, ma, Object.assign({ anchor: 'right' }, o));
      label(env, `POSTER / ${M.pad2((p.meta || 0) % 100)}`, mx, H - my, ma, o);
      label(env, `${cut.n} CHARS`, W - mx, H - my, ma, Object.assign({ anchor: 'right' }, o));
    }
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 4. コードの壁 */
const CODE_T = [
  () => 'frame += 1;',
  (a) => `const t = clamp(time / ${a % 9 + 1}.0);`,
  () => 'ease.out(t)',
  (a, b) => `beat[${a % 64}] = ${b % 8};`,
  (a) => `if (beat.hit) flash(${a % 12});`,
  (a) => `for (let i = 0; i < ${a % 48 + 8}; i++) {`,
  () => '}',
  (a, b) => `draw(glyph, ${a % 1920}, ${b % 1080});`,
  (a, b) => `return mix(a, b, 0.${b % 90 + 10});`,
  (a, b, j) => `// cut ${a % 40} · line ${j}`,
  (a) => `offset.x -= ${a % 30 + 2} * dt;`,
  (a, b) => `scale = 1 + kick * 0.${b % 9 + 1};`,
  () => 'lyric.render(ctx);',
  () => 'await nextFrame();',
  (a) => `let y = baseline + ${a % 120};`,
  () => 'ctx.restore();',
];
L.register('layout', 's_codeWall', {
  name: 'コードの壁', tags: ['cyber', 'glitch', 'dark', 'graphic'], w: 1, emph: 1.3, treat: 'safe', busy: true, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ plate: rng.pick(['accent2', 'accent2', 'ink']), seed: rng.int(1, 99999), rise: rng.chance(0.5) }),
  render(env) {
    const { W, H, u, sc, cut } = env;
    const p = cut.params || {};
    const m = Math.min(W, H), sd = p.seed || seedOf(env);
    const plateC = p.plate === 'ink' ? L.mix(sc.bg, '#000000', 0.55) : sc.accent2;
    const tc = L.onColor(plateC);
    const pin = E.outQuart(clamp(env.lt / 0.45)), pout = E.inCubic(clamp((env.pOut - 0.4) / 0.6));
    const cov = pin * (1 - pout);
    if (env.pass === 'main' && cov > 0.002) {
      const ctx = env.ctx;
      ctx.save();
      ctx.fillStyle = plateC;
      if (p.rise) ctx.fillRect(0, H * (1 - pin) + H * pout, W, H * cov + 1);
      else ctx.fillRect(0, 0, W, H * cov);
      // 背景のコード行(拍ごとに2行ずつ送る)
      ctx.beginPath(); ctx.rect(0, p.rise ? H * (1 - pin) + H * pout : 0, W, H * cov); ctx.clip();
      const fs = Math.max(7, m * 0.026), lh = fs * 1.55;
      const scroll = stepped(env, 0.3, E.outCubic) * 2 + env.ltb * 0.4;
      const rows = Math.ceil(H / lh) + 2, k0 = Math.floor(scroll), fr = scroll - k0;
      ctx.font = `400 ${fs.toFixed(1)}px ${M.MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const gx = W * 0.04, cx0 = gx + fs * 3.2;
      const hot = Math.floor(beatPos(env)) % rows;
      for (let r = 0; r < rows; r++) {
        const j = k0 + r, y = H * 0.02 + (r - fr) * lh;
        const tp = CODE_T[ih(sd, j) % CODE_T.length];
        const ind = (ih(sd, j, 7) % 3) * 2;
        const s = ' '.repeat(ind) + tp(ih(sd, j, 1) % 2000, ih(sd, j, 2) % 2000, j);
        const isHot = r === hot;
        ctx.globalAlpha = cov * (isHot ? 0.34 : 0.13);
        ctx.fillStyle = tc;
        ctx.fillText(String(j + 1).padStart(3, '0'), gx, y);
        ctx.globalAlpha = cov * (isHot ? 0.42 : 0.19);
        ctx.fillText(s, cx0, y);
        if (W > H * 1.2 && ih(sd, j, 3) % 3 === 0) { ctx.globalAlpha = cov * 0.1; ctx.fillText(CODE_T[ih(sd, j, 4) % CODE_T.length](ih(sd, j, 5) % 2000, ih(sd, j, 6) % 2000, j), W * 0.58, y); }
      }
      ctx.restore();
    }
    // 歌詞: 白い極太 + RGBずれ + 横スライスのジッタ(登場後に収束、拍で時々ちょっとだけ)
    const it = lyricItem(env, W / 2, H / 2, W * 0.78, H * (env.portrait ? 0.34 : 0.42), { cap: m * 0.26, item: { color: tc, delay: 0.12 } });
    const bp = beatPos(env), bk = Math.floor(bp);
    const settle = 1 - E.outCubic(clamp((env.lt - 0.12) / 0.8));
    const burst = env.lt > 1 && ih(sd, bk, 11) % 4 === 0 ? Math.exp(-(bp - bk) * M.beatLen(env) / 0.09) * 0.35 : 0;
    const g = Math.max(settle, burst);
    let bb = null;
    if (g > 0.02) {
      const st = env.step;
      L.itemBands(env, it, 7, i => (ir(sd + st, i, 3) < 0.55 ? L.rs(sd, 'gj', i, st) * it.size * 0.3 * g : 0));
      const dx = it.size * 0.07 * g;
      const c1 = sc.accent, c2 = L.contrast(sc.accent2, plateC) > 1.6 ? sc.accent2 : sc.fg;
      bb = L.unionBB(bb, L.mainDraw(env, Object.assign({}, it, { x: it.x - dx, color: c1, alpha: 0.75 * clamp(g * 2), plain: true, ghost: false, bands: null })));
      bb = L.unionBB(bb, L.mainDraw(env, Object.assign({}, it, { x: it.x + dx, color: c2, alpha: 0.75 * clamp(g * 2), plain: true, ghost: false, bands: null })));
    }
    bb = L.unionBB(bb, L.mainDraw(env, it));
    // 点滅するブロックカーソル(最終行の後ろ)
    const mm = L.measure(it);
    let lx = -mm.w / 2, ly = 0, lmax = -1;
    for (const gl of mm.lay) { if (gl.line > lmax) { lmax = gl.line; lx = -1e9; } if (gl.line === lmax) { lx = Math.max(lx, gl.x + gl.w / 2); ly = gl.y; } }
    const on = env.lt < 0.9 || frac(bp) < 0.5;
    const ca = cov * clamp((env.lt - Math.max(0.2, cut.inDur * 0.8)) / 0.15) * (1 - clamp(env.pOut * 2.5));
    if (on && ca > 0.01) env.rect(it.x + lx + it.size * 0.12, it.y + ly - it.size * 0.42, it.size * 0.46, it.size * 0.84, tc, ca * 0.9, false);
    return bb;
  },
}, P);

/* ================================================================ 5. ハーフトーン球 */
const HT_SHAPES = ['circle', 'plus', 'square', 'diamond'];
const addShape = (path, kind, x, y, r) => {
  if (r <= 0.05) return;
  if (kind === 'plus') { const t = r * 0.42; path.rect(x - r, y - t, r * 2, t * 2); path.rect(x - t, y - r, t * 2, r * 2); }
  else if (kind === 'square') { const s = r * 0.86; path.rect(x - s, y - s, s * 2, s * 2); }
  else if (kind === 'diamond') { const s = r * 1.12; path.moveTo(x, y - s); path.lineTo(x + s, y); path.lineTo(x, y + s); path.lineTo(x - s, y); path.closePath(); }
  else { path.moveTo(x + r, y); path.arc(x, y, r, 0, TAU); }
};
L.register('layout', 's_halftone', {
  name: 'ハーフトーン球', tags: ['graphic', 'editorial', 'cyber', 'pop'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 30,
  plan: rng => ({ variant: rng.pick(['sphere', 'sphere', 'ripple']), flip: rng.chance(0.5), n: rng.int(22, 26), spin: rng.sign(), a0: rng.range(0, 6.28) }),
  render(env) {
    const { u, sc, cut } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5);
    const s = split(env, 0.46, p.flip);
    const sd = seedOf(env);
    const ripple = p.variant === 'ripple';
    const Rg = Math.min(s.g.w, s.g.h) * (ripple ? 0.46 : 0.45);
    const cx = s.g.x, cy = s.g.y;
    const N = ripple ? 15 : Math.min(28, p.n || 24);
    const sp = Rg * 2 / N;
    let lbl = '';
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const pA = new Path2D(), pB = new Path2D(), pC = new Path2D();
      const kk = kick(env);
      if (!ripple) {
        const a = (p.a0 || 0) + (p.spin || 1) * (env.ltb * 0.55 + stepped(env, 0.5, E.inOutCubic) * 0.35);
        const lx = Math.cos(a) * 0.78, ly = -0.25 + Math.sin(a) * 0.5, lz = 0.42, ln = Math.hypot(lx, ly, lz);
        for (let j = 0; j < N + 4; j++) for (let i = 0; i < N + 4; i++) {
          const dx = ((i - 2) + 0.5) / N * 2 - 1, dy = ((j - 2) + 0.5) / N * 2 - 1, d2 = dx * dx + dy * dy;
          if (d2 > 1.32) continue;
          const d = Math.sqrt(d2);
          const q = E.outBack(clamp(env.lt * 2.4 - d * 0.9), 1.3) * (1 - E.inCubic(clamp(env.pOut * 1.6 - (1 - Math.min(1, d)) * 0.6)));
          if (q <= 0.01) continue;
          const x = cx + dx * Rg, y = cy + dy * Rg;
          if (d2 <= 1) {
            const nz = Math.sqrt(1 - d2), sh = Math.max(0, (dx * lx + dy * ly + nz * lz) / ln);
            const rad = sp * 0.5 * (0.1 + 0.86 * Math.pow(sh, 0.85)) * (1 + kk * 0.1) * q;
            addShape(pA, 'circle', x, y, rad);
          } else if (ir(sd, i, j) < 0.34) {
            const rad = sp * (0.2 + 0.1 * Math.sin(env.ltb * 3 + i + j)) * (1 + kk * 0.5) * q;
            addShape(pB, 'circle', x, y, rad);
          }
        }
        ctx.save(); ctx.globalAlpha = io;
        ctx.fillStyle = sc.fg; ctx.fill(pA);
        ctx.fillStyle = sc.accent; ctx.fill(pB);
        // 光源の位置(外周を回る小さな点)
        const Lx = cx + (lx / ln) * Rg * 1.22, Ly = cy + (ly / ln) * Rg * 1.22;
        ctx.globalAlpha = io * 0.9; ctx.strokeStyle = sc.accent2; ctx.lineWidth = Math.max(1, u * 1.5);
        ctx.beginPath(); ctx.arc(Lx, Ly, Math.max(2, sp * 0.45), 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(Lx, Ly, Math.max(1, sp * 0.15), 0, TAU); ctx.fillStyle = sc.accent2; ctx.fill();
        ctx.restore();
        lbl = `LIGHT ${String(Math.round(((a * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}°`;
      } else {
        // 波紋: 中心から 円→十字→四角→菱形、色が伝染
        const bp = beatPos(env), paths = [pA, pB, pC];
        let stage = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const dx = (i + 0.5) / N * 2 - 1, dy = (j + 0.5) / N * 2 - 1, d = Math.hypot(dx, dy);
          const q = E.outBack(clamp(env.lt * 2.6 - d * 0.8), 1.3) * (1 - E.inCubic(clamp(env.pOut * 1.6 - (1.4 - d) * 0.4)));
          if (q <= 0.01) continue;
          const w = bp * 0.8 - d * 1.15;
          const k = Math.max(0, Math.floor(w)), f = w < 0 ? 0.5 : w - k;
          const sc2 = w < 0 ? 1 : f < 0.14 ? E.outBack(f / 0.14, 1.8) : f > 0.9 ? 1 - E.inQuad((f - 0.9) / 0.1) * 0.85 : 1;
          const kc = Math.max(0, Math.floor(w - 0.25));
          if (d < 0.1) stage = k;
          addShape(paths[kc % 3], HT_SHAPES[k % 4], cx + dx * Rg, cy + dy * Rg, sp * 0.36 * sc2 * q * (1 + kick(env) * 0.08));
        }
        ctx.save(); ctx.globalAlpha = io;
        ctx.fillStyle = sc.fg; ctx.fill(pA);
        ctx.fillStyle = sc.accent2; ctx.fill(pB);
        ctx.fillStyle = sc.accent; ctx.fill(pC);
        ctx.restore();
        lbl = `RIPPLE ${M.pad2(stage + 1)} / ${HT_SHAPES[stage % 4].toUpperCase()}`;
      }
    }
    if (lbl) { if (s.stack) label(env, lbl, s.g.x - s.g.w / 2, s.g.y - s.g.h / 2 + u * 8, io * 0.75); else label(env, lbl, cx, cy + Rg * (ripple ? 1.1 : 1.3) + u * 6, io * 0.75, { anchor: 'center' }); }
    return L.mainDraw(env, lyricItem(env, s.t.x, s.t.y, s.t.w, s.t.h));
  },
}, P);

/* ================================================================ 6. 角柱の高さ場 */
L.register('layout', 's_columns3d', {
  name: '角柱の高さ場', tags: ['graphic', 'cyber', 'pop'], w: 0.9, emph: 1.2, busy: true, fits: n => n >= 1 && n <= 24,
  plan: rng => ({ band: rng.pick(['top', 'bottom', 'bottom']), yaw: rng.range(-0.35, 0.35), ph: rng.range(0, 6.28), dir: rng.sign(), seed: rng.int(1, 9999) }),
  render(env) {
    const { W, H, u, sc, cut, portrait } = env;
    const p = cut.params || {};
    const io = env.inOut(0.5), m = Math.min(W, H);
    const topBand = p.band === 'top';
    const bandH = H * (portrait ? 0.22 : 0.26);
    const by0 = topBand ? 0 : H - bandH;
    const fy0 = topBand ? by0 + bandH : 0, fy1 = topBand ? H : by0;
    const sd = p.seed || seedOf(env);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const cols = portrait ? 8 : W / H < 1.3 ? 10 : 12, rows = portrait ? 11 : 9;
      const sp = 2 / Math.max(cols, rows * 0.9), hw = sp * 0.39;
      const T = env.ltb * 1.3 + stepped(env, 0.4, E.outCubic) * 0.7;
      const kk = kick(env);
      const grow = E.outCubic(clamp(env.lt / 0.8)) * (1 - E.inCubic(env.pOut));
      const bpFrac = frac(beatPos(env));
      const hAt = (x, z) => {
        const w1 = Math.sin(x * 3.1 + z * 1.7 - T * 2.1 + (p.ph || 0)), w2 = Math.sin(z * 4.2 - x * 1.3 + T * 1.3);
        return (0.06 + 0.5 * (0.5 + 0.5 * (w1 * 0.65 + w2 * 0.35)) + kk * 0.06 * Math.max(0, Math.cos(Math.hypot(x, z) * 4 - bpFrac * 6))) * grow;
      };
      const ay = (p.yaw || 0) + Math.sin(env.ltb * 0.25) * 0.12, ax = portrait ? 0.78 : 0.66;
      const dist = 2.1;
      const R = (portrait ? W * 0.56 : Math.min(W * 0.4, H * 0.8)) * (1 + 0.1 * E.inOutSine(clamp(env.lt / Math.max(1, cut.dur))));   // ゆっくり寄る(ドリー)
      const cxS = W / 2, cyS = (fy0 + fy1) / 2 + (fy1 - fy0) * (topBand ? 0.12 : 0.02);
      const proj = (x, y, z) => M.persp(cxS, cyS, R, M.rot3([x, y, z], ax, ay, 0), dist);
      const rotN = v => M.rot3(v, ax, ay, 0);
      const NRM = { f: rotN([0, 0, -1]), b: rotN([0, 0, 1]), l: rotN([-1, 0, 0]), r: rotN([1, 0, 0]) };
      const base = L.mix(sc.fg, sc.bg, 0.1);
      const pal = [base, sc.accent, sc.accent2].map(c => [c, L.mix(c, '#000000', 0.28), L.mix(c, '#000000', 0.5)]);
      const items = [];
      const x0 = -(cols - 1) / 2 * sp, z0 = -(rows - 1) / 2 * sp;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = x0 + i * sp, z = z0 + j * sp;
        const c = rotN([x, 0, z]);
        const hsh = ih(sd, i, j) % 100;
        items.push({ x, z, dz: c[2], ci: hsh < 9 ? 1 : hsh < 16 ? 2 : 0, h: hAt(x, z), q: clamp(grow * 1.6 - (j / rows) * 0.6) });
      }
      // 光沢のある玉
      const bt = env.ltb * 0.55 + (p.ph || 0);
      const bxw = Math.sin(bt) * (cols - 1) / 2 * sp * 0.8 * (p.dir || 1), bzw = Math.sin(bt * 1.7) * (rows - 1) / 2 * sp * 0.5;
      const br = sp * 0.55;
      const bi = clamp(Math.round((bxw - x0) / sp), 0, cols - 1), bj = clamp(Math.round((bzw - z0) / sp), 0, rows - 1);
      const under = items[bj * cols + bi];
      items.push({ ball: true, dz: rotN([bxw, 0, bzw])[2] - 0.001, x: bxw, z: bzw, y: -(under.h + br) });
      items.sort((a, b) => b.dz - a.dz);
      ctx.save(); ctx.lineJoin = 'round';
      ctx.strokeStyle = L.rgba(sc.bg, 0.55); ctx.lineWidth = Math.max(0.5, u * 1);
      for (const c of items) {
        if (c.ball) {
          const v = proj(c.x, c.y, c.z), rr = br * R * v[3] * grow;
          if (rr < 0.5) continue;
          const g = ctx.createRadialGradient(v[0] - rr * 0.35, v[1] - rr * 0.4, rr * 0.05, v[0], v[1], rr);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, sc.accent); g.addColorStop(1, L.mix(sc.accent, '#000000', 0.6));
          ctx.globalAlpha = io; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(v[0], v[1], rr, 0, TAU); ctx.fill();
          continue;
        }
        const h = c.h * c.q;
        const col = pal[c.ci];
        const faces = [];
        const cam = rotN([c.x, -h / 2, c.z]);
        const vis = (n, off) => (n[0] * (cam[0] + off[0]) + n[1] * (cam[1] + off[1]) + n[2] * (cam[2] + off[2] + dist)) < 0;
        const Y = -h, X0 = c.x - hw, X1 = c.x + hw, Z0 = c.z - hw, Z1 = c.z + hw;
        const rh = rotN([hw, 0, 0]), rz = rotN([0, 0, hw]);
        if (vis(NRM.f, [-rz[0], -rz[1], -rz[2]])) faces.push([[X0, Y, Z0], [X1, Y, Z0], [X1, 0, Z0], [X0, 0, Z0], 1]);
        if (vis(NRM.b, rz)) faces.push([[X0, Y, Z1], [X1, Y, Z1], [X1, 0, Z1], [X0, 0, Z1], 1]);
        if (vis(NRM.l, [-rh[0], -rh[1], -rh[2]])) faces.push([[X0, Y, Z0], [X0, Y, Z1], [X0, 0, Z1], [X0, 0, Z0], 2]);
        if (vis(NRM.r, rh)) faces.push([[X1, Y, Z0], [X1, Y, Z1], [X1, 0, Z1], [X1, 0, Z0], 2]);
        faces.push([[X0, Y, Z0], [X1, Y, Z0], [X1, Y, Z1], [X0, Y, Z1], 0]);
        ctx.globalAlpha = io * clamp(c.q * 3);
        for (const f of faces) {
          ctx.beginPath();
          for (let k = 0; k < 4; k++) { const v = proj(f[k][0], f[k][1], f[k][2]); if (k) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }
          ctx.closePath(); ctx.fillStyle = col[f[4]]; ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // 帯の上の歌詞
    const be = E.outCubic(clamp(env.lt / 0.4)) * (1 - E.inCubic(clamp((env.pOut - 0.3) / 0.7)));
    if (be > 0.002) {
      const hh = bandH * be;
      env.rect(0, by0 + (bandH - hh) / 2, W, hh, sc.bg, 0.9, false);
      env.rect(0, (topBand ? by0 + bandH / 2 + hh / 2 : by0 + bandH / 2 - hh / 2) - Math.max(1, u * 1.5), W * be, Math.max(2, u * 3), sc.accent, 1, false);
      const lfs = Math.max(7, u * 16);
      label(env, `FIELD ${portrait ? '08×11' : W / H < 1.3 ? '10×09' : '12×09'} · H-MAP`, W * 0.04, topBand ? by0 + lfs * 1.1 : H - lfs * 1.1, be * 0.7 * (bandH > lfs * 7 && W / H >= 1.3 ? 1 : 0), { color: sc.sub, size: lfs });
    }
    const it = lyricItem(env, W / 2, by0 + bandH / 2, W * 0.86, bandH * 0.74, { cap: m * 0.18 });
    return L.mainDraw(env, it);
  },
}, P);

/* ================================================================ 7. 流れる帯(マーキー) */
const advCache = new Map();
const advances = (ctx, font, glyphs) => {
  const key = font + '|' + glyphs.join('');
  let a = advCache.get(key);
  if (a) return a;
  ctx.font = font;
  a = glyphs.map(g => ctx.measureText(g).width);
  if (advCache.size > 200) advCache.clear();
  advCache.set(key, a);
  return a;
};
const MQ_STYLES = ['bold', 'outline', 'cond', 'wide'];
L.register('layout', 's_marquee', {
  name: '流れる帯', tags: ['pop', 'graphic', 'editorial'], w: 1, emph: 1.3, treat: 'safe', busy: true, fits: n => n >= 1 && n <= 20,
  plan: (rng, cut) => ({ mode: (cut.words || []).length > 1 && rng.chance(0.4) ? 'words' : 'full', s0: rng.int(0, 3), dir: rng.sign(), amp: rng.range(0.35, 0.5) }),
  render(env) {
    const { W, H, u, sc, cut, portrait } = env;
    const p = cut.params || {};
    const m = Math.min(W, H);
    const n = cut.n;
    const two = (portrait && n > 7) || n > 14;
    const side = portrait ? 4 : 3;
    const bandK = two ? 2.3 : 1.4;
    const rh = H / (side * 2 + bandK);
    const bh = rh * bandK;
    const font = L.roleFont(env, 'display');
    const words = (cut.words || []).map(w => String(w.text || '').trim()).filter(Boolean);
    const io = env.inOut(0.45);
    if (env.pass === 'main' && io > 0.002) {
      const ctx = env.ctx;
      const size = rh * 0.8;
      const bpv = stepped(env, 0.35, E.outCubic);
      const phi = beatPos(env) * 0.9 + bpv * 1.4;
      const k = TAU / (W * (portrait ? 0.9 : 0.65));
      const A = p.amp || 0.42;
      ctx.save();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (let r = 0; r < side * 2; r++) {
        const up = r < side, ri = up ? side - 1 - r : r - side;      // 帯からの距離
        const y = up ? H / 2 - bh / 2 - (ri + 0.5) * rh : H / 2 + bh / 2 + (ri + 0.5) * rh;
        const ra = E.outCubic(clamp((env.lt - ri * 0.06) / 0.4)) * (1 - E.inCubic(clamp(env.pOut * 1.3 - (side - 1 - ri) * 0.08)));
        if (ra <= 0.01) continue;
        const style = MQ_STYLES[(r + (p.s0 || 0)) % MQ_STYLES.length];
        const txt = p.mode === 'words' && words.length ? words[r % words.length] : cut.text;
        const gl = L.glyphs(txt);
        const weight = style === 'cond' ? 700 : 900;
        const fstr = `${weight} ${size.toFixed(1)}px ${L.fontFam(font)}`;
        const adv = advances(ctx, fstr, gl);
        const bsx = style === 'cond' ? 0.6 : style === 'wide' ? 1.3 : 1;
        const sepW = size * 0.9;
        let Pw = sepW;
        for (const a of adv) Pw += a * bsx;
        Pw = Math.max(Pw, size);
        const dir = (r % 2 ? 1 : -1) * (p.dir || 1);
        const off = dir * (env.ltb * rh * 0.9 + bpv * rh * 1.1) + (1 - ra) * dir * W * 0.2;
        const ph2 = phi + r * 0.8;
        const X = uu => uu + A / k * Math.sin(k * uu - ph2);
        const dX = uu => 1 + A * Math.cos(k * uu - ph2);
        ctx.font = fstr;
        ctx.globalAlpha = io * ra * (style === 'cond' ? 0.6 : 0.92);
        const col = style === 'cond' ? sc.sub : sc.fg;
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, size * 0.035);
        let x = (((off % Pw) + Pw) % Pw) - Pw - A / k;
        let guard = 0;
        while (x < W + A / k && guard++ < 240) {
          for (let i = 0; i < gl.length && x < W + A / k; i++) {
            const a = adv[i] * bsx, uc = x + a / 2;
            if (gl[i].trim() && uc > -a && X(uc) > -size * 2 && X(uc) < W + size * 2) {
              const gx = X(uc), s = bsx * dX(uc);
              ctx.save(); ctx.translate(gx, y); ctx.scale(s, 1);
              if (style === 'outline') ctx.strokeText(gl[i], 0, 0); else ctx.fillText(gl[i], 0, 0);
              ctx.restore();
            }
            x += a;
          }
          // 区切りの丸
          const uc = x + sepW / 2, gx = X(uc);
          if (gx > -size && gx < W + size) {
            ctx.fillStyle = sc.accent; ctx.beginPath(); ctx.ellipse(gx, y, size * 0.12 * dX(uc), size * 0.12, 0, 0, TAU); ctx.fill(); ctx.fillStyle = col;
          }
          x += sepW;
        }
      }
      ctx.restore();
    }
    // 中央の帯(差し色)。この段の歌詞だけ止まっている
    const be = E.outCubic(clamp(env.lt / 0.35)) * (1 - E.inCubic(clamp((env.pOut - 0.3) / 0.7)));
    if (be > 0.002) {
      const hh = bh * be;
      env.rect(0, H / 2 - hh / 2, W, hh, sc.accent, 1, false);
      const fs = Math.max(7, u * 16);
      label(env, 'LOOP · ' + M.pad2(cut.idx + 1), W * 0.02, H / 2 - hh / 2 + fs * 0.9, be * 0.8 * (hh > fs * 5 && !portrait ? 1 : 0), { color: sc.onInk, size: fs });
    }
    const it = lyricItem(env, W / 2, H / 2, W * 0.88, bh * 0.8, { rows: two ? 2 : 1, cap: bh * 0.8, item: { color: sc.onInk, lead: 1.05 } });
    return L.mainDraw(env, it);
  },
}, P);
})();
