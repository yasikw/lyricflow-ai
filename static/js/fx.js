/* =====================================================================
 * LyricFlow AI — Anime FX Engine
 * Canvas 2Dベースのアニメ調演出エンジン。
 * シーン背景(パララックス) / パーティクル / 単語単位歌詞アニメーション /
 * ポストプロセス (Bloom・Glitch・色収差・Wave Distortion) を実装。
 * 曲のエネルギー(RMSエンベロープ)とシーン解析結果に連動して強度が変化する。
 * ===================================================================== */
class FXEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // 歌詞・ポスト処理用のオフスクリーンレイヤー
    this.textLayer = document.createElement('canvas');
    this.tctx = this.textLayer.getContext('2d');
    this.post = document.createElement('canvas');
    this.pctx = this.post.getContext('2d');
    // ブルーム用の低解像度バッファ (whole-frame blur add)
    this.bloom = document.createElement('canvas');
    this.bctx = this.bloom.getContext('2d');
    this.particles = [];
    this.pTime = -1;
    this.rand = this._seededRand(42);
    this.timeline = null;
    this.quality = 'full';
    this._grain = null;
  }

  _grainTile() {
    if (this._grain) return this._grain;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.floor(Math.random() * 90);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this._grain = c;
    return c;
  }

  _seededRand(seed) {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }

  setTimeline(tl) {
    this.timeline = tl;
    this.particles = [];
    this.pTime = -1;
    // 前景キャラ/被写体の画像を読み込み
    const url = tl && tl.subject && tl.subject.url;
    if (url && this._subjUrl !== url) {
      this._subjUrl = url;
      this._subjImg = new Image();
      this._subjImg.crossOrigin = 'anonymous';
      this._subjImg.src = url;
    } else if (!url) {
      this._subjImg = null; this._subjUrl = null;
    }
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.textLayer.width = w; this.textLayer.height = h;
      this.post.width = w; this.post.height = h;
      this.particles = [];
    }
  }

  /* t秒時点のエネルギー(0..1) */
  energyAt(t) {
    const tl = this.timeline;
    if (!tl || !tl.envelope || !tl.envelope.length) return 0.5;
    const i = Math.min(tl.envelope.length - 1, Math.max(0, Math.floor(t / (tl.hop || 0.1))));
    const mx = tl.envMax || (tl.envMax = Math.max(...tl.envelope, 0.0001));
    return Math.min(1, tl.envelope[i] / mx);
  }

  sceneAt(t) {
    const scenes = this.timeline?.scenes || [];
    return scenes.find(s => t >= s.start && t < s.end) || null;
  }

  /* サビは演出強度を上げる (仕様 2.4.2) */
  boostAt(t) {
    const sc = this.sceneAt(t);
    if (!sc) return 1;
    return sc.label === 'Chorus' ? 1.55 : sc.label === 'Intro' || sc.label === 'Outro' ? 0.6 : sc.label === 'Bridge' ? 0.8 : 1;
  }

  render(t, opts = {}) {
    const tl = this.timeline;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    if (!tl || !W) return;
    const colors = tl.colors || { bg1: '#0d1117', bg2: '#1a2040', accent: '#00d4ff', accent2: '#7b2ff7', text: '#fff' };
    const energy = this.energyAt(t);
    const boost = this.boostAt(t);
    const fx = tl.fx || {};
    const fxActive = this._activeFx(t);

    ctx.clearRect(0, 0, W, H);
    this._drawScene(ctx, t, W, H, colors, energy, boost);
    // 光芒 (God rays) — 背景の上・前景/歌詞の下に敷く
    const godray = (fxActive.godray ?? fx.godray ?? 0);
    if (godray > 0.04 && this.quality !== 'draft') this._godRays(ctx, t, W, H, colors, godray * (0.6 + energy * boost * 0.6));
    this._stepParticles(ctx, t, W, H, colors, energy * boost);
    // 被写界深度 (Depth of Field) — 背景/粒子をフォーカス帯の外でぼかす
    const dof = (fxActive.dof ?? fx.dof ?? 0);
    if (dof > 0.05 && this.quality !== 'draft') this._dof(ctx, W, H, dof);
    // 前景キャラ/被写体レイヤー (任意アップロード素材)
    this._drawSubject(ctx, t, W, H, energy, boost);
    if (!this.hideLyrics) this._drawLyrics(t, W, H, colors, energy, boost, fx);   // タップ同期中は歌詞を隠す
    this._drawOverlays(ctx, t, W, H, colors);

    // ---- post processing ----
    const glitchAmt = (fxActive.glitch ?? fx.glitch ?? 0) * boost * (0.35 + energy);
    if (glitchAmt > 0.08 && this.quality !== 'draft') this._glitch(ctx, W, H, glitchAmt, t);
    const waveAmt = (fxActive.wave ?? fx.wave ?? 0);
    if (waveAmt > 0.05) this._wave(ctx, W, H, waveAmt * (0.5 + energy * boost), t);
    // 本物の多段ブルーム (明部を抽出してブラー加算)
    const bloom = (fxActive.bloom ?? fx.bloom ?? 0.5) * boost;
    if (bloom > 0.05) this._bloom(W, H, bloom * (0.55 + energy * 0.5));
    // レンズフレア (光源からの筋) — サビ/高エネルギーで強調
    const flare = (fxActive.flare ?? fx.flare ?? 0);
    if (flare > 0.04 && this.quality !== 'draft') this._lensFlare(ctx, t, W, H, colors, flare * (0.4 + energy * boost * 0.7));
    this._grade(ctx, W, H, energy);      // カラーグレード + フィルムグレイン
    this._vignette(ctx, W, H);
    if (tl.watermark) this._watermark(ctx, W, H);
    ctx.filter = 'none';
  }

  /* 前景の被写体(キャラ)レイヤー: アップロード画像をリムライト+浮遊+呼吸で演出 */
  _drawSubject(ctx, t, W, H, energy, boost) {
    const sub = this.timeline?.subject;
    if (!sub || !this._subjImg || !this._subjImg.complete || !this._subjImg.naturalWidth) return;
    const img = this._subjImg;
    const scale = (sub.scale || 0.72) * (1 + Math.sin(t * 1.6) * 0.006 + energy * boost * 0.01); // 呼吸
    const ih = H * scale, iw = ih * (img.naturalWidth / img.naturalHeight);
    const cx = W * (sub.x ?? 0.5), by = H * (sub.y ?? 0.98);           // 接地位置
    const floatY = Math.sin(t * 1.1) * H * 0.008;                       // 浮遊
    const x = cx - iw / 2, y = by - ih + floatY;
    ctx.save();
    // 接地の影
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.ellipse(cx, by - H * 0.01, iw * 0.32, H * 0.02, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // リムライト (加算で縁を光らせる)
    if (this.quality !== 'draft') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + energy * 0.3;
      ctx.filter = `drop-shadow(0 0 ${Math.max(4, W / 240)}px ${this._alpha(this.timeline.colors?.accent || '#00d4ff', 0.9)})`;
      ctx.drawImage(img, x, y, iw, ih);
      ctx.restore();
    }
    ctx.drawImage(img, x, y, iw, ih);
    ctx.restore();
  }

  /* 光芒 (God rays): 光源から扇状に伸びる加算の光の筋 */
  _godRays(ctx, t, W, H, C, amt) {
    const lx = W * (this.timeline?.lightX ?? 0.5), ly = H * (this.timeline?.lightY ?? 0.18);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i - n / 2) * 0.22 + Math.sin(t * 0.2 + i) * 0.02;
      const len = Math.hypot(W, H);
      const spread = 0.06 + 0.03 * Math.sin(t * 0.7 + i * 1.7);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang + Math.PI);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, this._alpha(C.accent, 0.0));
      g.addColorStop(0.04, this._alpha(i % 2 ? C.accent2 : C.accent, amt * 0.16));
      g.addColorStop(1, this._alpha(C.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-len * spread, len);
      ctx.lineTo(len * spread, len);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 光源のグロー
    const gg = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.25);
    gg.addColorStop(0, this._alpha('#ffffff', amt * 0.18));
    gg.addColorStop(0.3, this._alpha(C.accent, amt * 0.12));
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* レンズフレア: 光源から画面反対側へ並ぶ光の玉 + アナモルフィックな横筋 */
  _lensFlare(ctx, t, W, H, C, amt) {
    const lx = W * (this.timeline?.lightX ?? 0.5), ly = H * (this.timeline?.lightY ?? 0.18);
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 横方向アナモルフィック筋
    const streak = ctx.createLinearGradient(0, ly, W, ly);
    streak.addColorStop(0, 'rgba(0,0,0,0)');
    streak.addColorStop(0.5, this._alpha(C.accent, amt * 0.5));
    streak.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, ly - H * 0.006, W, H * 0.012);
    // フレアの玉
    const dx = cx - lx, dy = cy - ly;
    const cols = [C.accent, C.accent2, '#ffffff', C.accent2];
    for (let i = 1; i <= 5; i++) {
      const f = i * 0.42;
      const px = lx + dx * f, py = ly + dy * f;
      const r = (W * 0.02) * (1 + (i % 2) * 0.8) * (0.7 + amt);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, this._alpha(cols[i % cols.length], amt * 0.3));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* 被写界深度: フォーカス帯(歌詞の高さ)以外をぼかす */
  _dof(ctx, W, H, amt) {
    const p = this.pctx;
    if (this.post.width !== W || this.post.height !== H) { this.post.width = W; this.post.height = H; }
    p.clearRect(0, 0, W, H);
    p.filter = `blur(${Math.max(2, amt * W / 140)}px)`;
    p.drawImage(this.canvas, 0, 0);
    p.filter = 'none';
    // フォーカス帯の外(上/下)だけブラー版を重ねる
    const band = H * 0.30, mid = H * (this.canvas.height > this.canvas.width ? 0.5 : 0.56);
    ctx.save();
    const tmp = this.bloom; // 一時流用
    if (tmp.width !== W || tmp.height !== H) { tmp.width = W; tmp.height = H; }
    const tctx = this.bctx;
    const grad = tctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(Math.max(0, (mid - band) / H), 'rgba(0,0,0,0)');
    grad.addColorStop(Math.min(1, (mid + band) / H), 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, W, H);
    tctx.drawImage(this.post, 0, 0);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  /* 明部ベースのブルーム: フレームを縮小→自己乗算で明部を強調→ブラー加算。安価だが発光感が出る */
  _bloom(W, H, strength) {
    if (this.quality === 'draft') { this._bloomFlash(this.ctx, W, H, this.timeline.colors || {}, strength * 0.2); return; }
    const bw = Math.max(200, W >> 2), bh = Math.max(112, H >> 2);
    if (this.bloom.width !== bw || this.bloom.height !== bh) { this.bloom.width = bw; this.bloom.height = bh; }
    const b = this.bctx, ctx = this.ctx;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, bw, bh);
    b.drawImage(this.canvas, 0, 0, bw, bh);
    b.globalCompositeOperation = 'multiply';        // 自己乗算で明部を残し暗部を落とす(擬似しきい値)
    b.drawImage(this.canvas, 0, 0, bw, bh);
    b.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(2, W / 300)}px)`;  // タイトなコア
    ctx.globalAlpha = Math.min(0.95, strength);
    ctx.drawImage(this.bloom, 0, 0, W, H);
    ctx.filter = `blur(${Math.max(5, W / 110)}px)`;  // 広いハロー
    ctx.globalAlpha = Math.min(0.6, strength * 0.65);
    ctx.drawImage(this.bloom, 0, 0, W, H);
    ctx.restore();
    ctx.filter = 'none';
  }

  /* 軽いカラーグレード(コントラスト持ち上げ)とフィルムグレイン */
  _grade(ctx, W, H, energy) {
    if (this.quality === 'draft') return;
    // シャドウを僅かにパープル寄せ + ハイライトをシアン寄せの映画的トーン
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.18;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1830'); g.addColorStop(0.5, '#141414'); g.addColorStop(1, '#1a0a24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // フィルムグレイン
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.05 + energy * 0.03;
    const tile = this._grainTile();
    const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(ox, oy, W + 128, H + 128);
    ctx.restore();
  }

  _watermark(ctx, W, H) {
    // Freeプランの透かし (仕様 9.1)
    ctx.save();
    const fs = Math.max(13, W * 0.018);
    ctx.font = `700 ${fs}px 'Noto Sans JP', sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText('♪ LyricFlow AI', W - fs * 0.9, H - fs * 0.9);
    ctx.restore();
  }

  _activeFx(t) {
    const out = {};
    for (const c of this.timeline?.tracks?.effects || []) {
      if (t >= c.start && t < c.end) out[c.type] = c.intensity;
    }
    return out;
  }

  /* ---------------- scenes ---------------- */
  _drawScene(ctx, t, W, H, C, energy, boost) {
    const scene = (this.timeline.tracks?.background || []).find(b => t >= b.start && t < b.end)?.scene
      || this.timeline.sceneDefault || 'city';
    // 背景グラデーション(全面・変形なし)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (scene === 'flat') return;
    // ゆっくりしたカメラドリフト(Ken Burns)。サビでビート連動のズームを僅かに強める
    ctx.save();
    const beat = 1 + energy * boost * 0.012;
    const zoom = (1.06 + 0.025 * Math.sin(t * 0.09)) * beat;
    const px = Math.sin(t * 0.05) * W * 0.012, py = Math.cos(t * 0.043) * H * 0.012;
    ctx.translate(W / 2 + px, H / 2 + py);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    if (scene === 'city') this._sceneCity(ctx, t, W, H, C, energy);
    else if (scene === 'grid') this._sceneGrid(ctx, t, W, H, C, energy * boost);
    else if (scene === 'stars' || scene === 'sky') this._sceneSky(ctx, t, W, H, C, scene === 'stars');
    else if (scene === 'sunset') this._sceneSunset(ctx, t, W, H, C, energy);
    else if (scene === 'stage') this._sceneStage(ctx, t, W, H, C, energy, boost);
    ctx.restore();
  }

  /* コンサートステージ: 反射する床 + 上方からのスポットライト + ヘイズ (アニメMV定番) */
  _sceneStage(ctx, t, W, H, C, energy, boost) {
    const horizon = H * 0.66;
    // 床 (グラデ + 反射のハイライト)
    const fg = ctx.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, this._alpha(C.accent2, 0.10));
    fg.addColorStop(0.5, '#05070d');
    fg.addColorStop(1, this._alpha(C.accent, 0.06));
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizon, W, H - horizon);
    // 床の反射ライン (奥行き)
    ctx.save();
    ctx.strokeStyle = this._alpha(C.accent, 0.10 + energy * 0.1);
    ctx.lineWidth = Math.max(1, W / 1100);
    for (let i = 1; i <= 8; i++) {
      const y = horizon + Math.pow(i / 8, 2) * (H - horizon);
      ctx.globalAlpha = 1 - i / 10;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
    // スポットライト (上方から複数, 加算)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lights = 3;
    for (let i = 0; i < lights; i++) {
      const sx = W * (0.28 + 0.22 * i) + Math.sin(t * 0.5 + i * 2) * W * 0.06;
      const topX = W * (0.3 + 0.2 * i);
      const col = i === 1 ? C.accent : C.accent2;
      const g = ctx.createLinearGradient(topX, 0, sx, horizon + H * 0.12);
      g.addColorStop(0, this._alpha(col, 0.18 + energy * boost * 0.12));
      g.addColorStop(1, this._alpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(topX - W * 0.02, 0);
      ctx.lineTo(topX + W * 0.02, 0);
      ctx.lineTo(sx + W * 0.14, horizon + H * 0.14);
      ctx.lineTo(sx - W * 0.14, horizon + H * 0.14);
      ctx.closePath();
      ctx.fill();
      // 床のスポット
      const fgr = ctx.createRadialGradient(sx, horizon + H * 0.05, 0, sx, horizon + H * 0.05, W * 0.16);
      fgr.addColorStop(0, this._alpha(col, 0.14 + energy * 0.1));
      fgr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fgr;
      ctx.beginPath(); ctx.ellipse(sx, horizon + H * 0.06, W * 0.16, H * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 星/塵
    const r = this._seededRand(19);
    ctx.save();
    for (let i = 0; i < 60; i++) {
      const x = r() * W, y = r() * horizon;
      ctx.globalAlpha = (0.3 + 0.6 * Math.abs(Math.sin(t + i))) * 0.6;
      ctx.fillStyle = i % 5 === 0 ? C.accent : '#dfeaff';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
  }

  _sceneCity(ctx, t, W, H, C, energy) {
    // 星
    const r = this._seededRand(7);
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * H * 0.55;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + r() * 2) + i));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = i % 9 === 0 ? C.accent : '#cfe6ff';
      ctx.fillRect(x, y, i % 13 === 0 ? 2.2 : 1.3, i % 13 === 0 ? 2.2 : 1.3);
    }
    ctx.restore();
    // ビル群 2層パララックス
    for (const [layer, speed, hgt, alpha] of [[0, 6, 0.30, 0.55], [1, 14, 0.42, 0.95]]) {
      const rb = this._seededRand(20 + layer);
      ctx.save();
      ctx.globalAlpha = alpha;
      const bw = W / 14;
      const off = (t * speed) % (bw * 2);
      for (let i = -2; i < 17; i++) {
        const bh = H * hgt * (0.4 + rb() * 0.6);
        const x = i * bw - off;
        ctx.fillStyle = layer ? '#070b14' : '#0d1526';
        ctx.fillRect(x, H - bh, bw * (0.62 + rb() * 0.3), bh);
        if (layer) { // 窓の灯り
          ctx.fillStyle = rb() > 0.5 ? C.accent : C.accent2;
          for (let wY = 0; wY < 5; wY++) for (let wX = 0; wX < 2; wX++) {
            if (rb() > 0.55) {
              ctx.globalAlpha = alpha * (0.25 + 0.45 * rb()) * (0.6 + energy * 0.6);
              ctx.fillRect(x + 6 + wX * 12, H - bh + 10 + wY * (bh / 6), 4, 5);
              ctx.globalAlpha = alpha;
            }
          }
        }
      }
      ctx.restore();
    }
    // ネオン地平線グロー
    ctx.save();
    const gg = ctx.createLinearGradient(0, H * 0.72, 0, H);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, this._alpha(C.accent2, 0.16 + energy * 0.18));
    ctx.fillStyle = gg;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    ctx.restore();
  }

  _sceneGrid(ctx, t, W, H, C, energy) {
    ctx.save();
    const horizon = H * 0.62;
    ctx.strokeStyle = this._alpha(C.accent, 0.4 + energy * 0.3);
    ctx.lineWidth = Math.max(1, W / 900);
    // 放射状の縦線
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * W * 0.03, horizon);
      ctx.lineTo(W / 2 + i * W * 0.22, H);
      ctx.stroke();
    }
    // スクロールする横線
    for (let i = 0; i < 12; i++) {
      const p = ((i / 12 + (t * 0.35) % 1) % 1);
      const y = horizon + Math.pow(p, 2.2) * (H - horizon);
      ctx.globalAlpha = p * 0.9;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 上空グロー
    const g = ctx.createRadialGradient(W / 2, horizon, 10, W / 2, horizon, W * 0.5);
    g.addColorStop(0, this._alpha(C.accent2, 0.34));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 4);
    ctx.restore();
  }

  _sceneSky(ctx, t, W, H, C, dense) {
    const r = this._seededRand(11);
    ctx.save();
    for (let i = 0; i < (dense ? 160 : 70); i++) {
      const x = (r() * W + t * (2 + r() * 5)) % W, y = r() * H * 0.9;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.8 + r() * 2.4) + i * 1.7));
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 11 === 0 ? C.accent : (i % 7 === 0 ? C.accent2 : '#e8f2ff');
      const sz = i % 17 === 0 ? 2.4 : 1.2;
      ctx.fillRect(x, y, sz, sz);
    }
    // 流れ星 (8秒ごと)
    const sh = (t % 8) / 8;
    if (sh < 0.18 && dense) {
      const sx = W * (0.15 + ((Math.floor(t / 8) * 37) % 60) / 100), sy = H * 0.12;
      const p = sh / 0.18;
      ctx.globalAlpha = (1 - p) * 0.9;
      const grad = ctx.createLinearGradient(sx + p * W * 0.3, sy + p * H * 0.25, sx + p * W * 0.3 - W * 0.09, sy + p * H * 0.25 - H * 0.07);
      grad.addColorStop(0, '#fff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + p * W * 0.3, sy + p * H * 0.25);
      ctx.lineTo(sx + p * W * 0.3 - W * 0.09, sy + p * H * 0.25 - H * 0.07);
      ctx.stroke();
    }
    // 淡い雲
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 0.31 + t * 0.006) % 1.2 - 0.1) * W, cy = H * (0.2 + i * 0.18);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - W * 0.2, cy - W * 0.2, W * 0.4, W * 0.4);
    }
    ctx.restore();
  }

  _sceneSunset(ctx, t, W, H, C, energy) {
    // レトロサン
    const cy = H * 0.52, rad = Math.min(W, H) * 0.24;
    ctx.save();
    const g = ctx.createLinearGradient(0, cy - rad, 0, cy + rad);
    g.addColorStop(0, C.accent); g.addColorStop(1, C.accent2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(W / 2, cy, rad, 0, Math.PI * 2); ctx.fill();
    // 太陽のスリット
    ctx.fillStyle = C.bg1;
    for (let i = 0; i < 6; i++) {
      const y = cy + rad * (0.1 + i * 0.16);
      ctx.fillRect(W / 2 - rad, y, rad * 2, 2 + i * 1.5);
    }
    ctx.globalAlpha = 0.5 + energy * 0.4;
    ctx.shadowColor = C.accent; ctx.shadowBlur = 60;
    ctx.beginPath(); ctx.arc(W / 2, cy, rad, 0, Math.PI * 2);
    ctx.strokeStyle = this._alpha(C.accent, 0.6); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    this._sceneGrid(ctx, t, W, H, { ...C, accent: C.accent2, accent2: C.accent }, energy * 0.6);
  }

  /* ---------------- particles ---------------- */
  _stepParticles(ctx, t, W, H, C, intensity) {
    const kind = this.timeline?.particles || 'none';
    if (kind === 'none') { this.particles = []; return; }
    const dt = this.pTime < 0 || t < this.pTime ? 0.016 : Math.min(0.1, t - this.pTime);
    this.pTime = t;
    const targetN = Math.floor((kind === 'rain' ? 70 : kind === 'sakura' ? 40 : kind === 'snow' ? 60 : kind === 'embers' ? 45 : 50) * (0.5 + intensity));
    while (this.particles.length < targetN) this.particles.push(this._spawn(kind, W, H, true));
    if (this.particles.length > targetN + 20) this.particles.length = targetN + 20;
    ctx.save();
    for (const p of this.particles) {
      p.x += p.vx * dt * W; p.y += p.vy * dt * H; p.rot += p.vr * dt; p.life -= dt;
      if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || p.life <= 0) Object.assign(p, this._spawn(kind, W, H, false));
      ctx.globalAlpha = Math.min(1, p.life) * p.alpha * (0.55 + intensity * 0.6);
      if (kind === 'rain') {
        ctx.strokeStyle = this._alpha(C.accent, 0.7);
        ctx.lineWidth = p.size * 0.42;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * W * 0.03, p.y - p.vy * H * 0.03); ctx.stroke();
      } else if (kind === 'sakura') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.tint ? '#ffc4dd' : '#ff9ecf';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (kind === 'snow') {
        ctx.fillStyle = '#eaf6ff';
        ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 1.4 + p.seed * 9) * 14, p.y, p.size * 0.7, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'embers') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.tint ? C.accent : C.accent2;
        ctx.shadowColor = C.accent; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 2 + p.seed * 7) * 10, p.y, p.size * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      } else { // stars (浮遊光)
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.tint ? C.accent : '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  _spawn(kind, W, H, anywhere) {
    const r = Math.random;
    const base = { x: r() * W, y: anywhere ? r() * H : -12, rot: r() * 6.28, seed: r(), tint: r() > 0.6, alpha: 0.4 + r() * 0.6, life: 4 + r() * 6 };
    if (kind === 'rain') return { ...base, y: anywhere ? r() * H : -16, vx: -0.06, vy: 1.5 + r() * 0.8, vr: 0, size: 2.5 + r() * 2.5 };
    if (kind === 'sakura') return { ...base, vx: -0.03 - r() * 0.05, vy: 0.07 + r() * 0.09, vr: 1 + r() * 2.4, size: 4 + r() * 5 };
    if (kind === 'snow') return { ...base, vx: -0.01, vy: 0.05 + r() * 0.07, vr: 0, size: 2.5 + r() * 4 };
    if (kind === 'embers') return { ...base, y: anywhere ? r() * H : H + 12, vx: (r() - 0.5) * 0.04, vy: -0.06 - r() * 0.1, vr: 0, size: 2.5 + r() * 4 };
    return { ...base, vx: (r() - 0.5) * 0.015, vy: -0.008 - r() * 0.02, vr: 0, size: 1.6 + r() * 3 };
  }

  /* ---------------- lyrics (word-level animation) ---------------- */
  _drawLyrics(t, W, H, C, energy, boost, fx) {
    const words = this.timeline?.tracks?.lyrics || [];
    const style = this.timeline?.lyricStyle || {};
    const anim = style.anim || 'glow-pop';
    // 現在の行: 表示中 or 直近の単語の行
    let lineIdx = -1;
    for (const w of words) { if (t >= w.start - 0.15 && t < w.end + 0.65) lineIdx = Math.max(lineIdx, w.line); }
    if (lineIdx < 0) return;
    const lineWords = words.filter(w => w.line === lineIdx);
    if (!lineWords.length) return;
    const lineStart = lineWords[0].start, lineEnd = lineWords[lineWords.length - 1].end;
    if (t < lineStart - 0.15 || t > lineEnd + 0.65) return;

    const tc = this.tctx;
    tc.clearRect(0, 0, W, H);
    const portrait = this.canvas.height > this.canvas.width;
    let fontSize = (style.size || 64) * (W / 1280) * (portrait ? 0.72 : 1);
    const fam = style.font || "'Noto Sans JP', sans-serif";
    tc.textBaseline = 'middle';
    const lineOut = Math.min(1, Math.max(0, (t - lineEnd) / 0.5));

    if ((style.orient || 'horizontal') === 'vertical') {
      tc.font = `900 ${fontSize}px ${fam}`;
      this._drawLyricsVertical(tc, lineWords, t, fontSize, C, style, anim, energy, boost, lineOut, fx, W, H);
    } else {
      // 横書き: 行内レイアウト。長い行はフレームに収まるようフォントを自動縮小(auto-fit)
      const headId = lineWords[0] && lineWords[0].id;
      const lineStart = lineWords[0] ? lineWords[0].start : 0;
      const maxW = W * 0.9, maxBlockH = H * (portrait ? 0.6 : 0.66);
      let rows, tracking, gap, lineH;
      for (let iter = 0; iter < 12; iter++) {
        tc.font = `900 ${fontSize}px ${fam}`;
        tracking = (style.tracking || 0) * fontSize;
        gap = fontSize * 0.18 + tracking;
        const widths = lineWords.map(w => this._measureWord(tc, w.word, tracking));
        rows = [[]]; let rw = 0;
        lineWords.forEach((w, i) => {
          if (rw + widths[i] + gap > maxW && rows[rows.length - 1].length) { rows.push([]); rw = 0; }
          rows[rows.length - 1].push({ ...w, w: widths[i] });
          rw += widths[i] + gap;
        });
        lineH = fontSize * 1.34;
        const blockH = rows.length * lineH;
        const maxRowW = Math.max(...rows.map(row => row.reduce((a, w) => a + w.w, 0) + gap * (row.length - 1)));
        if ((blockH <= maxBlockH && maxRowW <= maxW) || fontSize < 22) break;
        fontSize *= 0.9;
      }
      const cy = H * (portrait ? 0.5 : 0.58) - (rows.length - 1) * lineH / 2;
      rows.forEach((row, ri) => {
        const totalW = row.reduce((a, w) => a + w.w, 0) + gap * (row.length - 1);
        let x = (W - totalW) / 2;
        const y = cy + ri * lineH;
        for (const w of row) {
          this._drawWord(tc, w, x, y, t, fontSize, C, style, anim, energy, boost, lineOut, fx, tracking, w.id === headId, lineStart);
          x += w.w + gap;
        }
      });
    }

    // 色収差付きで合成
    const chroma = (fx.chroma || 0) * boost * (0.4 + energy);
    const ctx = this.ctx;
    if (chroma > 0.06 && this.quality !== 'draft') {
      const off = Math.min(10, chroma * 6 * (W / 1280));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.filter = `drop-shadow(0 0 0 red)`;
      ctx.filter = 'none';
      // R/Bを微妙にずらして重ねる簡易色収差
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.textLayer, -off, 0);
      ctx.drawImage(this.textLayer, off, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(this.textLayer, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(this.textLayer, 0, 0);
    }
  }

  /* 出現アニメの状態を計算 (縦横で共有) */
  // entranceStart = 行の開始時刻。行が出た瞬間に全語が素早く一緒に入場(YouTube風・カラオケ無し)。
  _wordAnim(entranceStart, w, t, fs, anim, active, energy, lineOut) {
    const p = Math.min(1, Math.max(0, (t - (entranceStart - 0.12)) / 0.2));  // 歌い出しの少し前から素早く表示
    const ease = 1 - Math.pow(1 - p, 3);
    const eob = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
    let dx = 0, dy = 0, scale = 1, alpha = 1;
    if (anim === 'fade') { alpha = ease; }
    else if (anim === 'fade-up') { alpha = ease; dy = (1 - ease) * fs * 0.5; }
    else if (anim === 'slide-up') { alpha = Math.min(1, ease * 1.4); dy = (1 - ease) * fs * 1.1; }
    else if (anim === 'pop-scale') { scale = 0.5 + eob * 0.5; alpha = Math.min(1, ease * 1.3); }
    else if (anim === 'glow-pop') { scale = 0.78 + eob * 0.22; alpha = Math.min(1, ease * 1.3); }
    else if (anim === 'glitch-in') { alpha = ease; if (p < 1) { dx = (Math.random() - 0.5) * fs * 0.4 * (1 - p); dy = (Math.random() - 0.5) * fs * 0.2 * (1 - p); } }
    if (active) scale += Math.sin(t * 7 + w.start * 3) * 0.02 * (0.5 + energy);
    return { dx, dy, scale, alpha: alpha * (1 - lineOut), p };
  }

  /* レタリングのプリセット別スタイルを適用し fillStyle を返す (縦横で共有) */
  _letterFill(tc, preset, active, C, style, fs, yTop, yBot) {
    const base = style.color || C.text;
    tc.lineJoin = 'round';
    if (preset === 'outline') {
      tc.lineWidth = fs * 0.12; tc.strokeStyle = active ? C.accent : this._alpha(base, 0.92);
      return active ? this._alpha(C.bg1 || '#0a0f1a', 0.85) : 'rgba(10,14,22,0.55)';
    }
    if (preset === 'marker') {
      tc.lineWidth = fs * 0.05; tc.strokeStyle = 'rgba(5,9,16,0.4)';
      return '#0a0f18';
    }
    if (preset === 'chrome') {
      tc.lineWidth = fs * 0.08; tc.strokeStyle = 'rgba(5,9,16,0.85)';
      const g = tc.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, '#eaf6ff'); g.addColorStop(0.44, '#9fb6cf'); g.addColorStop(0.5, '#586b82');
      g.addColorStop(0.56, '#cfdcec'); g.addColorStop(1, '#f4faff');
      return g;
    }
    if (preset === 'brush') {
      tc.lineWidth = fs * 0.13; tc.strokeStyle = 'rgba(5,9,16,0.88)';
      return active ? C.accent : this._alpha(base, 0.94);
    }
    // neon (default)
    tc.lineWidth = fs * 0.085; tc.strokeStyle = 'rgba(5,9,16,0.8)';
    if (active) {
      const g = tc.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, this._alpha(C.accent2, 0.95)); g.addColorStop(0.45, '#ffffff'); g.addColorStop(1, C.accent);
      return g;
    }
    return this._alpha(base, 0.9);
  }

  /* 1グリフ(または語)を描画: 縁取り→塗り→発光。marker/longshadowの装飾も処理 */
  _paintGlyph(tc, text, cx, cy, w, fs, preset, active, alpha, glow, C, style, t, w0) {
    const yTop = cy - fs * 0.55, yBot = cy + fs * 0.55;
    // marker: 蛍光ペン風の背景ボックス
    if (preset === 'marker' && active) {
      tc.save();
      tc.globalAlpha = alpha * 0.9;
      const grad = tc.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      grad.addColorStop(0, C.accent); grad.addColorStop(1, C.accent2);
      tc.fillStyle = grad;
      tc.fillRect(cx - w / 2 - fs * 0.06, cy - fs * 0.42, w + fs * 0.12, fs * 0.86);
      tc.restore();
    }
    // longshadow: 斜め下へ連続シャドウ
    if (preset === 'longshadow') {
      tc.save();
      tc.globalAlpha = alpha * 0.5;
      tc.fillStyle = this._alpha(C.accent2, 0.5);
      for (let s = 2; s <= 14; s += 2) { tc.fillText(text, cx + s, cy + s); }
      tc.restore();
      tc.lineWidth = fs * 0.09; tc.strokeStyle = 'rgba(5,9,16,0.85)';
      tc.strokeText(text, cx, cy);
      tc.fillStyle = active ? C.accent : this._alpha(style.color || C.text, 0.95);
      tc.fillText(text, cx, cy);
      return;
    }
    tc.globalAlpha = alpha;
    const fill = this._letterFill(tc, preset, active, C, style, fs, yTop, yBot);
    tc.strokeText(text, cx, cy);
    if (glow > 0.05 && this.quality !== 'draft') {
      tc.shadowColor = active ? C.accent : this._alpha(C.accent2, 0.8);
      tc.shadowBlur = fs * 0.45 * glow;
    }
    tc.fillStyle = fill;
    tc.fillText(text, cx, cy);
    if (active && glow > 0.3 && preset !== 'marker') {   // 芯の発光
      tc.shadowBlur = fs * 0.14; tc.fillStyle = '#ffffff'; tc.globalAlpha = alpha * 0.5;
      tc.fillText(text, cx, cy); tc.globalAlpha = alpha;
    }
    tc.shadowBlur = 0;
  }

  _measureWord(tc, word, tracking) {
    const chars = [...word];
    let wsum = 0;
    chars.forEach((ch, i) => { wsum += tc.measureText(ch).width + (i < chars.length - 1 ? tracking : 0); });
    return wsum;
  }

  _drawWord(tc, w, x, y, t, fs, C, style, anim, energy, boost, lineOut, fx, tracking, isHead, lineStart) {
    tracking = tracking || 0;
    const preset = style.lettering || 'neon';
    // YouTube風リリックビデオ: 行が出た瞬間に全語が一緒に入場し、行全体が均一に光る(カラオケ無し)
    const a = this._wordAnim(lineStart != null ? lineStart : w.start, w, t, fs, anim, false, energy, lineOut);
    tc.save();
    tc.textAlign = 'center';
    const cx = x + w.w / 2, cyy = y + a.dy;
    tc.translate(cx + a.dx, cyy); tc.scale(a.scale, a.scale); tc.translate(-cx - a.dx, -cyy);
    const gx = cx + a.dx, gy = y + a.dy;
    const glow = (style.glow ?? 0.6) * boost * (0.75 + energy * 0.5);
    // 一文字ずつ描画 (字間トラッキング + ランダムサイズ対応)。行内は均一の見た目
    const chars = [...w.word];
    let lx = gx - w.w / 2;
    chars.forEach((ch, i) => {
      const cw = tc.measureText(ch).width;
      const center = lx + cw / 2;
      let f = 1;
      if (style.randomSize) {
        const h = this._hash01(w.id + ':' + i);
        f = isHead ? (1.0 + h * 0.7) : (0.7 + h * 1.2);
      }
      if (f !== 1) { tc.save(); tc.translate(center, gy); tc.scale(f, f); tc.translate(-center, -gy); }
      this._paintGlyph(tc, ch, center, gy, cw, fs, preset, true, a.alpha, glow, C, style, t, w);
      if (f !== 1) tc.restore();
      lx += cw + (i < chars.length - 1 ? tracking : 0);
    });
    tc.restore();
  }

  /* 縦書き: 各語を縦にスタックし、列を右→左に配置 */
  _drawLyricsVertical(tc, lineWords, t, fs, C, style, anim, energy, boost, lineOut, fx, W, H) {
    const preset = style.lettering || 'neon';
    const headId = lineWords[0] && lineWords[0].id;
    const lineStartV = lineWords[0] ? lineWords[0].start : 0;
    const charH = fs * 1.04 + (style.tracking || 0) * fs;
    const colW = fs * 1.34;
    const maxColChars = Math.floor((H * 0.82) / charH);
    // 語を列に詰める (縦に溢れたら新しい列へ)
    const cols = [[]];
    let used = 0;
    for (const w of lineWords) {
      const chars = [...w.word];
      if (used + chars.length > maxColChars && cols[cols.length - 1].length) { cols.push([]); used = 0; }
      cols[cols.length - 1].push({ w, chars });
      used += chars.length;
    }
    const totalCols = cols.length;
    const blockW = totalCols * colW;
    const startX = W / 2 + blockW / 2 - colW / 2;   // 右端の列から
    tc.textAlign = 'center';
    cols.forEach((col, ci) => {
      const cx = startX - ci * colW;
      const nChars = col.reduce((a, wc) => a + wc.chars.length, 0);
      let cy = H * 0.5 - (nChars * charH) / 2 + charH / 2;
      for (const wc of col) {
        const w = wc.w;
        const a = this._wordAnim(lineStartV, w, t, fs, anim, false, energy, lineOut);
        const isHead = w.id === headId;
        const glow = (style.glow ?? 0.6) * boost * (0.75 + energy * 0.5);
        wc.chars.forEach((ch, ci) => {
          const h = this._hash01(w.id + ':' + ci);
          const jf = style.randomSize ? (isHead ? 1.0 + h * 0.7 : 0.7 + h * 1.2) : 1;
          tc.save();
          const sc = a.scale * jf;
          tc.translate(cx, cy + a.dy); tc.scale(sc, sc); tc.translate(-cx, -(cy + a.dy));
          this._paintGlyph(tc, ch, cx, cy + a.dy, colW * 0.8, fs, preset, true, a.alpha, glow, C, style, t, w);
          tc.restore();
          cy += charH;
        });
      }
    });
  }

  /* ---------------- overlays ---------------- */
  _drawOverlays(ctx, t, W, H, C) {
    for (const ov of this.timeline?.tracks?.overlay || []) {
      if (t < ov.start || t > ov.end) continue;
      const fadeIn = Math.min(1, (t - ov.start) / 0.6);
      const fadeOut = Math.min(1, (ov.end - t) / 0.6);
      ctx.save();
      ctx.globalAlpha = Math.min(fadeIn, fadeOut);
      const fs = (ov.size || 34) * (W / 1280);
      ctx.font = `700 ${fs}px ${this.timeline?.lyricStyle?.font || "'Noto Sans JP', sans-serif"}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = ov.color || C.accent; ctx.shadowBlur = fs * 0.5;
      ctx.fillStyle = ov.color || C.accent;
      ctx.fillText(ov.text || '', W * (ov.x ?? 0.5), H * (ov.y ?? 0.12));
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
  }

  /* ---------------- post fx ---------------- */
  _glitch(ctx, W, H, amt, t) {
    // 一定間隔でランダムスライスをずらす
    const gate = Math.sin(t * 13.7) * Math.sin(t * 7.3 + 1);
    if (gate < 0.55 - amt * 0.5) return;
    const p = this.pctx;
    p.clearRect(0, 0, W, H);
    p.drawImage(this.canvas, 0, 0);
    const n = 3 + Math.floor(amt * 6);
    for (let i = 0; i < n; i++) {
      const y = Math.random() * H, h = 4 + Math.random() * H * 0.06;
      const off = (Math.random() - 0.5) * W * 0.09 * amt;
      ctx.drawImage(this.post, 0, y, W, h, off, y, W, h);
    }
    // RGBスプリットバンド
    if (amt > 0.4) {
      const y = Math.random() * H, h = H * 0.05;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.post, 0, y, W, h, amt * 14, y, W, h);
      ctx.restore();
    }
  }

  _wave(ctx, W, H, amt, t) {
    const p = this.pctx;
    p.clearRect(0, 0, W, H);
    p.drawImage(this.canvas, 0, 0);
    const strips = 28;
    const sh = H / strips;
    for (let i = 0; i < strips; i++) {
      const off = Math.sin(t * 2.4 + i * 0.5) * amt * W * 0.012;
      ctx.drawImage(this.post, 0, i * sh, W, sh, off, i * sh, W, sh);
    }
  }

  _vignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _bloomFlash(ctx, W, H, C, amt) {
    if (amt <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, W * 0.6);
    g.addColorStop(0, this._alpha(C.accent, amt * 0.16));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  _alpha(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '#ffffff');
    if (!m) return `rgba(255,255,255,${a})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  /* 文字列から決定論的な 0..1 値 (毎フレーム同じ=チラつかない) */
  _hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
}

/* テンプレートのサムネイル1フレームを描画 (ダッシュボード/マーケット用) */
function renderTemplateThumb(canvas, config, sampleWord = '星が降り注ぐ夜に') {
  canvas.width = 384; canvas.height = 216;
  const eng = new FXEngine(canvas);
  eng.setTimeline({
    duration: 30, colors: config.colors, particles: config.particles, fx: config.fx,
    lyricStyle: { font: config.font, size: 52, color: config.colors.text, anim: 'fade', glow: config.fx.bloom },
    envelope: Array.from({ length: 300 }, (_, i) => 0.4 + 0.3 * Math.sin(i / 18)), hop: 0.1,
    scenes: [{ label: 'Chorus', start: 0, end: 30, energy: 0.8 }],
    sceneDefault: config.scene,
    tracks: {
      lyrics: [{ id: 't', word: sampleWord, line: 0, start: 0, end: 30 }],
      background: [{ id: 'b', start: 0, end: 30, scene: config.scene }],
      effects: [], overlay: [],
    },
  });
  eng.render(7.3);
  return eng;
}
