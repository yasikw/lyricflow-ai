# VPS 公開(https://lyricflow.aixr.tokyo.jp)

- 置き場所: コード `/opt/lyricflow`(root 所有・読むだけ)、データ `/var/lib/lyricflow`(ユーザー `lyricflow`)、設定 `/etc/lyricflow.env`(600)。
- サービス: `systemctl {status,restart} lyricflow` / ログ `journalctl -u lyricflow -f`。ポート 127.0.0.1:4189 → nginx。
- 更新(Mac から):
  ```
  rsync -az --delete --exclude data/ --exclude node_modules/ --exclude electron/ --exclude .env --exclude .git/ \
    --exclude __pycache__/ --exclude dev/ --exclude .claude/ --exclude .DS_Store --exclude package-lock.json \
    ./ ekyc-vps:/opt/lyricflow/ && ssh ekyc-vps 'chown -R root:root /opt/lyricflow && chmod -R a+rX /opt/lyricflow && systemctl restart lyricflow'
  ```
  `deploy/` の nginx/systemd を変えた時だけ VPS 側も手で更新する。
- 公開モード(env): 新規登録なし・デモアカウントなし・`X-Real-IP` でログイン失敗ロック。管理者のパスワードは `/etc/lyricflow.env` の `LF_ADMIN_PASSWORD`(DB 作成時だけ使う。以後はアカウント画面で変更)。
- DNS は Cloudflare(A `lyricflow` → 220.158.21.82, Proxied)。Cloudflare は約100秒で通信を切り、アップロードは 100MB まで。
- VPS では Whisper / Codex / VRM Atelier は無い → 歌詞同期は内蔵エンジン、AI 提案は Built-in。

## Mac のデータを移した記録(2026-10-15)

- Mac(アプリ版)の DB をスナップショット(sqlite backup)→ 所有ワークスペース「Demo Studio」だけ残し、テスト用アカウント・デモメンバー
  (hanako/kenji)・API キーを除外 → `demo@lyricflow.app` を `LF_ADMIN_EMAIL` に付け替え、パスワードは `/etc/lyricflow.env` の値で再設定。
- uploads/renders/bglib/atelier_cache を `frames_*` 抜きで rsync。移す前の VPS のデータは `/root/lyricflow-data-before-migrate-<日時>.tgz`。
- 以後 Mac と VPS は別々に進む(同期はしない)。もう一度移すなら同じ手順で VPS 側を置き換える(VPS 側の変更は消える)。
