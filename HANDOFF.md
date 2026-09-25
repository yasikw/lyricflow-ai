# HANDOFF — LyricFlow AI

最終更新: 2026-09-24 (Claude Code)

## 演出エンジン(カット演出)の契約 — 破壊的変更禁止

- 実装: `static/js/compose/core.js`(グローバル `window.LFC`) + パック `static/js/compose/p_*.js`、読込一覧は `loader.js`。
  エディタ・書き出し・開発シートが同じ一覧を使う。パック作成の契約は `docs/COMPOSE_PACKS.md`、調査は `docs/JIZURA_RESEARCH.md`。
- タイムライン: `timeline.compose = {enabled, seed, style, mood, motion, decor, density, ghost, camera, trans, useWa, fonts:{display,serif,body}, cuts:{"<line>:<part>": 案}, planVersion}`
  案 = `{layout, params, enter, hold, exit, decor:[{key,P}], treat, treatP, cam, camP, trans, transP, seed, locked, reroll}`。
  `enabled=false`(既定) なら従来の歌詞描画(`FXEngine._drawLyrics`)。既存プロジェクトの見た目は変わらない。
- 描画入口: `FXEngine._drawLyricLayer` → `LFC.render(engine, ctx, t, W, H, energy, boost)`。失敗時は従来描画にフォールバック。
- カットのキャッシュ `timeline._lfcCuts` は**非列挙**(保存JSONに入らない)。案を変えたら `compose.planVersion` を増やす。
- レイアウトの key は接頭辞で担当パックを分ける(`a_` `b_` `c_` `d_`)。group 内で key は一意。
- 歌詞記法: `*強調*` / 行末の半角 `!`=衝撃 / `本文|注釈` / 語末 `/`=カット分割(表示時に記号は消える。従来描画には記号が残る)。
- 書き出し: `engine.keyMode = 'green'|'black'` で合成用(背景・後処理なし、透明に描いて背面に地色)。AE用 `.jsx` は `Editor.exportAE()`(中央配置の簡略版)。
- モーショングラフィックス: パック `p_motion_graphics.js`(m_particles/m_morph/m_tunnel/m_cube/m_graph、particleIn/Out、mgHud 等、
  スタイル reelPaper/reelNight)。`compose.beatLock=true`(要 `timeline.bpm`)で全カットを拍に固定(登場=1拍・退場=半拍)。
  「🎞 モーションリールを作る」= `Editor.buildMotionReel()`(言葉を拍に配置+演出の並び+`_synthReelBGM()`で同じ拍のBGMを合成→WAVを資産アップロード)。
- 書き出しのモーションブラー: `state.mblur`(5/10)。1コマを180°シャッター内で複数回描いて累積平均(時間は約N倍)。
- 検証: `dev/compose/sheet.sh <group> <ids|all> <out> [sheet|smoke|plan|bbox|motioncheck] [style]`(chrome-headless-shell で PNG + report.json)、
  `dev/compose/editor_test.html`(本物のエディタを API モックで起動。`python3 -m http.server 4299` をリポ直下で)。

## VRM Atelier連携(3Dダンスレイヤー)の契約 — 破壊的変更禁止

- `.env`: `LF_ATELIER_URL`(既定 http://127.0.0.1:4188) / `LF_ATELIER_KEY`(vak_...、VRM AtelierのEnterprise APIキー)
- 認証付きプロキシ: `GET /api/v1/atelier/status|avatars|motions`
- **未認証**ファイルプロキシ: `GET /api/v1/atelier/file?path=/files/(avatars|motions|thumbs)/<name>`
  (GLTFLoader等が認証ヘッダ無しで取得するため。パス許可制・キーはサーバー側付与)
- タイムライン: `timeline.dance = {enabled, vrm_url, vmd_url, vrm_name, vmd_name, offset, scale, x, y, aspect, camera, loop, speed}`
  (`aspect` はステージの横幅比。未設定は1.0。以前は0.72固定で腕を広げると左右が切れていた)
- アセットkind追加: `vrm→model3d` / `vmd→motion3d`(マジックバイト検証付き)
- `static/stage/` は **vrm-avatar-platform がマスター**。直接編集せず、
  `~/manus/vrm-avatar-platform/sync_stage.sh` で同期する(SYNC_VERSION参照)。
  stage3d.js のみ本リポ管理(LyricFlow固有ラッパー)。
- FXEngine: `_drawDance()`(subjectの直後に描画) / `prepareDance()`(書き出し前プリロード)。
  レイヤー順: 背景 → subject → **dance** → 歌詞。

## 連携が切れたときの復帰(重要)

- `_loadAtelier()` は**成功時のみキャッシュ**する。失敗をキャッシュすると、後から
  VRM Atelierを起動しても一覧が空のままになり「アバターを選べない」が固定化する。
- `Stage3D.loadVRM/loadVMD` は**失敗時に vrmUrl/vmdUrl を巻き戻す**。保持したままだと
  `st.vrmUrl !== d.vrm_url` が成立せず二度と再読込されない(2.5秒バックオフで再試行)。
- 3Dダンスパネルに接続状態と「↻ 再読込」を表示する。

## in-flight

- なし(3Dダンスレイヤー Phase1 完了・E2E確認済み / 演出エンジン 454種(モーショングラフィックス含む) 完了・スモーク/連続性テスト済み)

## 次にやること

- Phase 2: セクション連動カメラ/表情、3Dポストエフェクト(ブルーム/DoFを3D側にも)
- Phase 3: ダンスMVテンプレート、書き出しプリセット
- 演出エンジン: ブラウザ内 WebCodecs 書き出し、AE への構図の忠実再現、中国語/韓国語の役割フォント自動切替、曲頭タイトルカード・間奏カット
- 太い縁取り系の文字加工(sticker/doubleLine/extrude3d/cutout)は CPU 描画で 1080p 4〜7ms。書き出し時間が気になれば軽量化
