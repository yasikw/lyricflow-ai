# LyricFlow AI — 次世代AI動画クリエイティブSaaS (MVP)

企画書 `final_report.pdf` / 仕様書 `spec_final.pdf` に基づく、アニメ調MV向けリリックビデオメーカーのMVP実装。

## 起動

```bash
cd ~/manus/lyricflow-ai
python3 server.py        # http://localhost:4189
```

- 依存: Python 3 標準ライブラリのみ (DB=SQLite)。MP4書き出しに ffmpeg (無ければWebM出力のみ)。
- デモアカウント: **demo@lyricflow.app / demo1234**
- 初回起動時にデモ楽曲(オリジナル合成曲・約44秒)とサンプルプロジェクト「星空のメロディー」をシードします。
- データ初期化: `rm -rf data/` してから再起動。

## 実装済み機能 (仕様書対応)

| 仕様 | 実装 |
|---|---|
| 2.1 認証 | メール/パスワード + JWT (access 1h / refresh 30d, 自動リフレッシュ)。RBAC (Owner/Admin/Editor/Viewer) |
| 2.2 プロジェクト管理 | 作成/複製/削除、状態 (draft/rendering/exported)、バージョン履歴50件、30秒オートセーブ |
| 2.3 アセット | MP3/WAV/画像/動画/フォントのアップロード、ストレージ使用量メーター |
| 2.4.1 AI歌詞同期 | 非同期ジョブ。クライアントでRMSエンベロープ抽出→サーバーで歌唱区間検出+単語レベル割付 (Demucs/Whisper/MFA相当のヒューリスティック) |
| 2.4.2 シーン解析AI | エネルギー解析でIntro/Verse/Chorus/Bridge/Outroを検出、サビで演出自動ブースト+FXクリップ自動配置 |
| 2.4.3 アニメFXエンジン | Bloom / Glitch / 色収差 / パーティクル(桜・雪・雨・星・火の粉) / Wave歪み。Canvas 2Dリアルタイムレンダリング |
| 2.4.4 AI翻訳 | `DEEPL_API_KEY` 環境変数があればDeepL実呼び出し、無ければプレビュー翻訳 |
| 2.5 エディター | 4ペイン構成。5トラックタイムライン (Audio波形/Lyrics/BG/FX/Overlay)、単語クリップのドラッグ/リサイズ、ズーム、プレビュー品質切替 |
| 2.6 出力 | 16:9 / 9:16 / 1:1 / 4:5、720p/1080p、MP4 (ffmpeg変換・進捗表示) / WebM、SRT/LRC/VTT/ASS同時出力 |
| 2.7 B2B | テンプレートマーケットプレイス(8種)、ブランドキット、ホワイトラベルAPI (X-API-Key, /api/v1/external/*) |
| LRC/SRT読込 | エディター左ペイン「歌詞」タブからインポート |

## エクスポートの仕組み

プレビュー(Canvas)を `captureStream` + `MediaRecorder` でリアルタイムキャプチャ (曲の実時間かかります) → WebMをサーバーへ → ffmpegでMP4 (H.264+AAC) に変換。レンダリングジョブは進捗ポーリング (`GET /api/v1/render/{job_id}`)。

## ホワイトラベルAPI

```bash
curl -X POST http://localhost:4189/api/v1/external/generate-video \
  -H "X-API-Key: <チーム設定ページで発行>" -H "Content-Type: application/json" \
  -d '{"template_id":"tpl-neon-city","lyrics_text":"星が降り注ぐ夜に","duration":30}'
```

## 構成

```
server.py            # APIサーバー (stdlib only) + AIエンジン + ジョブワーカー + デモ曲合成
static/js/fx.js      # アニメ調FXエンジン (シーン/パーティクル/歌詞アニメ/ポストFX)
static/js/editor.js  # メインエディター (タイムライン/AIツール/エクスポート)
static/js/app.js     # SPA (認証/ダッシュボード/マーケット/チーム/API)
data/                # SQLite + アップロード + レンダリング出力 (gitignore対象)
```
