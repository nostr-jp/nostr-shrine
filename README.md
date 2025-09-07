# Nostr神社（方式A：Workers→リレー中継）スターター

Cloudflare Workers + Durable Objects + KV + Svelte（SPA）を使用したNostr署名システムです。
ユーザーが署名した Nostr イベントを Workers で検証・中継し、神社による公式再署名機能も提供します。
**全てのデータはNostrイベントとして管理され、DBは使用しません。**

**本システムの特徴:**
- 🚀 **高性能**: Cloudflareのエッジネットワークで高速処理
- 🔒 **セキュア**: 入力検証、レート制限、適切なエラーハンドリング
- 📊 **スケーラブル**: KV、Durable Objectsによる自動スケーリング
- 🛠️ **型安全**: TypeScriptによる開発時型チェック
- 🌐 **分散対応**: 複数Nostrリレーへの自動中継
- 📝 **Nostrネイティブ**: 全データをNostrイベントとして管理（DBレス）

## 機能

- ✅ **署名検証**: 受け取ったNostrイベントの署名・ID検証
- ✅ **イベントラッピング**: 受け取ったイベントをcontentに設定して神社が署名
- ✅ **Nostrリレー**: Cloudflare自体がNostrリレーとして機能
- ✅ **リレー中継**: 複数の外部Nostrリレーへの自動中継
- ✅ **Accept/Reject条件**: 署名検証・時間制限・kind制限
- ✅ **環境変数設定**: リレー名・説明・連絡先を環境変数で設定可能

## Accept/Reject条件

### ✅ OK条件（全て満たす必要あり）
1. **署名検証**: イベントIDと署名が正しい
2. **時間制限**: `created_at`が現在時刻の前後5分以内
3. **kind制限**: 環境変数`ALLOWED_KINDS`で指定されたkindのみ

### ❌ NG条件（一つでも該当すればreject）
- 署名が無効
- イベントIDが不正
- 作成時刻が5分を超えて古い/新しい
- 許可されていないkind

## 構成
- `cf/` … Cloudflare 側（Workers / Durable Object / KV）
- `apps/web/` … Svelte 簡易UI（参拝送信デモ）

## セットアップ（Cloudflare 側）

### 1. 依存関係のインストール
```bash
cd cf
npm i
```

### 1.5. Cloudflareリソースの作成
```bash
# KVストレージの作成（レート制限・重複チェック用）
npx wrangler kv:namespace create "RATE_KV"
```
作成されたIDを `wrangler.toml` に設定してください。

**注意**: D1データベースは使用しません。全データはNostrイベントとして管理されます。

### 2. 神社の鍵ペア生成
```bash
npm run generate-keys
```
生成された鍵ペアを `.dev.vars` ファイルに設定してください。

### 3. セットアップ完了確認
```bash
# 設定ファイルの確認
cat wrangler.toml

# 環境変数ファイルの確認
cat .dev.vars
```

**注意**: データベースのセットアップは不要です。schema.sqlは参考情報のみです。

### 4. 開発サーバーの起動
```bash
# 型チェック（推奨）
npx tsc --noEmit

# 開発サーバー起動
npx wrangler dev
```

### 5. 本番デプロイ
```bash
# 型チェック
npx tsc --noEmit

# デプロイ
npx wrangler deploy
```

### .dev.vars 例
```
RELAY_URLS="wss://relay.damus.io,wss://nos.lol"
SHRINE_PUBKEY_HEX="your_shrine_public_key_here"
SHRINE_PRIVKEY_HEX="your_shrine_private_key_here"
ALLOWED_KINDS="1,30023"
RELAY_NAME="Nostr神社リレー"
RELAY_DESCRIPTION="Cloudflare Workers上で動作するNostr神社リレー"
RELAY_CONTACT="admin@example.com"
```

> 公式再署名を使う場合は `SHRINE_PUBKEY_HEX` / `SHRINE_PRIVKEY_HEX` を設定してください（本番では NIP-46 などで分離推奨）。

## API エンドポイント

### 基本エンドポイント
- `GET /` - リレー情報（NIP-11対応）
- `GET /health` - ヘルスチェック
- `GET /shrine/pubkey` - 神社の公開鍵取得

### Nostrリレー
- `GET /ws` - WebSocketエンドポイント（Nostrリレーとして機能）

### イベント処理
- `POST /ingest` - 受け取ったイベントの署名検証・リレー中継
- `POST /wrap` - 受け取ったイベントをcontentにラップして神社が署名

### 使用例
```bash
# リレー情報取得（NIP-11）
curl -H "Accept: application/nostr+json" https://your-worker.your-subdomain.workers.dev/

# ヘルスチェック
curl -X GET https://your-worker.your-subdomain.workers.dev/health

# 神社の公開鍵取得
curl -X GET https://your-worker.your-subdomain.workers.dev/shrine/pubkey

# Nostrクライアントでリレーに接続
# WebSocketエンドポイント: wss://your-worker.your-subdomain.workers.dev/ws

# イベントをcontentにラップして神社が署名
curl -X POST https://your-worker.your-subdomain.workers.dev/wrap \
  -H "Content-Type: application/json" \
  -d '{"kind": 1, "content": "神社への参拝記録", "tags": [], "pubkey": "user_pubkey", "created_at": 1705315800, "id": "event_id", "sig": "signature"}'

# 署名済みイベントをリレーに中継
curl -X POST https://your-worker.your-subdomain.workers.dev/ingest \
  -H "Content-Type: application/json" \
  -d '{"kind": 1, "content": "Hello Nostr", "tags": [], "pubkey": "user_pubkey", "created_at": 1705315800, "id": "event_id", "sig": "signature"}'
```

## 技術仕様

### 署名システム
- **ライブラリ**: `nostr-tools` v2.7.0
- **署名関数**: `finalizeEvent` (秘密鍵はUint8Array形式)
- **検証関数**: `verifyEvent`, `getEventHash`
- **ラッピング**: 受け取ったイベントをJSONでcontentに設定してkind:1で署名

### Accept/Reject条件
- **署名検証**: イベントID・署名の検証
- **時間制限**: created_atが現在時刻の前後5分以内
- **kind制限**: 環境変数ALLOWED_KINDSで指定されたkindのみ
- **リレー中継**: 条件を満たしたイベントのみリレーに送信

### イベントラッピング例
```json
// 元のイベント
{
  "kind": 1,
  "content": "Hello Nostr",
  "tags": [],
  "pubkey": "user_pubkey",
  "created_at": 1705315800,
  "id": "event_id",
  "sig": "signature"
}

// ラップ後（神社が署名）
{
  "kind": 1,
  "content": "{\"kind\":1,\"content\":\"Hello Nostr\",\"tags\":[],\"pubkey\":\"user_pubkey\",\"created_at\":1705315800,\"id\":\"event_id\",\"sig\":\"signature\"}",
  "tags": [],
  "pubkey": "shrine_pubkey",
  "created_at": 1705315900,
  "id": "new_event_id",
  "sig": "shrine_signature"
}
```

## セットアップ（Svelte 側）
このスターターは最小のページファイルのみ含みます。既存の Vite + Svelte プロジェクトに `apps/web/src` を持ち込むか、適宜組み込んでください。

## ライセンス
MIT
