/* =====================================================================
 * LyricFlow AI — SPA shell / pages
 * #/login #/dashboard #/projects #/templates #/assets #/team #/editor/{id}
 * ===================================================================== */
const App = {
  user: null, ws: null, workspaces: [], me: null, editor: null,

  async boot() {
    window.addEventListener('hashchange', () => this.route());
    if (API.token) {
      try {
        const me = await API.get('/me');
        this.user = me.user; this.workspaces = me.workspaces; this.ws = me.workspaces[0]; this.me = me;
      } catch (e) { API.clear(); }
    }
    if (!location.hash) location.hash = this.user ? '#/dashboard' : '#/login';
    this.route();
  },

  async route() {
    if (this.editor) { this.editor.destroy(); this.editor = null; }
    const app = document.getElementById('app');
    const hash = location.hash.slice(2) || 'login';
    const [page, arg] = hash.split('/');
    if (!this.user && page !== 'login' && page !== 'register') { location.hash = '#/login'; return; }
    if (this.user && (page === 'login' || page === 'register')) { location.hash = '#/dashboard'; return; }
    if (page === 'login' || page === 'register') return this.renderAuth(app, page);
    if (page === 'editor' && arg) {
      app.innerHTML = '';
      this.editor = new Editor(app, arg);
      try { await this.editor.init(); } catch (e) { toast('プロジェクトを開けません: ' + e.message, 'err'); location.hash = '#/projects'; }
      return;
    }
    this.renderShell(app, page);
    const fn = { dashboard: this.pageDashboard, projects: this.pageProjects, templates: this.pageTemplates, assets: this.pageAssets, team: this.pageTeam }[page];
    if (fn) await fn.call(this, document.getElementById('page'));
    else location.hash = '#/dashboard';
  },

  /* ================= auth ================= */
  renderAuth(app, mode) {
    const isLogin = mode === 'login';
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-visual">
        <canvas id="auth-canvas"></canvas>
        <div class="vcap">
          <h2>歌詞が、<em>MVになる</em>。<br>AIが同期し、アニメ調演出が踊る。</h2>
          <p>AI歌詞同期 × アニメFXエンジン × マルチフォーマット出力。音源と歌詞から、YouTube・Shorts・Spotify Canvas向けのリリックビデオを数分で。</p>
        </div>
      </div>
      <div class="auth-panel"><div class="auth-card">
        <div class="logo"><span class="mark">♪</span><span>Lyric<b>Flow</b> AI</span></div>
        <h1>${isLogin ? 'おかえりなさい' : 'アカウント作成'}</h1>
        <p class="sub">${isLogin ? 'ログインして制作を続けましょう' : 'Freeプランで今すぐ始められます'}</p>
        <form id="auth-form">
          ${isLogin ? '' : `<label class="fld"><span>名前</span><input class="input" id="f-name" required placeholder="山田 太郎"></label>`}
          <label class="fld"><span>メールアドレス</span><input class="input" type="email" id="f-email" required placeholder="you@example.com"></label>
          <label class="fld"><span>パスワード${isLogin ? '' : ' (8文字以上)'}</span><input class="input" type="password" id="f-pass" required minlength="8"></label>
          <button class="btn primary" style="width:100%;justify-content:center;padding:11px" type="submit">${isLogin ? 'ログイン' : '登録して始める'}</button>
        </form>
        <div class="auth-switch">${isLogin ? 'アカウントがない場合 <a href="#/register">新規登録</a>' : '既にアカウントがある場合 <a href="#/login">ログイン</a>'}</div>
        <div class="demo-hint" id="demo-fill">デモアカウントで試す → <code>demo@lyricflow.app</code> / <code>demo1234</code></div>
      </div></div>
    </div>`;
    // 左側のライブFXプレビュー
    const c = document.getElementById('auth-canvas');
    const eng = new FXEngine(c);
    eng.resize(960, 1080);
    eng.setTimeline({
      duration: 999, colors: { bg1: '#050a18', bg2: '#1a0b38', accent: '#00d4ff', accent2: '#7b2ff7', text: '#fff' },
      particles: 'stars', fx: { bloom: 0.8, glitch: 0.1, chroma: 0.4, wave: 0 }, sceneDefault: 'city',
      lyricStyle: { font: "'Noto Sans JP', sans-serif", size: 58, anim: 'glow-pop', glow: 0.85, color: '#fff' },
      envelope: Array.from({ length: 600 }, (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i / 14))), hop: 0.1,
      scenes: [{ label: 'Chorus', start: 0, end: 999, energy: .8 }],
      tracks: {
        lyrics: Array.from({ length: 200 }, (_, k) => {
          const phrases = [['星が', '降り注ぐ', '夜に'], ['君の', '声が', '心を', '照らす'], ['夢の', '先で', '僕らは', '出会う']];
          const ph = phrases[k % 3];
          return ph.map((w, i) => ({ id: 'a' + k + i, word: w, line: k, start: k * 4 + i * 0.7 + 0.4, end: k * 4 + i * 0.7 + 1.05 }));
        }).flat(),
        background: [{ id: 'b', start: 0, end: 999, scene: 'city' }], effects: [], overlay: [],
      },
    });
    let t0 = performance.now();
    const loop = () => {
      if (!c.isConnected) return;
      eng.render((performance.now() - t0) / 1000);
      requestAnimationFrame(loop);
    };
    loop();
    document.getElementById('demo-fill').onclick = () => {
      document.getElementById('f-email').value = 'demo@lyricflow.app';
      document.getElementById('f-pass').value = 'demo1234';
    };
    document.getElementById('auth-form').onsubmit = async e => {
      e.preventDefault();
      try {
        const body = { email: document.getElementById('f-email').value, password: document.getElementById('f-pass').value };
        if (!isLogin) body.name = document.getElementById('f-name').value;
        const d = await API.post('/auth/' + (isLogin ? 'login' : 'register'), body);
        API.setTokens(d.access_token, d.refresh_token);
        const me = await API.get('/me');
        this.user = me.user; this.workspaces = me.workspaces; this.ws = me.workspaces[0]; this.me = me;
        location.hash = '#/dashboard';
      } catch (err) { toast(err.message, 'err'); }
    };
  },

  /* ================= shell ================= */
  renderShell(app, active) {
    const w = this.ws;
    const pct = w.storage_limit ? Math.min(100, w.storage_used / w.storage_limit * 100) : 0;
    const NAV = [
      ['dashboard', 'ダッシュボード', 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10'],
      ['projects', 'プロジェクト', 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
      ['templates', 'テンプレート', 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z'],
      ['assets', 'アセット', 'M4 5h16v14H4zM4 15l4-4 3 3 5-5 4 4'],
      ['team', 'チーム / API', 'M16 11a4 4 0 10-8 0M2 20c0-3 4-5 10-5s10 2 10 5'],
    ];
    app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="logo"><span class="mark">♪</span><span>Lyric<b>Flow</b></span></div>
        ${NAV.map(([id, label, d]) => `
          <button class="nav-item ${active === id ? 'active' : ''}" data-nav="${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>
            <span>${label}</span>
          </button>`).join('')}
        <div class="spacer"></div>
        <div class="storage-box">
          <div class="row1"><span>ストレージ</span><b>${fmtBytes(w.storage_used)} / ${fmtBytes(w.storage_limit)}</b></div>
          <div class="meter"><i style="width:${pct}%"></i></div>
          <div class="plan-chip">${w.plan_type.toUpperCase()} PLAN</div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <span class="ws-pill">🎬 <b>${esc(w.name)}</b> · ${esc(w.role)}</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:12.5px;color:var(--muted)">${esc(this.user.name)}</span>
            <span class="avatar">${esc(this.user.name[0] || '?')}</span>
            <button class="btn ghost sm" id="logout-btn">ログアウト</button>
          </div>
        </div>
        <div class="content" id="page"></div>
      </div>
    </div>`;
    app.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.nav; });
    document.getElementById('logout-btn').onclick = async () => {
      await API.post('/auth/logout', {}).catch(() => {});
      API.clear(); this.user = null; location.hash = '#/login';
    };
  },

  /* ================= dashboard ================= */
  async pageDashboard(el) {
    const [pj, tpl] = await Promise.all([API.get(`/workspaces/${this.ws.id}/projects`), API.get('/templates')]);
    const projects = pj.projects;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>ダッシュボード</h1><p>おかえりなさい、${esc(this.user.name)} さん。今日も作りましょう。</p></div>
        <button class="btn primary" id="new-p">+ 新規プロジェクト</button>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="k-label">総プロジェクト数</div><div class="k-val">${projects.length}</div><div class="k-sub up">↑ アクティブ制作中</div></div>
        <div class="kpi"><div class="k-label">動画エクスポート数</div><div class="k-val">${pj.exports}</div><div class="k-sub">MP4 / WebM 完了ジョブ</div></div>
        <div class="kpi"><div class="k-label">ストレージ使用量</div><div class="k-val" style="font-size:22px">${fmtBytes(this.ws.storage_used)}</div>
          <div class="meter" style="margin-top:8px"><i style="width:${Math.min(100, this.ws.storage_used / this.ws.storage_limit * 100)}%"></i></div></div>
      </div>
      <div class="sec-head"><h2>最近のプロジェクト</h2><a href="#/projects">すべて表示 →</a></div>
      <div class="proj-grid" id="recent-grid"></div>
      <div class="sec-head"><h2>フィーチャードテンプレート</h2><a href="#/templates">マーケットプレイス →</a></div>
      <div class="tpl-row" id="tpl-row"></div>`;
    el.querySelector('#new-p').onclick = () => this.newProjectModal();
    this.renderProjectCards(el.querySelector('#recent-grid'), projects.slice(0, 7), true);
    this.renderTemplateCards(el.querySelector('#tpl-row'), tpl.templates.slice(0, 4));
  },

  renderProjectCards(grid, projects, withNew) {
    grid.innerHTML = (withNew ? `<div class="proj-card new" id="card-new"><span class="plus">+</span><span>新規プロジェクト</span></div>` : '') +
      projects.map(p => `
      <div class="proj-card" data-open="${p.id}">
        <div class="thumb"><canvas data-pthumb="${p.tpl || 'tpl-neon-city'}" data-title="${esc(p.title)}"></canvas>
          ${p.dur ? `<span class="dur">${fmtTime(p.dur)}</span>` : ''}</div>
        <div class="pc-menu">
          <button data-dup="${p.id}" title="複製">⧉</button>
          <button data-del="${p.id}" title="削除">🗑</button>
        </div>
        <div class="pc-body">
          <div class="pc-title">${esc(p.title)}</div>
          <div class="pc-meta">
            <span class="badge ${p.status}">${p.status}</span>
            <span class="badge aspect">${p.aspect_ratio}</span>
            <span style="margin-left:auto">${fmtAgo(p.updated_at)}</span>
          </div>
        </div>
      </div>`).join('');
    if (withNew) grid.querySelector('#card-new').onclick = () => this.newProjectModal();
    grid.querySelectorAll('canvas[data-pthumb]').forEach(async c => {
      const tpl = (await this._templates()).find(t => t.id === c.dataset.pthumb) || (await this._templates())[0];
      if (tpl) renderTemplateThumb(c, tpl.config, c.dataset.title);
    });
    grid.querySelectorAll('[data-open]').forEach(card => card.onclick = e => {
      if (e.target.closest('.pc-menu')) return;
      location.hash = '#/editor/' + card.dataset.open;
    });
    grid.querySelectorAll('[data-dup]').forEach(b => b.onclick = async () => {
      await API.post(`/projects/${b.dataset.dup}/duplicate`);
      toast('プロジェクトを複製しました', 'ok'); this.route();
    });
    grid.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('このプロジェクトを削除しますか?')) return;
      await API.del('/projects/' + b.dataset.del);
      toast('削除しました', 'ok'); this.route();
    });
  },

  async _templates() {
    if (!this._tplCache) this._tplCache = (await API.get('/templates')).templates;
    return this._tplCache;
  },

  renderTemplateCards(row, templates) {
    row.innerHTML = templates.map(t => `
      <div class="tpl-card" data-use="${t.id}">
        <div class="thumb"><canvas data-tthumb="${t.id}"></canvas></div>
        <div class="tc-body">
          <div class="tc-title">${esc(t.title)} <span class="price ${t.price_usd ? '' : 'free'}">${t.price_usd ? '$' + t.price_usd : 'Free'}</span></div>
          <div class="tc-meta"><span>by ${esc(t.author)}</span><span>★ ${t.rating}</span><span>${t.sales} sales</span></div>
        </div>
      </div>`).join('');
    row.querySelectorAll('canvas[data-tthumb]').forEach(c => {
      const t = templates.find(x => x.id === c.dataset.tthumb);
      renderTemplateThumb(c, t.config);
    });
    row.querySelectorAll('[data-use]').forEach(card => card.onclick = () => this.newProjectModal(card.dataset.use));
  },

  /* ================= projects ================= */
  async pageProjects(el) {
    const pj = await API.get(`/workspaces/${this.ws.id}/projects`);
    el.innerHTML = `
      <div class="page-head">
        <div><h1>プロジェクト</h1><p>${pj.projects.length} 件 · ワークスペース「${esc(this.ws.name)}」</p></div>
        <button class="btn primary" id="new-p">+ 新規プロジェクト</button>
      </div>
      <div class="proj-grid" id="grid"></div>`;
    el.querySelector('#new-p').onclick = () => this.newProjectModal();
    this.renderProjectCards(el.querySelector('#grid'), pj.projects, true);
  },

  async newProjectModal(preTpl) {
    const templates = await this._templates();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    let selTpl = preTpl || templates[0].id;
    let selAspect = '16:9';
    bg.innerHTML = `
      <div class="modal wide">
        <div class="m-head"><h2>新規プロジェクト / Project Setup</h2><button class="x-btn">×</button></div>
        <div class="m-body">
          <label class="fld"><span>プロジェクト名</span><input class="input" id="np-title" placeholder="例: 星空のメロディー MV" value=""></label>
          <label class="fld"><span>MVテンプレート (AIがおすすめを提示)</span></label>
          <div class="tpl-pick" id="np-tpls">${templates.map(t => `<div class="tp ${t.id === selTpl ? 'sel' : ''}" data-t="${t.id}"><canvas></canvas><span>${esc(t.title)}</span></div>`).join('')}</div>
          <label class="fld"><span>出力アスペクト比</span></label>
          <div class="aspect-pick" id="np-aspect">
            ${[['16:9', 'YouTube', 40, 22], ['9:16', 'Shorts/TikTok', 16, 28], ['1:1', 'Instagram', 24, 24], ['4:5', 'IG Portrait', 21, 26]].map(([a, use, w, h]) =>
              `<div class="ap ${a === selAspect ? 'sel' : ''}" data-a="${a}"><div class="box" style="width:${w}px;height:${h}px"></div>${a}<br><small style="color:var(--faint)">${use}</small></div>`).join('')}
          </div>
          <label class="fld" style="margin-top:14px"><span>歌詞 (任意 — 後からでも入力可)</span>
            <textarea class="input" id="np-lyrics" rows="4" placeholder="1行に1フレーズで入力してください"></textarea></label>
        </div>
        <div class="m-foot">
          <button class="btn" id="np-cancel">キャンセル</button>
          <button class="btn primary" id="np-create">プロジェクト作成 →</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelectorAll('#np-tpls .tp').forEach(tp => {
      const t = templates.find(x => x.id === tp.dataset.t);
      renderTemplateThumb(tp.querySelector('canvas'), t.config, 'Aa');
      tp.onclick = () => { bg.querySelectorAll('.tp').forEach(x => x.classList.toggle('sel', x === tp)); selTpl = tp.dataset.t; };
    });
    bg.querySelectorAll('#np-aspect .ap').forEach(ap => ap.onclick = () => {
      bg.querySelectorAll('.ap').forEach(x => x.classList.toggle('sel', x === ap)); selAspect = ap.dataset.a;
    });
    const close = () => bg.remove();
    bg.querySelector('.x-btn').onclick = close;
    bg.querySelector('#np-cancel').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
    bg.querySelector('#np-create').onclick = async () => {
      try {
        const d = await API.post(`/workspaces/${this.ws.id}/projects`, {
          title: bg.querySelector('#np-title').value || 'Untitled Project',
          template: selTpl, aspect_ratio: selAspect,
          lyrics_text: bg.querySelector('#np-lyrics').value,
        });
        close();
        location.hash = '#/editor/' + d.id;
      } catch (e) { toast(e.message, 'err'); }
    };
  },

  /* ================= templates marketplace ================= */
  async pageTemplates(el) {
    const templates = await this._templates();
    el.innerHTML = `
      <div class="page-head">
        <div><h1>テンプレートマーケットプレイス</h1><p>クリエイター制作のMVテンプレート。売上の70%が制作者に還元されます (Stripe Connect)。</p></div>
      </div>
      <div class="tpl-row" id="mkt"></div>`;
    this.renderTemplateCards(el.querySelector('#mkt'), templates);
  },

  /* ================= assets ================= */
  async pageAssets(el) {
    const { assets } = await API.get(`/workspaces/${this.ws.id}/assets`);
    el.innerHTML = `
      <div class="page-head">
        <div><h1>アセットライブラリ</h1><p>音源 (MP3/WAV)・画像・動画・フォントのプライベートライブラリ</p></div>
        <div>
          <input type="file" id="as-file" style="display:none" accept=".mp3,.wav,.png,.jpg,.jpeg,.webp,.svg,.mp4,.webm,.ttf,.otf,.woff2">
          <button class="btn primary" id="as-up">⬆ アップロード</button>
        </div>
      </div>
      <div class="asset-grid">${assets.map(a => `
        <div class="asset-card">
          <div class="a-prev">${a.type === 'image' ? `<img src="${a.url}">` : a.type === 'audio' ? '<span style="font-size:26px">♪</span>' : a.type === 'font' ? '<span style="font-size:22px">Aa</span>' : '<span style="font-size:24px">▶</span>'}</div>
          <button class="btn sm danger a-del" data-del="${a.id}">削除</button>
          <div class="a-body">
            <div class="a-name">${esc(a.filename)}</div>
            <div class="a-meta"><span>${a.type}${a.metadata?.duration ? ' · ' + fmtTime(a.metadata.duration) : ''}</span><span>${fmtBytes(a.size_bytes)}</span></div>
          </div>
        </div>`).join('') || '<div class="empty-note">アセットがありません</div>'}
      </div>`;
    el.querySelector('#as-up').onclick = () => el.querySelector('#as-file').click();
    el.querySelector('#as-file').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('file', f);
      if (/\.(mp3|wav)$/i.test(f.name)) {
        try {
          const url = URL.createObjectURL(f);
          const { env, duration, hop } = await computeEnvelope(url);
          fd.append('metadata', JSON.stringify({ duration: Math.round(duration * 100) / 100, envelope: env, hop }));
          URL.revokeObjectURL(url);
        } catch (err) {}
      }
      toast('アップロード中…');
      await API.upload(`/workspaces/${this.ws.id}/assets`, fd);
      toast('アップロード完了', 'ok');
      this.route();
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('削除しますか?')) return;
      await API.del('/assets/' + b.dataset.del);
      this.route();
    });
  },

  /* ================= team / brand kit / API ================= */
  async pageTeam(el) {
    const [{ members }, { api_keys }] = await Promise.all([
      API.get(`/workspaces/${this.ws.id}/members`),
      API.get(`/workspaces/${this.ws.id}/api-keys`),
    ]);
    const bk = this.ws.brand_kit || { primary: '#00d4ff', secondary: '#7b2ff7', accent: '#ff7edb', font: "'Noto Sans JP', sans-serif", logo_text: 'LF' };
    el.innerHTML = `
      <div class="page-head"><div><h1>チーム設定</h1><p>メンバー管理・ブランドキット・ホワイトラベルAPI</p></div></div>
      <div class="panel">
        <h3>メンバー / Members</h3>
        <p class="p-sub">ロールベースアクセス制御 (Owner / Admin / Editor / Viewer)</p>
        ${members.map(m => `
          <div class="member-row">
            <span class="avatar">${esc(m.name[0] || '?')}</span>
            <div class="m-info"><div class="m-name">${esc(m.name)}</div><div class="m-email">${esc(m.email)}</div></div>
            <span class="badge role">${m.role}</span>
          </div>`).join('')}
        <div style="display:flex;gap:9px;margin-top:14px">
          <input class="input" id="inv-email" placeholder="招待するメールアドレス" style="flex:1">
          <select class="input" id="inv-role" style="width:110px"><option>Editor</option><option>Admin</option><option>Viewer</option></select>
          <button class="btn" id="inv-btn">招待</button>
        </div>
      </div>
      <div class="panel">
        <h3>ブランドキット / Brand Kit</h3>
        <p class="p-sub">全プロジェクトにワンクリック適用できるブランド設定 (Teamプラン機能)</p>
        <div style="display:flex;gap:22px;flex-wrap:wrap">
          <label class="fld"><span>プライマリ</span><div class="color-swatch"><input type="color" id="bk-p" value="${bk.primary}"><code>${bk.primary}</code></div></label>
          <label class="fld"><span>セカンダリ</span><div class="color-swatch"><input type="color" id="bk-s" value="${bk.secondary}"><code>${bk.secondary}</code></div></label>
          <label class="fld"><span>アクセント</span><div class="color-swatch"><input type="color" id="bk-a" value="${bk.accent || '#ff7edb'}"><code>${bk.accent || '#ff7edb'}</code></div></label>
          <label class="fld" style="min-width:180px"><span>フォント</span>
            <select class="input" id="bk-f">
              <option value="'Noto Sans JP', sans-serif" ${bk.font?.includes('Sans') ? 'selected' : ''}>Noto Sans JP</option>
              <option value="'Noto Serif JP', serif" ${bk.font?.includes('Serif') ? 'selected' : ''}>Noto Serif JP</option>
            </select></label>
          <label class="fld"><span>ロゴテキスト</span><input class="input" id="bk-l" value="${esc(bk.logo_text || 'LF')}" style="width:90px"></label>
        </div>
        <div class="brand-preview" id="bk-preview"></div>
        <div style="margin-top:14px"><button class="btn primary" id="bk-save">変更を保存</button></div>
      </div>
      <div class="panel">
        <h3>ホワイトラベルAPI / White Label API</h3>
        <p class="p-sub">REST APIで動画生成機能を外部サービスへ組み込み。APIキーはワークスペース単位で発行されます。</p>
        ${api_keys.map(k => `
          <div class="apikey-row">
            <b>${esc(k.name)}</b><code>${esc(k.key)}</code>
            <span style="color:var(--faint);margin-left:auto">${k.last_used_at ? '最終使用 ' + fmtAgo(k.last_used_at) : '未使用'}</span>
            <button class="btn sm" data-copy="${esc(k.key)}">コピー</button>
          </div>`).join('') || '<p class="p-sub">キーがありません</p>'}
        <button class="btn" id="key-new" style="margin-top:10px">+ APIキーを発行</button>
        <p class="p-sub" style="margin:16px 0 8px">使用例:</p>
        <pre class="code">curl -X POST http://localhost:4189/api/v1/external/generate-video \\
  -H "X-API-Key: ${esc(api_keys[0]?.key || 'lfk_...')}" \\
  -H "Content-Type: application/json" \\
  -d '{"template_id": "tpl-neon-city", "lyrics_text": "星が降り注ぐ夜に", "duration": 30}'

# → {"job_id": "..."}  ステータス確認: GET /api/v1/external/jobs/{job_id}</pre>
      </div>`;
    const updatePreview = () => {
      const p = el.querySelector('#bk-p').value, s = el.querySelector('#bk-s').value;
      const f = el.querySelector('#bk-f').value, l = el.querySelector('#bk-l').value;
      el.querySelector('#bk-preview').innerHTML = `
        <div style="display:flex;align-items:center;gap:14px">
          <span class="avatar" style="border-radius:9px;width:42px;height:42px;background:linear-gradient(135deg,${p},${s});font-size:16px">${esc(l)}</span>
          <div>
            <div style="font-family:${f};font-weight:900;font-size:20px;background:linear-gradient(90deg,${p},${s});-webkit-background-clip:text;background-clip:text;color:transparent">Create. Edit. Share. / 創る。編集する。共有する。</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:3px">このブランド設定が全動画のデフォルトカラー・フォントに適用されます</div>
          </div>
        </div>`;
    };
    updatePreview();
    ['#bk-p', '#bk-s', '#bk-a', '#bk-f', '#bk-l'].forEach(sel => el.querySelector(sel).oninput = updatePreview);
    el.querySelector('#bk-save').onclick = async () => {
      const kit = {
        primary: el.querySelector('#bk-p').value, secondary: el.querySelector('#bk-s').value,
        accent: el.querySelector('#bk-a').value, font: el.querySelector('#bk-f').value,
        logo_text: el.querySelector('#bk-l').value,
      };
      await API.put(`/workspaces/${this.ws.id}/brand-kit`, kit);
      this.ws.brand_kit = kit;
      toast('ブランドキットを保存しました', 'ok');
    };
    el.querySelector('#inv-btn').onclick = async () => {
      const email = el.querySelector('#inv-email').value.trim();
      if (!email) return;
      try {
        await API.post(`/workspaces/${this.ws.id}/members`, { email, role: el.querySelector('#inv-role').value });
        toast(`${email} を招待しました`, 'ok');
        this.route();
      } catch (e) { toast(e.message, 'err'); }
    };
    el.querySelector('#key-new').onclick = async () => {
      const name = prompt('APIキーの名前', 'Production Key');
      if (!name) return;
      await API.post(`/workspaces/${this.ws.id}/api-keys`, { name });
      toast('APIキーを発行しました', 'ok');
      this.route();
    };
    el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copy);
      toast('コピーしました', 'ok');
    });
  },
};

App.boot();
