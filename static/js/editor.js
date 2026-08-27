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
const ANIMS = [['glow-pop', 'グロウポップ'], ['fade', 'フェード'], ['fade-up', 'フェードアップ'], ['slide-up', 'スライドアップ'], ['pop-scale', 'ポップスケール'], ['glitch-in', 'グリッチイン']];
const SCENES = [['city', 'ネオン都市'], ['sky', '夜空'], ['stars', '星空(高密度)'], ['grid', 'サイバーグリッド'], ['sunset', 'レトロサンセット'], ['stage', 'ステージ(照明)'], ['flat', 'フラット']];
const LETTERINGS = [['neon', 'ネオン(グラデ)'], ['outline', 'アウトライン'], ['marker', 'マーカー'], ['brush', '筆(太字)'], ['chrome', 'クローム(金属)'], ['longshadow', 'ロングシャドウ']];
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
    this.loop();
    this.autosaveTimer = setInterval(() => this.save(true), 30000); // 仕様: 30秒オートセーブ
    this.keyHandler = e => {
      if (this._tapActive) return;                 // タップ同期中はSpaceを譲る
      if (e.target.matches('input,textarea,select')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
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
            <button class="t-btn play" id="tp-play">▶</button>
            <button class="t-btn" id="tp-end" title="末尾へ">⏭</button>
            <span class="t-time" id="tp-time">00:00.00 / 00:00.00</span>
            <input type="range" id="tp-vol" min="0" max="100" value="80" style="width:90px" title="音量">
            <div class="aspect-mini" id="aspect-mini">
              ${Object.keys(ASPECTS).map(a => `<button data-a="${a}" class="${this.project.aspect_ratio === a ? 'sel' : ''}">${a}</button>`).join('')}
            </div>
          </div>
        </section>
        <aside class="ed-right" id="right-pane"></aside>
      </div>
      <div class="ed-bottom">
        <div class="tl-toolbar">
          <span>タイムライン</span>
          <span id="tl-hint" style="color:var(--faint)">クリップをドラッグで移動 / 端でリサイズ</span>
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
    $('#tp-vol').oninput = e => { this.audio.volume = e.target.value / 100; };
    $('#title-in').onchange = e => { this.project.title = e.target.value; API.put('/projects/' + this.pid, { title: e.target.value }); };
    $('#quality-chip').onclick = () => {
      this.quality = this.quality === 'full' ? 'draft' : 'full';
      this.engine.quality = this.quality;
      $('#quality-chip').textContent = '品質: ' + (this.quality === 'full' ? 'Full HD' : 'Draft(高速)');
    };
    $('#tl-zoom').oninput = e => { this.zoom = +e.target.value; this.renderTimeline(); };
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
    this.engine.render(this.t);
    const tt = this.root.querySelector('#tp-time');
    if (tt) tt.textContent = `${fmtTime(this.t)} / ${fmtTime(this.tl.duration || 0)}`;
    const sc = this.engine.sceneAt(this.t);
    const chip = this.root.querySelector('#scene-chip');
    if (chip) chip.textContent = sc ? `${sc.label} · energy ${(sc.energy * 100 | 0)}%` : 'シーン未解析';
    this.movePlayhead();
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
        <div class="ai-tools">
          <button class="ai-btn" id="ai-tap"><span class="ic">🎯</span><span>タップ同期<small>再生しながら行頭でタップ＝最も正確</small></span></button>
          <button class="ai-btn" id="ai-sync"><span class="ic">♪</span><span>${App.whisperAvailable ? 'AI自動同期 (Whisper)' : 'AI自動同期'}<small>${App.whisperAvailable ? '実音声を認識し強制アライメント(高精度)' : '無音を除外しオンセットにスナップ(近似)'}</small></span></button>
          <button class="ai-btn" id="ai-suggest"><span class="ic">✨</span><span>演出提案 (AI Director)<small>歌詞から背景・配色・演出を提案</small></span></button>
          <button class="ai-btn" id="ai-scene"><span class="ic">◈</span><span>シーン解析AI<small>曲構成を検出し演出を自動適用</small></span></button>
          <button class="ai-btn" id="ai-trans"><span class="ic">文</span><span>AI多言語翻訳<small>50言語以上 / DeepL・Codex</small></span></button>
        </div>
        <div class="job-bar" id="job-bar" style="display:none">
          <div class="jb-label"><span id="jb-stage">処理中…</span><span id="jb-pct">0%</span></div>
          <div class="pbar"><i id="jb-fill" style="width:0%"></i></div>
        </div>
      </div>
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
          <select class="input" id="st-font">
            <option value="'Noto Sans JP', sans-serif" ${(st.font || '').includes('Sans') ? 'selected' : ''}>Noto Sans JP</option>
            <option value="'Noto Serif JP', serif" ${(st.font || '').includes('Serif') ? 'selected' : ''}>Noto Serif JP</option>
            <option value="'Inter', sans-serif" ${(st.font || '').includes('Inter') ? 'selected' : ''}>Inter</option>
          </select></div>
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
      </div>
      <div class="prop-group">
        <h4>シーン &amp; パーティクル</h4>
        <div class="prop-row"><span>背景</span>
          <select class="input" id="sc-scene">${SCENES.map(([v, l]) => `<option value="${v}" ${(this.tl.tracks.background[0]?.scene || this.tl.sceneDefault) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="prop-row"><span>粒子</span>
          <select class="input" id="sc-part">${PARTICLES.map(([v, l]) => `<option value="${v}" ${this.tl.particles === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
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
        <div class="empty-note" style="padding:6px 2px;text-align:left;font-size:11px">サビ(Chorus)では強度が自動ブーストされます</div>
      </div>
      <div class="prop-group">
        <h4>前景キャラ / 被写体</h4>
        ${this.tl.subject ? `
          <div class="prop-row"><span>素材</span><span style="font-size:11px;color:var(--cyan);overflow:hidden;text-overflow:ellipsis">${esc(this.tl.subject.name || '設定済み')}</span></div>
          <div class="prop-row"><span>大きさ</span><input type="range" id="su-scale" min="30" max="100" value="${(this.tl.subject.scale || 0.72) * 100}"></div>
          <div class="prop-row"><span>横位置</span><input type="range" id="su-x" min="0" max="100" value="${(this.tl.subject.x ?? 0.5) * 100}"></div>
          <button class="btn danger sm" id="su-del" style="width:100%;justify-content:center;margin-top:5px">キャラを外す</button>
        ` : `
          <div class="empty-note" style="padding:4px 2px;text-align:left;font-size:11px">アニメキャラ等の画像/透過PNGを前景に配置し、リムライト・浮遊・呼吸で演出します。</div>
          <input type="file" id="su-file" accept=".png,.jpg,.jpeg,.webp" style="display:none">
          <button class="btn sm" id="su-add" style="width:100%;justify-content:center;margin-top:6px">＋ キャラ画像を配置</button>
        `}
      </div>`;
    const $ = s => el.querySelector(s);
    const engSel = $('#ai-engine');
    engSel.value = this.aiEngine();
    engSel.onchange = e => { localStorage.setItem('lf_ai_engine', e.target.value); };
    $('#ai-suggest').onclick = () => this.runSuggest();
    $('#ai-tap').onclick = () => this.openTapSync();
    $('#ai-sync').onclick = () => this.runSync();
    $('#ai-scene').onclick = () => this.runSceneAnalysis();
    $('#ai-trans').onclick = () => this.runTranslate();
    $('#st-font').onchange = e => { this.tl.lyricStyle.font = e.target.value; this.markDirty(); };
    $('#st-size').oninput = e => { this.tl.lyricStyle.size = +e.target.value; this.markDirty(); };
    $('#st-color').oninput = e => { this.tl.lyricStyle.color = e.target.value; this.markDirty(); };
    $('#st-anim').onchange = e => { this.tl.lyricStyle.anim = e.target.value; this.markDirty(); };
    $('#st-orient').onchange = e => { this.tl.lyricStyle.orient = e.target.value; this.markDirty(); };
    $('#st-letter').onchange = e => { this.tl.lyricStyle.lettering = e.target.value; this.markDirty(); };
    $('#st-track').oninput = e => { this.tl.lyricStyle.tracking = e.target.value / 100; this.markDirty(); };
    $('#st-glow').oninput = e => { this.tl.lyricStyle.glow = e.target.value / 100; this.markDirty(); };
    $('#st-randsize').onchange = e => { this.tl.lyricStyle.randomSize = e.target.checked; this.markDirty(); };
    $('#sc-scene').onchange = e => {
      this.tl.sceneDefault = e.target.value;
      if (this.tl.tracks.background[0]) this.tl.tracks.background[0].scene = e.target.value;
      else this.tl.tracks.background.push({ id: 'bg' + Date.now(), start: 0, end: this.tl.duration || 60, scene: e.target.value });
      this.markDirty(); this.renderTimeline();
    };
    $('#sc-part').onchange = e => { this.tl.particles = e.target.value; this.engine.particles = []; this.markDirty(); };
    for (const k of ['bloom', 'glitch', 'chroma', 'wave', 'godray', 'flare', 'dof']) {
      $('#fx-' + k).oninput = e => { this.tl.fx[k] = e.target.value / 100; this.markDirty(); };
    }
    // 前景キャラ/被写体
    if (this.tl.subject) {
      $('#su-scale').oninput = e => { this.tl.subject.scale = e.target.value / 100; this.markDirty(); };
      $('#su-x').oninput = e => { this.tl.subject.x = e.target.value / 100; this.markDirty(); };
      $('#su-del').onclick = () => { this.tl.subject = null; this.engine.setTimeline(this.tl); this.markDirty(); this.renderRight(); };
    } else {
      $('#su-add').onclick = () => $('#su-file').click();
      $('#su-file').onchange = e => this.addSubject(e.target.files[0]);
    }
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

  async runSuggest() {
    if (!this.tl.lyrics_text?.trim()) return toast('先に歌詞を入力してください(左の歌詞タブ)', 'err');
    const engine = this.aiEngine();
    const { job_id } = await API.post('/ai/suggest', {
      workspace_id: this.project.workspace_id, lyrics_text: this.tl.lyrics_text, engine,
    });
    let res;
    try { res = await API.waitJob(job_id, j => this.showJob(j.stage, j.progress_pct)); }
    catch (e) { return toast('演出提案に失敗: ' + e.message, 'err'); }
    const msg = `${res.engine === 'codex' ? 'Codex' : 'Built-in'} の提案:\n\n` +
      `背景: ${res.scene} / 粒子: ${res.particles} / アニメ: ${res.anim}` +
      `${res.lettering ? ' / 文字: ' + res.lettering : ''}${res.orient === 'vertical' ? ' / 縦書き' : ''}\n` +
      `${res.rationale || ''}\n\nこの演出を適用しますか?`;
    if (!confirm(msg)) return;
    const ls = { ...this.tl.lyricStyle, anim: res.anim, color: res.colors.text, glow: res.fx.bloom };
    if (res.lettering) ls.lettering = res.lettering;
    if (res.orient) ls.orient = res.orient;
    Object.assign(this.tl, {
      colors: res.colors, fx: { ...this.tl.fx, ...res.fx }, particles: res.particles, sceneDefault: res.scene,
      lyricStyle: ls,
    });
    if (this.tl.tracks.background[0]) this.tl.tracks.background[0].scene = res.scene;
    else this.tl.tracks.background.push({ id: 'bg' + Date.now(), start: 0, end: this.tl.duration || 60, scene: res.scene });
    this.engine.particles = [];
    this.engine.setTimeline(this.tl);
    this.markDirty(); this.renderRight(); this.renderTimeline();
    toast(`演出提案を適用しました (${res.engine})`, 'ok');
  }

  /* ---------------- タップ同期 (最も正確な手動同期) ---------------- */
  openTapSync() {
    if (!this.tl.duration || !this.audio.src) return toast('先に音源を設定してください', 'err');
    const rawLines = (this.tl.lyrics_text || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!rawLines.length) return toast('先に歌詞を入力してください(左の歌詞タブ)', 'err');
    this.pause();
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
      const cur = state.units[state.idx];
      const nxt = state.units[state.idx + 1];
      const done = state.idx >= state.units.length;
      stageEl.innerHTML = done
        ? `<div class="tap-done">✓ 全${state.units.length}${state.mode === 'line' ? '行' : '語'}をタップしました。「適用」で確定します。</div>`
        : `<div class="tap-cur">${esc(cur.text)}</div>${nxt ? `<div class="tap-next">次: ${esc(nxt.text)}</div>` : '<div class="tap-next">（最後）</div>'}`;
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
      this.audio.pause();
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
    inner.style.width = W + 'px';
    inner.innerHTML = `
      <div class="tl-ruler" id="tl-ruler" style="width:${W}px">${ruler}${sceneBand}</div>
      ${trackDefs.map(([label, key, color]) => `
        <div class="tl-track">
          <div class="tl-label"><i style="background:${color}"></i>${label}</div>
          <div class="tl-lane ${key === 'audio' ? 'audio' : ''}" data-track="${key}" style="width:${W - labelW}px">
            ${key === 'audio' ? `<canvas id="wave-c" height="46" style="position:absolute;inset:0"></canvas>` : ''}
            ${key === 'lyrics' ? (this.tl.tracks.lyrics || []).map(w => `
              <div class="clip lyr ${w.id === this.sel ? 'sel' : ''}" data-clip="${w.id}"
                   style="left:${w.start * pps}px;width:${Math.max(14, (w.end - w.start) * pps)}px">
                <span class="rz l"></span>${esc(w.word)}<span class="rz r"></span>
              </div>`).join('') : ''}
            ${key === 'background' ? (this.tl.tracks.background || []).map(b => `
              <div class="clip bg" style="left:${b.start * pps}px;width:${Math.max(14, (b.end - b.start) * pps)}px">${b.scene}</div>`).join('') : ''}
            ${key === 'effects' ? (this.tl.tracks.effects || []).map(f => `
              <div class="clip fx" style="left:${f.start * pps}px;width:${Math.max(14, (f.end - f.start) * pps)}px">${f.type} ${(f.intensity * 100 | 0)}%</div>`).join('') : ''}
            ${key === 'overlay' ? (this.tl.tracks.overlay || []).map(o => `
              <div class="clip ov" style="left:${o.start * pps}px;width:${Math.max(14, (o.end - o.start) * pps)}px">${esc(o.text || o.type)}</div>`).join('') : ''}
          </div>
        </div>`).join('')}
      <div class="playhead" id="playhead" style="left:${labelW + this.t * pps}px"></div>`;
    this.drawWaveform();
    this.bindTimeline(labelW, pps);
  }

  drawWaveform() {
    const c = this.root.querySelector('#wave-c');
    if (!c || !this.tl.envelope) return;
    const pps = this.zoom;
    const dur = this.tl.duration || 10;
    c.width = dur * pps;
    const ctx = c.getContext('2d');
    const mx = Math.max(...this.tl.envelope, 0.001);
    const hop = this.tl.hop || 0.1;
    ctx.fillStyle = 'rgba(0,212,255,0.45)';
    for (let i = 0; i < this.tl.envelope.length; i++) {
      const h = (this.tl.envelope[i] / mx) * 38;
      ctx.fillRect(i * hop * pps, 23 - h / 2, Math.max(1, hop * pps - 0.5), h);
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
    const state = { res: maxRes >= 1080 ? '1080p' : '720p', fmt: 'mp4', aspect: this.project.aspect_ratio };
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
          <label class="fld"><span>アスペクト比 (${state.aspect} — エディターで変更)</span></label>
          <label class="fld"><span>歌詞ファイル同時出力</span></label>
          <div class="sub-dl">
            <button class="btn sm" data-sub="srt">SRT</button>
            <button class="btn sm" data-sub="lrc">LRC</button>
            <button class="btn sm" data-sub="vtt">WebVTT</button>
            <button class="btn sm" data-sub="ass">ASS</button>
          </div>
          <div class="job-bar" id="exp-bar" style="display:none;margin-top:16px">
            <div class="jb-label"><span id="exp-stage">レンダリング中…</span><span id="exp-pct">0%</span></div>
            <div class="pbar"><i id="exp-fill" style="width:0%"></i></div>
          </div>
          <div id="exp-done" style="display:none;margin-top:14px"></div>
          <div class="empty-note" style="text-align:left;padding:10px 2px 0">リアルタイムキャプチャ方式のため、曲の長さぶんの時間がかかります。レンダリング中はタブを前面に保ってください。</div>
        </div>
        <div class="m-foot">
          <button class="btn" id="exp-cancel">キャンセル</button>
          <button class="btn primary" id="exp-start">⬆ レンダリング開始</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); this.recording && this.stopRecording(); };
    bg.querySelector('.x-btn').onclick = close;
    bg.querySelector('#exp-cancel').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
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

  async startRender(bg, state) {
    const startBtn = bg.querySelector('#exp-start');
    startBtn.disabled = true;
    const bar = bg.querySelector('#exp-bar');
    bar.style.display = 'block';
    const setP = (stage, pct) => {
      bg.querySelector('#exp-stage').textContent = stage;
      bg.querySelector('#exp-pct').textContent = Math.floor(pct) + '%';
      bg.querySelector('#exp-fill').style.width = pct + '%';
    };
    // 高解像度キャンバスへ切替 (60fps)
    const [W, H] = EXPORT_RES[state.res][state.aspect] || EXPORT_RES[state.res]['16:9'];
    const FPS = 60;
    this.pause();
    this.engine.resize(W, H);
    this.engine.quality = 'full';
    // 映像のみをキャプチャ。音声は劣化を避けるためサーバー側で元音源を直接ミックスする
    const canvasStream = this.root.querySelector('#stage').captureStream(FPS);
    const stream = new MediaStream(canvasStream.getVideoTracks());
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const bitrate = state.res === '4k' ? 55_000_000 : state.res === '1080p' ? 18_000_000 : 10_000_000;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    this.recording = rec;
    const dur = this.tl.duration;
    rec.onstop = async () => {
      this.recording = null;
      this.pause();
      this.fitStage(); // プレビュー解像度に戻す
      if (!bg.isConnected) return;
      setP('サーバーでエンコード中 (ffmpeg)…', 62);
      const blob = new Blob(chunks, { type: 'video/webm' });
      const fd = new FormData();
      fd.append('file', blob, 'capture.webm');
      fd.append('project_id', this.pid);
      fd.append('settings', JSON.stringify({ format: state.fmt, resolution: state.res, aspect: state.aspect, width: W, height: H, fps: FPS, mux_source_audio: true }));
      try {
        const { job_id } = await API.upload('/render', fd);
        for (;;) {
          const j = await API.req('GET', '/render/' + job_id);
          setP('サーバーでエンコード中 (ffmpeg)…', 62 + j.progress_pct * 0.38);
          if (j.status === 'completed') {
            setP('完了', 100);
            const ext = { mp4: 'mp4', webm: 'webm', prores: 'mov', gif: 'gif' }[state.fmt] || 'mp4';
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
          await new Promise(r => setTimeout(r, 700));
        }
      } catch (e) { toast('レンダリング失敗: ' + e.message, 'err'); setP('失敗: ' + e.message, 0); }
      startBtn.disabled = false;
    };
    // 再生しながらキャプチャ
    this.seek(0);
    rec.start(250);
    this.play();
    const t0 = performance.now();
    // 監視は setTimeout で(rAFは非表示時に停止するため)。実描画はWorker駆動のframe()が60Hzで行う
    const tick = () => {
      if (!this.recording) return;
      const p = Math.min(1, this.t / dur);
      setP(`リアルタイムキャプチャ中… ${fmtTime(this.t)} / ${fmtTime(dur)}`, p * 60);
      if (this.t >= dur - 0.05 || (performance.now() - t0) / 1000 > dur + 5) rec.stop();
      else setTimeout(tick, 100);
    };
    tick();
  }

  stopRecording() {
    try { this.recording?.stop(); } catch (e) {}
    this.recording = null;
    this.pause();
    this.fitStage();
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
