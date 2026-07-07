/* LyricFlow AI — APIクライアント (JWT自動リフレッシュ付き) */
const API = {
  get token() { return localStorage.getItem('lf_access'); },
  get refreshToken() { return localStorage.getItem('lf_refresh'); },
  setTokens(a, r) {
    if (a) localStorage.setItem('lf_access', a);
    if (r) localStorage.setItem('lf_refresh', r);
  },
  clear() { localStorage.removeItem('lf_access'); localStorage.removeItem('lf_refresh'); },

  async req(method, path, body, isForm) {
    const opts = { method, headers: {} };
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    if (body !== undefined) {
      if (isForm) { opts.body = body; }
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    let res = await fetch('/api/v1' + path, opts);
    if (res.status === 401 && this.refreshToken && !path.startsWith('/auth/')) {
      const rr = await fetch('/api/v1/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      if (rr.ok) {
        const d = await rr.json();
        this.setTokens(d.access_token, null);
        opts.headers['Authorization'] = 'Bearer ' + d.access_token;
        res = await fetch('/api/v1' + path, opts);
      } else { this.clear(); location.hash = '#/login'; }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error?.message || res.statusText), { code: data.error?.code, status: res.status });
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
  put(p, b) { return this.req('PUT', p, b); },
  del(p) { return this.req('DELETE', p); },
  upload(p, formData) { return this.req('POST', p, formData, true); },

  /* 非同期AIジョブをポーリングして完了を待つ */
  async waitJob(jobId, onProgress) {
    for (;;) {
      const j = await this.get('/ai/jobs/' + jobId);
      if (onProgress) onProgress(j);
      if (j.status === 'completed') return j.result;
      if (j.status === 'failed') throw new Error(j.error_message || 'ジョブが失敗しました');
      await new Promise(r => setTimeout(r, 500));
    }
  },
};

/* ---- 共通ユーティリティ ---- */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 3400);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
}
function fmtTime(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
function fmtAgo(t) {
  const d = (Date.now() / 1000 - t);
  if (d < 60) return 'たった今';
  if (d < 3600) return Math.floor(d / 60) + '分前';
  if (d < 86400) return Math.floor(d / 3600) + '時間前';
  return Math.floor(d / 86400) + '日前';
}

/* 音声ファイル → RMSエンベロープ (hop=0.1s)。AI同期・シーン解析・波形描画に使用 */
async function computeEnvelope(url, hop = 0.1) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await (await fetch(url)).arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  const ch = audio.getChannelData(0);
  const step = Math.floor(audio.sampleRate * hop);
  const env = [];
  for (let s = 0; s < ch.length; s += step) {
    let acc = 0, cnt = 0;
    const e = Math.min(ch.length, s + step);
    for (let i = s; i < e; i += 16) { acc += ch[i] * ch[i]; cnt++; }
    env.push(Math.round(Math.sqrt(acc / Math.max(1, cnt)) * 10000) / 10000);
  }
  ctx.close();
  return { env, duration: audio.duration, hop };
}
