# HANDOFF — LyricFlow AI

最終更新: 2026-08-24 (Claude Code)

## VRM Atelier連携(3Dダンスレイヤー)の契約 — 破壊的変更禁止

- `.env`: `LF_ATELIER_URL`(既定 http://127.0.0.1:4188) / `LF_ATELIER_KEY`(vak_...、VRM AtelierのEnterprise APIキー)
- 認証付きプロキシ: `GET /api/v1/atelier/status|avatars|motions`
- **未認証**ファイルプロキシ: `GET /api/v1/atelier/file?path=/files/(avatars|motions|thumbs)/<name>`
  (GLTFLoader等が認証ヘッダ無しで取得するため。パス許可制・キーはサーバー側付与)
- タイムライン: `timeline.dance = {enabled, vrm_url, vmd_url, vrm_name, vmd_name, offset, scale, x, y, camera, loop, speed}`
- アセットkind追加: `vrm→model3d` / `vmd→motion3d`(マジックバイト検証付き)
- `static/stage/` は **vrm-avatar-platform がマスター**。直接編集せず、
  `~/manus/vrm-avatar-platform/sync_stage.sh` で同期する(SYNC_VERSION参照)。
  stage3d.js のみ本リポ管理(LyricFlow固有ラッパー)。
- FXEngine: `_drawDance()`(subjectの直後に描画) / `prepareDance()`(書き出し前プリロード)。
  レイヤー順: 背景 → subject → **dance** → 歌詞。

## in-flight

- なし(3Dダンスレイヤー Phase1 完了・E2E確認済み)

## 次にやること

- Phase 2: セクション連動カメラ/表情、3Dポストエフェクト(ブルーム/DoFを3D側にも)
- Phase 3: ダンスMVテンプレート、書き出しプリセット
