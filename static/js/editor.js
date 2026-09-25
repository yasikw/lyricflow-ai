/* =====================================================================
 * LyricFlow AI — Main Editor (仕様 4.2: 4ペイン構成)
 * 左: アセット/エフェクト/テンプレート  中央: WebGLプレビュー+トランスポート
 * 下: 5トラックタイムライン  右: プロパティ + AIツール
 * ===================================================================== */
const ASPECTS = { '16:9': [1280, 720], '9:16': [405, 720], '1:1': [720, 720], '4:5': [576, 720] };
const EXPORT_RES = {
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
  '4k': { '16:9': [3840, 2160], '9:16': [2160, 3840], '1:1': [2160, 2160], '4:5': [2160, 2700] },
};
const ANIMS = [
  ['glow-pop', 'グロウポップ'], ['fade', 'フェード'], ['fade-up', 'フェードアップ'], ['slide-up', 'スライドアップ'],
  ['pop-scale', 'ポップスケール'], ['glitch-in', 'グリッチイン'], ['zoom-in', 'ズームイン'], ['drop-in', 'ドロップ(弾む)'],
  ['rise-soft', 'ふわり上昇'], ['spin-in', 'スピンイン'], ['flip-in', 'フリップ(横)'], ['swing-in', 'スイング'],
  ['blur-in', 'ブラーイン'], ['stretch-in', 'ストレッチ'], ['typewriter', 'タイプライター'], ['cascade', 'カスケード(一字ずつ)'],
  ['wave', 'ウェーブ(波打ち)'], ['tumble', 'タンブル(一字ずつ回転)'],
  // 文字PV / キネティックタイポ系
  ['punch-in', 'パンチイン(巨大→収束)'], ['slam-down', 'スラムダウン(叩きつけ)'], ['squash-in', 'スカッシュ&ストレッチ'],
  ['slide-left', 'スライド(左から)'], ['slide-right', 'スライド(右から)'], ['whoosh', 'ホワッシュ(横ブラー)'],
  ['fly-through', 'フライスルー(奥→手前)'], ['roll-in', 'ロールイン(転がり)'], ['bounce-in', 'バウンス(弾む)'],
  ['neon-flicker', 'ネオン点滅'], ['char-pop', '一字ポップ'], ['char-blur', '一字ブラー'], ['scatter-in', '飛散集合(四方から)'],
];
const SCENES = [['city', 'ネオン都市'], ['sky', '夜空'], ['stars', '星空(高密度)'], ['grid', 'サイバーグリッド'], ['sunset', 'レトロサンセット'], ['stage', 'ステージ(照明)'], ['flat', 'フラット']];
const LETTERINGS = [
  ['neon', 'ネオン(グラデ)'], ['outline', 'アウトライン'], ['marker', 'マーカー'], ['brush', '筆(太字)'],
  ['chrome', 'クローム(金属)'], ['longshadow', 'ロングシャドウ'], ['gold', 'ゴールド'], ['gradient', 'グラデ(2色)'],
  ['rainbow', 'レインボー'], ['fire', 'ファイア(炎)'], ['ice', 'アイス(氷)'], ['shadow3d', '3D押し出し'],
  ['glitch', 'グリッチ(RGBずれ)'], ['retro', 'レトロ(80s)'], ['sticker', 'ステッカー'], ['pill', 'ピル(丸背景)'],
];
// 使用フォント (value=CSS font-family, label=表示名, cat=分類)。index.htmlのGoogle Fontsと対応
const FONTS = [
  // ゴシック / サンセリフ
  ["'Noto Sans JP', sans-serif", 'Noto Sans JP', 'ゴシック'],
  ["'Zen Kaku Gothic New', sans-serif", 'Zen角ゴシック New', 'ゴシック'],
  ["'M PLUS Rounded 1c', sans-serif", 'M PLUS Rounded 1c (丸)', 'ゴシック'],
  ["'Zen Maru Gothic', sans-serif", 'Zen丸ゴシック', 'ゴシック'],
  ["'Kosugi Maru', sans-serif", '小杉丸ゴシック', 'ゴシック'],
  ["'BIZ UDPGothic', sans-serif", 'BIZ UDPゴシック', 'ゴシック'],
  ["'Zen Kurenaido', sans-serif", 'Zenくれなゐど (硬筆)', 'ゴシック'],
  // 明朝 / セリフ
  ["'Noto Serif JP', serif", 'Noto Serif JP (明朝)', '明朝'],
  ["'Shippori Mincho', serif", 'しっぽり明朝', '明朝'],
  ["'Zen Old Mincho', serif", 'Zen Old明朝', '明朝'],
  ["'Kaisei Tokumin', serif", 'Kaisei Tokumin (太明朝)', '明朝'],
  ["'New Tegomin', serif", 'New Tegomin (時代劇風)', '明朝'],
  ["'Zen Antique', serif", 'Zen Antique (レトロ明朝)', '明朝'],
  ["'Hina Mincho', serif", 'ひな明朝 (繊細)', '明朝'],
  // ディスプレイ / 太字インパクト
  ["'Dela Gothic One', sans-serif", 'Dela Gothic One (極太)', 'ディスプレイ'],
  ["'Reggae One', sans-serif", 'Reggae One (極太)', 'ディスプレイ'],
  ["'RocknRoll One', sans-serif", 'RocknRoll One', 'ディスプレイ'],
  ["'Rampart One', sans-serif", 'Rampart One (3D)', 'ディスプレイ'],
  ["'Train One', sans-serif", 'Train One (袋文字)', 'ディスプレイ'],
  ["'Kaisei Decol', serif", 'Kaisei Decol (装飾)', 'ディスプレイ'],
  ["'DotGothic16', sans-serif", 'DotGothic16 (ドット)', 'ディスプレイ'],
  ["'Stick', sans-serif", 'Stick (細ディスプレイ)', 'ディスプレイ'],
  // ポップ / 手書き
  ["'Mochiy Pop One', sans-serif", 'もちいずポップ', 'ポップ/手書き'],
  ["'Hachi Maru Pop', cursive", 'はちまるポップ', 'ポップ/手書き'],
  ["'Yusei Magic', sans-serif", '油性マジック', 'ポップ/手書き'],
  ["'Klee One', cursive", 'クレー (教科書体)', 'ポップ/手書き'],
  ["'Yuji Syuku', serif", 'Yuji Syuku (筆)', 'ポップ/手書き'],
  ["'Yuji Mai', serif", 'Yuji Mai (崩し筆)', 'ポップ/手書き'],
  ["'Yomogi', cursive", 'Yomogi (手書き)', 'ポップ/手書き'],
  // 欧文
  ["'Inter', sans-serif", 'Inter', '欧文'],
  ["'Montserrat', sans-serif", 'Montserrat', '欧文'],
  ["'Oswald', sans-serif", 'Oswald (縦長)', '欧文'],
  ["'Bebas Neue', sans-serif", 'Bebas Neue (見出し)', '欧文'],
  ["'Anton', sans-serif", 'Anton (極太)', '欧文'],
  ["'Playfair Display', serif", 'Playfair Display', '欧文'],
  ["'Zen Dots', cursive", 'Zen Dots (サイバー)', '欧文'],
];
// フォントの雰囲気タグと相性の良い動き(フォント見本・推奨表示に使う)。jp:false は日本語グリフ無し
const FONT_MOODS = [['speed', '疾走感・攻撃的'], ['night', '夜・孤独・退廃'], ['cute', 'かわいい・ポップ'], ['cyber', '未来的・サイバー'], ['elegant', '高級感・切なさ'], ['uneasy', '不安・狂気'], ['wa', '和']];
const FONT_MOTIONS = { pop: '拡大・振動・分裂', slide: '横移動・縦積み・画面分割', fade: 'フェード・ゆっくり移動', zoom: 'ゆっくりズーム・縦書き', type: '一文字ずつ出現', wave: '弾む・波打ち', blink: 'タイピング・点滅', emph: '一語の強調・タイトル' };
const FONT_META = {
  'Noto Sans JP': { m: ['speed', 'night'], mo: 'slide' }, 'Zen Kaku Gothic New': { m: ['speed', 'night'], mo: 'slide' },
  'M PLUS Rounded 1c': { m: ['cute'], mo: 'wave' }, 'Zen Maru Gothic': { m: ['cute', 'night'], mo: 'fade' }, 'Kosugi Maru': { m: ['cute'], mo: 'wave' },
  'BIZ UDPGothic': { m: ['night', 'cyber'], mo: 'fade' }, 'Zen Kurenaido': { m: ['night', 'uneasy'], mo: 'type' },
  'Noto Serif JP': { m: ['elegant', 'night'], mo: 'zoom' }, 'Shippori Mincho': { m: ['elegant', 'night'], mo: 'zoom' }, 'Zen Old Mincho': { m: ['elegant', 'wa'], mo: 'zoom' },
  'Kaisei Tokumin': { m: ['elegant', 'wa', 'speed'], mo: 'pop' }, 'New Tegomin': { m: ['wa', 'uneasy'], mo: 'zoom' }, 'Zen Antique': { m: ['wa', 'elegant'], mo: 'fade' },
  'Hina Mincho': { m: ['night', 'elegant'], mo: 'fade' }, 'Dela Gothic One': { m: ['speed'], mo: 'pop' }, 'Reggae One': { m: ['speed', 'uneasy'], mo: 'pop' },
  'RocknRoll One': { m: ['speed', 'cute'], mo: 'pop' }, 'Rampart One': { m: ['cyber', 'uneasy'], mo: 'emph' }, 'Train One': { m: ['cyber', 'uneasy'], mo: 'emph' },
  'Kaisei Decol': { m: ['elegant', 'uneasy'], mo: 'emph' }, 'DotGothic16': { m: ['cyber'], mo: 'blink' }, 'Stick': { m: ['cyber', 'uneasy'], mo: 'slide' },
  'Mochiy Pop One': { m: ['cute', 'speed'], mo: 'pop' }, 'Hachi Maru Pop': { m: ['cute'], mo: 'wave' }, 'Yusei Magic': { m: ['cute'], mo: 'type' },
  'Klee One': { m: ['night', 'cute'], mo: 'type' }, 'Yuji Syuku': { m: ['wa'], mo: 'type' }, 'Yuji Mai': { m: ['wa', 'uneasy'], mo: 'type' }, 'Yomogi': { m: ['cute', 'night'], mo: 'type' },
  'Inter': { m: ['cyber'], mo: 'slide', jp: false }, 'Montserrat': { m: ['speed'], mo: 'slide', jp: false }, 'Oswald': { m: ['speed', 'cyber'], mo: 'slide', jp: false },
  'Bebas Neue': { m: ['speed'], mo: 'slide', jp: false }, 'Anton': { m: ['speed'], mo: 'pop', jp: false }, 'Playfair Display': { m: ['elegant'], mo: 'zoom', jp: false },
  'Zen Dots': { m: ['cyber'], mo: 'blink', jp: false },
};
// 役割の組み合わせ(主役=メイン歌詞 / 強調=対比・強調語 / 補助=英訳・注釈など)
const FONT_PAIRS = [
  ['疾走・クリーン', "'Dela Gothic One', sans-serif", "'Zen Kaku Gothic New', sans-serif", "'BIZ UDPGothic', sans-serif"],
  ['現代×文学', "'Zen Kaku Gothic New', sans-serif", "'Shippori Mincho', serif", "'BIZ UDPGothic', sans-serif"],
  ['ポップ・感情', "'Mochiy Pop One', sans-serif", "'Yomogi', cursive", "'Zen Maru Gothic', sans-serif"],
  ['テクノ・デジタル', "'Zen Kaku Gothic New', sans-serif", "'Rampart One', sans-serif", "'DotGothic16', sans-serif"],
  ['映画的・余韻', "'Shippori Mincho', serif", "'Hina Mincho', serif", "'Noto Serif JP', serif"],
  ['和・荘厳', "'Kaisei Tokumin', serif", "'Yuji Mai', serif", "'Zen Old Mincho', serif"],
  ['不安・狂気', "'Reggae One', sans-serif", "'New Tegomin', serif", "'Zen Kurenaido', sans-serif"],
];
// 画面全体エフェクト (fx.js の _screenFx と対応)
const SCREEN_FX = [
  ['flash', 'フラッシュ(明滅)'], ['zoomblur', '放射ズームブラー'], ['rgbshift', 'RGBずれ'], ['scanlines', '走査線(CRT)'],
  ['vhs', 'VHS'], ['pixelate', 'モザイク/ピクセル'], ['halftone', '網点(ハーフトーン)'], ['mirror', 'ミラー/万華鏡'],
  ['hueshift', '色相サイクル'], ['lightleak', '光漏れ(リーク)'], ['oldfilm', '古いフィルム'], ['letterbox', 'シネスコ黒帯'],
  ['colorama', 'コロラマ(極彩色)'], ['speedlines', '流線(集中線)'], ['lightning', '稲妻フラッシュ'], ['blinds', 'ブラインド'], ['cinema', 'シネマ色調'],
];
const ORIENTS = [['horizontal', '横書き'], ['vertical', '縦書き']];
const PARTICLES = [['rain', '雨'], ['sakura', '桜'], ['snow', '雪'], ['stars', '光の粒'], ['embers', '火の粉'], ['none', 'なし']];
const SCENE_COLORS = { Intro: '#8b96a8', Verse: '#00d4ff', 'Pre-Chorus': '#3fd58f', Chorus: '#ff7edb', Bridge: '#ffb03a', Outro: '#8b96a8' };

class Editor {
  constructor(root, projectId) {
    this.root = root;
    this.pid = projectId;
    this.playing = false;
    this.t = 0;
    this.zoom = 14;               // px / 秒
    this.sel = null;              // 選択中の歌詞クリップid
    this.dirty = false;
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.leftTab = 'media';
    this.quality = 'full';
    this.destroyed = false;
    this.metronomeOn = false;
    try { this.metronomeOn = localStorage.getItem('lf_metronome') === '1'; } catch (_) {}
    this.guides = { safe: false, center: false, grid: false };   // プレビュー専用ガイド(書き出し非対象)
    try { const g = JSON.parse(localStorage.getItem('lf_guides') || '{}'); this.guides = { safe: !!g.safe, center: !!g.center, grid: !!g.grid }; } catch (_) {}
    this._metroScheduled = -Infinity;   // 予約済みの最終拍番号
  }

  /* メトロノーム: Web Audioでクリック音を生成 */
  _ensureAudioCtx() {
    if (!this._actx) {
      try { this._actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});
    return this._actx;
  }
  // 指定したAudioContext時刻(when)にクリック音を予約する。予約=正確な発音でズレない
  _metroClick(accent, when) {
    const ac = this._actx;
    if (!ac) return;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 2000 : 1200;   // 小節頭は高い音
    const peak = accent ? 0.35 : 0.2;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(ac.destination);
    osc.start(when); osc.stop(when + 0.06);
  }
  // 現在の再生位置に拍カーソルを合わせる(シーク・再生開始・ON・BPM変更で呼ぶ→二重/連打防止)
  _syncBeatCursor() {
    if (!this.tl.bpm) { this._metroScheduled = -Infinity; return; }
    const period = 60 / this.tl.bpm, off = this.tl.beatOffset || 0;
    this._metroScheduled = Math.ceil((this.t - off) / period) - 1;  // 次の拍から予約
  }

  async init() {
    const p = await API.get('/projects/' + this.pid);
    this.project = p;
    this.tl = p.timeline_data;
    this.role = p.role;
    this.plan = p.plan || 'free';
    this.limits = (App.ws && App.ws.limits) || {};
    this.tl.watermark = !!p.watermark;   // Freeプランは透かし表示（保存対象外の表示専用フラグ）
    const [tpls, assets] = await Promise.all([API.get('/templates'), API.get(`/workspaces/${p.workspace_id}/assets`)]);
    this.templates = tpls.templates;
    this.assets = assets.assets;
    this.renderShell();
    this.engine = new FXEngine(this.root.querySelector('#stage'));
    this.engine.setTimeline(this.tl);
    await this.loadAudio();
    this.renderAll();
    if (this.tl.lyricStyle?.font) this.ensureFont(this.tl.lyricStyle.font);   // 保存済みフォントを確実に読込→再描画
    this.setupStageDrag();
    this.setupPaneResizers();
    this.loop();
    this.autosaveTimer = setInterval(() => this.save(true), 30000); // 仕様: 30秒オートセーブ
    this.keyHandler = e => {
      if (this._tapActive) return;                 // タップ同期中はSpaceを譲る
      if (e.target.matches('input,textarea,select')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); this.composeOmakase(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); this.stepFrame(1); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); this.stepFrame(-1); }
      if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSel();
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.autosaveTimer);
    document.removeEventListener('keydown', this.keyHandler);
    try { this._clock && this._clock.terminate(); } catch (e) {}
    this.audio.pause();
    if (this.dirty) this.save(true);
  }

  audioAsset() { return this.assets.find(a => a.id === this.tl.audio_asset_id); }

  async loadAudio() {
    const a = this.audioAsset();
    if (!a) return;
    this.audio.src = a.url;
    const meta = a.metadata || {};
    if (meta.envelope) {
      this.tl.envelope = meta.envelope; this.tl.hop = meta.hop || 0.1;
      this.tl.duration = this.tl.duration || meta.duration;
    } else {
      try {
        const { env, duration, hop } = await computeEnvelope(a.url);
        this.tl.envelope = env; this.tl.hop = hop;
        this.tl.duration = this.tl.duration || Math.round(duration * 100) / 100;
        a.metadata = { ...(meta || {}), envelope: env, duration: this.tl.duration, hop };
      } catch (e) { console.warn('envelope failed', e); }
    }
    this.engine.setTimeline(this.tl);
  }

  /* ---------------- shell ---------------- */
  renderShell() {
    this.root.innerHTML = `
    <div class="editor">
      <div class="ed-top">
        <button class="btn ghost sm" id="back-btn">← 戻る</button>
        <span class="logo" style="font-size:13px"><span class="mark">♪</span></span>
        <input class="title-in" id="title-in" value="${esc(this.project.title)}">
        <span class="autosave" id="autosave">自動保存: 30秒ごと</span>
        <div style="flex:1"></div>
        <span class="badge ${this.project.status}" id="status-badge">${this.project.status}</span>
        <button class="btn sm" id="history-btn" title="バージョン履歴">🕑 履歴</button>
        <button class="btn sm" id="publish-btn" title="このプロジェクトをテンプレートとして公開">✦ テンプレ化</button>
        <button class="btn sm" id="save-btn">保存</button>
        <button class="btn primary sm" id="export-btn">⬆ エクスポート</button>
      </div>
      <div class="ed-mid">
        <aside class="ed-left">
          <div class="ed-tabs">
            <button data-tab="media" class="active">メディア</button>
            <button data-tab="templates">テンプレ</button>
            <button data-tab="lyrics">歌詞</button>
          </div>
          <div class="ed-pane" id="left-pane"></div>
        </aside>
        <section class="ed-center">
          <div class="stage-wrap">
            <div class="stage-hud">
              <span class="chip" id="scene-chip">—</span>
              <span class="chip" id="quality-chip" style="cursor:pointer" title="プレビュー品質切替">品質: Full HD</span>
            </div>
            <canvas id="stage"></canvas>
          </div>
          <div class="transport">
            <button class="t-btn" id="tp-start" title="先頭へ">⏮</button>
            <button class="t-btn" id="tp-prev" title="1フレーム戻る（←）">◁</button>
            <button class="t-btn play" id="tp-play">▶</button>
            <button class="t-btn" id="tp-next" title="1フレーム進む（→）">▷</button>
            <button class="t-btn" id="tp-end" title="末尾へ">⏭</button>
            <span class="t-time" id="tp-time">00:00.00 / 00:00.00</span>
            <input type="range" id="tp-vol" min="0" max="100" value="80" style="width:90px" title="音量">
            <div class="aspect-mini" id="aspect-mini">
              ${Object.keys(ASPECTS).map(a => `<button data-a="${a}" class="${this.project.aspect_ratio === a ? 'sel' : ''}">${a}</button>`).join('')}
            </div>
            <div class="t-guides" id="t-guides" title="ガイド表示（プレビューのみ・書き出しには含まれません）">
              <button data-g="safe" class="${this.guides.safe ? 'on' : ''}" title="セーフゾーン">⛶</button>
              <button data-g="center" class="${this.guides.center ? 'on' : ''}" title="中央の印">✛</button>
              <button data-g="grid" class="${this.guides.grid ? 'on' : ''}" title="グリッド線（三分割）">▦</button>
            </div>
          </div>
        </section>
        <aside class="ed-right" id="right-pane"></aside>
        <div class="resizer resizer-x" id="rz-left" title="ドラッグで左サイドバーの幅を調整"></div>
        <div class="resizer resizer-x" id="rz-right" title="ドラッグで右サイドバーの幅を調整"></div>
      </div>
      <div class="ed-bottom">
        <div class="resizer resizer-y" id="rz-tl" title="ドラッグでタイムラインの高さを調整"></div>
        <div class="tl-toolbar">
          <span>タイムライン</span>
          <span id="tl-hint" style="color:var(--faint)">クリップをドラッグで移動 / 端でリサイズ</span>
          <div class="tl-bpm">
            <span>BPM</span>
            <input type="number" id="tl-bpm-val" min="40" max="240" value="${this.tl.bpm || ''}" placeholder="--">
            <button class="btn sm" id="tl-bpm-detect">検知</button>
            <label class="tl-bpm-grid"><input type="checkbox" id="tl-bpm-grid" ${this.tl.showBeats === false ? '' : 'checked'}>拍グリッド</label>
            <label class="tl-bpm-grid"><input type="checkbox" id="tl-metro" ${this.metronomeOn ? 'checked' : ''}>🔊 メトロノーム</label>
            <label class="tl-bpm-grid" title="クリック音のタイミング補正。＋で遅く／−で早く">補正<input type="number" id="tl-metro-trim" min="-100" max="200" step="1" style="width:52px" value="${Math.round((this.tl.metroTrim ?? 0.002) * 1000)}">ms</label>
          </div>
          <div class="zoom">
            <span>ズーム</span>
            <input type="range" id="tl-zoom" min="4" max="120" value="${this.zoom}" style="width:110px;accent-color:var(--cyan)">
          </div>
        </div>
        <div class="tl-scroll" id="tl-scroll"><div class="tl-inner" id="tl-inner"></div></div>
      </div>
    </div>`;
    this.bindShell();
  }

  bindShell() {
    const $ = s => this.root.querySelector(s);
    $('#back-btn').onclick = () => { location.hash = '#/projects'; };
    $('#save-btn').onclick = () => this.save();
    $('#export-btn').onclick = () => this.openExport();
    $('#publish-btn').onclick = () => this.publishTemplate();
    $('#history-btn').onclick = () => this.openHistory();
    $('#tp-play').onclick = () => this.togglePlay();
    $('#tp-start').onclick = () => this.seek(0);
    $('#tp-end').onclick = () => this.seek(this.tl.duration || 0);
    $('#tp-prev').onclick = () => this.stepFrame(-1);
    $('#tp-next').onclick = () => this.stepFrame(1);
    this.root.querySelectorAll('#t-guides button').forEach(b => b.onclick = () => {
      const k = b.dataset.g;
      this.guides[k] = !this.guides[k];
      b.classList.toggle('on', this.guides[k]);
      try { localStorage.setItem('lf_guides', JSON.stringify(this.guides)); } catch (_) {}
      this.frame();   // 即座に再描画
    });
    $('#tp-vol').oninput = e => { this.audio.volume = e.target.value / 100; };
    $('#title-in').onchange = e => { this.project.title = e.target.value; API.put('/projects/' + this.pid, { title: e.target.value }); };
    $('#quality-chip').onclick = () => {
      this.quality = this.quality === 'full' ? 'draft' : 'full';
      this.engine.quality = this.quality;
      $('#quality-chip').textContent = '品質: ' + (this.quality === 'full' ? 'Full HD' : 'Draft(高速)');
    };
    $('#tl-zoom').oninput = e => { this.zoom = +e.target.value; this.renderTimeline(); };
    $('#tl-bpm-detect').onclick = () => this.detectBpm();
    $('#tl-bpm-val').onchange = e => {
      const v = +e.target.value;
      if (v >= 40 && v <= 240) { this.tl.bpm = v; if (this.tl.beatOffset == null) this.tl.beatOffset = 0; }
      else this.tl.bpm = null;
      this._syncBeatCursor();
      this.markDirty(); this.renderTimeline();
    };
    $('#tl-bpm-grid').onchange = e => { this.tl.showBeats = e.target.checked; this.markDirty(); this.renderTimeline(); };
    $('#tl-metro').onchange = e => {
      this.metronomeOn = e.target.checked;
      try { localStorage.setItem('lf_metronome', this.metronomeOn ? '1' : '0'); } catch (_) {}
      if (this.metronomeOn) { this._ensureAudioCtx(); this._syncBeatCursor(); }
      if (this.metronomeOn && !this.tl.bpm) toast('先にBPMを検知/入力してください', 'err');
    };
    $('#tl-metro-trim').onchange = e => {
      const ms = Math.max(-100, Math.min(200, +e.target.value || 0));
      this.tl.metroTrim = ms / 1000;
      e.target.value = ms;
      this.markDirty();
    };
    this.root.querySelectorAll('.ed-tabs button').forEach(b => b.onclick = () => {
      this.root.querySelectorAll('.ed-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.leftTab = b.dataset.tab;
      this.renderLeft();
    });
    this.root.querySelectorAll('#aspect-mini button').forEach(b => b.onclick = async () => {
      this.project.aspect_ratio = b.dataset.a;
      this.root.querySelectorAll('#aspect-mini button').forEach(x => x.classList.toggle('sel', x === b));
      await API.put('/projects/' + this.pid, { aspect_ratio: b.dataset.a });
      this.fitStage();
    });
    this.fitStage();
    window.addEventListener('resize', this.fitHandler = () => this.fitStage());
  }

  // プレビュー上で歌詞を掴んでリアルタイムに移動(自由配置)
  // サイドバー幅・タイムライン高さを境界ドラッグで変更(localStorageに保存)
  setupPaneResizers() {
    const editor = this.root.querySelector('.editor');
    const mid = this.root.querySelector('.ed-mid');
    if (!editor || !mid || editor._rzBound) return;
    editor._rzBound = true;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const setVar = (k, px) => editor.style.setProperty(k, px + 'px');
    // 保存値を復元
    ['--left-w', '--right-w', '--tl-h'].forEach(k => { const v = localStorage.getItem('lf_pane_' + k); if (v) setVar(k, parseInt(v, 10)); });
    const bind = (id, onMove) => {
      const h = this.root.querySelector('#' + id);
      if (!h) return;
      h.addEventListener('pointerdown', e => {
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        h.classList.add('dragging');
        const move = ev => onMove(ev);
        const up = ev => {
          h.classList.remove('dragging');
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          try { h.releasePointerCapture(ev.pointerId); } catch (_) {}
          this.fitStage(); this.renderTimeline();     // 最終サイズで再フィット
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    };
    bind('rz-left', e => {
      const r = mid.getBoundingClientRect();
      const w = Math.round(clamp(e.clientX - r.left, 170, r.width - 360));
      setVar('--left-w', w); localStorage.setItem('lf_pane_--left-w', w);
    });
    bind('rz-right', e => {
      const r = mid.getBoundingClientRect();
      const w = Math.round(clamp(r.right - e.clientX, 190, r.width - 360));
      setVar('--right-w', w); localStorage.setItem('lf_pane_--right-w', w);
    });
    bind('rz-tl', e => {
      const r = editor.getBoundingClientRect();
      const hgt = Math.round(clamp(r.bottom - e.clientY, 120, r.height - 260));
      setVar('--tl-h', hgt); localStorage.setItem('lf_pane_--tl-h', hgt);
    });
  }

  setupStageDrag() {
    const c = this.root.querySelector('#stage');
    if (!c || c._dragBound) return;
    c._dragBound = true;
    const toCanvas = e => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };
    const inBox = (p) => {
      const b = this.engine && this.engine._lyricBox;
      if (!b) return false;
      const pad = Math.min(c.width, c.height) * 0.03;
      return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
    };
    let drag = null;
    c.addEventListener('pointermove', e => {
      if (!drag) { c.style.cursor = inBox(toCanvas(e)) ? 'move' : 'default'; return; }
      const p = toCanvas(e);
      const st = this.tl.lyricStyle;
      st.posX = Math.min(0.96, Math.max(0.04, (p.x + drag.ox) / c.width));
      st.posY = Math.min(0.96, Math.max(0.04, (p.y + drag.oy) / c.height));
      this.engine.render(this.t);
      const sx = this.root.querySelector('#st-posx'), sy = this.root.querySelector('#st-posy');
      if (sx) sx.value = Math.round(st.posX * 100);
      if (sy) sy.value = Math.round(st.posY * 100);
    });
    c.addEventListener('pointerdown', e => {
      const p = toCanvas(e);
      if (!inBox(p)) return;
      const st = this.tl.lyricStyle;
      const cx = c.width * (st.posX ?? 0.5), cy = c.height * (st.posY ?? (c.height > c.width ? 0.5 : 0.58));
      drag = { ox: cx - p.x, oy: cy - p.y };   // 掴んだ点と中心のズレを保持
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
      e.preventDefault();
    });
    const end = e => { if (!drag) return; drag = null; c.style.cursor = 'move'; this.markDirty(); try { c.releasePointerCapture(e.pointerId); } catch (_) {} };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  fitStage() {
    const [w, h] = ASPECTS[this.project.aspect_ratio] || ASPECTS['16:9'];
    this.engine?.resize(w, h);
    const c = this.root.querySelector('#stage');
    if (c) { c.style.aspectRatio = `${w}/${h}`; }
    if (this.engine) this.engine.render(this.t);
  }

  renderAll() { this.renderLeft(); this.renderRight(); this.renderTimeline(); this.fitStage(); }

  /* ---------------- playback ---------------- */
  /* 再生クロックはWeb Workerのタイマーで駆動する。
     rAFやsetIntervalはタブ/ペインが非表示だと絞られ、音声(=audio.currentTime)だけ進んで
     歌詞が取り残される(遅延・ドリフト)。Workerのタイマーは可視性で絞られないため常に追従する。 */
  loop() {
    if (this._clock) return;              // 既に開始済み
    const tick = () => this.frame();
    try {
      const code = 'let id;onmessage=e=>{if(e.data==="start"){id=setInterval(()=>postMessage(0),16)}else{clearInterval(id)}}';
      this._clock = new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      this._clock.onmessage = tick;
      this._clock.postMessage('start');
    } catch (e) {
      // Worker不可の環境ではrAFにフォールバック
      const raf = () => { if (this.destroyed) return; tick(); requestAnimationFrame(raf); };
      this._clock = { terminate() {} };
      requestAnimationFrame(raf);
    }
  }

  frame() {
    if (this.destroyed) return;
    if (this.playing && this.audio.src) this.t = this.audio.currentTime;
    else if (this.playing) this.t += 1 / 60;
    if (this.playing && this.t >= (this.tl.duration || 0)) { this.pause(); this.t = this.tl.duration || 0; }
    if (this.playing && this.metronomeOn && this.tl.bpm) this._metroTick();
    this.engine.render(this.t);
    this._drawGuides();   // プレビュー専用ガイド(書き出しには含めない)
    if (this.tl.compose && this.tl.compose.enabled && !this._exporting) this._composeCutPanel();   // カットが変わったら編集パネル更新
    const tt = this.root.querySelector('#tp-time');
    if (tt) tt.textContent = `${fmtTime(this.t)} / ${fmtTime(this.tl.duration || 0)}`;
    const sc = this.engine.sceneAt(this.t);
    const chip = this.root.querySelector('#scene-chip');
    if (chip) chip.textContent = sc ? `${sc.label} · energy ${(sc.energy * 100 | 0)}%` : 'シーン未解析';
    this.movePlayhead();
  }

  /* 先読みスケジューラ: これから鳴る拍をAudioContextのタイムライン上に前もって予約する。
     「検知した瞬間に鳴らす」方式は 16msポーリングのジッタ + 音声/AudioContextのクロック差で
     ズレて聞こえるため、song時刻→AudioContext時刻に写像して正確に予約する(A Tale of Two Clocks)。 */
  _metroTick() {
    const ac = this._actx;
    if (!ac) return;
    const period = 60 / this.tl.bpm, off = this.tl.beatOffset || 0, bpb = this.tl.beatsPerBar || 4;
    const songT = this.t;                 // 現在の曲内時刻(=audio.currentTime)
    const acNow = ac.currentTime;         // それに対応するAudioContextの現在時刻
    const lookahead = 0.18;               // 先読み窓(秒)
    // 補正: <audio>要素は AudioContext より出力が遅れるため、その分クリックを後ろへずらす
    // (無補正だとクリックが音楽より僅かに先行して聞こえる)。多くの環境で outputLatency が
    // 0 を返すので、その場合は実測代表値(~55ms)を既定補正に使う。metroTrimで微調整可。
    const auto = ac.outputLatency || 0;         // 環境が値を返す時のみ自動補正
    const comp = auto + (this.tl.metroTrim ?? 0.002);  // 既定2ms、スライダーで微調整
    let beat = this._metroScheduled + 1;
    for (; beat < 1e9; beat++) {
      const bt = off + beat * period;     // その拍の曲内時刻
      if (bt < songT - 0.02) continue;    // シーク直後などで過ぎている拍は捨てる
      const when = acNow + (bt - songT) + comp;  // AudioContext上の発音時刻(レイテンシ補正込み)
      if (when > acNow + lookahead) break;
      this._metroClick(beat % bpb === 0, Math.max(when, acNow + 0.001));
      this._metroScheduled = beat;
    }
  }

  togglePlay() { this.playing ? this.pause() : this.play(); }
  play() {
    if (!this.tl.duration) return toast('先に音源を設定してください', 'err');
    // 埋め込みプレビュー等 visibilityState=hidden の環境ではブラウザが画面更新を絞り、
    // 描画は正しくても表示だけがカクつく。初回のみ案内する(書き出しは正しく同期される)。
    if (document.visibilityState === 'hidden' && !this._hiddenWarned) {
      this._hiddenWarned = true;
      toast('この表示環境ではプレビューがカクつく場合があります。滑らかに見るには localhost:4189 をブラウザの別タブで開いてください（書き出しは正しく同期されます）', '');
    }
    this.playing = true;
    if (this.metronomeOn) { this._ensureAudioCtx(); this._syncBeatCursor(); }
    if (this.audio.src) { this.audio.currentTime = this.t; this.audio.play().catch(() => {}); }
    this.root.querySelector('#tp-play').textContent = '⏸';
  }
  pause() {
    this.playing = false;
    this.audio.pause();
    const b = this.root.querySelector('#tp-play');
    if (b) b.textContent = '▶';
  }
  seek(t) {
    this.t = Math.max(0, Math.min(this.tl.duration || 0, t));
    if (this.audio.src) this.audio.currentTime = this.t;
    this._syncBeatCursor();
  }
  /* 1フレーム送り/戻し(dir=+1/-1)。再生中は一時停止してコマ送り、その場で1フレーム描画 */
  stepFrame(dir) {
    if (this.playing) this.pause();
    const step = 1 / (this.tl.fps || 30);
    this.seek(this.t + dir * step);
    if (!this.playing) this.frame();   // 停止中はループが描かないので即描画
  }

  /* プレビュー専用ガイド(セーフゾーン/中央印/三分割グリッド)をステージに上描き。
     エディタのframe()からのみ呼ぶため、書き出し(offscreenレンダ)には一切含まれない。 */
  _drawGuides() {
    const g = this.guides;
    if (!g || (!g.safe && !g.center && !g.grid)) return;
    const cv = this.engine?.canvas; if (!cv) return;
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    if (!W || !H) return;
    ctx.save();
    ctx.lineWidth = Math.max(1, W / 900);
    if (g.grid) {   // 三分割グリッド
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      for (let i = 1; i <= 2; i++) {
        ctx.moveTo(W * i / 3, 0); ctx.lineTo(W * i / 3, H);
        ctx.moveTo(0, H * i / 3); ctx.lineTo(W, H * i / 3);
      }
      ctx.stroke();
    }
    if (g.safe) {   // アクション/タイトルセーフ(90% / 80%)
      ctx.strokeStyle = 'rgba(0,212,255,0.7)';
      for (const m of [0.05, 0.10]) {
        ctx.strokeRect(W * m, H * m, W * (1 - 2 * m), H * (1 - 2 * m));
      }
    }
    if (g.center) {   // 中央のクロスマーク
      ctx.strokeStyle = 'rgba(255,80,120,0.85)';
      const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.03;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 演出エンジン (カット演出) ----------------
     歌詞をカットに分け、構図・登場/保持/退場・装飾・加工・カメラ・つなぎを割り当てる(static/js/compose/)。
     データ: tl.compose = {enabled, seed, style, mood, motion, decor, density, ghost, camera, trans, useWa, cuts:{"line:part": 案}} */
  _cm() {
    if (!this.tl.compose) this.tl.compose = { enabled: false, seed: 1, density: 0.5, motion: 1, decor: 0.6, ghost: 1, camera: 0.5, trans: 0.28, useWa: true };
    return this.tl.compose;
  }
  _composePanelHTML() {
    const L = window.LFC;
    if (!L) return '';
    const cm = this._cm();
    const cnt = L.count();
    const styleOpts = L.STYLE_ORDER.map(k => `<option value="${k}" ${cm.style === k ? 'selected' : ''}>${esc(L.STYLES[k].name)}</option>`).join('');
    const moodOpts = L.MOODS.map(([k, l]) => `<option value="${k}" ${cm.mood === k ? 'selected' : ''}>${l}</option>`).join('');
    const sl = (id, label, v, tip) => `<div class="prop-row" title="${tip}"><span>${label}</span><input type="range" id="${id}" min="0" max="100" value="${Math.round((v == null ? 0.5 : v) * 100)}"></div>`;
    const h = this._cmpHist || [];
    return `
      <div class="prop-group cmp-group">
        <h4>🎬 演出エンジン <span class="cmp-count" title="構図・登場・保持・退場・装飾・加工・カメラ・つなぎ・配色の合計">${cnt.total}種</span></h4>
        <label class="chk-row"><input type="checkbox" id="cmp-on" ${cm.enabled ? 'checked' : ''}><span>カット演出で歌詞を描く</span></label>
        <button class="btn primary cmp-omakase" id="cmp-omakase" title="スタイル・雰囲気・動き・配色・構成をまるごと作り直す(キーボード R)">🎲 おまかせで作る <kbd>R</kbd></button>
        <button class="btn sm cmp-reel" id="cmp-reel" title="言葉とBPMから、拍にぴったり合ったモーショングラフィックスとBGMを作る">🎞 モーションリールを作る（拍同期）</button>
        <div class="cmp-hist">
          <button class="btn sm" id="cmp-prev">◀ 前の案</button>
          <span id="cmp-histpos">${h.length ? `${(this._cmpHistIdx ?? h.length - 1) + 1} / ${h.length}` : '—'}</span>
          <button class="btn sm" id="cmp-next">次の案 ▶</button>
        </div>
        <div class="cmp-partial"><span>ここだけ変える</span>
          <button class="btn sm" data-reroll="style">配色</button><button class="btn sm" data-reroll="layout">構図</button><button class="btn sm" data-reroll="motion">動き</button><button class="btn sm" data-reroll="decor">装飾</button><button class="btn sm" data-reroll="cam">カメラ</button>
        </div>
        <div class="prop-row"><span>スタイル</span><select class="input" id="cmp-style"><option value="">(プロジェクトの配色)</option>${styleOpts}</select></div>
        <div class="prop-row"><span>雰囲気</span><select class="input" id="cmp-mood"><option value="">指定なし</option>${moodOpts}</select></div>
        ${sl('cmp-motion', '動きの強さ', cm.motion, '登場/退場/保持/カメラの動きの大きさ')}
        ${sl('cmp-decor', '装飾の量', cm.decor, '1カットに付く装飾の頻度(再計画)')}
        ${sl('cmp-density', 'カット密度', cm.density, '長い行を何カットに分けるか(再計画)')}
        ${sl('cmp-ghost', '色ずれ', cm.ghost, '動く文字に色ずれの残像を重ねる強さ')}
        ${sl('cmp-camera', 'カメラ', cm.camera, 'カメラワークが付く頻度(再計画)')}
        ${sl('cmp-trans', 'つなぎ', cm.trans, 'カット間のトランジションの頻度(再計画)')}
        <label class="chk-row"><input type="checkbox" id="cmp-wa" ${cm.useWa === false ? '' : 'checked'}><span>和風の演出も使う</span></label>
        <div class="cmp-summary" id="cmp-summary"></div>
        <div class="cmp-cut" id="cmp-cut"></div>
      </div>`;
  }
  _bindComposePanel(el) {
    const L = window.LFC;
    if (!L || !el.querySelector('#cmp-on')) return;
    const $ = s => el.querySelector(s);
    const cm = this._cm();
    $('#cmp-on').onchange = e => {
      cm.enabled = e.target.checked;
      if (cm.enabled && !cm.cuts) this.composePlan();
      this.markDirty(); this._composeRefresh(); this.renderTimeline();
    };
    $('#cmp-omakase').onclick = () => this.composeOmakase();
    $('#cmp-reel').onclick = () => this.openReelMaker();
    $('#cmp-prev').onclick = () => this.composeHist(-1);
    $('#cmp-next').onclick = () => this.composeHist(1);
    el.querySelectorAll('[data-reroll]').forEach(b => b.onclick = () => this.composeReroll(b.dataset.reroll));
    $('#cmp-style').onchange = e => { this.composeApplyStyle(e.target.value); this._composePushHist(); this._composeRefresh(); };
    $('#cmp-mood').onchange = e => { cm.mood = e.target.value || null; this.composePlan(); this._composePushHist(); };
    const replanKeys = ['decor', 'density', 'camera', 'trans'];
    for (const [id, k] of [['cmp-motion', 'motion'], ['cmp-decor', 'decor'], ['cmp-density', 'density'], ['cmp-ghost', 'ghost'], ['cmp-camera', 'camera'], ['cmp-trans', 'trans']]) {
      $('#' + id).oninput = e => { cm[k] = e.target.value / 100; this.markDirty(); };
      if (replanKeys.includes(k)) $('#' + id).onchange = () => { this.composePlan(); };
    }
    $('#cmp-wa').onchange = e => { cm.useWa = e.target.checked; this.composePlan(); };
    this._composeRefresh();
  }
  /* 全カットを計画し直す(固定したカットは保持)。opts.only で一部だけ */
  composePlan(opts = {}) {
    const L = window.LFC;
    if (!L) return;
    const cv = this.engine.canvas;
    L.planAll(this.tl, { W: cv.width, H: cv.height, seed: opts.seed, only: opts.only });
    this.markDirty();
    this._composeRefresh();
    this.renderTimeline();
  }
  composeApplyStyle(key) {
    const L = window.LFC;
    const cm = this._cm();
    const st = L && L.getStyle(key);
    cm.style = key || null;
    if (st && st.colors) this.tl.colors = Object.assign({}, st.colors);
    if (st && st.fonts) for (const f of [].concat(...Object.values(st.fonts))) if (f) this.ensureFont(f);
    this.markDirty();
  }
  /* おまかせ: 雰囲気→それに合うスタイル→スライダー→新しい種で全カットを計画。歌詞・タイミング・固定カットは触らない */
  composeOmakase() {
    const L = window.LFC;
    if (!L) return;
    const cm = this._cm();
    if (!this._cmpHist || !this._cmpHist.length) this._composePushHist();   // 最初の状態も戻れるように
    const rng = L.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);   // UI操作の乱数(描画には使わない)
    const RANGES = {
      pop: { motion: [0.75, 1], decor: [0.6, 0.9], density: [0.45, 0.75], ghost: [0.3, 0.7], camera: [0.4, 0.7], trans: [0.2, 0.4] },
      calm: { motion: [0.3, 0.6], decor: [0.25, 0.5], density: [0.15, 0.4], ghost: [0, 0.3], camera: [0.2, 0.5], trans: [0.1, 0.25] },
      emotional: { motion: [0.45, 0.75], decor: [0.35, 0.6], density: [0.25, 0.5], ghost: [0.2, 0.5], camera: [0.3, 0.6], trans: [0.15, 0.3] },
      glitch: { motion: [0.8, 1], decor: [0.5, 0.85], density: [0.55, 0.9], ghost: [0.7, 1], camera: [0.5, 0.8], trans: [0.3, 0.5] },
      graphic: { motion: [0.7, 1], decor: [0.55, 0.85], density: [0.45, 0.75], ghost: [0.3, 0.6], camera: [0.4, 0.7], trans: [0.25, 0.45] },
      editorial: { motion: [0.45, 0.75], decor: [0.45, 0.75], density: [0.3, 0.55], ghost: [0.1, 0.35], camera: [0.2, 0.45], trans: [0.15, 0.3] },
      cyber: { motion: [0.75, 1], decor: [0.6, 0.9], density: [0.5, 0.8], ghost: [0.6, 1], camera: [0.45, 0.75], trans: [0.3, 0.5] },
      dark: { motion: [0.6, 0.95], decor: [0.4, 0.7], density: [0.45, 0.8], ghost: [0.4, 0.8], camera: [0.4, 0.7], trans: [0.2, 0.4] },
      wa: { motion: [0.4, 0.7], decor: [0.45, 0.75], density: [0.25, 0.5], ghost: [0.1, 0.35], camera: [0.2, 0.45], trans: [0.15, 0.3] },
    };
    const moods = L.MOODS.map(m => m[0]).filter(m => cm.useWa !== false || m !== 'wa');
    const mood = rng.pick(moods);
    const styles = L.STYLE_ORDER.map(k => L.STYLES[k]).filter(s => cm.useWa !== false || !(s.moods || []).includes('wa'));
    const fit = styles.filter(s => (s.moods || []).includes(mood));
    const st = fit.length && rng() < 0.75 ? rng.pick(fit) : (styles.length ? rng.pick(styles) : null);
    const R = RANGES[mood] || RANGES.pop;
    cm.mood = mood;
    for (const k of Object.keys(R)) cm[k] = +rng.range(R[k][0], R[k][1]).toFixed(2);
    cm.enabled = true;
    if (st) this.composeApplyStyle(st.key);
    cm.seed = rng.int(1, 2e9);
    const cv = this.engine.canvas;
    L.planAll(this.tl, { W: cv.width, H: cv.height, seed: cm.seed });
    this.markDirty();
    this._composePushHist();
    this.renderRight();
    this.renderTimeline();
    const ml = (L.MOODS.find(m => m[0] === mood) || [])[1] || mood;
    toast(`おまかせ: ${st ? st.name + ' / ' : ''}${ml}`, 'ok');
  }
  composeReroll(part) {
    const L = window.LFC;
    if (!L) return;
    const cm = this._cm();
    if (!cm.enabled) { cm.enabled = true; }
    if (!this._cmpHist || !this._cmpHist.length) this._composePushHist();
    const rng = L.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    if (part === 'style') {
      const all = L.STYLE_ORDER.filter(k => k !== cm.style && (cm.useWa !== false || !(L.STYLES[k].moods || []).includes('wa')));
      const same = all.filter(k => cm.mood && (L.STYLES[k].moods || []).includes(cm.mood));
      const pick = same.length && rng() < 0.6 ? rng.pick(same) : rng.pick(all);
      if (pick) this.composeApplyStyle(pick);
    } else {
      cm.seed = rng.int(1, 2e9);
      const cv = this.engine.canvas;
      if (!cm.cuts) L.planAll(this.tl, { W: cv.width, H: cv.height, seed: cm.seed });
      else L.planAll(this.tl, { W: cv.width, H: cv.height, seed: cm.seed, only: part });
    }
    this.markDirty();
    this._composePushHist();
    this.renderRight();
    this.renderTimeline();
    toast({ style: '配色', layout: '構図', motion: '動き', decor: '装飾', cam: 'カメラ' }[part] + 'だけ変えました', 'ok');
  }
  _composePushHist() {
    const h = this._cmpHist || (this._cmpHist = []);
    if (this._cmpHistIdx != null && this._cmpHistIdx < h.length - 1) h.splice(this._cmpHistIdx + 1);
    h.push(JSON.parse(JSON.stringify({ cm: this._cm(), colors: this.tl.colors })));
    if (h.length > 60) h.shift();
    this._cmpHistIdx = h.length - 1;
    const pos = this.root.querySelector('#cmp-histpos');
    if (pos) pos.textContent = `${this._cmpHistIdx + 1} / ${h.length}`;
  }
  composeHist(d) {
    const h = this._cmpHist || [];
    const i = (this._cmpHistIdx == null ? h.length - 1 : this._cmpHistIdx) + d;
    if (i < 0 || i >= h.length) return toast(d < 0 ? 'これより前の案はありません' : 'これより後の案はありません');
    this._cmpHistIdx = i;
    const s = JSON.parse(JSON.stringify(h[i]));
    this.tl.compose = s.cm;
    this.tl.compose.planVersion = Date.now();        // キャッシュ済みのカット案を確実に入れ替える
    if (s.colors) this.tl.colors = s.colors;
    const st = window.LFC && window.LFC.getStyle(s.cm.style);
    if (st && st.fonts) for (const f of [].concat(...Object.values(st.fonts))) if (f) this.ensureFont(f);
    this.markDirty();
    this.renderRight();
    this.renderTimeline();
  }
  _composeRefresh() {
    const L = window.LFC;
    const el = this.root.querySelector('#cmp-summary');
    if (!L || !el) return;
    const cm = this._cm();
    const cuts = L.buildCuts(this.tl);
    const st = L.getStyle(cm.style);
    const used = new Set();
    cuts.forEach(c => { const p = (cm.cuts || {})[c.line + ':' + c.part]; if (p && p.layout) used.add(p.layout); });
    const cnt = L.count();
    const col = this.tl.colors || {};
    const sw = ['bg1', 'bg2', 'accent', 'accent2', 'text'].map(k => `<i style="background:${esc(col[k] || '#000')}"></i>`).join('');
    const disp = st && st.fonts && st.fonts.display ? String([].concat(st.fonts.display)[0]).split(',')[0].replace(/'/g, '') : '(歌詞スタイルのフォント)';
    el.innerHTML = `
      <div class="cmp-now"><b>いまの案</b></div>
      <div>スタイル: ${st ? esc(st.name) : 'プロジェクトの配色'} <span class="cmp-sw">${sw}</span></div>
      <div>見出し書体: ${esc(disp)}</div>
      <div>構成: ${cuts.length} カット・構図 ${used.size} 種${cm.enabled ? '' : '（OFF中）'}</div>
      <div class="cmp-lib">ライブラリ: 構図${cnt.layout} 登場${cnt.enter} 保持${cnt.hold} 退場${cnt.exit} 装飾${cnt.decor} 加工${cnt.treat} カメラ${cnt.cam} つなぎ${cnt.trans} 配色${cnt.style}</div>`;
    this._cmpCutIdx = -2;
    this._composeCutPanel();
  }
  /* 再生位置のカットを編集するパネル(カットが変わった時だけ描き直す) */
  _composeCutPanel(force) {
    const L = window.LFC;
    const box = this.root.querySelector('#cmp-cut');
    if (!L || !box) return;
    const cuts = L.buildCuts(this.tl);
    const ci = L.cutAt(cuts, this.t);
    if (!force && ci === this._cmpCutIdx) return;
    this._cmpCutIdx = ci;
    const cut = cuts[ci];
    if (!cut || this.t > cut.end + 0.01) { box.innerHTML = '<div class="empty-note" style="padding:6px 2px">再生位置にカットがありません</div>'; return; }
    const cm = this._cm();
    const key = cut.line + ':' + cut.part;
    const W = this.engine.canvas.width, H = this.engine.canvas.height;
    L.resolveCut(this.tl, cut, cuts, W, H);
    const p = cut.plan || {};
    const opt = (g, cur, none) => (none ? '<option value="">なし</option>' : '') +
      L.list(g).map(d => `<option value="${d.key}" ${cur === d.key ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    const row = (label, g, cur, none) => `<div class="prop-row"><span>${label}</span><select class="input sm" data-cg="${g}">${opt(g.replace(/\d$/, ''), cur, none)}</select></div>`;
    const dk = i => ((p.decor || [])[i] || {}).key;
    box.innerHTML = `
      <div class="cmp-cut-head">カット ${ci + 1} / ${cuts.length}　「${esc(cut.text.slice(0, 16))}${cut.text.length > 16 ? '…' : ''}」</div>
      ${row('構図', 'layout', p.layout)}
      ${row('登場', 'enter', p.enter, true)}
      ${row('保持', 'hold', p.hold, true)}
      ${row('退場', 'exit', p.exit, true)}
      ${row('加工', 'treat', p.treat, true)}
      ${row('装飾', 'decor0', dk(0), true)}
      ${row('装飾2', 'decor1', dk(1), true)}
      ${row('カメラ', 'cam', p.cam, true)}
      ${row('つなぎ', 'trans', p.trans, true)}
      <div class="cmp-cut-btns">
        <button class="btn sm" id="cmp-cut-dice">🎲 このカットだけ振り直す</button>
        <label class="chk-row"><input type="checkbox" id="cmp-cut-lock" ${p.locked ? 'checked' : ''}><span>🔒 固定</span></label>
      </div>`;
    const materialize = () => {
      cm.cuts = cm.cuts || {};
      if (!cm.cuts[key]) cm.cuts[key] = JSON.parse(JSON.stringify(p));
      return cm.cuts[key];
    };
    const st = L.getStyle(cm.style) || {};
    const bump = () => { cm.planVersion = (cm.planVersion || 0) + 1; this.markDirty(); this.renderTimeline(); };
    box.querySelectorAll('[data-cg]').forEach(s => s.onchange = () => {
      const g = s.dataset.cg, q = materialize(), v = s.value || null;
      if (g === 'layout') {
        q.layout = v;
        const d = L.get('layout', v);
        q.params = d && d.plan ? d.plan(L.rng(L.h(cm.seed, key, v)), { text: cut.text, n: cut.n, W, H, dur: cut.dur, portrait: H > W, emph: !!cut.emph, words: cut.words }, st) : {};
      } else if (g === 'decor0' || g === 'decor1') {
        const i = g === 'decor0' ? 0 : 1;
        const arr = (q.decor || []).slice();
        if (v) arr[i] = { key: v, P: (arr[i] && arr[i].P) || { seed: L.h(key, i), v: i, r: 0.5, right: i === 1, low: false, accent: true, big: false, n: 2, corner: i } };
        else arr[i] = null;
        q.decor = arr.filter(Boolean);
      } else if (g === 'treat' || g === 'cam' || g === 'trans') {
        q[g] = v;
        const d = v && L.get(g, v);
        q[g + 'P'] = d && d.plan ? d.plan(L.rng(L.h(key, g, v)), st) : {};
      } else q[g] = v;
      bump();
    });
    box.querySelector('#cmp-cut-dice').onclick = () => {
      const q = materialize();
      const reroll = (q.reroll || 0) + 1;
      const moods = [].concat(cm.mood ? [cm.mood] : [], st.moods || []);
      const rng = L.rng(L.h(cm.seed, 'plan', cut.line, cut.part, reroll));
      const np = L.planCut(cut, { rng, st: L.getStyle(cm.style), moods, cm, portrait: H > W, recent: {}, W, H, keep: null, prevCut: cuts[ci - 1], seed: cm.seed });
      np.reroll = reroll;
      cm.cuts[key] = np;
      bump();
      this._composeCutPanel(true);
    };
    box.querySelector('#cmp-cut-lock').onchange = e => { materialize().locked = e.target.checked; this.markDirty(); };
  }

  /* ---------------- モーションリール(拍同期モーショングラフィックス) ----------------
     言葉とBPMから、全イベントを拍番号で決めた短い映像を組む: 言葉を拍に配置 → 拍ロックの演出計画
     (滑り込み/図形モーフ/弾む/グラフ/トンネル/立方体/…/最後は粒子で文字を組んで爆散) + 同じ拍で作曲したBGM。 */
  openReelMaker() {
    const L = window.LFC;
    if (!L || !L.get('layout', 'm_particles')) return toast('モーショングラフィックスの演出パックが読み込まれていません', 'err');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const words = 'はじまり\nうごく\nかたち\nリズム\n奥へ\nまわる\nLYRICFLOW';
    bg.innerHTML = `
      <div class="modal reelmaker">
        <div class="m-head"><h2>🎞 モーションリールを作る</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <p class="p-sub">言葉を拍に並べ、拍にぴったり合った演出と、同じ拍で自動作曲したBGMの短いモーショングラフィックスを作ります。最後の言葉は粒子が集まって形になります。</p>
          <label class="fld"><span>言葉（1行に1つ・3〜10個）</span><textarea class="input" id="rm-words" rows="7">${words}</textarea></label>
          <div class="rm-row">
            <label class="fld"><span>テンポ (BPM)</span><input class="input" type="number" id="rm-bpm" min="70" max="180" value="${this.tl.bpm && this.tl.bpm >= 70 ? Math.round(this.tl.bpm) : 128}"></label>
            <label class="fld"><span>1語あたりの拍</span><select class="input" id="rm-per"><option value="2">2拍（速い）</option><option value="4" selected>4拍（標準）</option><option value="8">8拍（ゆったり）</option></select></label>
            <label class="fld"><span>スタイル</span><select class="input" id="rm-style"><option value="reelPaper">モーションリール(紙)</option><option value="reelNight">モーションリール(夜)</option></select></label>
          </div>
          <label class="chk-row"><input type="checkbox" id="rm-bgm" checked><span>同じ拍でBGMを自動作曲して曲に設定する</span></label>
          <div class="rm-sum" id="rm-sum"></div>
          <p class="p-sub" style="margin-top:8px">書き出し時に「モーションブラー 10サンプル」を選ぶと、速い動きがなめらかにぶれて映像らしくなります。</p>
        </div>
        <div class="m-foot"><button class="btn" id="rm-cancel">キャンセル</button><button class="btn primary" id="rm-go">🎞 作成する</button></div>
      </div>`;
    document.body.appendChild(bg);
    const $ = s => bg.querySelector(s);
    const read = () => {
      const ws = $('#rm-words').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
      const bpm = Math.max(70, Math.min(180, +$('#rm-bpm').value || 128));
      const per = +$('#rm-per').value || 4;
      const beats = 2 + per * Math.max(0, ws.length - 1) + (per + 2) + 2;
      return { words: ws, bpm, per, beats, style: $('#rm-style').value, bgm: $('#rm-bgm').checked };
    };
    const sum = () => { const o = read(); $('#rm-sum').textContent = `${o.words.length}語 ・ 合計 ${o.beats}拍 ＝ ${(o.beats * 60 / o.bpm).toFixed(1)}秒`; };
    $('#rm-words').oninput = sum; $('#rm-bpm').oninput = sum; $('#rm-per').onchange = sum;
    sum();
    const close = () => bg.remove();
    bg.querySelector('.x-btn').onclick = close;
    $('#rm-cancel').onclick = close;
    $('#rm-go').onclick = async () => {
      const o = read();
      if (o.words.length < 2) return toast('言葉を2つ以上入力してください', 'err');
      if ((this.tl.tracks.lyrics || []).length && !confirm('いまの歌詞・タイミング・曲をモーションリール用に置き換えます。よろしいですか？（元に戻すは「履歴」から）')) return;
      $('#rm-go').disabled = true;
      try { await this.buildMotionReel(o); close(); }
      catch (e) { toast('作成に失敗: ' + e.message, 'err'); $('#rm-go').disabled = false; }
    };
  }
  async buildMotionReel(o) {
    const L = window.LFC;
    const bl = 60 / o.bpm;
    const intro = 2;
    const lyr = [];
    let beat = intro;
    o.words.forEach((w, i) => {
      const last = i === o.words.length - 1;
      const len = last ? o.per + 2 : o.per;
      lyr.push({ id: 'mg' + i + '_' + Date.now().toString(36), word: w, line: i, start: +(beat * bl).toFixed(3), end: +((beat + len - 0.5) * bl).toFixed(3) });
      beat += len;
    });
    const finaleBeat = intro + o.per * (o.words.length - 1);
    const totalBeats = beat + 2;
    const tl = this.tl;
    this.pause();
    tl.lyrics_text = o.words.join('\n');
    tl.tracks.lyrics = lyr;
    tl.duration = +(totalBeats * bl).toFixed(3);
    tl.bpm = o.bpm; tl.beatOffset = 0; tl.showBeats = true;
    tl.sceneDefault = 'flat'; tl.particles = 'none';
    tl.tracks.background = [{ id: 'bg' + Date.now(), start: 0, end: tl.duration, scene: 'flat' }];
    tl.scenes = [];
    tl.fx = Object.assign({}, tl.fx, { bloom: 0.25, glitch: 0.08, chroma: 0.3 });
    const cm = this._cm();
    Object.assign(cm, { enabled: true, beatLock: true, density: 0, motion: 1, decor: 0.8, ghost: 0.6, camera: 0.3, trans: 0, useWa: true, mood: 'graphic' });
    this.composeApplyStyle(o.style);
    cm.seed = L.h('reel', o.words.join('|'), o.bpm) % 2000000000;
    // 拍ロックのカットに、場面ごとの演出を順番に割り当てる
    const SEQ = [
      { layout: 'center', enter: 'slideL', exit: 'whipLeft', scene: 'MOVE' },
      { layout: 'm_morph', enter: 'pop', exit: 'shrinkPoint', scene: 'SHAPE' },
      { layout: 'center', enter: 'dropBounce', exit: 'dropFall', scene: 'RHYTHM' },
      { layout: 'm_graph', enter: 'fade', exit: 'wipeL', scene: 'EASING' },
      { layout: 'm_tunnel', enter: 'zoomFar', exit: 'zoomThrough', scene: 'DEPTH' },
      { layout: 'm_cube', enter: 'spinIn', exit: 'glitchOut', scene: '3D' },
    ];
    const FINAL = { layout: 'm_particles', enter: 'fade', exit: 'particleOut', scene: 'FINALE' };
    const cv = this.engine.canvas;
    const W = cv.width, H = cv.height;
    const cuts = L.buildCuts(tl);
    const st = L.getStyle(cm.style) || {};
    cm.cuts = {};
    cuts.forEach((c, i) => {
      const spec = i === cuts.length - 1 ? FINAL : SEQ[i % SEQ.length];
      const pick = (g, k, fb) => (L.get(g, k) ? k : fb);
      const lay = L.get('layout', spec.layout) || L.get('layout', 'center');
      const rng = L.rng(L.h(cm.seed, 'reel', i));
      cm.cuts[c.line + ':' + c.part] = {
        layout: lay.key,
        params: lay.plan ? lay.plan(rng, { text: c.text, n: c.n, W, H, dur: c.dur, portrait: H > W, emph: i === cuts.length - 1, words: c.words }, st) : {},
        enter: pick('enter', spec.enter, 'fade'), hold: 'still', exit: pick('exit', spec.exit, 'fade'),
        decor: [{ key: 'mgHud', P: { title: 'LYRICFLOW / MOTION REEL', scene: i === 0 ? 'INTRO' : spec.scene } }],
        treat: null, cam: null, trans: null, seed: L.h(cm.seed, 'cut', i),
      };
    });
    cm.planVersion = (cm.planVersion || 0) + 1;
    this.engine.setTimeline(tl);
    this.sel = null;
    this.markDirty();
    this.renderAll();
    this._composePushHist();
    toast(`モーションリールを作成しました（${o.words.length}語・${totalBeats}拍・${o.bpm}BPM）`, 'ok');
    if (o.bgm) {
      toast('BGMを作曲中…');
      const wav = await this._synthReelBGM(o.bpm, totalBeats, finaleBeat + 2);
      const file = new File([wav], `motion_reel_${o.bpm}bpm.wav`, { type: 'audio/wav' });
      try { await this.uploadAsset(file); }
      catch (e) { toast('BGMのアップロードに失敗: ' + e.message + '（映像はそのまま使えます）', 'err'); }
      tl.duration = Math.max(tl.duration, +(totalBeats * bl).toFixed(3));
      this.renderTimeline();
    }
  }
  /* 拍で作曲するBGM(完全に計算で合成・オリジナル): キック/ハット/スネア/ノコギリ7本の和音/ベース/
     キックでのサイドチェイン/決めの前のライザーと0.1秒の無音/決めの一撃。WAV(16bit)を返す */
  async _synthReelBGM(bpm, totalBeats, hitBeat) {
    const sr = 44100, bl = 60 / bpm;
    const dur = totalBeats * bl;                                   // 曲長=拍の合計ちょうど(HUDの拍数と一致)
    const ac = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    const master = ac.createGain(); master.gain.value = 0.85;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.12;
    comp.connect(master); master.connect(ac.destination);
    const drums = ac.createGain(); drums.connect(comp);
    const music = ac.createGain(); music.gain.value = 1; music.connect(comp);
    // 決定論的なノイズ
    const nb = ac.createBuffer(1, sr, sr), nd = nb.getChannelData(0);
    let s = 20260926;
    for (let i = 0; i < nd.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; nd[i] = s / 2147483648 - 1; }
    const noise = (t, len, type, freq, q, gain, dest = drums) => {
      const src = ac.createBufferSource(); src.buffer = nb;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(dest); src.start(t, (t * 0.37) % 0.4); src.stop(t + len + 0.02);
      return f;
    };
    const kick = (t, big = false) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(big ? 120 : 150, t); o.frequency.exponentialRampToValueAtTime(big ? 34 : 42, t + (big ? 0.3 : 0.14));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 1.2 : 1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.1 : 0.36));
      o.connect(g).connect(drums); o.start(t); o.stop(t + (big ? 1.2 : 0.4));
      // サイドチェイン: キックのたびに他の音を一瞬小さく
      music.gain.setValueAtTime(0.25, t); music.gain.linearRampToValueAtTime(1, t + bl * 0.45);
    };
    const hat = t => noise(t, 0.045, 'highpass', 7800, 0.7, 0.22);
    const snare = t => {
      noise(t, 0.2, 'bandpass', 1900, 0.8, 0.55);
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(drums); o.start(t); o.stop(t + 0.2);
    };
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];     // Am - F - C - G
    const pad = (t, len, notes, lvl = 0.05) => {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.5;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lvl, t + 0.04);
      g.gain.setValueAtTime(lvl, Math.max(t + 0.05, t + len - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + len);
      lp.connect(g).connect(music);
      for (const n of notes) for (let k = 0; k < 7; k++) {          // 少しずつ音程をずらしたノコギリ波を7本
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = (k - 3) * 8;
        o.connect(lp); o.start(t); o.stop(t + len + 0.02);
      }
    };
    const bass = (t, n) => {
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = hz(n - 24); lp.type = 'lowpass'; lp.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + bl * 0.45);
      o.connect(lp).connect(g).connect(music); o.start(t); o.stop(t + bl * 0.5);
    };
    const tHit = hitBeat * bl;
    for (let b = 0; b < totalBeats; b++) {
      const t = b * bl, bar = Math.floor(b / 4), inBar = b % 4;
      if (Math.abs(t - tHit) < 1e-6) continue;
      const chord = CH[bar % CH.length];
      if (t >= tHit - 2 * bl && t < tHit) {                       // 決めの前2拍: ハットの連打のみ
        for (let k = 0; k < 4; k++) hat(t + k * bl / 4);
        continue;
      }
      if (b >= 2) kick(t);
      if (b >= 2) hat(t + bl / 2);
      if (b >= 4 && (inBar === 1 || inBar === 3)) snare(t);
      const room = t < tHit ? tHit - 2 * bl - t : Infinity;          // 決めの前2拍には和音を伸ばさない
      const afterHit = t > tHit && t < tHit + bl * 4;                // 決めの和音と重ねない
      if (inBar === 0 && !afterHit) pad(t, Math.max(bl, Math.min(bl * 4, room)), chord);
      if (b >= 2) { bass(t, chord[0]); bass(t + bl / 2, chord[0]); }
    }
    // 決めの前: 上がっていく「シュッ」(ライザー) → 0.1秒の完全な無音 → 一撃
    const rise = noise(tHit - 2 * bl, 2 * bl, 'bandpass', 500, 1.2, 0.35);
    rise.frequency.setValueAtTime(400, tHit - 2 * bl); rise.frequency.exponentialRampToValueAtTime(7000, tHit - 0.1);
    master.gain.setValueAtTime(0.85, tHit - 0.1 - 1e-3); master.gain.setValueAtTime(0, tHit - 0.1);
    master.gain.setValueAtTime(0.85, tHit);
    kick(tHit, true);
    noise(tHit, 1.8, 'highpass', 3200, 0.5, 0.45);                // クラッシュ
    pad(tHit, bl * 4, CH[0].concat([CH[0][0] + 12]), 0.07);
    const buf = await ac.startRendering();
    return this._wavBlob(buf);
  }
  _wavBlob(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, str) => { for (let i = 0; i < str.length; i++) data.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
    data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    w(36, 'data'); data.setUint32(40, len * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return new Blob([data], { type: 'audio/wav' });
  }

  /* ---------------- After Effects 用書き出し (.jsx) ----------------
     AE で「ファイル > スクリプト > スクリプトファイルを実行」すると、コンポ・背景・(任意で)曲・
     カットごとの編集可能なテキストレイヤー(登場/退場をキーフレーム化)・マーカーを組み立てる。
     構図は簡略化(中央配置)。フォントは PostScript 名で指定し、未インストールなら代替書体。 */
  exportAE(state) {
    const L = window.LFC;
    const [W, H] = EXPORT_RES[(state && state.res) || '1080p'][this.project.aspect_ratio] || [1920, 1080];
    const fps = (state && state.fps) || 30;
    const cm = this._cm();
    const col = this.tl.colors || {};
    const PS = {
      'Dela Gothic One': 'DelaGothicOne-Regular', 'Reggae One': 'ReggaeOne-Regular', 'RocknRoll One': 'RocknRollOne-Regular',
      'Rampart One': 'RampartOne-Regular', 'Train One': 'TrainOne-Regular', 'Zen Kaku Gothic New': 'ZenKakuGothicNew-Black',
      'Noto Sans JP': 'NotoSansJP-Black', 'BIZ UDPGothic': 'BIZUDPGothic-Bold', 'M PLUS Rounded 1c': 'MPLUSRounded1c-ExtraBold',
      'Zen Maru Gothic': 'ZenMaruGothic-Black', 'Kosugi Maru': 'KosugiMaru-Regular', 'Zen Kurenaido': 'ZenKurenaido-Regular',
      'Noto Serif JP': 'NotoSerifJP-Black', 'Shippori Mincho': 'ShipporiMincho-ExtraBold', 'Zen Old Mincho': 'ZenOldMincho-Black',
      'Kaisei Tokumin': 'KaiseiTokumin-ExtraBold', 'New Tegomin': 'NewTegomin-Regular', 'Zen Antique': 'ZenAntique-Regular',
      'Hina Mincho': 'HinaMincho-Regular', 'Kaisei Decol': 'KaiseiDecol-Bold', 'Mochiy Pop One': 'MochiyPopOne-Regular',
      'Hachi Maru Pop': 'HachiMaruPop-Regular', 'Yusei Magic': 'YuseiMagic-Regular', 'Klee One': 'KleeOne-SemiBold',
      'Yuji Syuku': 'YujiSyuku-Regular', 'Yuji Mai': 'YujiMai-Regular', 'Yomogi': 'Yomogi-Regular', 'DotGothic16': 'DotGothic16-Regular',
      'Stick': 'Stick-Regular', 'Anton': 'Anton-Regular', 'Bebas Neue': 'BebasNeue-Regular', 'Oswald': 'Oswald-Bold',
      'Montserrat': 'Montserrat-ExtraBold', 'Inter': 'Inter-Black', 'Playfair Display': 'PlayfairDisplay-ExtraBold', 'Zen Dots': 'ZenDots-Regular',
    };
    const famOf = css => String(css || '').split(',')[0].replace(/'/g, '').trim();
    const fontsFor = css => [PS[famOf(css)], 'HiraginoSans-W8', 'HiraKakuStdN-W8', 'YuGothic-Bold', 'KozGoPr6N-Heavy', 'ArialMT'].filter(Boolean);
    const aeKind = (key, name) => {
      const s = `${key || ''} ${name || ''}`.toLowerCase();
      if (!key) return 'none';
      if (/type|タイプ|cursor|カーソル|打ち/.test(s)) return 'type';
      if (/wipe|clip|reveal|iris|curtain|blind|ワイプ|幕|ブラインド|アイリス/.test(s)) return 'wipe';
      if (/slide|whip|push|スライド|流入|ホワッシュ|whoosh/.test(s)) return 'slide';
      if (/drop|fall|bounce|slam|落|バウンス|叩/.test(s)) return 'drop';
      if (/rise|float|上昇|浮|fade-up|slide-up/.test(s)) return 'rise';
      if (/punch|zoom|huge|fly|ズーム|パンチ|迫|奥から/.test(s)) return 'zoom';
      if (/pop|scale|stamp|squash|ポップ|拡大|スカッシュ/.test(s)) return 'pop';
      if (/blur|focus|light|flash|glow|ブラー|光|閃|フォーカス/.test(s)) return 'blur';
      return 'fade';
    };
    const main = (cm.fonts && cm.fonts.display) || (L && L.getStyle(cm.style) && [].concat(L.getStyle(cm.style).fonts.display)[0]) || this.tl.lyricStyle.font || "'Noto Sans JP', sans-serif";
    let cuts = [];
    if (L && cm.enabled) {
      const lc = L.buildCuts(this.tl);
      cuts = lc.map(c => {
        L.resolveCut(this.tl, c, lc, W, H);
        const text = L.splitLines(c.text, c.n > 12 ? Math.ceil(c.n / 2) : 99).join('\n');
        const size = Math.round(L.fitSize(text, main, W * 0.84, H * 0.42, { max: Math.min(W, H) * 0.2 }));
        return { text, start: c.start, end: c.end, inDur: c.inDur, outDur: c.outDur, size, x: W / 2, y: H / 2,
          enter: aeKind(c.plan && c.plan.enter, c.enterDef && c.enterDef.name), exit: aeKind(c.plan && c.plan.exit, c.exitDef && c.exitDef.name),
          color: col.text || '#ffffff', fonts: fontsFor(main) };
      });
    } else {
      // 従来表示: 行ごと
      const byLine = new Map();
      for (const w of this.tl.tracks.lyrics || []) { if (!byLine.has(w.line)) byLine.set(w.line, []); byLine.get(w.line).push(w); }
      const lines = [...byLine.values()].map(ws => ws.sort((a, b) => a.start - b.start)).sort((a, b) => a[0].start - b[0].start);
      const st = this.tl.lyricStyle || {};
      cuts = lines.map((ws, i) => {
        const text = ws.map(w => w.word).join('');
        const start = ws[0].start - 0.1, next = lines[i + 1] ? lines[i + 1][0].start : Infinity;
        const end = Math.min(next - 0.02, ws[ws.length - 1].end + 0.6);
        const size = Math.round((st.size || 64) * (W / 1280));
        return { text, start, end: Math.max(end, start + 0.4), inDur: 0.25, outDur: 0.25, size, x: W * (st.posX ?? 0.5), y: H * (st.posY ?? 0.58),
          enter: aeKind(st.anim, st.anim), exit: 'fade', color: st.color || col.text || '#ffffff', fonts: fontsFor(st.font) };
      });
    }
    const data = {
      title: this.project.title || 'LyricFlow', w: W, h: H, fps, duration: Math.max(1, this.tl.duration || 10),
      colors: { bg1: col.bg1 || '#0d1117', bg2: col.bg2 || col.bg1 || '#1a2040', accent: col.accent || '#00d4ff' },
      glow: (this.tl.fx && this.tl.fx.bloom) || 0.5, cuts,
    };
    const jsx = this._aeScript(data);
    const blob = new Blob(['﻿' + jsx], { type: 'application/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(this.project.title || 'lyricflow').replace(/[\\/:*?"<>|]/g, '_')}_AE.jsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`After Effects用スクリプトを書き出しました（${cuts.length}カット）`, 'ok');
  }
  /* ExtendScript(ES3)本体。非ASCIIは \\uXXXX に置換して文字コード問題を避ける */
  _aeScript(data) {
    const body = `// LyricFlow -> After Effects import script (generated)
// Usage: After Effects > File > Scripts > Run Script File... > choose this file
#target aftereffects
(function () {
var D = ${JSON.stringify(data)};
function hex(c) { c = String(c || '#ffffff').replace('#', ''); if (c.length === 3) { c = c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2); } return [parseInt(c.substr(0, 2), 16) / 255, parseInt(c.substr(2, 2), 16) / 255, parseInt(c.substr(4, 2), 16) / 255]; }
function pad(n) { var s = String(n); while (s.length < 3) { s = '0' + s; } return s; }
function setFont(td, list) { for (var i = 0; i < list.length; i++) { try { td.font = list[i]; if (td.font === list[i]) { return list[i]; } } catch (e) {} } return null; }
function ease(prop) {
  try {
    var n = 1;
    if (prop.propertyValueType !== PropertyValueType.TwoD_SPATIAL && prop.propertyValueType !== PropertyValueType.ThreeD_SPATIAL && prop.value instanceof Array) { n = prop.value.length; }
    for (var k = 1; k <= prop.numKeys; k++) { var arr = []; for (var j = 0; j < n; j++) { arr.push(new KeyframeEase(0, 70)); } prop.setTemporalEaseAtKey(k, arr, arr); }
  } catch (e) {}
}
function keys(prop, a, b, hidden, rest, isIn) { prop.setValueAtTime(a, isIn ? hidden : rest); prop.setValueAtTime(b, isIn ? rest : hidden); ease(prop); }
function motion(L, kind, a, b, isIn, c) {
  if (kind === 'none' || b <= a) { return; }
  var tr = L.property('ADBE Transform Group');
  var op = tr.property('ADBE Opacity'), pos = tr.property('ADBE Position'), sc = tr.property('ADBE Scale');
  var p0 = [c.x, c.y], s0 = [100, 100];
  if (kind !== 'type' && kind !== 'wipe') { keys(op, a, b, 0, 100, isIn); }
  if (kind === 'rise') { keys(pos, a, b, [p0[0], p0[1] + c.size * 0.8], p0, isIn); }
  else if (kind === 'drop') { keys(pos, a, b, [p0[0], p0[1] - c.size * 1.3], p0, isIn); }
  else if (kind === 'slide') { keys(pos, a, b, [p0[0] + (isIn ? D.w * 0.22 : -D.w * 0.22), p0[1]], p0, isIn); }
  else if (kind === 'pop') { keys(sc, a, b, [35, 35], s0, isIn); }
  else if (kind === 'zoom') { keys(sc, a, b, [190, 190], s0, isIn); }
  else if (kind === 'blur') { try { var gb = L.property('ADBE Effect Parade').addProperty('ADBE Gaussian Blur 2'); keys(gb.property(1), a, b, 45, 0, isIn); } catch (e) {} }
  else if (kind === 'wipe') { try { var lw = L.property('ADBE Effect Parade').addProperty('ADBE Linear Wipe'); lw.property(2).setValue(isIn ? 270 : 90); lw.property(3).setValue(c.size * 0.4); keys(lw.property(1), a, b, 100, 0, isIn); } catch (e) { keys(op, a, b, 0, 100, isIn); } }
  else if (kind === 'type') {
    try {
      var an = L.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
      an.name = isIn ? 'Type In' : 'Type Out';
      an.property('ADBE Text Animator Properties').addProperty('ADBE Text Opacity').setValue(0);
      var sel = an.property('ADBE Text Selectors').addProperty('ADBE Text Selector');
      keys(sel.property('ADBE Text Percent Start'), a, b, 0, 100, isIn);
    } catch (e) { keys(op, a, b, 0, 100, isIn); }
  }
}
app.beginUndoGroup('LyricFlow import');
var proj = app.project || app.newProject();
var folder = proj.items.addFolder(D.title + ' (LyricFlow)');
var comp = proj.items.addComp(D.title, D.w, D.h, 1, D.duration, D.fps);
comp.parentFolder = folder;
comp.bgColor = hex(D.colors.bg1);
var bg = comp.layers.addSolid(hex(D.colors.bg1), 'BG', D.w, D.h, 1, D.duration);
try { var ramp = bg.property('ADBE Effect Parade').addProperty('ADBE Ramp'); ramp.property(1).setValue([0, 0]); ramp.property(2).setValue(hex(D.colors.bg1)); ramp.property(3).setValue([D.w, D.h]); ramp.property(4).setValue(hex(D.colors.bg2)); } catch (e) {}
var missing = {};
for (var i = 0; i < D.cuts.length; i++) {
  var c = D.cuts[i];
  var L = comp.layers.addText(String(c.text).replace(/\\n/g, '\\r'));
  L.name = pad(i + 1) + ' ' + String(c.text).replace(/\\n/g, ' ');
  var tp = L.property('ADBE Text Properties').property('ADBE Text Document');
  var td = tp.value;
  try { td.resetCharStyle(); td.resetParagraphStyle(); } catch (e) {}
  if (!setFont(td, c.fonts)) { missing[c.fonts[0]] = true; }
  td.fontSize = c.size; td.applyFill = true; td.fillColor = hex(c.color); td.applyStroke = false;
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  tp.setValue(td);
  L.startTime = 0; L.inPoint = Math.max(0, c.start); L.outPoint = Math.min(D.duration, Math.max(c.end, c.start + 0.1));
  try { var r = L.sourceRectAtTime(L.inPoint, false); L.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([r.left + r.width / 2, r.top + r.height / 2]); } catch (e) {}
  L.property('ADBE Transform Group').property('ADBE Position').setValue([c.x, c.y]);
  motion(L, c.enter, L.inPoint, L.inPoint + c.inDur, true, c);
  motion(L, c.exit, L.outPoint - c.outDur, L.outPoint, false, c);
  try { comp.markerProperty.setValueAtTime(Math.max(0, c.start), new MarkerValue(String(c.text).replace(/\\n/g, ' '))); } catch (e) {}
}
if (D.glow > 0.2) { try { var adj = comp.layers.addSolid([1, 1, 1], 'Glow', D.w, D.h, 1, D.duration); adj.adjustmentLayer = true; var gl = adj.property('ADBE Effect Parade').addProperty('ADBE Glo2'); gl.property(2).setValue(40); gl.property(3).setValue(0.6 + D.glow * 0.8); } catch (e) {} }
var f = File.openDialog('Select the song audio file (Cancel = no audio)');
if (f) { try { var it = proj.importFile(new ImportOptions(f)); it.parentFolder = folder; var al = comp.layers.add(it); al.moveToEnd(); } catch (e) {} }
comp.openInViewer();
app.endUndoGroup();
var miss = []; for (var k in missing) { miss.push(k); }
alert('LyricFlow: ' + D.cuts.length + ' text layers created.' + (miss.length ? '\\nMissing fonts (fallback used): ' + miss.join(', ') : ''));
})();
`;
    return body.replace(/[^\x00-\x7F]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  }

  /* ---------------- フォント見本 ----------------
     実際の歌詞を各フォントで「そのフォントに合う動き」でループ表示して比較し、
     歌詞(従来表示)/主役/強調/補助(演出エンジンの役割フォント)に割り当てる。 */
  openFontLab() {
    const L = window.LFC;
    const cm = this._cm();
    const famOf = css => String(css).split(',')[0].replace(/'/g, '').trim();
    let sample = '';
    if (L) { const cuts = L.buildCuts(this.tl); const ci = L.cutAt(cuts, this.t); if (ci >= 0 && cuts[ci]) sample = cuts[ci].text; }
    if (!sample) { const ln = (this.tl.lyrics_text || '').split('\n').map(s => s.trim()).find(Boolean); if (ln) sample = L ? L.parseNotation(ln).text : ln; }
    if (!sample) sample = 'ぼくらは夜明けを待っている ーABC 123';
    const state = { mood: '', jpOnly: true, sample };
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal wide fontlab">
        <div class="m-head"><h2>🔤 フォント見本 — 歌詞で動かして選ぶ</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <div class="fl-bar">
            <input class="input" id="fl-sample" value="${esc(sample)}" placeholder="試す歌詞(漢字・かな・濁音・小さい文字・長音・英数字を含むと弱点が分かります)">
            <label class="chk-row"><input type="checkbox" id="fl-jp" checked><span>日本語対応のみ</span></label>
          </div>
          <div class="fl-moods" id="fl-moods"><button class="fl-chip sel" data-m="">すべて</button>${FONT_MOODS.map(([k, l]) => `<button class="fl-chip" data-m="${k}">${l}</button>`).join('')}</div>
          <div class="fl-pairs"><span>おすすめの組み合わせ（主役／強調／補助）</span>${FONT_PAIRS.map((p, i) => `<button class="btn sm" data-pair="${i}" title="${famOf(p[1])} / ${famOf(p[2])} / ${famOf(p[3])}">${p[0]}</button>`).join('')}</div>
          <div class="fl-roles" id="fl-roles"></div>
          <div class="fl-grid" id="fl-grid"></div>
          <p class="p-sub" style="margin-top:10px">主役は太めで読みやすい書体、明朝・手書きは短いフレーズや強調語に。書体は2〜3種類に絞ると画面がまとまります。主役/強調/補助は演出エンジン(カット演出)で使われます。</p>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const $ = s => bg.querySelector(s);
    const grid = $('#fl-grid');
    const cards = [];
    const roleName = { lyric: '歌詞', display: '主役', serif: '強調', body: '補助' };
    const renderRoles = () => {
      const f = cm.fonts || {};
      const item = (k, css) => `<span class="fl-role"><em>${roleName[k]}</em><b style="font-family:${css || 'inherit'}">${css ? esc(famOf(css)) : '（スタイル既定）'}</b></span>`;
      $('#fl-roles').innerHTML = item('lyric', this.tl.lyricStyle.font) + item('display', f.display) + item('serif', f.serif) + item('body', f.body) +
        (cm.fonts ? '<button class="btn sm ghost" id="fl-reset">役割をスタイル既定に戻す</button>' : '');
      const rs = $('#fl-reset');
      if (rs) rs.onclick = () => { delete cm.fonts; cm.planVersion = (cm.planVersion || 0) + 1; this.markDirty(); renderRoles(); };
    };
    const assign = (role, css) => {
      if (role === 'lyric') this.tl.lyricStyle.font = css;
      else { cm.fonts = Object.assign({}, cm.fonts || {}, { [role]: css }); cm.planVersion = (cm.planVersion || 0) + 1; }
      this.ensureFont(css);
      this.markDirty();
      renderRoles();
      toast(`${roleName[role]}フォント: ${famOf(css)}${role !== 'lyric' && !cm.enabled ? '（演出エンジンON時に反映）' : ''}`, 'ok');
    };
    const renderGrid = () => {
      const list = FONTS.filter(([css]) => {
        const m = FONT_META[famOf(css)] || { m: [] };
        if (state.jpOnly && m.jp === false) return false;
        return !state.mood || (m.m || []).includes(state.mood);
      });
      grid.innerHTML = list.map(([css, label, cat]) => {
        const m = FONT_META[famOf(css)] || { m: [], mo: 'fade' };
        const tags = (m.m || []).map(k => (FONT_MOODS.find(x => x[0] === k) || [])[1]).filter(Boolean).map(s => `<i>${s}</i>`).join('');
        return `<div class="fl-card" data-css="${css.replace(/"/g, '&quot;')}">
          <canvas width="560" height="180"></canvas>
          <div class="fl-info"><b style="font-family:${css}">${esc(label)}</b><span class="fl-cat">${cat}${m.jp === false ? '・欧文のみ' : ''}</span></div>
          <div class="fl-tags">${tags}</div>
          <div class="fl-mo">推奨の動き: ${FONT_MOTIONS[m.mo] || '—'}</div>
          <div class="fl-btns"><button class="btn sm" data-role="lyric">歌詞に使う</button><button class="btn sm" data-role="display">主役</button><button class="btn sm" data-role="serif">強調</button><button class="btn sm" data-role="body">補助</button></div>
        </div>`;
      }).join('') || '<div class="empty-note">該当するフォントがありません</div>';
      cards.length = 0;
      grid.querySelectorAll('.fl-card').forEach((card, i) => {
        const css = card.dataset.css;
        if (document.fonts && document.fonts.load) document.fonts.load(`900 48px ${css}`, state.sample).catch(() => {});
        cards.push({ cv: card.querySelector('canvas'), css, mo: (FONT_META[famOf(css)] || {}).mo || 'fade', off: i * 0.37 });
        card.querySelectorAll('[data-role]').forEach(b => b.onclick = () => assign(b.dataset.role, css));
      });
    };
    $('#fl-sample').oninput = e => { state.sample = e.target.value || ' '; };
    $('#fl-jp').onchange = e => { state.jpOnly = e.target.checked; renderGrid(); };
    bg.querySelectorAll('#fl-moods .fl-chip').forEach(b => b.onclick = () => {
      bg.querySelectorAll('#fl-moods .fl-chip').forEach(x => x.classList.toggle('sel', x === b));
      state.mood = b.dataset.m; renderGrid();
    });
    bg.querySelectorAll('[data-pair]').forEach(b => b.onclick = () => {
      const p = FONT_PAIRS[+b.dataset.pair];
      cm.fonts = { display: p[1], serif: p[2], body: p[3] };
      [p[1], p[2], p[3]].forEach(f => this.ensureFont(f));
      cm.planVersion = (cm.planVersion || 0) + 1;
      this.markDirty(); renderRoles();
      toast(`組み合わせ「${p[0]}」を主役/強調/補助に設定${cm.enabled ? '' : '（演出エンジンON時に反映）'}`, 'ok');
    });
    renderRoles();
    renderGrid();
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      if (!bg.isConnected) return;
      const t = (performance.now() - t0) / 1000;
      const vh = window.innerHeight;
      for (const c of cards) {
        const r = c.cv.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        this._drawFontSample(c.cv, c.css, state.sample, c.mo, (t + c.off) % 2.8);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const close = () => { cancelAnimationFrame(raf); bg.remove(); this.renderRight(); };
    bg.querySelector('.x-btn').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
  }
  /* フォント見本の1コマ: 字を実際に並べ、そのフォントに合う動きで出入りさせる(2.8秒ループ) */
  _drawFontSample(cv, css, text, mo, t) {
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bgGrad = g.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0f1422'); bgGrad.addColorStop(1, '#221a3d');
    g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);
    const chars = Array.from(text || ' ');
    g.font = `900 100px ${css}`;
    const w100 = g.measureText(text || ' ').width || 1;
    const size = Math.max(10, Math.min(H * 0.46, (W * 0.88) / w100 * 100));
    g.font = `900 ${size}px ${css}`;
    g.textBaseline = 'middle'; g.textAlign = 'center';
    const widths = chars.map(ch => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const x0 = (W - total) / 2, cy = H / 2;
    const eo = x => 1 - Math.pow(1 - x, 3);
    const ob = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
    const pin = Math.min(1, t / 0.6), pout = Math.max(0, (t - 2.25) / 0.5);
    let x = x0;
    let shown = 0;
    chars.forEach((ch, i) => {
      const w = widths[i];
      const pi = Math.min(1, Math.max(0, (t - i * 0.05) / 0.45));
      let dx = 0, dy = 0, s = 1, a = 1, show = true;
      if (mo === 'pop') { s = 0.4 + 0.6 * ob(pi); a = Math.min(1, pi * 2); if (t > 0.8 && t < 2.2) dx = Math.sin(t * 40 + i) * size * 0.012; }
      else if (mo === 'slide') { dx = (1 - eo(pin)) * W * 0.45; a = pin; }
      else if (mo === 'fade') { a = eo(pin); dy = (1 - eo(pin)) * size * 0.25; }
      else if (mo === 'zoom') { s = 0.86 + 0.14 * eo(Math.min(1, t / 2.2)); a = eo(pin); }
      else if (mo === 'type' || mo === 'blink') { show = t > i * 0.07; }
      else if (mo === 'wave') { a = pi; dy = Math.sin(t * 5 + i * 0.7) * size * 0.07 + (1 - ob(pi)) * size * 0.4; }
      else if (mo === 'emph') { s = i < 2 ? 0.55 + 0.6 * ob(pi) : 1; a = pi; }
      a *= 1 - pout;
      if (show) shown++;
      if (show && a > 0.01) {
        g.save();
        g.globalAlpha = Math.min(1, a);
        g.translate(x + w / 2 + dx, cy + dy);
        g.scale(s, s);
        g.shadowColor = 'rgba(0,212,255,.35)'; g.shadowBlur = 8;
        g.fillStyle = '#ffffff';
        g.fillText(ch, 0, 0);
        g.restore();
      }
      x += w;
    });
    if (mo === 'blink' && Math.floor(t * 3) % 2 === 0 && pout < 1) {
      const cx = x0 + widths.slice(0, shown).reduce((a, b) => a + b, 0);
      g.fillStyle = 'rgba(0,212,255,.9)';
      g.fillRect(cx + 3, cy - size * 0.42, Math.max(3, size * 0.07), size * 0.84);
    }
  }

  /* ---------------- left pane ---------------- */
  renderLeft() {
    const el = this.root.querySelector('#left-pane');
    if (this.leftTab === 'media') {
      const audios = this.assets.filter(a => a.type === 'audio');
      const others = this.assets.filter(a => a.type !== 'audio');
      el.innerHTML = `
        <button class="btn sm" id="up-btn" style="width:100%;justify-content:center;margin-bottom:11px">⬆ アップロード</button>
        <input type="file" id="up-file" accept=".mp3,.wav,.png,.jpg,.jpeg,.webp,.svg,.mp4,.webm,.ttf,.otf,.woff2" style="display:none">
        <div style="font-size:10.5px;font-weight:800;color:var(--faint);letter-spacing:.08em;margin:6px 0">音源 (MP3 / WAV)</div>
        ${audios.map(a => `
          <div class="media-item ${a.id === this.tl.audio_asset_id ? 'sel' : ''}" data-id="${a.id}">
            <div class="mi-ic">♪</div>
            <div style="min-width:0;flex:1">
              <div class="mi-name">${esc(a.filename)}</div>
              <div class="mi-meta">${a.metadata?.duration ? fmtTime(a.metadata.duration) : ''} · ${fmtBytes(a.size_bytes)}</div>
            </div>
          </div>`).join('') || '<div class="empty-note">音源がありません。<br>アップロードしてください。</div>'}
        ${others.length ? `<div style="font-size:10.5px;font-weight:800;color:var(--faint);letter-spacing:.08em;margin:12px 0 6px">その他素材</div>` : ''}
        ${others.map(a => `
          <div class="media-item" data-nop="1">
            <div class="mi-ic">${a.type === 'image' ? `<img src="${a.url}">` : a.type === 'font' ? 'Aa' : '▶'}</div>
            <div style="min-width:0;flex:1"><div class="mi-name">${esc(a.filename)}</div><div class="mi-meta">${a.type} · ${fmtBytes(a.size_bytes)}</div></div>
          </div>`).join('')}`;
      el.querySelector('#up-btn').onclick = () => el.querySelector('#up-file').click();
      el.querySelector('#up-file').onchange = e => this.uploadAsset(e.target.files[0]);
      el.querySelectorAll('.media-item[data-id]').forEach(m => m.onclick = () => this.setAudio(m.dataset.id));
    } else if (this.leftTab === 'templates') {
      el.innerHTML = this.templates.map(t => `
        <div class="media-item ${this.tl.template === t.id ? 'sel' : ''}" data-tpl="${t.id}">
          <canvas width="76" height="44" style="border-radius:5px;flex:none" data-thumb="${t.id}"></canvas>
          <div style="min-width:0;flex:1">
            <div class="mi-name">${esc(t.title)}</div>
            <div class="mi-meta">${t.price_usd > 0 ? '$' + t.price_usd : 'Free'} · ★${t.rating}</div>
          </div>
        </div>`).join('');
      el.querySelectorAll('canvas[data-thumb]').forEach(c => {
        const t = this.templates.find(x => x.id === c.dataset.thumb);
        renderTemplateThumb(c, t.config, '歌詞');
      });
      el.querySelectorAll('[data-tpl]').forEach(m => m.onclick = () => this.applyTemplate(m.dataset.tpl));
    } else { // lyrics
      el.innerHTML = `
        <label class="fld"><span>歌詞テキスト (1行=1フレーズ)</span>
          <textarea class="input" id="lyr-text" rows="10" placeholder="ここに歌詞を入力…">${esc(this.tl.lyrics_text || '')}</textarea>
        </label>
        <details class="notation-help">
          <summary>演出エンジンの記法</summary>
          <div><code>*強調*</code> 強調語(大きな構図・色で目立たせる)</div>
          <div><code>行の末尾に !</code> 衝撃(強いカメラ・大きな構図に寄せる)</div>
          <div><code>本文|注釈</code> 注釈を小さく添える</div>
          <div><code>語の後ろに /</code> そこでカットを分ける</div>
          <div class="nh-ex">例) 夜明けの*鼓動*を / 聞かせて!</div>
        </details>
        <div style="display:flex;gap:7px;margin-bottom:9px">
          <button class="btn sm" id="lrc-btn" style="flex:1;justify-content:center">LRC/SRT読込</button>
          <input type="file" id="lrc-file" accept=".lrc,.srt" style="display:none">
          <button class="btn primary sm" id="apply-lyr" style="flex:1;justify-content:center">反映</button>
        </div>
        <div class="empty-note" style="padding:8px 4px;text-align:left">「反映」後、右パネルの <b style="color:var(--cyan)">AI歌詞同期</b> でタイムスタンプを自動生成できます。</div>`;
      el.querySelector('#apply-lyr').onclick = () => {
        this.tl.lyrics_text = el.querySelector('#lyr-text').value;
        this.markDirty();
        toast('歌詞を更新しました。AI歌詞同期を実行してください', 'ok');
      };
      el.querySelector('#lrc-btn').onclick = () => el.querySelector('#lrc-file').click();
      el.querySelector('#lrc-file').onchange = e => this.importLrc(e.target.files[0]);
    }
  }

  async addSubject(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    toast('キャラ画像をアップロード中…');
    try {
      const a = await API.upload(`/workspaces/${this.project.workspace_id}/assets`, fd);
      this.assets.unshift(a);
      this.tl.subject = { asset_id: a.id, url: a.url, name: a.filename, scale: 0.72, x: 0.5, y: 0.98 };
      this.engine.setTimeline(this.tl);
      this.markDirty(); this.renderRight();
      toast('前景キャラを配置しました', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---- 3Dダンス (VRM × MMD): VRM Atelier連携 + ファイルアップロード ---- */
  async _loadAtelier(force) {
    // 成功時のみキャッシュする。失敗をキャッシュすると、後からVRM Atelierを
    // 起動しても一覧が空のままになり「アバターを選べない」状態が固定化する。
    if (this._atelier?.connected && !force) return this._atelier;
    const out = { connected: false, avatars: [], motions: [], reason: '' };
    try {
      const st = await API.req('GET', '/atelier/status');
      if (st.connected) {
        out.connected = true;
        out.avatars = (await API.req('GET', '/atelier/avatars')).avatars || [];
        out.motions = (await API.req('GET', '/atelier/motions')).motions || [];
      } else {
        out.reason = /refus|connection|timed out/i.test(st.reason || '')
          ? 'VRM Atelier (:4188) が起動していません'
          : (st.reason || '未接続');
      }
    } catch (e) {
      out.reason = 'APIキー未設定またはVRM Atelierに到達できません';
    }
    this._atelier = out;
    return out;
  }

  _bindDancePanel($) {
    const d = this.tl.dance;
    if (!d?.enabled) {
      const btn = $('#dn-setup');
      if (btn) btn.onclick = () => {
        this.tl.dance = { enabled: true, scale: 0.92, x: 0.5, y: 1.0, offset: 0, camera: false };
        this.markDirty(); this.renderRight();
      };
      return;
    }
    // セレクトをAtelier一覧で埋める
    const fillAtelier = (force) => this._loadAtelier(force).then(at => {
      const vs = $('#dn-vrm-sel'), ms = $('#dn-vmd-sel'), note = $('#dn-atelier-note');
      if (!vs || !ms) return;
      const proxied = u => '/api/v1/atelier/file?path=' + encodeURIComponent(u);
      vs.innerHTML = '<option value="">— 選択 —</option>' + at.avatars.map(a =>
        `<option value="${proxied(a.file_url)}">${esc(a.name)}</option>`).join('');
      ms.innerHTML = '<option value="">なし (立ちポーズ)</option>' + at.motions.map(m =>
        `<option value="${proxied(m.file_url)}">${esc(m.name)}</option>`).join('');
      if (note) {
        note.textContent = at.connected
          ? `アバター${at.avatars.length} / モーション${at.motions.length}`
          : `${at.reason} — 起動後に「↻ 再読込」`;
        note.style.color = at.connected ? 'var(--muted)' : 'var(--warn, #e8a33d)';
      }
      if (d.vrm_url) vs.value = d.vrm_url;
      if (d.vmd_url) ms.value = d.vmd_url;
      vs.onchange = e => {
        d.vrm_url = e.target.value || null;
        d.vrm_name = e.target.selectedOptions[0]?.textContent || '';
        this.markDirty();
      };
      ms.onchange = e => {
        d.vmd_url = e.target.value || null;
        d.vmd_name = e.target.selectedOptions[0]?.textContent || '';
        this.markDirty();
      };
    });
    fillAtelier(false);
    $('#dn-reload').onclick = () => fillAtelier(true);
    $('#dn-vrm-up').onclick = () => $('#dn-vrm-file').click();
    $('#dn-vmd-up').onclick = () => $('#dn-vmd-file').click();
    $('#dn-vrm-file').onchange = e => this._uploadDanceFile(e.target.files[0], 'vrm');
    $('#dn-vmd-file').onchange = e => this._uploadDanceFile(e.target.files[0], 'vmd');
    // 縦位置に必要な量は大きさに比例する(キャラが画面より大きいほど、下端まで
    // 送るのに大きな値が要る)。上限を大きさに連動させ、常に端まで届くようにする。
    const charFrac = () => window.Stage3D?._last?.charFrac || window.Stage3D?.CHAR_FRAC || 0.81;
    const syncYRange = () => {
      const yEl = $('#dn-y');
      if (!yEl) return;
      const max = Math.max(160, Math.round((1 + (d.scale ?? 0.92) / charFrac()) * 100));
      yEl.max = String(max);
      if (+yEl.value > max) { yEl.value = String(max); d.y = max / 100; }
      const v = $('#dn-y-v');
      if (v) v.textContent = Math.round(+yEl.value) + '%';
    };
    $('#dn-scale').oninput = e => {
      d.scale = e.target.value / 100;
      $('#dn-scale-v').textContent = e.target.value + '%';
      syncYRange();
      this.markDirty();
    };
    $('#dn-x').oninput = e => { d.x = e.target.value / 100; this.markDirty(); };
    $('#dn-y').oninput = e => {
      d.y = e.target.value / 100;
      $('#dn-y-v').textContent = e.target.value + '%';
      this.markDirty();
    };
    syncYRange();
    $('#dn-offset').onchange = e => { d.offset = +e.target.value || 0; this.markDirty(); };
    $('#dn-camera').onchange = e => { d.camera = e.target.checked; this.markDirty(); };
    // ステージの横幅比(左右の見切れ対策)
    $('#dn-ar').onclick = e => {
      const b = e.target.closest('button[data-ar]');
      if (!b) return;
      d.aspect = +b.dataset.ar;
      for (const x of e.currentTarget.querySelectorAll('button[data-ar]')) {
        x.classList.toggle('primary', x === b);
      }
      this.markDirty();   // プレビューは毎フレーム描き直されるので即反映される
    };
    $('#dn-del').onclick = () => {
      this.tl.dance = null;
      if (this.engine._stage) { this.engine._stage.dispose(); this.engine._stage = null; }
      this.markDirty(); this.renderRight();
    };
  }

  async _uploadDanceFile(file, kind) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    toast((kind === 'vrm' ? 'VRM' : 'VMD') + 'をアップロード中…');
    try {
      const a = await API.upload(`/workspaces/${this.project.workspace_id}/assets`, fd);
      const d = this.tl.dance;
      if (kind === 'vrm') { d.vrm_url = a.url; d.vrm_name = a.filename; }
      else { d.vmd_url = a.url; d.vmd_name = a.filename; }
      this.markDirty(); this.renderRight();
      toast('設定しました', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  async uploadAsset(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    if (/\.(mp3|wav|m4a)$/i.test(file.name)) {
      try {
        const url = URL.createObjectURL(file);
        const { env, duration, hop } = await computeEnvelope(url);
        fd.append('metadata', JSON.stringify({ duration: Math.round(duration * 100) / 100, envelope: env, hop }));
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
    toast('アップロード中…');
    const a = await API.upload(`/workspaces/${this.project.workspace_id}/assets`, fd);
    this.assets.unshift(a);
    this.renderLeft();
    toast('アップロード完了', 'ok');
    if (a.type === 'audio') this.setAudio(a.id);
  }

  async setAudio(assetId) {
    this.tl.audio_asset_id = assetId;
    const a = this.assets.find(x => x.id === assetId);
    this.tl.duration = a?.metadata?.duration || this.tl.duration || 0;
    await this.loadAudio();
    // 背景クリップを曲長に合わせる
    if (!this.tl.tracks.background.length) {
      this.tl.tracks.background.push({ id: 'bg' + Date.now(), start: 0, end: this.tl.duration, scene: this.tl.sceneDefault || 'city' });
    } else { this.tl.tracks.background[0].end = this.tl.duration; }
    this.markDirty();
    this.renderLeft();
    this.renderTimeline();
    toast(`音源を設定しました (${fmtTime(this.tl.duration)})`, 'ok');
  }

  applyTemplate(tplId) {
    const t = this.templates.find(x => x.id === tplId);
    if (!t) return;
    const c = t.config;
    Object.assign(this.tl, {
      template: tplId, colors: c.colors, fx: { ...c.fx }, particles: c.particles, sceneDefault: c.scene,
      lyricStyle: { ...this.tl.lyricStyle, font: c.font, anim: c.anim, glow: c.fx.bloom, color: c.colors.text,
                    lettering: c.lettering || 'neon', orient: c.orient || 'horizontal' },
    });
    if (this.tl.tracks.background[0]) this.tl.tracks.background[0].scene = c.scene;
    this.engine.setTimeline(this.tl);
    this.markDirty();
    this.renderLeft(); this.renderRight();
    toast(`テンプレート「${t.title}」を適用しました`, 'ok');
  }

  importLrc(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const words = [];
      let lineIdx = 0;
      if (/\[\d+:\d+/.test(text)) { // LRC
        const lines = text.split(/\r?\n/).map(l => {
          const m = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/.exec(l);
          return m ? { t: (+m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() } : null;
        }).filter(Boolean).filter(l => l.text);
        lines.forEach((l, i) => {
          const end = lines[i + 1]?.t ?? Math.min((this.tl.duration || l.t + 4), l.t + 5);
          const chunks = splitWordsJS(l.text);
          const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
          let t = l.t;
          for (const c of chunks) {
            const d = (end - l.t) * 0.92 * c.length / total;
            words.push({ id: Math.random().toString(36).slice(2, 10), word: c, line: i, start: +t.toFixed(2), end: +(t + d).toFixed(2) });
            t += d;
          }
        });
      } else if (/-->/.test(text)) { // SRT
        const blocks = text.split(/\r?\n\r?\n/);
        for (const b of blocks) {
          const m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/.exec(b);
          if (!m) continue;
          const st = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
          const en = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
          const txt = b.split(/\r?\n/).slice(2).join(' ').trim();
          if (!txt) continue;
          const chunks = splitWordsJS(txt);
          const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
          let t = st;
          for (const c of chunks) {
            const d = (en - st) * c.length / total;
            words.push({ id: Math.random().toString(36).slice(2, 10), word: c, line: lineIdx, start: +t.toFixed(2), end: +(t + d).toFixed(2) });
            t += d;
          }
          lineIdx++;
        }
      }
      if (!words.length) return toast('LRC/SRTの解析に失敗しました', 'err');
      this.tl.tracks.lyrics = words;
      this.tl.lyrics_text = [...new Set(words.map(w => w.line))].map(li => words.filter(w => w.line === li).map(w => w.word).join('')).join('\n');
      this.markDirty();
      this.renderTimeline();
      toast(`${words.length}語のタイムスタンプを読み込みました`, 'ok');
    };
    reader.readAsText(file);
  }

  /* ---------------- right pane (properties + AI) ---------------- */
  // 選択フォントを確実に読み込んでから再描画(Canvasは未ロードだとフォールバック表示になるため)
  ensureFont(cssFamily) {
    if (!cssFamily || !document.fonts || !document.fonts.load) return;
    const fam = cssFamily.split(',')[0].trim();   // 例: "'Noto Sans JP'"
    Promise.all(['400', '700', '900'].map(w => document.fonts.load(`${w} 64px ${fam}`).catch(() => {})))
      .then(() => { if (!this._exporting) this.engine.render(this.t); });
  }

  renderRight() {
    const el = this.root.querySelector('#right-pane');
    const st = this.tl.lyricStyle || {};
    const fx = this.tl.fx || {};
    const selWord = (this.tl.tracks.lyrics || []).find(w => w.id === this.sel);
    el.innerHTML = `
      <div class="prop-group">
        <h4>AI ツール</h4>
        <div class="ai-engine-row">
          <span>エンジン</span>
          <select class="input" id="ai-engine">
            <option value="builtin">Built-in</option>
            <option value="codex" ${App.codexAvailable ? '' : 'disabled'}>Codex${App.codexAvailable ? '' : ' (未接続)'}</option>
          </select>
        </div>
        <div class="ai-brief">
          <textarea class="input" id="ai-brief" rows="2" placeholder="例: 疾走感のあるサイバーロックMV。ネオン発光・集中線・パンチインの文字、力強いゴシック体で。">${esc(this.tl.brief || '')}</textarea>
          <button class="ai-btn director" id="ai-direct"><span class="ic">🎬</span><span>会話でMV演出 (AIディレクター)<small>ブリーフから配色・フォント・アニメ・エフェクト・背景まで自動構成</small></span></button>
        </div>
        <div class="ai-tools">
          <button class="ai-btn" id="ai-tap"><span class="ic">🎯</span><span>タップ同期<small>再生しながら行頭でタップ＝最も正確</small></span></button>
          <button class="ai-btn" id="ai-sync"><span class="ic">♪</span><span>${App.whisperAvailable ? 'AI自動同期 (Whisper)' : 'AI自動同期'}<small>${App.whisperAvailable ? '実音声を認識し強制アライメント(高精度)' : '無音を除外しオンセットにスナップ(近似)'}</small></span></button>
          <button class="ai-btn" id="ai-suggest"><span class="ic">✨</span><span>演出提案 (AI Director)<small>歌詞から背景・配色・演出を提案</small></span></button>
          <button class="ai-btn" id="ai-scene"><span class="ic">◈</span><span>シーン解析AI<small>曲構成を検出し演出を自動適用</small></span></button>
          <button class="ai-btn" id="ai-bg"><span class="ic">🎬</span><span>背景MVスタジオ<small>展開ごとに静止画背景 / GPT Image 2で生成・蓄積</small></span></button>
          <button class="ai-btn" id="ai-trans"><span class="ic">文</span><span>AI多言語翻訳<small>50言語以上 / DeepL・Codex</small></span></button>
        </div>
        <div class="job-bar" id="job-bar" style="display:none">
          <div class="jb-label"><span id="jb-stage">処理中…</span><span id="jb-pct">0%</span></div>
          <div class="pbar"><i id="jb-fill" style="width:0%"></i></div>
        </div>
      </div>
      ${this._composePanelHTML()}
      ${selWord ? `
      <div class="prop-group">
        <h4>選択クリップ「${esc(selWord.word)}」</h4>
        <div class="prop-row"><span>IN (秒)</span><input class="input" type="number" step="0.01" id="w-start" value="${selWord.start}"></div>
        <div class="prop-row"><span>OUT (秒)</span><input class="input" type="number" step="0.01" id="w-end" value="${selWord.end}"></div>
        <div class="prop-row"><span>テキスト</span><input class="input" id="w-text" value="${esc(selWord.word)}"></div>
        <button class="btn danger sm" id="w-del" style="width:100%;justify-content:center;margin-top:5px">クリップ削除</button>
      </div>` : ''}
      <div class="prop-group">
        <h4>歌詞スタイル</h4>
        <div class="prop-row"><span>フォント</span>
          <select class="input" id="st-font">${(() => {
            const cats = [...new Set(FONTS.map(f => f[2]))];
            const cur = st.font || FONTS[0][0];
            return cats.map(cat => `<optgroup label="${cat}">${FONTS.filter(f => f[2] === cat).map(([v, l]) =>
              `<option value="${v.replace(/"/g, '&quot;')}" ${cur === v ? 'selected' : ''} style="font-family:${v}">${l}</option>`).join('')}</optgroup>`).join('');
          })()}</select></div>
        <button class="btn sm" id="st-fontlab" style="width:100%;justify-content:center;margin:2px 0 6px" title="実際の歌詞を各フォントで動かして比較し、主役・強調・補助に割り当てる">🔤 フォント見本（歌詞で動かして選ぶ）</button>
        <div class="prop-row"><span>サイズ</span><input type="range" id="st-size" min="28" max="300" value="${st.size || 64}"></div>
        <div class="prop-row"><span>カラー</span><input type="color" id="st-color" value="${st.color || '#ffffff'}"></div>
        <div class="prop-row"><span>組方向</span>
          <select class="input" id="st-orient">${ORIENTS.map(([v, l]) => `<option value="${v}" ${(st.orient || 'horizontal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>レタリング</span>
          <select class="input" id="st-letter">${LETTERINGS.map(([v, l]) => `<option value="${v}" ${(st.lettering || 'neon') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>アニメ</span>
          <select class="input" id="st-anim">${ANIMS.map(([v, l]) => `<option value="${v}" ${st.anim === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>字間</span><input type="range" id="st-track" min="0" max="60" value="${(st.tracking || 0) * 100}"></div>
        <div class="prop-row"><span>グロー</span><input type="range" id="st-glow" min="0" max="100" value="${(st.glow ?? 0.6) * 100}"></div>
        <label class="chk-row"><input type="checkbox" id="st-randsize" ${st.randomSize ? 'checked' : ''}><span>文字サイズをランダム化</span></label>
        <label class="chk-row"><input type="checkbox" id="st-randrot" ${st.randomRot ? 'checked' : ''}><span>文字の回転をランダム化</span></label>
        <div class="prop-row"><span>横位置</span><input type="range" id="st-posx" min="4" max="96" value="${Math.round((st.posX ?? 0.5) * 100)}"></div>
        <div class="prop-row"><span>縦位置</span><input type="range" id="st-posy" min="4" max="96" value="${Math.round((st.posY ?? ((this.project.aspect_ratio === '9:16') ? 0.5 : 0.58)) * 100)}"></div>
        <div class="prop-row"><span>傾き(斜め文字)</span><input type="range" id="st-tilt" min="-20" max="20" value="${Math.round(st.tilt || 0)}"></div>
        <button class="btn sm" id="st-poscenter" style="width:100%;justify-content:center;margin-top:2px">位置を中央に戻す</button>
        <div class="bgm-hint" style="margin-top:4px">プレビュー上の文字を直接ドラッグしても自由に配置できます。</div>
      </div>
      <div class="prop-group">
        <h4>シーン別 文字アニメ</h4>
        ${(this.tl.scenes && this.tl.scenes.length) ? `
        ${this.tl.scenes.map((s, i) => `<div class="prop-row"><span style="color:${SCENE_COLORS[s.label] || '#8b96a8'}">${s.label}</span>
          <select class="input sm" data-scanim="${i}">
            <option value="">全体と同じ (${ANIMS.find(a => a[0] === (st.anim || 'glow-pop'))?.[1] || st.anim})</option>
            ${ANIMS.map(([v, l]) => `<option value="${v}" ${s.anim === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>`).join('')}
        <button class="btn sm" id="sc-anim-rand" style="width:100%;justify-content:center;margin-top:6px">🎲 シーンごとにランダム</button>
        <button class="btn sm" id="sc-anim-clear" style="width:100%;justify-content:center;margin-top:4px">全て「全体と同じ」に戻す</button>
        ` : `<div class="empty-note" style="padding:6px 2px;text-align:left;font-size:11px">「シーン解析AI」を実行すると、Intro/Verse/Chorus などセクションごとに文字アニメを変えられます。</div>`}
      </div>
      <div class="prop-group">
        <h4>シーン &amp; パーティクル</h4>
        <div class="prop-row"><span>背景</span>
          <select class="input" id="sc-scene">${SCENES.map(([v, l]) => `<option value="${v}" ${(this.tl.tracks.background[0]?.scene || this.tl.sceneDefault) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>粒子</span>
          <select class="input" id="sc-part">${PARTICLES.map(([v, l]) => `<option value="${v}" ${this.tl.particles === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>粒子の量</span><input type="range" id="sc-pden" min="0" max="200" value="${Math.round((this.tl.particleDensity ?? 1) * 100)}"></div>
      </div>
      <div class="prop-group">
        <h4>アニメ調エフェクト (Anime FX)</h4>
        <div class="fx-toggle"><span>Bloom 発光</span><input type="range" id="fx-bloom" min="0" max="100" value="${(fx.bloom || 0) * 100}"></div>
        <div class="fx-toggle"><span>Glitch</span><input type="range" id="fx-glitch" min="0" max="100" value="${(fx.glitch || 0) * 100}"></div>
        <div class="fx-toggle"><span>色収差</span><input type="range" id="fx-chroma" min="0" max="100" value="${(fx.chroma || 0) * 100}"></div>
        <div class="fx-toggle"><span>Wave 歪み</span><input type="range" id="fx-wave" min="0" max="100" value="${(fx.wave || 0) * 100}"></div>
        <div class="fx-toggle"><span>光芒 God rays</span><input type="range" id="fx-godray" min="0" max="100" value="${(fx.godray || 0) * 100}"></div>
        <div class="fx-toggle"><span>レンズフレア</span><input type="range" id="fx-flare" min="0" max="100" value="${(fx.flare || 0) * 100}"></div>
        <div class="fx-toggle"><span>被写界深度 DoF</span><input type="range" id="fx-dof" min="0" max="100" value="${(fx.dof || 0) * 100}"></div>
        <div class="fx-sub">画面全体エフェクト</div>
        ${SCREEN_FX.map(([k, l]) => `<div class="fx-toggle"><span>${l}</span><input type="range" id="fx-${k}" min="0" max="100" value="${(fx[k] || 0) * 100}"></div>${k === 'mirror' ? `<div class="prop-row" style="padding-left:2px"><span style="font-size:11px;color:var(--muted)">ミラー種類</span><select class="input sm" id="fx-mirrorMode"><option value="horizontal" ${(fx.mirrorMode || 'horizontal') === 'horizontal' ? 'selected' : ''}>左右</option><option value="vertical" ${fx.mirrorMode === 'vertical' ? 'selected' : ''}>上下</option><option value="quad" ${fx.mirrorMode === 'quad' ? 'selected' : ''}>4分割(万華鏡)</option></select></div>` : ''}`).join('')}
        <div class="empty-note" style="padding:6px 2px;text-align:left;font-size:11px">サビ(Chorus)では強度が自動ブーストされます。0で無効。</div>
      </div>
      <div class="prop-group">
        <h4>前景キャラ / 被写体</h4>
        ${this.tl.subject ? `
          <div class="prop-row"><span>素材</span><span style="font-size:11px;color:var(--cyan);overflow:hidden;text-overflow:ellipsis">${esc(this.tl.subject.name || '設定済み')}</span></div>
          <div class="prop-row"><span>大きさ</span><input type="range" id="su-scale" min="30" max="300" value="${(this.tl.subject.scale || 0.72) * 100}"></div>
          <div class="prop-row"><span>横位置</span><input type="range" id="su-x" min="0" max="100" value="${(this.tl.subject.x ?? 0.5) * 100}"></div>
          <div class="prop-row"><span>縦位置</span><input type="range" id="su-y" min="0" max="100" value="${(this.tl.subject.y ?? 0.98) * 100}"></div>
          <button class="btn danger sm" id="su-del" style="width:100%;justify-content:center;margin-top:5px">キャラを外す</button>
        ` : `
          <div class="empty-note" style="padding:4px 2px;text-align:left;font-size:11px">アニメキャラ等の画像/透過PNGを前景に配置し、リムライト・浮遊・呼吸で演出します。</div>
          <input type="file" id="su-file" accept=".png,.jpg,.jpeg,.webp" style="display:none">
          <button class="btn sm" id="su-add" style="width:100%;justify-content:center;margin-top:6px">＋ キャラ画像を配置</button>
        `}
      </div>
      <div class="prop-group">
        <h4>3Dダンス (VRM × MMD)</h4>
        ${this.tl.dance?.enabled ? `
          <div class="prop-row"><span>アバター</span><select class="input sm" id="dn-vrm-sel" style="max-width:130px"><option value="">読み込み中…</option></select></div>
          <div class="prop-row"><span>モーション</span><select class="input sm" id="dn-vmd-sel" style="max-width:130px"><option value="">読み込み中…</option></select></div>
          <div class="prop-row"><span>ファイル</span><span style="display:flex;gap:4px">
            <button class="btn sm" id="dn-vrm-up">↑vrm</button>
            <button class="btn sm" id="dn-vmd-up">↑vmd</button></span></div>
          <div class="prop-row"><span>大きさ</span>
            <input type="range" id="dn-scale" min="20" max="400" value="${Math.round((this.tl.dance.scale ?? 0.92) * 100)}">
            <span id="dn-scale-v" style="flex:none;width:38px;text-align:right;font-size:11px">${Math.round((this.tl.dance.scale ?? 0.92) * 100)}%</span></div>
          <div class="prop-row"><span>横位置</span><input type="range" id="dn-x" min="0" max="100" value="${(this.tl.dance.x ?? 0.5) * 100}"></div>
          <div class="prop-row"><span>縦位置</span>
            <input type="range" id="dn-y" min="0" max="160" value="${Math.round((this.tl.dance.y ?? 1.0) * 100)}">
            <span id="dn-y-v" style="flex:none;width:38px;text-align:right;font-size:11px">${Math.round((this.tl.dance.y ?? 1.0) * 100)}%</span></div>
          <div class="prop-row"><span>開始オフセット(秒)</span><input type="number" class="input sm" id="dn-offset" step="0.1" value="${this.tl.dance.offset || 0}" style="width:64px"></div>
          <div class="prop-row"><span>ステージ比</span><span style="display:flex;gap:4px" id="dn-ar">
            ${[['9:16', 0.5625], ['4:5', 0.8], ['1:1', 1], ['16:9', 1.7778]].map(([lab, v]) =>
              `<button class="btn sm${Math.abs((this.tl.dance.aspect ?? 1) - v) < 0.01 ? ' primary' : ''}" data-ar="${v}">${lab}</button>`).join('')}
          </span></div>
          <div class="prop-row"><span>VMDカメラで撮る</span><input type="checkbox" id="dn-camera" ${this.tl.dance.camera ? 'checked' : ''}></div>
          <div class="prop-row"><span>連携</span><span style="display:flex;gap:5px;align-items:center">
            <button class="btn sm" id="dn-reload">↻ 再読込</button></span></div>
          <div id="dn-atelier-note" style="font-size:10.5px;color:var(--muted);margin:2px 0 4px">読み込み中…</div>
          <button class="btn danger sm" id="dn-del" style="width:100%;justify-content:center;margin-top:5px">3Dダンスを外す</button>
        ` : `
          <div class="empty-note" style="padding:4px 2px;text-align:left;font-size:11px">VRMアバターにMMD(VMD)モーションを踊らせて合成します。VRM Atelier連携またはファイルアップロードで設定。</div>
          <button class="btn sm" id="dn-setup" style="width:100%;justify-content:center;margin-top:6px">＋ 3Dダンスを配置</button>
        `}
        <input type="file" id="dn-vrm-file" accept=".vrm" style="display:none">
        <input type="file" id="dn-vmd-file" accept=".vmd" style="display:none">
      </div>`;
    const $ = s => el.querySelector(s);
    const engSel = $('#ai-engine');
    engSel.value = this.aiEngine();
    engSel.onchange = e => { localStorage.setItem('lf_ai_engine', e.target.value); };
    $('#ai-suggest').onclick = () => this.runSuggest();
    this._bindComposePanel(el);
    $('#ai-brief').oninput = e => { this.tl.brief = e.target.value; this.markDirty(); };
    $('#ai-direct').onclick = () => {
      const brief = (this.root.querySelector('#ai-brief').value || '').trim();
      if (!brief) return toast('作りたいMVのイメージを一文で入力してください', 'err');
      this.runSuggest(brief);
    };
    $('#ai-tap').onclick = () => this.openTapSync();
    $('#ai-sync').onclick = () => this.runSync();
    $('#ai-scene').onclick = () => this.runSceneAnalysis();
    $('#ai-bg').onclick = () => this.openBgStudio();
    $('#ai-trans').onclick = () => this.runTranslate();
    $('#st-font').onchange = e => { this.tl.lyricStyle.font = e.target.value; this.ensureFont(e.target.value); this.markDirty(); };
    $('#st-fontlab').onclick = () => this.openFontLab();
    $('#st-size').oninput = e => { this.tl.lyricStyle.size = +e.target.value; this.markDirty(); };
    $('#st-color').oninput = e => { this.tl.lyricStyle.color = e.target.value; this.markDirty(); };
    $('#st-anim').onchange = e => { this.tl.lyricStyle.anim = e.target.value; this.markDirty(); };
    $('#st-orient').onchange = e => { this.tl.lyricStyle.orient = e.target.value; this.markDirty(); };
    $('#st-letter').onchange = e => { this.tl.lyricStyle.lettering = e.target.value; this.markDirty(); };
    $('#st-track').oninput = e => { this.tl.lyricStyle.tracking = e.target.value / 100; this.markDirty(); };
    $('#st-glow').oninput = e => { this.tl.lyricStyle.glow = e.target.value / 100; this.markDirty(); };
    $('#st-randsize').onchange = e => { this.tl.lyricStyle.randomSize = e.target.checked; this.markDirty(); };
    $('#st-randrot').onchange = e => { this.tl.lyricStyle.randomRot = e.target.checked; this.markDirty(); };
    $('#st-posx').oninput = e => { this.tl.lyricStyle.posX = e.target.value / 100; this.markDirty(); };
    $('#st-posy').oninput = e => { this.tl.lyricStyle.posY = e.target.value / 100; this.markDirty(); };
    $('#st-tilt').oninput = e => { this.tl.lyricStyle.tilt = +e.target.value; this.markDirty(); };
    $('#st-poscenter').onclick = () => {
      const def = this.project.aspect_ratio === '9:16' ? 0.5 : 0.58;
      this.tl.lyricStyle.posX = 0.5; this.tl.lyricStyle.posY = def;
      $('#st-posx').value = 50; $('#st-posy').value = Math.round(def * 100);
      this.markDirty();
    };
    // シーン別 文字アニメ
    this.root.querySelectorAll('[data-scanim]').forEach(sel => sel.onchange = e => {
      const i = +e.target.dataset.scanim, v = e.target.value;
      if (this.tl.scenes && this.tl.scenes[i]) { if (v) this.tl.scenes[i].anim = v; else delete this.tl.scenes[i].anim; }
      this.markDirty();
      if (this.tl.scenes && this.tl.scenes[i]) this.seek(this.tl.scenes[i].start + 0.3);   // 変更したシーンをプレビュー
    });
    { const rb = $('#sc-anim-rand'); if (rb) rb.onclick = () => {
      const keys = ANIMS.map(a => a[0]); let prev = null;
      (this.tl.scenes || []).forEach(s => { let k; do { k = keys[Math.floor(Math.random() * keys.length)]; } while (k === prev && keys.length > 1); s.anim = k; prev = k; });
      this.markDirty(); this.renderRight(); toast('シーンごとに文字アニメをランダム設定しました', 'ok');
    }; }
    { const cb = $('#sc-anim-clear'); if (cb) cb.onclick = () => {
      (this.tl.scenes || []).forEach(s => delete s.anim); this.markDirty(); this.renderRight();
    }; }
    $('#sc-scene').onchange = e => {
      this.tl.sceneDefault = e.target.value;
      if (this.tl.tracks.background[0]) this.tl.tracks.background[0].scene = e.target.value;
      else this.tl.tracks.background.push({ id: 'bg' + Date.now(), start: 0, end: this.tl.duration || 60, scene: e.target.value });
      this.markDirty(); this.renderTimeline();
    };
    $('#sc-part').onchange = e => { this.tl.particles = e.target.value; this.engine.particles = []; this.markDirty(); };
    $('#sc-pden').oninput = e => { this.tl.particleDensity = e.target.value / 100; this.markDirty(); };
    for (const k of ['bloom', 'glitch', 'chroma', 'wave', 'godray', 'flare', 'dof', ...SCREEN_FX.map(f => f[0])]) {
      const el = $('#fx-' + k);
      if (el) el.oninput = e => { this.tl.fx[k] = e.target.value / 100; this.markDirty(); };
    }
    { const mm = $('#fx-mirrorMode'); if (mm) mm.onchange = e => { this.tl.fx.mirrorMode = e.target.value; this.markDirty(); }; }
    // 前景キャラ/被写体
    if (this.tl.subject) {
      $('#su-scale').oninput = e => { this.tl.subject.scale = e.target.value / 100; this.markDirty(); };
      $('#su-x').oninput = e => { this.tl.subject.x = e.target.value / 100; this.markDirty(); };
      $('#su-y').oninput = e => { this.tl.subject.y = e.target.value / 100; this.markDirty(); };
      $('#su-del').onclick = () => { this.tl.subject = null; this.engine.setTimeline(this.tl); this.markDirty(); this.renderRight(); };
    } else {
      $('#su-add').onclick = () => $('#su-file').click();
      $('#su-file').onchange = e => this.addSubject(e.target.files[0]);
    }
    // 3Dダンス (VRM × MMD)
    this._bindDancePanel($);
    if (selWord) {
      $('#w-start').onchange = e => { selWord.start = +e.target.value; this.markDirty(); this.renderTimeline(); };
      $('#w-end').onchange = e => { selWord.end = +e.target.value; this.markDirty(); this.renderTimeline(); };
      $('#w-text').onchange = e => { selWord.word = e.target.value; this.markDirty(); this.renderTimeline(); };
      $('#w-del').onclick = () => this.deleteSel();
    }
  }

  deleteSel() {
    if (!this.sel) return;
    this.tl.tracks.lyrics = this.tl.tracks.lyrics.filter(w => w.id !== this.sel);
    this.sel = null;
    this.markDirty(); this.renderTimeline(); this.renderRight();
  }

  /* ---------------- AI jobs ---------------- */
  showJob(stage, pct) {
    const bar = this.root.querySelector('#job-bar');
    if (!bar) return;
    bar.style.display = 'block';
    this.root.querySelector('#jb-stage').textContent = stage || '処理中…';
    this.root.querySelector('#jb-pct').textContent = pct + '%';
    this.root.querySelector('#jb-fill').style.width = pct + '%';
    if (pct >= 100) setTimeout(() => { if (bar) bar.style.display = 'none'; }, 900);
  }

  aiEngine() {
    const e = localStorage.getItem('lf_ai_engine') || 'builtin';
    return (e === 'codex' && App.codexAvailable) ? 'codex' : 'builtin';
  }

  async runSuggest(brief) {
    // briefあり=会話ディレクター(歌詞なしでも可)、briefなし=歌詞から提案
    if (!brief && !this.tl.lyrics_text?.trim()) return toast('先に歌詞を入力するか、イメージを入力してください', 'err');
    const engine = this.aiEngine();
    const { job_id } = await API.post('/ai/suggest', {
      workspace_id: this.project.workspace_id, lyrics_text: this.tl.lyrics_text || '', engine,
      brief: brief || '',
    });
    let res;
    try { res = await API.waitJob(job_id, j => this.showJob(j.stage, j.progress_pct)); }
    catch (e) { return toast('演出提案に失敗: ' + e.message, 'err'); }
    const fontLabel = (FONTS.find(f => f[0] === res.font) || [])[1];
    const sfxOn = res.screen_fx ? Object.entries(res.screen_fx).filter(([, v]) => v > 0.03).map(([k]) => k) : [];
    const msg = `${res.engine === 'codex' ? 'Codex' : 'Built-in'} の演出設計:\n\n` +
      `背景: ${res.scene} / 粒子: ${res.particles} / アニメ: ${res.anim}` +
      `${res.lettering ? ' / 文字: ' + res.lettering : ''}${res.orient === 'vertical' ? ' / 縦書き' : ''}\n` +
      `${fontLabel ? 'フォント: ' + fontLabel + '\n' : ''}` +
      `${sfxOn.length ? '画面エフェクト: ' + sfxOn.join(', ') + '\n' : ''}` +
      `${res.tilt ? '文字傾き: ' + res.tilt + '°\n' : ''}${res.random ? 'サイズランダム: ON\n' : ''}` +
      `${res.rationale || ''}\n\nこの演出を適用しますか?`;
    if (!confirm(msg)) return;
    const ls = { ...this.tl.lyricStyle, anim: res.anim, color: res.colors.text, glow: res.fx.bloom };
    if (res.lettering) ls.lettering = res.lettering;
    if (res.orient) ls.orient = res.orient;
    if (res.font) { ls.font = res.font; this.ensureFont(res.font); }
    if (res.tilt != null) ls.tilt = res.tilt;
    if (res.random != null) ls.randomSize = !!res.random;
    Object.assign(this.tl, {
      colors: res.colors, fx: { ...this.tl.fx, ...res.fx, ...(res.screen_fx || {}) },
      particles: res.particles, sceneDefault: res.scene, lyricStyle: ls,
    });
    if (this.tl.tracks.background[0]) this.tl.tracks.background[0].scene = res.scene;
    else this.tl.tracks.background.push({ id: 'bg' + Date.now(), start: 0, end: this.tl.duration || 60, scene: res.scene });
    this.engine.particles = [];
    this.engine.setTimeline(this.tl);
    if (brief) this._composeFromBrief(brief, res);   // ブリーフがあれば演出エンジンで全カットを構成
    this.markDirty(); this.renderRight(); this.renderTimeline();
    toast(`AIディレクターの演出を適用しました (${res.engine})`, 'ok');
  }
  /* ブリーフ→雰囲気→合うスタイル(役割フォント)で演出エンジンを構成。配色はAIの提案を保つ */
  _composeFromBrief(brief, res) {
    const L = window.LFC;
    if (!L) return;
    const cm = this._cm();
    const MAP = [
      ['cyber', /サイバー|テクノ|未来|デジタル|EDM|エレクトロ/], ['glitch', /グリッチ|ノイズ|バグ|壊れ/],
      ['pop', /かわいい|可愛|ポップ|明る|元気|キュート/], ['calm', /バラード|切な|静か|しっとり|穏やか/],
      ['emotional', /エモ|涙|青春|泣/], ['editorial', /誌面|雑誌|エディトリアル|おしゃれ|ミニマル|洗練/],
      ['dark', /ロック|激し|ダーク|退廃|赤黒|狂気/], ['wa', /和風|和の|着物|祭|神社|筆/], ['graphic', /図形|グラフィック|幾何|ポスター/],
    ];
    const hit = MAP.find(([, re]) => re.test(brief));
    const mood = hit ? hit[0] : null;
    const styles = L.STYLE_ORDER.map(k => L.STYLES[k]);
    const fit = mood ? styles.filter(s => (s.moods || []).includes(mood)) : [];
    const st = fit.length ? fit[L.h(brief) % fit.length] : null;
    if (!this._cmpHist || !this._cmpHist.length) this._composePushHist();
    cm.enabled = true;
    if (mood) cm.mood = mood;
    if (st) {
      cm.style = st.key;                                   // 役割フォント・演出の重みはスタイルから(配色はAIの提案を維持)
      for (const f of [].concat(...Object.values(st.fonts || {}))) if (f) this.ensureFont(f);
    }
    if (res && res.font) { cm.fonts = Object.assign({}, cm.fonts || {}, { display: res.font }); this.ensureFont(res.font); }
    const cv = this.engine.canvas;
    cm.seed = L.h(brief, Date.now()) % 2000000000;
    L.planAll(this.tl, { W: cv.width, H: cv.height, seed: cm.seed });
    this._composePushHist();
  }

  /* ---------------- タップ同期 (最も正確な手動同期) ---------------- */
  openTapSync() {
    if (!this.tl.duration || !this.audio.src) return toast('先に音源を設定してください', 'err');
    const rawLines = (this.tl.lyrics_text || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!rawLines.length) return toast('先に歌詞を入力してください(左の歌詞タブ)', 'err');
    this.pause();
    this.seek(0);                          // 必ず先頭から
    this.engine.hideLyrics = true;         // タップ中は既存の歌詞表示を隠す(基準にならないため)
    this.engine.render(0);
    const state = { mode: 'line', idx: 0, taps: [], units: [], playing: false, done: false };
    const buildUnits = () => {
      state.units = [];
      rawLines.forEach((ln, li) => {
        if (state.mode === 'line') state.units.push({ text: ln, line: li });
        else splitWordsJS(ln).forEach(w => state.units.push({ text: w, line: li }));
      });
    };
    buildUnits();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal wide">
        <div class="m-head"><h2>🎯 タップ同期</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <p class="p-sub">曲を再生し、各${state.mode === 'line' ? '行' : '語'}の歌い出しの瞬間に <b style="color:var(--cyan)">スペース</b> または <b style="color:var(--cyan)">TAPボタン</b> を押してください。最後まで押したら「適用」。</p>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <div class="seg">
              <button class="seg-b ${state.mode === 'line' ? 'sel' : ''}" data-mode="line">行ごと</button>
              <button class="seg-b ${state.mode === 'word' ? 'sel' : ''}" data-mode="word">語ごと(高精度)</button>
            </div>
            <span class="tap-prog" id="tap-prog"></span>
          </div>
          <div class="tap-stage" id="tap-stage"></div>
          <div class="tap-transport">
            <button class="btn" id="tap-play">▶ 再生してタップ開始</button>
            <button class="btn" id="tap-undo">↩ 1つ戻る</button>
            <button class="btn" id="tap-reset">やり直し</button>
            <span class="t-time" id="tap-time" style="margin-left:auto">00:00.00</span>
          </div>
          <button class="btn primary tap-big" id="tap-hit">TAP (Space)</button>
        </div>
        <div class="m-foot">
          <button class="btn" id="tap-cancel">キャンセル</button>
          <button class="btn primary" id="tap-apply" disabled>適用</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const $ = s => bg.querySelector(s);
    const stageEl = $('#tap-stage'), progEl = $('#tap-prog');
    const renderStage = () => {
      const done = state.idx >= state.units.length;
      const last = state.idx > 0 ? state.units[state.idx - 1] : null;  // 直前にタップした行(タップした瞬間に表示)
      const upcoming = state.units[state.idx];  // 次にタップする行(予告)
      stageEl.innerHTML = done
        ? `<div class="tap-done">✓ 全${state.units.length}${state.mode === 'line' ? '行' : '語'}をタップしました。「適用」で確定します。</div>`
        : `${last
              ? `<div class="tap-cur">${esc(last.text)}</div>`
              : `<div class="tap-cur" style="opacity:.45;font-size:20px">▶ 再生し、最初の歌い出しでタップ</div>`}`
          + `${upcoming ? `<div class="tap-next">次: ${esc(upcoming.text)}</div>` : '<div class="tap-next">（最後）</div>'}`;
      progEl.textContent = `${Math.min(state.idx, state.units.length)} / ${state.units.length}`;
      $('#tap-apply').disabled = state.idx < 1;
    };
    renderStage();
    // タイマー表示
    const timer = setInterval(() => { if (bg.isConnected) $('#tap-time').textContent = fmtTime(this.audio.currentTime); }, 60);
    const hit = () => {
      if (state.idx >= state.units.length) return;
      // 人は音を聞いてから押すので約0.14s遅れる。その分だけ前に補正
      state.taps[state.idx] = Math.max(0, this.audio.currentTime - 0.14);
      state.idx++;
      renderStage();
      if (state.idx >= state.units.length) { this.audio.pause(); state.playing = false; $('#tap-play').textContent = '▶ 再生'; }
    };
    const keyHandler = e => {
      if (!bg.isConnected) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); hit(); }
    };
    document.addEventListener('keydown', keyHandler, true);
    this._tapActive = true;
    const close = () => {
      clearInterval(timer);
      document.removeEventListener('keydown', keyHandler, true);
      this._tapActive = false;
      this.engine.hideLyrics = false;      // 歌詞表示を戻す
      this.audio.pause();
      this.engine.render(this.t);
      bg.remove();
    };
    $('.x-btn').onclick = close;
    $('#tap-cancel').onclick = close;
    $('#tap-hit').onclick = hit;
    $('#tap-play').onclick = () => {
      if (state.playing) { this.audio.pause(); state.playing = false; $('#tap-play').textContent = '▶ 再生'; }
      else { this.audio.play().catch(() => {}); state.playing = true; $('#tap-play').textContent = '⏸ 一時停止'; }
    };
    $('#tap-undo').onclick = () => { if (state.idx > 0) { state.idx--; state.taps.pop(); renderStage(); } };
    $('#tap-reset').onclick = () => { this.audio.pause(); this.audio.currentTime = 0; state.idx = 0; state.taps = []; state.playing = false; $('#tap-play').textContent = '▶ 再生してタップ開始'; renderStage(); };
    bg.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode; buildUnits(); state.idx = 0; state.taps = [];
      bg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('sel', x === b));
      renderStage();
    });
    $('#tap-apply').onclick = () => {
      const words = this._tapsToTimestamps(rawLines, state);
      if (!words.length) return toast('タップが不足しています', 'err');
      this.tl.tracks.lyrics = words;
      this.markDirty(); this.renderTimeline();
      close();
      toast(`タップ同期を適用しました (${words.length}語)`, 'ok');
    };
  }

  _tapsToTimestamps(rawLines, state) {
    const dur = this.tl.duration;
    const out = [];
    if (state.mode === 'line') {
      rawLines.forEach((ln, li) => {
        if (state.taps[li] == null) return;
        const start = state.taps[li];
        const nextTap = state.taps[li + 1] != null ? state.taps[li + 1] : Math.min(dur, start + 4);
        const chunks = splitWordsJS(ln);
        const charN = chunks.reduce((a, c) => a + Math.max(1, c.length), 0) || 1;
        // 行内の語は「自然な歌唱ペース」で並べ、行間の空きに引き伸ばさない(=遅延/間延び防止)
        // 1文字あたり約0.26s目安。ただし次のタップは超えない
        const natural = Math.min(nextTap - start, charN * 0.26 + 0.25);
        const wsum = charN;
        let t = start;
        chunks.forEach((c, ci) => {
          const wd = natural * Math.max(1, c.length) / wsum;
          // 最後の語だけ次行(nextTap)まで保持して行を表示し続ける
          const en = ci === chunks.length - 1 ? Math.max(t + wd, nextTap - 0.05) : t + wd;
          out.push({ id: Math.random().toString(36).slice(2, 10), word: c, line: li, start: +t.toFixed(2), end: +en.toFixed(2) });
          t += wd;
        });
      });
    } else {
      // 語ごと: units は全語。各語 start=tap, end=次tap or +0.5
      let ui = 0;
      rawLines.forEach((ln, li) => {
        for (const c of splitWordsJS(ln)) {
          if (state.taps[ui] != null) {
            const start = state.taps[ui];
            let end = state.taps[ui + 1] != null ? state.taps[ui + 1] : Math.min(dur, start + 0.6);
            if (end <= start) end = Math.min(dur, start + 0.3);
            out.push({ id: Math.random().toString(36).slice(2, 10), word: c, line: li, start: +start.toFixed(2), end: +end.toFixed(2) });
          }
          ui++;
        }
      });
    }
    return out;
  }

  async runSync() {
    if (!this.tl.lyrics_text?.trim()) return toast('先に歌詞を入力してください(左の歌詞タブ)', 'err');
    if (!this.tl.duration) return toast('先に音源を設定してください', 'err');
    const useWhisper = App.whisperAvailable;
    if (useWhisper) toast('Whisperで音声認識中… 曲の長さに応じて数十秒かかります', '');
    const { job_id } = await API.post('/ai/sync-lyrics', {
      workspace_id: this.project.workspace_id, audio_asset_id: this.tl.audio_asset_id,
      lyrics_text: this.tl.lyrics_text, language: this.tl.language || 'ja',
      envelope: this.tl.envelope, hop: this.tl.hop || 0.1, duration: this.tl.duration,
      engine: useWhisper ? 'whisper' : 'builtin',
    });
    let res;
    try { res = await API.waitJob(job_id, j => this.showJob(j.stage, j.progress_pct)); }
    catch (e) { return toast('同期に失敗: ' + e.message, 'err'); }
    if (!res.timestamps || !res.timestamps.length) return toast('タイムスタンプを生成できませんでした', 'err');
    this.tl.tracks.lyrics = res.timestamps;
    this.markDirty(); this.renderTimeline();
    const eng = res.engine === 'whisper' ? 'Whisper' : '近似';
    toast(`AI自動同期 完了 (${eng}): ${res.timestamps.length}語`, 'ok');
  }

  async detectBpm() {
    const aid = this.tl.audio_asset_id;
    const asset = (this.assets || []).find(a => a.id === aid) || (this.assets || []).find(a => a.type === 'audio');
    const url = asset && asset.url;
    if (!url) return toast('先に音源を設定してください', 'err');
    const btn = this.root.querySelector('#tl-bpm-detect');
    if (btn) { btn.disabled = true; btn.textContent = '解析中…'; }
    try {
      const { bpm, beatOffset } = await detectBPM(url);
      this.tl.bpm = bpm; this.tl.beatOffset = beatOffset; this.tl.showBeats = true;
      this._syncBeatCursor();
      const bv = this.root.querySelector('#tl-bpm-val'); if (bv) bv.value = bpm;
      const gc = this.root.querySelector('#tl-bpm-grid'); if (gc) gc.checked = true;
      this.markDirty(); this.renderTimeline();
      toast(`BPM検知: ${bpm}（拍グリッドをタイムラインに表示）`, 'ok');
    } catch (e) {
      toast('BPM検知に失敗: ' + e.message, 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '検知'; }
    }
  }

  async runSceneAnalysis() {
    if (!this.tl.envelope) return toast('先に音源を設定してください', 'err');
    const { job_id } = await API.post('/ai/analyze-scene', {
      workspace_id: this.project.workspace_id, envelope: this.tl.envelope,
      hop: this.tl.hop || 0.1, duration: this.tl.duration,
    });
    const res = await API.waitJob(job_id, j => this.showJob(j.stage, j.progress_pct));
    this.tl.scenes = res.sections;
    // シーンに応じてエフェクトクリップを自動配置 (サビ=パーティクル/Bloom強化)
    this.tl.tracks.effects = res.sections.filter(s => s.label === 'Chorus').map((s, i) => (
      { id: 'fxc' + i, type: 'bloom', start: s.start, end: s.end, intensity: Math.min(1, (this.tl.fx.bloom || 0.5) + 0.3) }));
    this.markDirty(); this.renderTimeline();
    toast(`シーン解析 完了: ${res.sections.map(s => s.label).join(' → ')}`, 'ok');
  }

  // ---- 背景MVスタジオ: 曲の展開ごとに静止画背景を割り当て + GPT Image 2で生成・蓄積 ----
  async openBgStudio() {
    let data;
    try { data = await API.get('/bglib'); }
    catch (e) { return toast('背景ライブラリを取得できません: ' + e.message, 'err'); }

    // 曲の展開(セクション)。シーン解析済みならそれを、無ければ曲全体を1区間として扱う
    const secs = (this.tl.scenes && this.tl.scenes.length)
      ? this.tl.scenes.map(s => ({ ...s }))
      : [{ label: '曲全体', start: 0, end: this.tl.duration || 60, energy: 0.6 }];
    // 既存の背景トラックから画像割り当てを復元
    const assign = secs.map(s => {
      const seg = (this.tl.tracks.background || []).find(b => Math.abs((b.start || 0) - s.start) < 0.5 && b.image);
      return seg ? seg.image : null;
    });
    let images = data.images || [];
    let sel = 0;                    // 割り当て先として選択中のセクション
    const genSel = new Set();       // 生成対象に選んだムード
    let polling = null;

    const fmt = x => { const m = Math.floor(x / 60), s = Math.floor(x % 60); return `${m}:${String(s).padStart(2, '0')}`; };

    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    document.body.appendChild(bg);
    const close = () => { if (polling) clearInterval(polling); bg.remove(); this.engine.hideLyrics = false; this.engine.render(this.t); };

    const applyToTimeline = () => {
      const def = this.tl.sceneDefault || (this.tl.tracks.background && this.tl.tracks.background[0]?.scene) || 'city';
      this.tl.tracks.background = secs.map((s, i) => ({ id: 'bg' + i, start: s.start, end: s.end, scene: def, image: assign[i] || null }));
      this.engine.setTimeline(this.tl);
      this.markDirty();
    };

    const draw = () => {
      const enabled = data.enabled;
      const chip = m => {
        const on = genSel.has(m.key);
        const c = (m.palette && m.palette[2]) || '#00d4ff';
        return `<button class="bgm-chip ${on ? 'on' : ''}" data-mood="${m.key}" style="border-color:${on ? c : 'var(--border)'};${on ? `background:${c}22;color:#fff` : ''}">${m.label}</button>`;
      };
      const cats = [...new Set((data.moods || []).map(m => m.cat || 'その他'))];
      const moodChips = cats.map(cat =>
        `<div class="bgm-cat">${cat}</div><div class="bgm-moodrow">${(data.moods || []).filter(m => (m.cat || 'その他') === cat).map(chip).join('')}</div>`
      ).join('');
      const gallery = images.length ? images.map(im => `
        <div class="bgm-cell" data-img="${im.url}" title="${im.mood_label || ''}">
          <img src="${im.url}" loading="lazy">
          <span class="bgm-tag">${im.mood_label || ''}</span>
          <button class="bgm-del" data-del="${im.id}" title="削除">×</button>
        </div>`).join('')
        : `<div class="bgm-empty">まだ画像がありません。上でムードを選び「生成」すると、どの曲にも使える背景がここに蓄積されます。</div>`;
      const sections = secs.map((s, i) => {
        const url = assign[i];
        const c = SCENE_COLORS[s.label] || '#8b96a8';
        return `<div class="bgm-sec ${i === sel ? 'sel' : ''}" data-sec="${i}">
          <div class="bgm-sec-th" style="${url ? `background-image:url('${url}')` : ''}">${url ? '' : '自動'}</div>
          <div class="bgm-sec-meta"><b style="color:${c}">${s.label}</b><small>${fmt(s.start)}–${fmt(s.end)}</small></div>
          ${url ? `<button class="bgm-sec-clr" data-clr="${i}" title="クリア">×</button>` : ''}
        </div>`;
      }).join('');
      bg.innerHTML = `
      <div class="modal wide bgm">
        <div class="m-head"><h2>🎬 背景MVスタジオ</h2><button class="x-btn">×</button></div>
        <div class="m-body bgm-body">
          <div class="bgm-left">
            <div class="bgm-panel">
              <div class="bgm-h">背景を生成 <small>${enabled ? `本日 ${data.daily.used}/${data.daily.limit} 枚` : '未設定'}</small></div>
              ${enabled ? `
              <div class="bgm-moods">${moodChips}</div>
              <div class="bgm-genrow">
                <label>枚数<select class="input sm" id="bgm-count"><option>1</option><option>2</option><option selected>4</option><option>6</option><option>8</option></select></label>
                <label>向き<select class="input sm" id="bgm-orient">
                  <option value="landscape" ${this.tl.aspect !== '9:16' ? 'selected' : ''}>横 16:9</option>
                  <option value="portrait" ${this.tl.aspect === '9:16' ? 'selected' : ''}>縦 9:16</option>
                  <option value="square">正方 1:1</option></select></label>
                <button class="btn primary sm" id="bgm-gen">✨ 生成</button>
              </div>
              <div class="bgm-hint">ムード未選択なら「おまかせ(全ムード)」でバラエティ生成。選ぶほどライブラリが増え、他の曲でも再利用できます。</div>
              <div class="bgm-prog" id="bgm-prog" style="display:none"></div>
              ` : `<div class="bgm-hint">背景生成には <code>ATLASCLOUD_API_KEY</code> の設定が必要です。設定済みのライブラリ画像は下から割り当てできます。</div>`}
            </div>
            <div class="bgm-h" style="margin-top:6px">ライブラリ <small>クリックで選択中のセクションへ割り当て</small></div>
            <div class="bgm-gallery" id="bgm-gallery">${gallery}</div>
          </div>
          <div class="bgm-right">
            <div class="bgm-h">曲の展開ごとの背景 <small>${(this.tl.scenes && this.tl.scenes.length) ? '' : 'シーン解析AIで細かく分割できます'}</small></div>
            <div class="bgm-sections">${sections}</div>
            <div class="bgm-actions">
              <button class="btn sm" id="bgm-auto">🎲 自動割り当て</button>
              <button class="btn sm" id="bgm-clearall">全てクリア</button>
            </div>
          </div>
        </div>
        <div class="m-foot"><button class="btn" id="bgm-close">閉じる</button></div>
      </div>`;
      wire();
    };

    const refreshLib = async () => {
      try { const d = await API.get('/bglib'); images = d.images || []; data.daily = d.daily; } catch (e) {}
    };

    const startPolling = () => {
      if (polling) clearInterval(polling);
      polling = setInterval(async () => {
        let jd; try { jd = await API.get('/bglib/jobs'); } catch (e) { return; }
        const pend = jd.jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
        const fail = jd.jobs.filter(j => j.status === 'failed');
        const prog = bg.querySelector('#bgm-prog');
        if (prog) {
          prog.style.display = 'block';
          prog.textContent = pend ? `生成中… 残り ${pend} 枚` : (fail.length ? `完了 (${fail.length}件失敗)` : '生成完了');
        }
        if (pend === 0) {
          clearInterval(polling); polling = null;
          await refreshLib(); draw();
          toast(fail.length ? `背景生成: ${fail.length}件失敗しました` : '背景を生成しました', fail.length ? 'err' : 'ok');
        } else {
          await refreshLib();
          const gal = bg.querySelector('#bgm-gallery');
          if (gal && images.length) gal.innerHTML = images.map(im => `
            <div class="bgm-cell" data-img="${im.url}" title="${im.mood_label || ''}"><img src="${im.url}" loading="lazy"><span class="bgm-tag">${im.mood_label || ''}</span><button class="bgm-del" data-del="${im.id}">×</button></div>`).join('');
        }
      }, 3000);
    };

    const wire = () => {
      bg.querySelector('.x-btn').onclick = close;
      bg.querySelector('#bgm-close').onclick = close;
      bg.onclick = e => { if (e.target === bg) close(); };
      bg.querySelectorAll('.bgm-chip').forEach(b => b.onclick = () => {
        const k = b.dataset.mood; genSel.has(k) ? genSel.delete(k) : genSel.add(k); draw();
      });
      bg.querySelectorAll('.bgm-sec').forEach(el => el.onclick = e => {
        if (e.target.dataset.clr != null) { assign[+e.target.dataset.clr] = null; applyToTimeline(); draw(); return; }
        sel = +el.dataset.sec; draw();
      });
      bg.querySelectorAll('.bgm-cell').forEach(el => el.onclick = e => {
        if (e.target.dataset.del != null) return;   // 削除ボタンは別処理
        assign[sel] = el.dataset.img;
        if (this.tl.duration) this.seek(secs[sel].start + 0.1);   // 割り当て先セクションへプレビュー移動
        applyToTimeline();
        sel = Math.min(secs.length - 1, sel + (assign.slice(0, sel + 1).every(Boolean) ? 1 : 0));
        draw();
      });
      bg.querySelectorAll('.bgm-del').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        if (!confirm('この背景をライブラリから削除しますか？')) return;
        try { await API.del('/bglib/' + b.dataset.del); } catch (err) { return toast('削除失敗: ' + err.message, 'err'); }
        const url = images.find(i => i.id === b.dataset.del)?.url;
        images = images.filter(i => i.id !== b.dataset.del);
        assign.forEach((a, i) => { if (a === url) assign[i] = null; });
        applyToTimeline(); draw();
      });
      const genBtn = bg.querySelector('#bgm-gen');
      if (genBtn) genBtn.onclick = async () => {
        const count = +bg.querySelector('#bgm-count').value;
        const orient = bg.querySelector('#bgm-orient').value;
        const moods = [...genSel];
        genBtn.disabled = true;
        try {
          await API.post('/bglib/generate', { moods, count, orient });
          const prog = bg.querySelector('#bgm-prog'); if (prog) { prog.style.display = 'block'; prog.textContent = `生成開始… ${count}枚`; }
          startPolling();
        } catch (e) { toast('生成できません: ' + e.message, 'err'); }
        genBtn.disabled = false;
      };
      const autoBtn = bg.querySelector('#bgm-auto');
      if (autoBtn) autoBtn.onclick = () => {
        if (!images.length) return toast('先に背景を生成してください', 'err');
        // エネルギーの高いセクション=派手なムード、低い=静かなムードを優先し、被りを避けて循環
        const energetic = ['stage_lights', 'cyber_grid', 'neon_city', 'cosmic', 'aurora', 'fireworks', 'ferris_wheel', 'neon_alley', 'highway_night', 'harbor_night', 'planet_alien', 'vaporwave', 'galaxy_spiral'];
        const calm = ['night_sky', 'snow', 'rainy_window', 'minimal_grad', 'mountain_fog', 'ocean', 'moon_night', 'milkyway_lake', 'foggy_road', 'bamboo_forest', 'ink_wash', 'clouds_sky', 'meadow_sunrise', 'crystal', 'cafe_bokeh'];
        const pool = images.slice();
        secs.forEach((s, i) => {
          const want = (s.energy || 0.5) >= 0.6 ? energetic : calm;
          let cand = pool.filter(im => want.includes(im.mood));
          if (!cand.length) cand = pool;
          const pick = cand[i % cand.length];
          assign[i] = pick ? pick.url : null;
        });
        applyToTimeline(); draw();
        toast('展開に合わせて背景を自動割り当てしました', 'ok');
      };
      const clr = bg.querySelector('#bgm-clearall');
      if (clr) clr.onclick = () => { assign.fill(null); applyToTimeline(); draw(); };
    };

    this.engine.hideLyrics = false;
    draw();
    // 生成中ジョブがあれば復帰時にポーリング再開
    try { const jd = await API.get('/bglib/jobs'); if (jd.jobs.some(j => j.status === 'pending' || j.status === 'processing')) startPolling(); } catch (e) {}
  }

  async runTranslate() {
    if (!this.tl.lyrics_text?.trim()) return toast('先に歌詞を入力してください', 'err');
    const target = prompt('翻訳先の言語コードを入力してください (en / ko / zh / fr / es …)', 'en');
    if (!target) return;
    const { job_id } = await API.post('/ai/translate-lyrics', {
      workspace_id: this.project.workspace_id, lyrics_text: this.tl.lyrics_text, target, engine: this.aiEngine(),
    });
    const res = await API.waitJob(job_id, j => this.showJob(j.stage, j.progress_pct));
    const joined = res.lines.join('\n');
    const engLabel = { codex: 'Codex', deepl: 'DeepL', preview: 'プレビュー翻訳' }[res.engine] || res.engine;
    if (confirm(`翻訳結果 (${engLabel}):\n\n${joined}\n\nこの歌詞に置き換えてタイムスタンプを再生成しますか?`)) {
      this.tl.lyrics_text = joined;
      this.tl.language = target;
      await this.runSync();
      this.renderLeft();
    }
  }

  /* ---------------- timeline ---------------- */
  renderTimeline() {
    const inner = this.root.querySelector('#tl-inner');
    const dur = Math.max(10, this.tl.duration || 10);
    const pps = this.zoom;
    const W = Math.max(dur * pps + 120, this.root.querySelector('#tl-scroll').clientWidth);
    const labelW = 92;
    const trackDefs = [
      ['AUDIO', 'audio', '#00d4ff'], ['LYRICS', 'lyrics', '#00d4ff'],
      ['BG', 'background', '#7b2ff7'], ['FX', 'effects', '#ff7edb'], ['OVERLAY', 'overlay', '#3fd58f'],
    ];
    const composeOn = !!(this.tl.compose && this.tl.compose.enabled && window.LFC);
    if (composeOn) trackDefs.splice(2, 0, ['演出', 'cuts', '#ffb03a']);   // カットごとの構図(クリックで移動)
    // ルーラー目盛り
    const step = pps > 60 ? 1 : pps > 24 ? 2 : pps > 10 ? 5 : 10;
    let ruler = '';
    for (let s = 0; s <= dur; s += step) {
      ruler += `<span style="position:absolute;left:${labelW + s * pps}px;top:3px;font-size:9px;color:var(--faint);font-family:Inter">${s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + 's'}</span>
                <i style="position:absolute;left:${labelW + s * pps}px;top:16px;width:1px;height:6px;background:var(--border-hi);display:block"></i>`;
    }
    // シーン帯 (ルーラー下)
    let sceneBand = '';
    for (const sc of this.tl.scenes || []) {
      const c = SCENE_COLORS[sc.label] || '#8b96a8';
      sceneBand += `<div class="scene-band" data-seek="${sc.start}" style="left:${labelW + sc.start * pps}px;width:${(sc.end - sc.start) * pps}px;background:linear-gradient(180deg,${c}33,transparent);border-left:1px solid ${c}"><span style="background:${c}">${sc.label}</span></div>`;
    }
    // 拍グリッド (BPMから生成)
    let beatGrid = '';
    if (this.tl.bpm && this.tl.showBeats !== false) {
      const period = 60 / this.tl.bpm, off = this.tl.beatOffset || 0, bpb = this.tl.beatsPerBar || 4;
      let lines = '', i = 0;
      for (let tb = off; tb <= dur && i < 4000; tb += period, i++) {
        lines += `<i class="${i % bpb === 0 ? 'bar' : ''}" style="left:${labelW + tb * pps}px"></i>`;
      }
      beatGrid = `<div class="beat-grid" style="width:${W}px">${lines}</div>`;
    }
    inner.style.width = W + 'px';
    inner.innerHTML = `
      <div class="tl-ruler" id="tl-ruler" style="width:${W}px">${ruler}${sceneBand}</div>
      ${beatGrid}
      ${trackDefs.map(([label, key, color]) => `
        <div class="tl-track" data-track="${key}" style="height:${this._trackH(key)}px">
          <div class="tl-label"><i style="background:${color}"></i>${label}</div>
          <div class="tl-lane ${key === 'audio' ? 'audio' : ''}" data-track="${key}" style="width:${W - labelW}px">
            ${key === 'audio' ? `<canvas id="wave-c" style="position:absolute;inset:0"></canvas>` : ''}
            ${key === 'lyrics' ? (this.tl.tracks.lyrics || []).map(w => `
              <div class="clip lyr ${w.id === this.sel ? 'sel' : ''}" data-clip="${w.id}"
                   style="left:${w.start * pps}px;width:${Math.max(14, (w.end - w.start) * pps)}px">
                <span class="rz l"></span>${esc(w.word)}<span class="rz r"></span>
              </div>`).join('') : ''}
            ${key === 'cuts' ? this._cutChips(pps) : ''}
            ${key === 'background' ? (this.tl.tracks.background || []).map(b => `
              <div class="clip bg" style="left:${b.start * pps}px;width:${Math.max(14, (b.end - b.start) * pps)}px">${b.scene}</div>`).join('') : ''}
            ${key === 'effects' ? (this.tl.tracks.effects || []).map(f => `
              <div class="clip fx" style="left:${f.start * pps}px;width:${Math.max(14, (f.end - f.start) * pps)}px">${f.type} ${(f.intensity * 100 | 0)}%</div>`).join('') : ''}
            ${key === 'overlay' ? (this.tl.tracks.overlay || []).map(o => `
              <div class="clip ov" style="left:${o.start * pps}px;width:${Math.max(14, (o.end - o.start) * pps)}px">${esc(o.text || o.type)}</div>`).join('') : ''}
          </div>
          <div class="tl-rz" data-track="${key}" title="ドラッグでトラックの高さを変更"></div>
        </div>`).join('')}
      <div class="playhead" id="playhead" style="left:${labelW + this.t * pps}px"></div>`;
    this.drawWaveform();
    this.bindTimeline(labelW, pps);
    inner.querySelectorAll('.clip.cut').forEach(el => {
      el.onmousedown = e => e.stopPropagation();
      el.onclick = e => {
        e.stopPropagation();
        const cut = (window.LFC.buildCuts(this.tl) || [])[+el.dataset.cut];
        if (cut) { this.seek(cut.start + Math.min(cut.dur * 0.5, cut.inDur + 0.4)); this._composeCutPanel(true); }
      };
    });
  }
  /* 演出トラック: カットごとに構図名のチップ(色は構図ごとに固定) */
  _cutChips(pps) {
    const L = window.LFC;
    if (!L) return '';
    const cuts = L.buildCuts(this.tl);
    const W = this.engine.canvas.width || 1920, H = this.engine.canvas.height || 1080;
    return cuts.map(c => {
      L.resolveCut(this.tl, c, cuts, W, H);
      const d = c.layoutDef || {};
      const hue = L.h(d.key || 'center') % 360;
      const lock = c.plan && c.plan.locked ? '🔒' : '';
      const tip = `${c.text}\n構図: ${d.name || ''} / 登場: ${(c.enterDef || {}).name || 'なし'} / 退場: ${(c.exitDef || {}).name || 'なし'}`;
      return `<div class="clip cut" data-cut="${c.idx}" title="${esc(tip)}"
        style="left:${c.start * pps}px;width:${Math.max(10, c.dur * pps - 1)}px;background:hsla(${hue},70%,55%,.22);border-color:hsla(${hue},75%,62%,.85)">${lock}${esc(d.name || '')}</div>`;
    }).join('');
  }

  // トラック高さ(localStorageに保存)。既定=AUDIO 54px / それ以外 34px
  _trackH(key) {
    const def = key === 'audio' ? 54 : 34;
    const v = parseInt(localStorage.getItem('lf_trackH_' + key), 10);
    return (v && v >= 26 && v <= 260) ? v : def;
  }

  drawWaveform() {
    const c = this.root.querySelector('#wave-c');
    if (!c || !this.tl.envelope) return;
    const pps = this.zoom;
    const dur = this.tl.duration || 10;
    const laneH = (c.parentElement && c.parentElement.clientHeight) || 46;
    c.width = dur * pps;
    c.height = laneH;                       // レーン高さに合わせる(トラック高さ変更に追従)
    const ctx = c.getContext('2d');
    const mx = Math.max(...this.tl.envelope, 0.001);
    const hop = this.tl.hop || 0.1;
    const mid = laneH / 2, maxAmp = laneH * 0.82;
    ctx.fillStyle = 'rgba(0,212,255,0.45)';
    for (let i = 0; i < this.tl.envelope.length; i++) {
      const h = (this.tl.envelope[i] / mx) * maxAmp;
      ctx.fillRect(i * hop * pps, mid - h / 2, Math.max(1, hop * pps - 0.5), h);
    }
  }

  bindTimeline(labelW, pps) {
    const scroll = this.root.querySelector('#tl-scroll');
    // ルーラー/レーン クリックでシーク
    this.root.querySelector('#tl-ruler').onclick = e => {
      const rect = scroll.getBoundingClientRect();
      this.seek((e.clientX - rect.left + scroll.scrollLeft - labelW) / pps);
    };
    this.root.querySelectorAll('.tl-lane').forEach(lane => {
      lane.onclick = e => {
        if (e.target !== lane && !e.target.matches('canvas')) return;
        const rect = lane.getBoundingClientRect();
        this.seek((e.clientX - rect.left) / pps);
        this.sel = null; this.renderTimeline(); this.renderRight();
      };
    });
    // トラック高さのリサイズ(下辺をドラッグ)
    this.root.querySelectorAll('.tl-rz').forEach(rz => {
      rz.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const key = rz.dataset.track;
        const track = rz.closest('.tl-track');
        const startY = e.clientY, startH = track.getBoundingClientRect().height;
        rz.setPointerCapture(e.pointerId); rz.classList.add('dragging');
        const move = ev => {
          const h = Math.max(26, Math.min(260, Math.round(startH + (ev.clientY - startY))));
          track.style.height = h + 'px';
          if (key === 'audio') this.drawWaveform();
        };
        const up = ev => {
          localStorage.setItem('lf_trackH_' + key, parseInt(track.style.height, 10));
          rz.classList.remove('dragging');
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          try { rz.releasePointerCapture(ev.pointerId); } catch (_) {}
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    });
    // 歌詞クリップ: ドラッグ移動 / リサイズ / 選択
    this.root.querySelectorAll('.clip[data-clip]').forEach(clip => {
      clip.onmousedown = e => {
        e.stopPropagation(); e.preventDefault();
        const id = clip.dataset.clip;
        const w = this.tl.tracks.lyrics.find(x => x.id === id);
        if (!w) return;
        if (this.sel !== id) { this.sel = id; this.renderTimeline(); this.renderRight(); }
        const mode = e.target.classList.contains('rz') ? (e.target.classList.contains('l') ? 'l' : 'r') : 'move';
        const startX = e.clientX, s0 = w.start, e0 = w.end;
        const onMove = mv => {
          const dx = (mv.clientX - startX) / pps;
          if (mode === 'move') { const d = e0 - s0; w.start = Math.max(0, +(s0 + dx).toFixed(2)); w.end = +(w.start + d).toFixed(2); }
          else if (mode === 'l') w.start = Math.max(0, Math.min(e0 - 0.05, +(s0 + dx).toFixed(2)));
          else w.end = Math.max(s0 + 0.05, +(e0 + dx).toFixed(2));
          const el2 = this.root.querySelector(`[data-clip="${id}"]`);
          if (el2) { el2.style.left = w.start * pps + 'px'; el2.style.width = Math.max(14, (w.end - w.start) * pps) + 'px'; }
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this.markDirty(); this.renderRight();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
    });
    this.root.querySelectorAll('.scene-band').forEach(b => b.onclick = () => this.seek(+b.dataset.seek));
  }

  movePlayhead() {
    const ph = this.root.querySelector('#playhead');
    if (ph) ph.style.left = (92 + this.t * this.zoom) + 'px';
  }

  /* ---------------- save ---------------- */
  markDirty() {
    this.dirty = true;
    const el = this.root.querySelector('#autosave');
    if (el) { el.textContent = '未保存の変更あり'; el.classList.remove('saved'); }
    if (this._debounce) clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this.save(true), 2500);
  }

  async save(silent) {
    if (!this.dirty && silent) return;
    const tlCopy = { ...this.tl };
    delete tlCopy.watermark;   // 表示専用フラグは永続化しない
    try {
      await API.put('/projects/' + this.pid, { timeline_data: tlCopy });
      this.dirty = false;
      const el = this.root.querySelector('#autosave');
      if (el) { el.textContent = '保存済み ' + new Date().toLocaleTimeString('ja-JP'); el.classList.add('saved'); }
      if (!silent) toast('プロジェクトを保存しました', 'ok');
    } catch (e) { if (!silent) toast('保存失敗: ' + e.message, 'err'); }
  }

  /* ---------------- version history + rollback (仕様 2.2) ---------------- */
  async openHistory() {
    await this.save(true);   // 現在の状態を保存してから履歴を出す
    let data;
    try { data = await API.get(`/projects/${this.pid}/versions`); }
    catch (e) { return toast(e.message, 'err'); }
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const rows = data.versions.length ? data.versions.map((v, i) => `
      <div class="ver-row">
        <div class="ver-info">
          <div class="ver-title">バージョン ${data.versions.length - i}${i === 0 ? ' <span class="badge draft" style="margin-left:6px">最新の保存前</span>' : ''}</div>
          <div class="ver-meta">${new Date(v.created_at * 1000).toLocaleString('ja-JP')} · ${v.dur ? fmtTime(v.dur) : '—'} · ${v.tpl || ''}</div>
        </div>
        <button class="btn sm" data-restore="${v.id}">この版に復元</button>
      </div>`).join('') : '<div class="empty-note">まだ履歴がありません。編集すると自動で版が記録されます（最大50件）。</div>';
    bg.innerHTML = `
      <div class="modal">
        <div class="m-head"><h2>バージョン履歴</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <p class="p-sub" style="margin-bottom:12px">編集ごとに自動保存された版から復元できます（最大50件保持）。復元すると現在の状態も履歴に退避されます。</p>
          <div class="ver-list">${rows}</div>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.x-btn').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
    bg.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
      if (!confirm('この版に復元しますか？ 現在の編集内容は履歴に退避されます。')) return;
      try {
        const r = await API.post(`/projects/${this.pid}/versions/${b.dataset.restore}/restore`);
        this.tl = r.timeline_data;
        this.engine.setTimeline(this.tl);
        await this.loadAudio();
        this.dirty = false;
        this.renderAll();
        close();
        toast('バージョンを復元しました', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  /* ---------------- publish as template (仕様 2.7.1) ---------------- */
  async publishTemplate() {
    const title = prompt('テンプレート名を入力してください', this.project.title + ' Style');
    if (!title) return;
    const priceStr = prompt('販売価格 (USD)。無料は 0 を入力。\n※収益の70%がクリエイターに分配されます (Stripe Connect)', '0');
    if (priceStr === null) return;
    try {
      await API.post(`/projects/${this.pid}/publish-template`, { title, price_usd: parseFloat(priceStr) || 0 });
      toast(`テンプレート「${title}」をマーケットプレイスに公開しました`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- export ---------------- */
  openExport() {
    if (!this.tl.duration) return toast('先に音源を設定してください', 'err');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const lim = this.limits || {};
    const maxRes = lim.max_res || 2160;
    const allowFmts = lim.formats || ['mp4', 'webm', 'gif', 'prores'];
    const heights = { '720p': 720, '1080p': 1080, '4k': 2160 };
    const state = { res: maxRes >= 1080 ? '1080p' : '720p', fmt: 'mp4', aspect: this.project.aspect_ratio, fps: 30 };
    const resOpt = (id, title, sub) => {
      const locked = heights[id] > maxRes;
      return `<div class="exp-opt ${id === state.res ? 'sel' : ''} ${locked ? 'locked' : ''}" data-res="${id}" ${locked ? 'data-locked="1"' : ''}><b>${title}${locked ? ' 🔒' : ''}</b><small>${locked ? 'Pro以上' : sub}</small></div>`;
    };
    const fmtOpt = (id, title, sub) => {
      const locked = !allowFmts.includes(id);
      return `<div class="exp-opt ${id === state.fmt ? 'sel' : ''} ${locked ? 'locked' : ''}" data-fmt="${id}" ${locked ? 'data-locked="1"' : ''}><b>${title}${locked ? ' 🔒' : ''}</b><small>${locked ? 'アップグレード' : sub}</small></div>`;
    };
    bg.innerHTML = `
      <div class="modal">
        <div class="m-head"><h2>エクスポート / Export Video</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <label class="fld"><span>解像度 (プラン: ${(this.plan || 'free').toUpperCase()} — 最大${maxRes}p)</span></label>
          <div class="exp-grid" id="res-grid" style="grid-template-columns:1fr 1fr 1fr">
            ${resOpt('720p', '720p HD', '高速・軽量')}
            ${resOpt('1080p', '1080p FHD', '本番推奨')}
            ${resOpt('4k', '4K UHD', '3840×2160')}
          </div>
          <label class="fld"><span>フォーマット</span></label>
          <div class="exp-grid" id="fmt-grid" style="grid-template-columns:1fr 1fr">
            ${fmtOpt('mp4', 'MP4 (H.264)', '汎用配信')}
            ${fmtOpt('webm', 'WebM (VP9)', 'Web埋め込み')}
            ${fmtOpt('prores', 'ProRes 422', '映像制作 (.mov)')}
            ${fmtOpt('gif', 'GIF', 'SNSサムネイル')}
          </div>
          <label class="fld"><span>フレームレート</span></label>
          <div class="exp-grid" id="fps-grid" style="grid-template-columns:1fr 1fr 1fr">
            <div class="exp-opt" data-fps="24"><b>24 fps</b><small>映画調</small></div>
            <div class="exp-opt sel" data-fps="30"><b>30 fps</b><small>標準・高速</small></div>
            <div class="exp-opt" data-fps="60"><b>60 fps</b><small>より滑らか</small></div>
          </div>
          <label class="fld"><span>背景</span></label>
          <div class="exp-grid" id="key-grid" style="grid-template-columns:1fr 1fr 1fr">
            <div class="exp-opt sel" data-key=""><b>通常</b><small>背景・エフェクト込み</small></div>
            <div class="exp-opt" data-key="green"><b>グリーンバック</b><small>合成用 (#00FF00)</small></div>
            <div class="exp-opt" data-key="black"><b>ブラックバック</b><small>合成用 (黒地)</small></div>
          </div>
          <label class="fld"><span>モーションブラー（1コマを複数回描いて平均・書き出しのみ）</span></label>
          <div class="exp-grid" id="mb-grid" style="grid-template-columns:1fr 1fr 1fr">
            <div class="exp-opt sel" data-mb="1"><b>なし</b><small>最速</small></div>
            <div class="exp-opt" data-mb="5"><b>5サンプル</b><small>なめらか・約5倍の時間</small></div>
            <div class="exp-opt" data-mb="10"><b>10サンプル</b><small>最もなめらか・約10倍</small></div>
          </div>
          <label class="fld"><span>アスペクト比 (${state.aspect} — エディターで変更)</span></label>
          <label class="fld"><span>歌詞ファイル同時出力</span></label>
          <div class="sub-dl">
            <button class="btn sm" data-sub="srt">SRT</button>
            <button class="btn sm" data-sub="lrc">LRC</button>
            <button class="btn sm" data-sub="vtt">WebVTT</button>
            <button class="btn sm" data-sub="ass">ASS</button>
          </div>
          <label class="fld" style="margin-top:12px"><span>After Effects 用（編集可能なテキストレイヤー＋キーフレーム＋マーカー）</span></label>
          <button class="btn sm" id="ae-btn" style="width:100%;justify-content:center">🎞 After Effects用スクリプト (.jsx) を書き出す</button>
          <div class="job-bar" id="exp-bar" style="display:none;margin-top:16px">
            <div class="jb-label"><span id="exp-stage">レンダリング中…</span><span id="exp-pct">0%</span></div>
            <div class="pbar"><i id="exp-fill" style="width:0%"></i></div>
          </div>
          <div id="exp-done" style="display:none;margin-top:14px"></div>
          <div class="empty-note" style="text-align:left;padding:10px 2px 0">決定論的レンダリング方式：全フレームを正確な時刻で1枚ずつ描画しffmpegで高品質エンコードします。フレーム落ち・タイミングずれが原理的に無く、商用品質です（曲の長さ・解像度に応じて時間がかかります）。</div>
        </div>
        <div class="m-foot">
          <button class="btn" id="exp-cancel">キャンセル</button>
          <button class="btn primary" id="exp-start">⬆ レンダリング開始</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => { this._exporting = false; bg.remove(); this.fitStage(); };
    bg.querySelector('.x-btn').onclick = close;
    bg.querySelector('#exp-cancel').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
    bg.querySelectorAll('#fps-grid .exp-opt').forEach(o => o.onclick = () => {
      bg.querySelectorAll('#fps-grid .exp-opt').forEach(x => x.classList.toggle('sel', x === o));
      state.fps = +o.dataset.fps;
    });
    bg.querySelectorAll('#mb-grid .exp-opt').forEach(o => o.onclick = () => {
      bg.querySelectorAll('#mb-grid .exp-opt').forEach(x => x.classList.toggle('sel', x === o));
      state.mblur = +o.dataset.mb || 1;
    });
    bg.querySelectorAll('#key-grid .exp-opt').forEach(o => o.onclick = () => {
      bg.querySelectorAll('#key-grid .exp-opt').forEach(x => x.classList.toggle('sel', x === o));
      state.keyMode = o.dataset.key || '';
    });
    bg.querySelectorAll('#res-grid .exp-opt').forEach(o => o.onclick = () => {
      if (o.dataset.locked) return toast('この解像度はProプラン以上で利用できます', 'err');
      bg.querySelectorAll('#res-grid .exp-opt').forEach(x => x.classList.toggle('sel', x === o));
      state.res = o.dataset.res;
    });
    bg.querySelectorAll('#fmt-grid .exp-opt').forEach(o => o.onclick = () => {
      if (o.dataset.locked) return toast('このフォーマットは上位プランで利用できます', 'err');
      bg.querySelectorAll('#fmt-grid .exp-opt').forEach(x => x.classList.toggle('sel', x === o));
      state.fmt = o.dataset.fmt;
    });
    bg.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => this.downloadSubs(b.dataset.sub));
    bg.querySelector('#ae-btn').onclick = () => this.exportAE(state);
    bg.querySelector('#exp-start').onclick = () => this.startRender(bg, state);
  }

  downloadSubs(kind) {
    const words = this.tl.tracks.lyrics || [];
    if (!words.length) return toast('歌詞タイムスタンプがありません', 'err');
    const lines = [...new Set(words.map(w => w.line))].map(li => {
      const ws = words.filter(w => w.line === li);
      return { start: ws[0].start, end: ws[ws.length - 1].end, text: ws.map(w => w.word).join('') };
    });
    const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
    const srtT = t => `${pad(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)},${pad((t % 1) * 1000, 3)}`;
    const vttT = t => srtT(t).replace(',', '.');
    const lrcT = t => `${pad(t / 60)}:${pad(t % 60)}.${pad((t % 1) * 100)}`;
    let content = '', ext = kind;
    if (kind === 'srt') content = lines.map((l, i) => `${i + 1}\n${srtT(l.start)} --> ${srtT(l.end)}\n${l.text}\n`).join('\n');
    else if (kind === 'vtt') { content = 'WEBVTT\n\n' + lines.map(l => `${vttT(l.start)} --> ${vttT(l.end)}\n${l.text}\n`).join('\n'); ext = 'vtt'; }
    else if (kind === 'lrc') content = lines.map(l => `[${lrcT(l.start)}]${l.text}`).join('\n');
    else if (kind === 'ass') {
      const assT = t => `${Math.floor(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)}.${pad((t % 1) * 100)}`;
      content = `[Script Info]\nTitle: ${this.project.title}\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold\nStyle: Default,Noto Sans JP,64,&H00FFFFFF,1\n\n[Events]\nFormat: Layer, Start, End, Style, Text\n` +
        lines.map(l => `Dialogue: 0,${assT(l.start)},${assT(l.end)},Default,${l.text}`).join('\n');
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.project.title}.${ext}`;
    a.click();
    toast(`${kind.toUpperCase()}を書き出しました`, 'ok');
  }

  /* 決定論的レンダリング: 各フレームを正確な時刻で1枚ずつ描画してサーバーへ送信し、
     ffmpegで高品質エンコード+元音源ミックス。リアルタイム録画と違いフレーム落ち・ズレが無い。 */
  async startRender(bg, state) {
    const startBtn = bg.querySelector('#exp-start');
    startBtn.disabled = true;
    bg.querySelector('#exp-bar').style.display = 'block';
    const setP = (stage, pct) => {
      const s = bg.querySelector('#exp-stage'), p = bg.querySelector('#exp-pct'), f = bg.querySelector('#exp-fill');
      if (s) s.textContent = stage; if (p) p.textContent = Math.floor(pct) + '%'; if (f) f.style.width = pct + '%';
    };
    const [W, H] = EXPORT_RES[state.res][state.aspect] || EXPORT_RES[state.res]['16:9'];
    const FPS = state.fps || 30;
    const dur = this.tl.duration;
    const total = Math.max(1, Math.round(dur * FPS));
    this.pause();
    this._exporting = true;
    const prevQ = this.engine.quality;
    this.engine.quality = 'full';
    this.engine.resize(W, H);
    this.engine.keyMode = state.keyMode || null;   // グリーン/ブラックバック(合成用)
    const canvas = this.root.querySelector('#stage');
    // 演出エンジンの役割フォントも事前ロード
    if (this.tl.compose?.enabled && window.LFC && document.fonts?.load) {
      const fams = LFC.fontsUsed(this.tl).map(f => f.split(',')[0].trim());
      await Promise.all(fams.flatMap(f => ['500', '700', '900'].map(w => document.fonts.load(`${w} 64px ${f}`, '夜明けあアA').catch(() => {}))));
    }
    const ext = { mp4: 'mp4', webm: 'webm', prores: 'mov', gif: 'gif' }[state.fmt] || 'mp4';
    // フォントを事前ロード(決定論レンダで1フレーム目から正しい書体で描画されるように)
    if (this.tl.lyricStyle?.font && document.fonts?.load) {
      const fam = this.tl.lyricStyle.font.split(',')[0].trim();
      setP('フォントを読み込み中…', 0);
      await Promise.all(['400', '700', '900'].map(w => document.fonts.load(`${w} 64px ${fam}`).catch(() => {})));
    }
    // 背景画像を事前ロード(決定論レンダで1フレーム目から背景が出るように)
    const bgUrls = [...new Set((this.tl.tracks.background || []).map(b => b.image).filter(Boolean))];
    if (bgUrls.length) {
      setP('背景画像を読み込み中…', 0);
      bgUrls.forEach(u => this.engine._bgImage(u));
      await Promise.all(bgUrls.map(u => new Promise(res => {
        const im = this.engine._bgCache[u];
        if (im && im.complete && im.naturalWidth) return res();
        im.onload = res; im.onerror = res; setTimeout(res, 8000);
      })));
    }
    // 3Dダンス素材のプリロード+揺れもの整定 (決定論レンダで1フレーム目から描画されるように)
    if (this.tl.dance?.enabled && this.tl.dance.vrm_url) {
      setP('3Dダンス素材を読み込み中…', 0);
      try { await this.engine.prepareDance(); }
      catch (e) { toast('3Dダンス素材の読み込みに失敗: ' + e.message, 'err'); }
    }
    try {
      const { job_id } = await API.post('/render/frames/start', {
        project_id: this.pid,
        settings: { format: state.fmt, resolution: state.res, aspect: state.aspect, width: W, height: H, fps: FPS },
      });
      const MB = Math.max(1, state.mblur | 0);
      const acc = MB > 1 ? document.createElement('canvas') : null;
      const ag = acc ? (acc.width = W, acc.height = H, acc.getContext('2d')) : null;
      for (let i = 0; i < total; i++) {
        if (!bg.isConnected || !this._exporting) throw new Error('cancelled');
        let src = canvas;
        if (MB > 1) {
          // モーションブラー: 1コマの前後(180°シャッター)を MB 回描いて累積平均
          ag.globalAlpha = 1; ag.clearRect(0, 0, W, H);
          for (let k = 0; k < MB; k++) {
            this.engine.render(Math.max(0, (i + (k / MB - 0.5) * 0.5) / FPS));
            ag.globalAlpha = 1 / (k + 1);
            ag.drawImage(canvas, 0, 0);
          }
          ag.globalAlpha = 1;
          src = acc;
        } else {
          this.engine.render(i / FPS);                    // 正確な時刻で1フレーム描画
        }
        const blob = await new Promise(r => src.toBlob(r, 'image/jpeg', 0.92));
        const res = await fetch(`/api/v1/render/frames/${job_id}/${i}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + API.token, 'Content-Type': 'image/jpeg', 'X-Total-Frames': String(total) },
          body: blob,
        });
        if (!res.ok) throw new Error('フレーム送信に失敗しました');
        if (i % 4 === 0) { setP(`フレーム描画中… ${i}/${total}`, (i / total) * 60); await new Promise(r => setTimeout(r)); }
      }
      setP('サーバーでエンコード中 (ffmpeg)…', 62);
      await API.post(`/render/frames/${job_id}/finish`, {});
      for (;;) {
        const j = await API.req('GET', '/render/' + job_id);
        setP('サーバーでエンコード中 (ffmpeg)…', 62 + (j.progress_pct || 0) * 0.38);
        if (j.status === 'completed') {
          setP('完了', 100);
          const done = bg.querySelector('#exp-done');
          done.style.display = 'block';
          done.innerHTML = `<a class="btn primary" href="${j.output_url}" download="${esc(this.project.title)}.${ext}" style="width:100%;justify-content:center">⬇ ${esc(this.project.title)}.${ext} をダウンロード</a>`;
          this.project.status = 'exported';
          const badge = this.root.querySelector('#status-badge');
          if (badge) { badge.textContent = 'exported'; badge.className = 'badge exported'; }
          toast('レンダリング完了', 'ok');
          break;
        }
        if (j.status === 'failed') throw new Error(j.error_message || 'エンコード失敗');
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (e) {
      if (e.message !== 'cancelled') { toast('レンダリング失敗: ' + e.message, 'err'); setP('失敗: ' + e.message, 0); }
      else setP('中止しました', 0);
    } finally {
      this._exporting = false;
      this.engine.quality = prevQ;
      this.engine.keyMode = null;
      this.fitStage();
      startBtn.disabled = false;
    }
  }
}

/* CJK対応の簡易単語分割 (サーバー側 split_words と同等) */
function splitWordsJS(line) {
  line = line.trim();
  if (!line) return [];
  if (/[\s　]/.test(line)) return line.split(/[\s　]+/).filter(Boolean);
  if (/[぀-ヿ㐀-鿿]/.test(line)) {
    const out = [];
    let i = 0;
    while (i < line.length) {
      let step = (i + 3 <= line.length && line.length - i !== 4) ? 3 : 2;
      step = Math.min(step, line.length - i);
      out.push(line.slice(i, i + step));
      i += step;
    }
    return out;
  }
  return [line];
}
