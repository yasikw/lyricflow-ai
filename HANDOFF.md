# HANDOFF — LyricFlow AI

最終更新: 2026-10-15 (Claude Code)

## インストール版(/Applications/LyricFlow AI.app)
- 作成・更新: `./scripts/install_app.sh`(`--rebuild` で .app も作り直し)。コードは `~/Library/Application Support/LyricFlow AI/app` に置き、
  .app の `Contents/Resources/app` はそこへのリンク。**更新はコードだけ入れ替えるので .app の署名が変わらない**
  (Little Snitch が入っているので、署名が変わると通信許可を聞き直され、Google Fonts 待ちで画面が出なくなった)。
- データ: `~/Library/Application Support/LyricFlow AI/data`(`LF_DATA_DIR`)。**リポの .env にも同じ LF_DATA_DIR を書いてあり、
  Web版(4189)・開発版も同じデータを使う**(SQLite は WAL+timeout15 なので2プロセス同時でも可)。リポの data/ は 9/30 時点の旧データ(未使用・控え)。
- ポート: インストール版 4389 / 開発版 4189。インストール版の判定は実行ファイルの場所(実行ファイル名が Electron のため app.isPackaged は使えない)。
- 書き出しの自動保存(デスクトップ版のみ): ダウンロードは保存ダイアログを出さず `~/Movies/LyricFlow` へ(メニュー「ファイル → 書き出し先を変更…」、
  設定は userData/settings.json)。動画の書き出し完了時は自動で保存し通知(クリックで Finder)。
- Google Fonts は `media=print onload` で非ブロッキング(通信が止められていても画面は出る)。
- VRM Atelier の素材は `DATA/atelier_cache` に控え、Atelier 停止中はそこから返す。`scripts/seed_atelier_cache.py` で Atelier のデータから先に入れられる。
- server.py: `LF_DATA_DIR` 未指定なら従来どおり ROOT/data(後方互換)。Python は Mac の python3(/opt/homebrew)を使う。

## 演出エンジン(カット演出)の契約 — 破壊的変更禁止

- 実装: `static/js/compose/core.js`(グローバル `window.LFC`) + パック `static/js/compose/p_*.js`、読込一覧は `loader.js`。
  エディタ・書き出し・開発シートが同じ一覧を使う。パック作成の契約は `docs/COMPOSE_PACKS.md`、調査は `docs/JIZURA_RESEARCH.md`。
- タイムライン: `timeline.compose = {enabled, seed, style, mood, motion, decor, density, ghost, camera, trans, useWa, fonts:{display,serif,body}, cuts:{"<line>:<part>": 案}, planVersion}`
  案 = `{layout, params, enter, hold, exit, decor:[{key,P}], treat, treatP, cam, camP, trans, transP, seed, locked, reroll}`。
  `enabled=false`(既定) なら従来の歌詞描画(`FXEngine._drawLyrics`)。既存プロジェクトの見た目は変わらない。
- 描画入口: `FXEngine._drawLyricLayer` → `LFC.render(engine, ctx, t, W, H, energy, boost)`。失敗時は従来描画にフォールバック。
- カットのキャッシュ `timeline._lfcCuts` は**非列挙**(保存JSONに入らない)。案を変えたら `compose.planVersion` を増やす。
- レイアウトの key は接頭辞で担当パックを分ける(`a_` `b_` `c_` `d_`)。group 内で key は一意。
- **和のモチーフは使わない方針**(2026-09-26 ユーザー指示): `wa:true` の演出(暖簾・扇・家紋・青海波・麻の葉・桜吹雪・提灯・障子・市松・円窓・原稿用紙など)と
  moods に 'wa' を含む配色(墨と和紙・紅)は `L.register`/`L.registerStyle` が登録しない。気分「和風」と「和風の演出も使う」も廃止。
  保存済みの案にそれらの key が残っていても既定(center/fade)にフォールバックする。コードは各パックに残してある。
- **Hallmark 組版レイヤー**(2026-09-29): `compose.typo = 'off'|'set'(既定)|'full'`。約物詰め・かな詰め・サイズ別字間/行送り・欧文バランス改行・禁則・斜体見出し禁止。
  'full' は書体 2+1 固定と動きの抑制。品格チェック/自動修正 `static/js/compose/hm_audit.js`(`L.audit`/`L.auditFix`)、UI は演出パネル「✓ 文字の品格チェック」。
  Hallmark タイポ・パック `p_hm_type.js`(h_ 構図10・hm 登場4/退場3/加工2・配色6 hmSpecimen/hmNewsprint/hmManifesto/hmTerminal/hmRiso/hmGrid)。
  加工の `needsEmph:true` と style の `bias.treat` を計画が読むようにした。'full' は歌詞に数字が無いときデータ系構図(n_stats 等)を下げる(偽の数値を作らない)。
  既存の見た目を完全に戻すなら typo='off'。詳細は docs/COMPOSE_PACKS.md「Hallmark 組版レイヤー」。
- **文字の大きさ(MV)**(2026-09-29 ユーザー方針「歌詞は大きい方がMVらしい」): `compose.textSize = 'large'(既定)|'normal'`。
  large は構図ごとの実測占有率 `static/js/compose/size_table.js`(L.SIZE)で小さな組みの構図を下げ、計画のあと `Editor._mvFix()` が
  小さく組まれたカットだけ構図を選び直す(`L.auditFix(tl,W,H,{only:['mvSmall','small','safe']})`)。**構図を追加・変更したら `dev/compose/size_table.sh` で表を作り直す**。
- 歌詞記法: `*強調*` / 行末の半角 `!`=衝撃 / `本文|注釈` / 語末 `/`=カット分割(表示時に記号は消える。従来描画には記号が残る)。
- 書き出し: `engine.keyMode = 'green'|'black'` で合成用(背景・後処理なし、透明に描いて背面に地色)。AE用 `.jsx` は `Editor.exportAE()`(中央配置の簡略版)。
- モーショングラフィックス: パック `p_motion_graphics.js`(m_particles/m_morph/m_tunnel/m_cube/m_graph、particleIn/Out、mgHud 等、
  スタイル reelPaper/reelNight)。`compose.beatLock=true`(要 `timeline.bpm`)で全カットを拍に固定(登場=1拍・退場=半拍)。
  MG第2弾: `p_mg_layouts_n.js`(n_: データ/タイポ24) / `p_mg_layouts_g.js`(g_: 3D/幾何22) / `p_mg_motion.js`(mg*: 登場14・退場12・つなぎ12・カメラ6) /
  `p_mg_decor_styles.js`(mg*: 装飾18・配色8)。共通ヘルパーは `L.mg`(p_motion_graphics.js)。
  リールの型 `REEL_TEMPLATES`(editor.js): classic/data/three/typo/geo/random — 場面の候補(keys)と曲の作り(ドラム型・和音進行・音色)。
  MG第3弾(ショーリール): `p_sr_layouts_s.js`(s_: 弾む玉/選択枠/色面ポスター/コード壁/ハーフトーン/角柱3D/流れる帯) /
  `p_sr_layouts_r.js`(r_: 粒子銀河/リキャップ格子/交差ワイヤー/エンドカード/クローム立体/3D文字の輪/波形見出し) /
  `p_sr_motion.js`(sr*: 登場4・退場3・つなぎ5・装飾7・カメラ1・配色3 srOpusReel/srLimePoster/srCreamBlue)。
  物語型のリールの型 `showreel`/`poster`: `intro`/`seq`/`recap`/`finale` を `reelStorySpecs()` が言葉の数に合わせて並べる(場面ごとに登場/退場/つなぎ/装飾まで指定)。
  `L.splitLines` は空白なしの欧文1語を折らない(BE/AT 分断の修正)。
  「🎞 モーションリールを作る」= `Editor.buildMotionReel()`(言葉を拍に配置+演出の並び+`_synthReelBGM()`で同じ拍のBGMを合成→WAVを資産アップロード)。
- 書き出しのモーションブラー: `state.mblur`(5/10)。1コマを180°シャッター内で複数回描いて累積平均(時間は約N倍)。
- 検証: `[BPM=128] dev/compose/sheet.sh <group> <ids|all> <out> [sheet|smoke|plan|bbox|motioncheck] [style]`(BPM を付けると拍同期の確認ができる)(chrome-headless-shell で PNG + report.json)、
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

## Live2D キャラ層の契約 — 破壊的変更禁止(2026-10-13)

- タイムライン: `timeline.live2d = {enabled, model_url, model_name, style:'motion'(既定)|'groove'|'bounce'|'idol'|'calm'|'none', intensity, lipsync, lipGate, scale, x, y, mirror, offset}`
- 描画: `static/js/live2d_stage.js`(`window.Live2DStage`)。PixiJS 6.5.10 + pixi-live2d-display 0.4.0(cubism4, MIT, `static/vendor/live2d/` に同梱)+ 公式 Cubism Core。
  FXEngine `_drawLive2D()`(3Dダンスの直後・歌詞の前)/ `prepareLive2D()`(書き出し前)。姿勢は時刻の関数(drive)、物理は 1/30 秒刻み・時刻が飛んだら 1.2 秒前から回し直す。
  モデルのアイドルモーションと自動まばたきは止め、まばたきも時刻から決める(決定論)。パラメータは afterMotionUpdate で設定(髪・服の物理が追従する)。
- 'motion' スタイル: モデル自身の motion3.json を**自前で評価**(pixi の再生は内部時計なので使わない。直線/ベジェ/階段/逆階段、PartOpacity も)。
  歌詞の1行ごとにモーションを切り替え(サビ/盛り上がり=動きの大きいモーション、行の間が空けば一番おだやかなモーション)、長さは小節に合わせて0.75〜1.35倍に伸縮、
  切り替えはクロスフェード。その上に拍のうなずき・沈み・肩、サビで頬・笑顔・眉、間奏で視線。モーションの無いモデルはグルーヴで代用。
- 口パク: 歌詞の語のタイミング × ボーカル帯(250〜3500Hz)の音量包絡(`computeVocalEnvelope`, 1/60 秒, `engine.vocal`)× 語のモーラ(かな→母音で口の形)。
  `lipGate:false` で音量だけ。踊り: `tl.bpm` の拍に合わせた頭・体・腕(`~Param…` は最小〜最大の正規化値)、BPM 無しは音量でゆっくり。
- **Cubism Core とサンプルモデル(Hiyori)は Live2D の許諾があるので git に入れない**: `./scripts/fetch_live2d.sh` が公式CDN/公式サンプルから取得
  (`static/vendor/live2d/live2dcubismcore.min.js`, `static/live2d-samples/`。.gitignore 済)。Core が無ければ Live2D だけ無効(パネルに案内)。
- 自分のモデル: zip をアセットとしてアップロード(type=`live2d`)→ `uploads/live2d/<id>/` に展開(zip slip・300MB/3000ファイル上限、UTF-8 フラグ無しの日本語名は cp437→utf-8/cp932 で読み直し)、URL は model3.json。
- DB: assets.type の CHECK に `model3d/motion3d/live2d` を追加(`migrate_assets_types`、起動時に作り直し)。**旧DBでは VRM のアップロードも CHECK で失敗していた**。

## キャラと文字の重なり・キャラへのグロー(2026-10-13)

- キャラ(前景画像 subject → 3Dダンス dance → Live2D)は `FXEngine.charLayer` に描いてから合成。`engine._charBoxes` に各キャラの枠(プレビューのドラッグ用)。
- 文字の前後: `timeline.textLayer = 'front'(既定)|'behind'`、演出エンジンのカット案 `textLayer` が上書き(`FXEngine.textBehindAt(t)`)。
  おまかせ・🎲で振り直しても人が選んだ `textLayer` は残す(core planAll / editor のダイス)。
  `compose.randomTextLayer`(既定オン・キャラがいる時)なら `L.assignTextLayers(tl)` がカットごとに前/後ろを決めて `textLayerAuto:true` を付ける
  (画面いっぱいの構図・強調カットは後ろ寄り、同じ側が続きすぎない)。おまかせで決めた分は作り直すたびに決め直す。
- キャラへのグロー: `timeline.charGlow`(0..1, 既定0.25)。ブルームの光源からキャラを抜き、キャラの上に乗る光も弱める(半解像度の glowLayer)。
- キャラを避けて置く: `timeline.avoidChars`(既定オン)。文字がキャラの前の時だけ、歌詞を `lyricLayer` に描いて charLayer の不透明部分(64格子・1マス膨張・累積和)と重なれば
  空いている所へずらす/縮める(`FXEngine._placeAvoid`)。カット/行ごとに区間の最初の0.7秒で決めて0.25秒でなめらかに移す(書き出しは頭から順なので毎回同じ)。
  画面幅の82%を超える構図は動かさない。避ける時はおまかせで busy 構図を0.2倍(`L.avoidingChars(tl)`)。
- エディター: プレビューのキャラをドラッグで移動・ホイールで大きさ(文字の枠と重なる時は ⌥)。位置は x:-0.5〜1.5、y(足元):0.05〜2.5、大きさ 0.1〜4。

## プレビューのカクつき対策(2026-10-13) — 書き出しの絵は変えない

- `FXEngine.exporting`(editor.startRender が立てる)で「書き出し=毎コマ正確・同期」「プレビュー=間引き/非同期」を切り替える。
- Live2D: 画面に映る範囲だけ描く+プレビューは 1 枚 90 万画素まで、プレビュー再生中は 30 コマ/秒で更新(間は前の絵)。
  `im.update` は 1 コマ 1 回(描画中の二重更新を `_inRender` で止める)。
- 避け配置のマスクはプレビューでは `createImageBitmap` で非同期(getImageData の GPU 待ちを避ける)。
- `L.fitSize` / h_ 系 `fitBest` はメモ化(TYPO 状態込みのキー、フォント読込で破棄)。
- **大きな字の縁取り(strokeText)が GPU で最重**(194px×26字で 60→38fps)。プレビューでは `L._strokeText` が縁取りだけを
  字ごとの画像にキャッシュ(拡大率 2^(1/4) 刻みで切り上げ・合計 1200 万画素の LRU・1 コマの新規作成 24 個まで・破線/グラデは直描き)。
  `L._sfFast` は `L.makeEnv` が `!eng.exporting` で毎コマ設定。新しく縁取りを描くパックは `ctx.strokeText` でなく `L._strokeText(env|null, ctx, ch, x, y)`
  を使う(textAlign=center / textBaseline=middle の時だけキャッシュ、それ以外は直描きに落ちる)。
- 実測(1280×720・Live2D+避け配置・サビの h_underline+doubleLine): 36→59fps。他区間も 57〜60fps。

## 文字色の自動切替(背景が暗い→白系 / 明るい→暗い文字)(2026-10-14)

- `timeline.autoTextTone`(既定オン、`false` で無効)。エディターの文字スタイル「背景に合わせて白/黒」。
- `FXEngine._measureTone`: 歌詞を描く直前の画面を 48×27 に縮めて読み、区間(カット `c行:部` / 従来表示 `l行`)ごとに
  文字の枠(前コマの bb)の中の下位20%のマスでのコントラストで白系/暗色を決める。区間の頭 0.6 秒だけ 0.12 秒おきに測り直し、その後は固定。
  切替は 0.2 秒で色を移す。書き出しは同期で読む(毎回同じ)、プレビューは createImageBitmap で非同期(済んだら `engine.onAsyncReady` で描き直し)。
- 演出エンジン: `L.makeEnv` が `L.toneBlend(L.schemeFor(..), eng._toneFor(key, t))` で配色を差し替える。今の文字色が向きに合って読めればそのまま
  (ユーザーの色を尊重)、合わなければ `#ffffff` / `#15171c`。縁取り・下地用の `sc.bg` は文字と逆の明るさにそろえ、アクセントは `L.fitContrast(.., 2.4)`。
- 従来表示: `_drawLyrics` が同じ判定で `style.color` / `C` を差し替える。neon/brush/longshadow は暗い文字なら縁を白に・白い芯の発光を省く(`_darkInk`)。
  金/炎/クロームなど固定配色のレタリングは対象外。合成用(グリーン/ブラックバック)書き出しでは切り替えない。

## VPS 公開(2026-10-14) — https://lyricflow.aixr.tokyo.jp

- 手順・構成は `deploy/DEPLOY.md`。Xserver VPS(ekyc-vps)に systemd `lyricflow` + nginx。2026-10-15 に Mac のプロジェクト11件を移行済み(以後は別々の DB。手順は DEPLOY.md 末尾)。
- 公開モードの env(既定はローカル/アプリ版の従来動作のまま=後方互換): `LF_ALLOW_REGISTER`(0で登録停止)、`LF_SEED_DEMO`(0でデモ垢を作らず
  `LF_ADMIN_*` の管理者を作る)、`LF_TRUST_PROXY`(1で X-Real-IP)、`LF_MAX_BODY_MB`。ログイン画面は `GET /api/v1/auth/config` で出し分け。
- 追加 API: `POST /api/v1/me/password`(current_password/new_password, 10文字以上)。アカウント画面に「パスワード変更」。
- 公開前の点検で直したこと: `/media/` は uploads/renders/bglib/atelier_cache だけ配る(以前は DB と secret.key も取れた)・nosniff+CSP sandbox、
  Live2D zip は必要な拡張子だけ展開、音源は同じワークスペースの素材だけ解決、render/ai ジョブは持ち主のワークスペースだけ、finish は1回だけ
  (メモリ上の `_ENCODE_STARTED`、render_jobs.status の CHECK は変えていない)、フレーム数/サイズ上限、本文サイズ上限、
  Admin が Owner のロールを変えられない、API キー一覧は Admin 以上・伏せ字、MFA 有効中の再設定を拒否、`/ai/*` は workspace_id 必須。
- 残り(単独利用なので低リスク・未対応): プラン即時切替 API(デモ用)、Viewer の複製、放置された frames_* の掃除、認証なしの `/atelier/file` プロキシ(VPS では Atelier 無し)。

## スマホ・折りたたみ端末(Galaxy Z Fold7)対応(2026-10-15)

- 幅900px以下、または高さ600px以下のタッチ端末(横向きスマホ)で編集画面を「引き出しパネル」方式にする(app.css 末尾)。
  上部の「☰ 素材」「⚙ 調整」で左右のサイドバーを出し入れ(`.editor.show-left/.show-right`、暗幕 `#ed-scrim` で閉じる)。
  幅640px以上(開いた Fold)は暗幕を透明にしてプレビューを見ながら調整できる。再生ボタン等は 40〜56px、タイムライン見出しは横スクロール。
- 歌詞クリップのドラッグを pointer イベント化。指は 1 回目のタップで選択、選択中のクリップだけドラッグ(`.clip.sel{touch-action:none}`)。
- `audio.play()` が拒否された時も映像だけ進める(`_silentClock`)。
- Cloudflare が CSS/JS を4時間キャッシュするため、index.html を返す時に `static_version()`(static/ の最新更新時刻)を
  `?v=` として CSS/JS の URL に付ける(compose の loader も同じ v を引き継ぐ)。index.html は `Cache-Control: no-cache`。

## 連携が切れたときの復帰(重要)

- `_loadAtelier()` は**成功時のみキャッシュ**する。失敗をキャッシュすると、後から
  VRM Atelierを起動しても一覧が空のままになり「アバターを選べない」が固定化する。
- `Stage3D.loadVRM/loadVMD` は**失敗時に vrmUrl/vmdUrl を巻き戻す**。保持したままだと
  `st.vrmUrl !== d.vrm_url` が成立せず二度と再読込されない(2.5秒バックオフで再試行)。
- 3Dダンスパネルに接続状態と「↻ 再読込」を表示する。

## in-flight

- なし(3Dダンスレイヤー Phase1 完了・E2E確認済み / 演出エンジン 609種(MG第3弾・Hallmark タイポ・パック含む、和のモチーフ23種は除外) 完了・スモーク/連続性テスト済み)

## 次にやること

- Phase 2: セクション連動カメラ/表情、3Dポストエフェクト(ブルーム/DoFを3D側にも)
- Phase 3: ダンスMVテンプレート、書き出しプリセット
- 演出エンジン: ブラウザ内 WebCodecs 書き出し、AE への構図の忠実再現、中国語/韓国語の役割フォント自動切替、曲頭タイトルカード・間奏カット
- 太い縁取り系の文字加工(sticker/doubleLine/extrude3d/cutout)は CPU 描画で 1080p 4〜7ms。書き出し時間が気になれば軽量化
