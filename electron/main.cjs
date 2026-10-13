// LyricFlow AI — Electron desktop shell
// 既存のPythonサーバー(server.py)を子プロセスで起動し、専用ウィンドウで表示する。
// 埋め込みブラウザと違い可視ウィンドウなので rAF/コンポジタが絞られず、再生が滑らかに同期する。
// backgroundThrottling:false でウィンドウが背面/占有されても描画・タイマーを止めない(書き出し中も安全)。
console.log('[lf] electron', process.versions.electron)
const { app, BrowserWindow, Menu, shell, session, dialog, Notification } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const fs = require('fs')
const ROOT = path.join(__dirname, '..')
// インストール版(/Applications/LyricFlow AI.app): データは ~/Library/Application Support/LyricFlow AI/data に置き、
// 開発用サーバー(4189/4289)と取り違えないよう専用ポートを使う。開発版(npm run app)は従来どおりリポの data/ と 4189
// app.isPackaged は実行ファイル名が Electron だと false になるので、実行ファイルの場所で判定する
// (インストール版のコードは ~/Library/Application Support/LyricFlow AI/app にあり、.app からリンクしている)
const PACKAGED = app.isPackaged || (/\.app[\\/]Contents[\\/]MacOS[\\/]/.test(process.execPath) && !/node_modules[\\/]electron[\\/]dist/.test(process.execPath))
if (PACKAGED) app.setPath('userData', path.join(app.getPath('appData'), 'LyricFlow AI'))
const PORT = process.env.LF_PORT || (PACKAGED ? 4389 : 4189)
const DATA_DIR = process.env.LF_DATA_DIR || (PACKAGED ? path.join(app.getPath('userData'), 'data') : '')
const APP_URL = `http://localhost:${PORT}/`
let serverProc = null
let win = null

function pythonCandidates() {
  return [
    process.env.LF_PYTHON,
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    'python3',
  ].filter(Boolean)
}

function ping() {
  return new Promise((res) => {
    const req = http.get(APP_URL, (r) => { r.resume(); res(r.statusCode === 200) })
    req.on('error', () => res(false))
    req.setTimeout(1000, () => { req.destroy(); res(false) })
  })
}

async function ensureServer() {
  if (await ping()) { console.log('[lf] server already running on', PORT); return }
  const py = pythonCandidates().find((p) => !p.startsWith('/') || fs.existsSync(p)) || 'python3'
  console.log('[lf] launching server:', py, 'server.py (cwd', ROOT + ')')
  const env = { ...process.env, PORT: String(PORT), PYTHONDONTWRITEBYTECODE: '1' }
  // Finder から起動すると PATH が最小限なので、ffmpeg / codex / whisper の場所を足す
  env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', env.PATH || '/usr/bin:/bin'].join(':')
  if (DATA_DIR) { fs.mkdirSync(DATA_DIR, { recursive: true }); env.LF_DATA_DIR = DATA_DIR }
  serverProc = spawn(py, ['server.py'], { cwd: ROOT, env, stdio: 'inherit' })
  serverProc.on('exit', (code) => console.log('[lf] server exited', code))
  serverProc.on('error', (e) => console.error('[lf] server spawn error', e.message))
  for (let i = 0; i < 80; i++) {            // 最大~40秒待つ(初回シードでデモ曲合成に時間がかかる)
    if (await ping()) { console.log('[lf] server ready'); return }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('server did not become ready')
}

/* ---------------- 書き出しの自動保存 ----------------
   アプリ内のダウンロード(動画・字幕・AE用スクリプト)は保存ダイアログを出さず、書き出し先フォルダへ直接保存する。
   既定は ~/Movies/LyricFlow。メニュー「ファイル → 書き出し先を変更…」で変えられる(userData/settings.json に保存) */
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json')
function loadSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')) } catch (e) { return {} } }
function saveSettings(o) { try { fs.mkdirSync(path.dirname(SETTINGS()), { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify(o, null, 2)) } catch (e) {} }
function exportDir() { return loadSettings().exportDir || path.join(app.getPath('videos'), 'LyricFlow') }
function uniquePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext)
  let p = path.join(dir, name), i = 2
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`)
  return p
}
function setupDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const dir = exportDir()
    try { fs.mkdirSync(dir, { recursive: true }) } catch (err) {}
    const name = (item.getFilename() || 'lyricflow').replace(/[\\/:*?"<>|]/g, '_')
    const dest = uniquePath(dir, name)
    item.setSavePath(dest)
    item.once('done', (ev, state) => {
      if (!win || win.isDestroyed()) return
      if (state === 'completed') {
        const msg = `${path.basename(dest)} を「${path.basename(dir)}」に保存しました`
        win.webContents.executeJavaScript(`window.toast && toast(${JSON.stringify(msg)}, 'ok')`).catch(() => {})
        if (Notification.isSupported()) {
          const n = new Notification({ title: '書き出しを保存しました', body: `${path.basename(dest)}（クリックで Finder に表示）`, silent: true })
          n.on('click', () => shell.showItemInFolder(dest))
          n.show()
        }
      } else {
        win.webContents.executeJavaScript(`window.toast && toast(${JSON.stringify('保存できませんでした: ' + state)}, 'err')`).catch(() => {})
      }
    })
  })
}
// サーバーが使うデータの場所(インストール版は LF_DATA_DIR、開発版はリポの .env の LF_DATA_DIR、無ければ data/)
function dataDir() {
  if (DATA_DIR) return DATA_DIR
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^LF_DATA_DIR=(.*)$/m)
    if (m) return m[1].trim().replace(/^~/, app.getPath('home'))
  } catch (e) {}
  return path.join(ROOT, 'data')
}
function buildMenu() {
  const fileMenu = {
    label: 'ファイル',
    submenu: [
      { label: '書き出し先フォルダを開く', accelerator: 'CmdOrCtrl+Shift+O', click: () => { const d = exportDir(); fs.mkdirSync(d, { recursive: true }); shell.openPath(d) } },
      {
        label: '書き出し先を変更…',
        click: async () => {
          const r = await dialog.showOpenDialog(win, { title: '書き出し先フォルダ', defaultPath: exportDir(), properties: ['openDirectory', 'createDirectory'] })
          if (!r.canceled && r.filePaths[0]) { saveSettings({ ...loadSettings(), exportDir: r.filePaths[0] }); buildMenu() }
        },
      },
      { label: `いまの書き出し先: ${exportDir().replace(app.getPath('home'), '~')}`, enabled: false },
      { type: 'separator' },
      { label: 'データのフォルダを開く', click: () => shell.openPath(dataDir()) },
      { type: 'separator' },
      { role: 'close', label: 'ウィンドウを閉じる' },
    ],
  }
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    fileMenu, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    title: 'LyricFlow AI',
    backgroundColor: '#0d1117',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,          // 占有/背面でも rAF・タイマーを絞らない = 再生同期の要
    },
  })
  win.loadURL(APP_URL)
  // 外部リンク(YouTube等)は既定ブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
}

app.whenReady().then(async () => {
  setupDownloads()
  buildMenu()
  try {
    await ensureServer()
  } catch (e) {
    console.error('[lf]', e.message)
  }
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

function killServer() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill('SIGTERM') } catch (e) {}
  }
}

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', killServer)
process.on('exit', killServer)
