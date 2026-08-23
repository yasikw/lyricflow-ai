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
| 2.1 認証 | メール/パスワード + JWT (access 1h / refresh 30d, 自動リフレッシュ)。RBAC (Owner/Admin/Editor/Viewer)。**MFA (TOTP, RFC 6238)**。**ログイン試行制限 (5回失敗で15分ロック, 仕様8.3)** |
| 2.2 プロジェクト管理 | 作成/複製/削除、状態 (draft/rendering/exported/archived)、30秒オートセーブ。**バージョン履歴50件の閲覧＋任意版へのロールバックUI**、**アーカイブ/復元** |
| 2.3 アセット | MP3/WAV/画像/動画/フォントのアップロード、ストレージ使用量メーター。**マジックバイトによるMIME検証 (拡張子偽装を拒否, 仕様8.3)**、**プラン別1ファイルサイズ上限 (Free 100MB / Pro+ 500MB)** |
| 2.4.1 AI歌詞同期 | 非同期ジョブ。クライアントでRMSエンベロープ抽出→サーバーで歌唱区間検出+単語レベル割付 (Demucs/Whisper/MFA相当のヒューリスティック)。**言語自動判定つき** |
| 2.4.2 シーン解析AI | エネルギー解析でIntro/Verse/Chorus/Bridge/Outroを検出、サビで演出自動ブースト+FXクリップ自動配置 |
| 2.4.3 アニメFXエンジン | Bloom / Glitch / 色収差 / パーティクル(桜・雪・雨・星・火の粉) / Wave歪み。Canvas 2Dリアルタイムレンダリング |
| 2.4.4 AI翻訳 | エンジン選択制。**Codec(ローカル`codex exec`)** / DeepL(`DEEPL_API_KEY`) / プレビュー翻訳。**言語自動判定 + RTL(アラビア語/ヘブライ語)判定** |
| 2.4 演出提案 (AI Director) | 歌詞のムードから背景シーン・配色5色・パーティクル・エフェクト強度・歌詞アニメを提案し1クリック適用。**Codex** or Built-in(キーワードヒューリスティック) |
| AIエンジン | 翻訳・演出提案は **Built-in / Codex** を選択可 (エディターAIツール & アカウントpage)。Codexは `codex exec --output-schema` で構造化出力、read-onlyサンドボックス実行、失敗時はBuilt-inへ自動フォールバック。歌詞同期・シーン解析は音声解析必須のため常にBuilt-in |
| 2.5 エディター | 4ペイン構成。5トラックタイムライン (Audio波形/Lyrics/BG/FX/Overlay)、単語クリップのドラッグ/リサイズ、ズーム、プレビュー品質切替 |
| 2.6 出力 | 16:9 / 9:16 / 1:1 / 4:5、**720p/1080p/4K**、**MP4 (H.264) / WebM (VP9) / ProRes 422 / GIF** (ffmpeg変換・進捗表示)、SRT/LRC/VTT/ASS同時出力 |
| 2.7 B2B | テンプレートマーケットプレイス (**検索・ジャンル/価格/評価フィルタ・ソート**)、**プロジェクトからのテンプレート出品**、ブランドキット、ホワイトラベルAPI (X-API-Key, **プラン別レート制限**) |
| 9.1 課金/プラン | **Free/Pro/Team のプラン制限を強制** (プロジェクト数・月間エクスポート・月間AI同期・解像度上限・フォーマット・ストレージ・カスタムフォント・ブランドキット)、**Freeプランは透かし表示**。アカウントページでプラン切替 (本番はStripe想定) |
| マルチワークスペース | トップバーのワークスペース切替UI |
| LRC/SRT読込 | エディター左ペイン「歌詞」タブからインポート |

## エクスポートの仕組み

プレビュー(Canvas)を **60fps** の `captureStream` + `MediaRecorder` で**映像のみ**リアルタイムキャプチャ (曲の実時間かかります) → VP9をサーバーへ → ffmpegで**元音源(WAV)を直接ミックス**して各フォーマットに変換。音声はWebAudio再エンコードを経由しないため劣化ゼロ・完全同期。
- **MP4**: H.264 (`-crf 18 -tune animation` = アニメ調に最適) + AAC 256k
- **ProRes 422 HQ**: `.mov` (prores_ks profile 3) + PCM
- **WebM**: VP9を無変換コピー + Opus (音声のみ付与)
- **GIF**: palettegen (max 224色 + sierra2_4a ディザ)

レンダリングジョブは進捗ポーリング (`GET /api/v1/render/{job_id}`)。プラン別に解像度・フォーマット・月間回数を検証。

## 映像品質 (アニメ調FXエンジン)

`static/js/fx.js` の Canvas 2Dエンジンで以下を毎フレーム合成:
- **多段ブルーム**: フレーム縮小→自己乗算で明部抽出→2段ブラー加算 (発光感)
- **キネティック・タイポグラフィ**: 縦グラデ塗り(セカンダリ→白→アクセント) + 縁取り + 多層グロー + easeOutBack の行き過ぎ + 発声中のエネルギー脈動 + カラオケ下線
- **カメラドリフト (Ken Burns)**: 背景のゆっくりズーム/パン + サビでビート連動
- **カラーグレード + フィルムグレイン**: soft-light の映画的トーン + overlay グレイン
- サビ(Chorus)で全エフェクト強度が自動ブースト、パーティクル(桜/雪/雨/星/火の粉)は加算合成で発光

## プラン制限 (仕様 9.1)

| | Free | Pro | Team |
|---|---|---|---|
| プロジェクト | 5 | 無制限 | 無制限 |
| 月間エクスポート | 3 | 無制限 | 無制限 |
| 月間AI歌詞同期 | 3 | 無制限 | 無制限 |
| 最大解像度 | 720p | 4K | 4K |
| 透かし | あり | なし | なし |
| フォーマット | MP4 | +WebM/GIF | +ProRes |
| ストレージ | 1GB | 10GB | 100GB |
| ブランドキット | – | – | ○ |

デモの `demo@lyricflow.app` はTeamプラン。Freeの挙動は新規登録アカウント、またはアカウントページでプランを切り替えて確認できます。

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
