# Nostr神社（方式A：Workers→リレー中継）スターター

Cloudflare Workers + Durable Objects + D1 + KV + Svelte（SPA）最小雛形です。
ユーザーが署名した Nostr イベントを Workers で検証して、Durable Object 経由で複数リレーへ中継します。

## 構成
- `cf/` … Cloudflare 側（Workers / Durable Object / D1 / KV）
- `apps/web/` … Svelte 簡易UI（参拝送信デモ）

## セットアップ（Cloudflare 側）
```bash
cd cf
npm i
# D1 スキーマ適用
wrangler d1 execute nostr_shrine --file=./schema.sql
# dev 実行（.dev.vars で環境変数を設定）
wrangler dev
# 本番デプロイ
wrangler deploy
```

### .dev.vars 例
```
RELAY_URLS="wss://relay1.example,wss://relay2.example"
```

> 公式再署名を使う場合は `SHRINE_PUBKEY_HEX` / `SHRINE_PRIVKEY_HEX` を設定してください（本番では NIP-46 などで分離推奨）。

## セットアップ（Svelte 側）
このスターターは最小のページファイルのみ含みます。既存の Vite + Svelte プロジェクトに `apps/web/src` を持ち込むか、適宜組み込んでください。

## ライセンス
MIT
