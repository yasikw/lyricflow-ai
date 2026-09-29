/* LyricFlow 演出エンジン: 文字の品格チェック (Hallmark の slop test を歌詞動画へ翻訳)
   各カットを「静止した状態」で縮小キャンバスに一度描き、描かれた文字項目を集めて関門(gate)で判定する。
   L.audit(tl, W, H) → { cuts:[{idx,key,text,issues:[{id,label,fix}]}], pass, total, fonts:[…] }
   L.auditFix(tl, W, H) → 引っかかったカットだけ、原因の部分(構図/加工/装飾/動き/カメラ)を振り直して良い案を採る */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const clamp = L.clamp;

const GATES = {
  safe: { ok: 'セーフゾーンに収まっている', label: '文字が画面の端(セーフゾーン)からはみ出す', fix: 'layout' },
  small: { ok: '歌詞が読める大きさ', label: '歌詞が小さすぎて読みにくい', fix: 'layout' },
  mvSmall: { ok: '歌詞が画面を主役として占めている(MVの大きさ)', label: 'MVとしては歌詞が小さい(幅58%・高さ30%未満)', fix: 'layout' },
  orphan: { ok: '1字だけの行がない', label: '1字だけの行ができている', fix: 'layout' },
  capsLead: { ok: '欧文大文字の行送りが適切', label: '欧文大文字の行送りが詰まりすぎ(行がぶつかる)', fix: 'layout' },
  fonts: { ok: '1画面の書体は3種まで(2+1)', label: '1画面に書体が4種以上(2+1 まで)', fix: 'layout' },
  contrast: { ok: '背景とのコントラストが足りている', label: '背景に対して文字のコントラストが低い', fix: 'treat' },
  glow: { ok: 'グラデ/光彩の文字は強調だけ', label: 'グラデ/光彩/クロームの文字(強調でないカット)', fix: 'treat' },
  clutter: { ok: '動きが1つの振付にまとまっている', label: '装飾・カメラの動きが多すぎる(動きは1つの振付に)', fix: 'decor' },
  bounce: { ok: '跳ねる動きは強調だけ', label: '跳ねる/弾む動き(強調でないカット)', fix: 'motion' },
  fakeNum: { ok: '歌詞に無い数字を作っていない', label: '歌詞に無い数字(統計・割合・グラフ)を見せている', fix: 'layout' },
};
L.AUDIT_GATES = GATES;
const BOUNCY = /spring|elastic|jelly|[bB]ounce|squash|[rR]ubber|hop|pendulum|tumble|balloon/;
const GLOWY = new Set(['glowShadow', 'gradAccent', 'chrome', 'longShadow', 'extrude3d', 'patternFill', 'jitter', 'baseWave']);
const fam = f => String(f || '').split(',')[0].replace(/['"]/g, '').trim();

let auditCanvas = null;
function canvasFor(W, H) {
  const k = Math.min(1, 640 / Math.max(W, H));
  const w = Math.max(64, Math.round(W * k)), h = Math.max(64, Math.round(H * k));
  if (!auditCanvas) auditCanvas = document.createElement('canvas');
  if (auditCanvas.width !== w || auditCanvas.height !== h) { auditCanvas.width = w; auditCanvas.height = h; }
  return auditCanvas;
}

/* 1カットを静止状態で描いて関門を判定 */
function auditCut(tl, cut, cuts, W, H) {
  const cm = tl.compose || {};
  const cv = canvasFor(W, H);
  const w = cv.width, h = cv.height, ref = Math.min(w, h);
  L.resolveCut(tl, cut, cuts, w, h);
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const eng = { timeline: tl, quality: 'full', sceneAt: () => null };
  const st0 = L.getStyle(cm.style);
  L.setTypo(cm, cm.fonts ? { fonts: Object.assign({}, (st0 && st0.fonts) || {}, cm.fonts) } : st0, w, h);
  const env = L.makeEnv(eng, ctx, cut.start, w, h, cut, 0.5, 1);
  const rest = Math.min(cut.inDur + 0.45, Math.max(cut.inDur + 0.05, cut.dur - cut.outDur - 0.05));
  const t = cut.start + Math.max(0.02, Math.min(rest, cut.dur * 0.95));
  L._collect = [];
  try { L.drawCut(env, t, { cm, noGhost: true }); } catch (e) { /* 判定できないカットは素通り */ }
  const items = L._collect || [];
  L._collect = null;
  const plan = cut.plan || {};
  const lay = cut.layoutDef || {};
  const emph = !!(cut.emph || cut.emphMark || cut.impact);
  const issues = [];
  const add = id => { if (!issues.some(x => x.id === id)) issues.push(Object.assign({ id }, GATES[id])); };
  const mains = items.filter(x => x.main && x.alpha > 0.3 && x.it.text && String(x.it.text).trim());
  let ub = null;
  for (const x of mains) ub = L.unionBB(ub, x.bb);
  if (ub) {
    const mx = w * 0.03, my = h * 0.03;
    if (ub.x0 < mx || ub.x1 > w - mx || ub.y0 < my || ub.y1 > h - my) add('safe');
  }
  if (mains.length) {
    const maxS = Math.max(...mains.map(x => x.it.size * Math.max(Math.abs(x.it.sx == null ? 1 : x.it.sx), Math.abs(x.it.sy == null ? 1 : x.it.sy))));
    if (maxS < ref * 0.045) add('small');
    // MV の基準: 16字までの行は、歌詞が画面の幅の半分か高さの1/4以上を占める(Hallmark のウェブ用上限より大きく)
    if (ub && cut.n <= 16 && ub.w < w * 0.58 && ub.h < h * 0.3) add('mvSmall');
  }
  for (const x of mains) {
    const lay0 = x.m.lay;
    const per = {};
    for (const g of lay0) if (!g.space && !L.isPunct(g.ch)) per[g.line] = (per[g.line] || 0) + 1;
    const counts = Object.values(per);
    if (counts.length >= 2 && cut.n >= 4 && counts.some(c => c === 1)) add('orphan');
    const txt = String(x.it.text);
    if (x.it.lead != null && x.it.lead < 1 && /\n/.test(txt) && /[A-Z]/.test(txt) && txt === txt.toUpperCase() && !/[぀-ヿ一-鿿]/.test(txt)) add('capsLead');
    if (x.it.fill !== false && !x.it.gradient && !lay.busy && lay.treat !== 'safe' && typeof x.it.color === 'string' && /^#/.test(x.it.color)
        && L.contrast(x.it.color, env.sc.bg) < 3) add('contrast');
  }
  const fams = new Set(items.filter(x => x.alpha > 0.15).map(x => fam(L.lockFont(x.it.font || L.DEFAULT_FONTS.display))));
  if (fams.size > 3) add('fonts');
  if (plan.treat && GLOWY.has(plan.treat) && !emph) add('glow');
  const nDecor = (plan.decor || []).length;
  const camStrong = cut.camDef && cut.camDef.strong;
  if (nDecor >= 3 || (!emph && (nDecor >= 2 && plan.cam || camStrong))) add('clutter');
  if (/^n_(stats|pctswap|waffle|donut|bars|linegraph|hbar|odometer|countup|countdown|tally)$/.test(plan.layout || '') && !/[0-9０-９]/.test(cut.text)) add('fakeNum');
  if (!emph && ((plan.enter && BOUNCY.test(plan.enter)) || (plan.exit && BOUNCY.test(plan.exit)))) add('bounce');
  return { idx: cut.idx, key: cut.line + ':' + cut.part, text: cut.text, issues, fonts: Array.from(fams), locked: !!plan.locked };
}

L.audit = (tl, W, H) => {
  const cuts = L.buildCuts(tl);
  const out = { cuts: [], pass: 0, total: 0, fonts: [] };
  const allF = new Set();
  const nG = Object.keys(GATES).length;
  for (const c of cuts) {
    const r = auditCut(tl, c, cuts, W, H);
    out.cuts.push(r);
    out.total += nG; out.pass += nG - r.issues.length;
    r.fonts.forEach(f => allF.add(f));
  }
  out.fonts = Array.from(allF);
  // 画面を跨いだ書体の数(動画全体で揃っているか)
  out.fontWarn = out.fonts.length > 4;
  return out;
};

/* 引っかかったカットを振り直す: 原因の部分だけ最大6案試し、関門に最も多く通る案を採用 */
L.auditFix = (tl, W, H, opts = {}) => {
  const only = opts.only ? new Set(opts.only) : null;             // 例 {only:['mvSmall','small']} = 大きさだけ直す
  const cnt = r => (only ? r.issues.filter(x => only.has(x.id)).length : r.issues.length);
  const cm = tl.compose = tl.compose || {};
  const st = L.getStyle(cm.style);
  const moods = [].concat(cm.mood ? [cm.mood] : [], (st && st.moods) || []);
  const cuts = L.buildCuts(tl);
  cm.cuts = cm.cuts || {};
  let fixed = 0, tried = 0;
  cuts.forEach((cut, i) => {
    const key = cut.line + ':' + cut.part;
    const cur = cm.cuts[key];
    if (cur && cur.locked) return;
    let best = auditCut(tl, cut, cuts, W, H);
    if (!cnt(best)) return;
    tried++;
    const bestPlan0 = cm.cuts[key] || cut.plan;
    let bestPlan = bestPlan0, bestN = cnt(best), bestAll = best.issues.length;
    const drops = new Set(best.issues.filter(x => !only || only.has(x.id)).map(x => x.fix));
    for (let k = 1; k <= (opts.tries || 6) && bestN > 0; k++) {
      const keep = Object.assign({}, bestPlan0);
      if (drops.has('layout')) { delete keep.layout; delete keep.params; }
      if (drops.has('treat')) { delete keep.treat; delete keep.treatP; }
      if (drops.has('decor')) { delete keep.decor; delete keep.cam; delete keep.camP; }
      if (drops.has('motion')) { delete keep.enter; delete keep.exit; delete keep.hold; }
      const reroll = ((bestPlan0 && bestPlan0.reroll) || 0) + k * 17;
      const rng = L.rng(L.h(cm.seed || 1, 'plan', cut.line, cut.part, reroll));
      const cand = L.planCut(cut, { rng, st, moods, cm: only ? cm : Object.assign({}, cm, { typo: 'full' }), portrait: H > W, recent: {}, W, H, keep, prevCut: cuts[i - 1], seed: cm.seed || 1 });
      cand.reroll = reroll;
      cm.cuts[key] = cand;
      cm.planVersion = (cm.planVersion || 0) + 1;
      const r = auditCut(tl, cut, cuts, W, H);
      const n = cnt(r);
      if (n < bestN || (n === bestN && r.issues.length < bestAll && bestPlan !== bestPlan0)) { bestN = n; bestAll = r.issues.length; bestPlan = cand; }
    }
    cm.cuts[key] = bestPlan;
    if (bestPlan !== bestPlan0) fixed++;
  });
  cm.planVersion = (cm.planVersion || 0) + 1;
  return { fixed, tried };
};
})();
