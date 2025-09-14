# Nostr神社 API仕様

Cloudflare Workers + KV を使用したNostr署名・ラッピングシステムのAPI仕様書です。

## 技術構成

- **バックエンド**: Cloudflare Workers + KV
- **フロントエンド**: Svelte（SPA）
- **機能**: イベントラッピング・署名・リレー中継

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

## API エンドポイント

### 基本エンドポイント
- `GET /health` - ヘルスチェック
- `GET /shrine/pubkey` - 神社の公開鍵取得

### イベント処理
- `POST /wrap` - 受け取ったイベントをラップして神社が署名し、指定リレーに中継

### 使用例
```bash
# ヘルスチェック
curl -X GET https://your-worker.your-subdomain.workers.dev/health

# 神社の公開鍵取得
curl -X GET https://your-worker.your-subdomain.workers.dev/shrine/pubkey

# イベントをラップして神社が署名・リレー中継
curl -X POST https://your-worker.your-subdomain.workers.dev/wrap \
  -H "Content-Type: application/json" \
  -d '{"kind": 1, "content": "神社への参拝記録", "tags": [], "pubkey": "user_pubkey", "created_at": 1705315800, "id": "event_id", "sig": "signature"}'
```

### `/wrap` エンドポイントの動作
1. **受信**: ユーザーが署名したNostrイベントを受け取り
2. **検証**: イベントの署名・ID・時間制限・kind制限をチェック
3. **ラッピング**: 受け取ったイベントをJSONでcontentに設定
4. **署名**: 神社の秘密鍵でラッピングしたイベントに署名
5. **中継**: 環境変数で指定されたリレーに神社署名済みイベントを送信
6. **レスポンス**: ラッピング済みイベントをJSONで返却

### レスポンス例
```json
{
  "success": true,
  "wrapped_event": {
    "kind": 1,
    "content": "{\"kind\":1,\"content\":\"神社への参拝記録\",\"tags\":[],\"pubkey\":\"user_pubkey\",\"created_at\":1705315800,\"id\":\"event_id\",\"sig\":\"signature\"}",
    "tags": [],
    "pubkey": "shrine_pubkey",
    "created_at": 1705315900,
    "id": "new_event_id",
    "sig": "shrine_signature"
  },
  "relayed_to": ["wss://relay.damus.io", "wss://nos.lol"]
}
```

## 技術仕様

### 署名システム
- **ライブラリ**: `nostr-tools` v2.7.0
- **署名関数**: `finalizeEvent` (秘密鍵はUint8Array形式)
- **検証関数**: `verifyEvent`, `getEventHash`
- **ラッピング**: 受け取ったイベントをJSONでcontentに設定してkind:1で署名

### 処理フロー
1. **署名検証**: イベントID・署名の検証
2. **時間制限**: created_atが現在時刻の前後5分以内
3. **kind制限**: 環境変数ALLOWED_KINDSで指定されたkindのみ
4. **ラッピング**: 条件を満たしたイベントをcontentにラップ
5. **神社署名**: 神社の秘密鍵で署名
6. **リレー中継**: 指定されたリレーに送信
7. **レスポンス**: ラッピング済みイベントを返却

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
```

**環境変数の説明:**
- `RELAY_URLS`: ラッピング済みイベントを中継するリレーのURL（カンマ区切り）
- `SHRINE_PUBKEY_HEX`: 神社の公開鍵（16進数）
- `SHRINE_PRIVKEY_HEX`: 神社の秘密鍵（16進数）
- `ALLOWED_KINDS`: 受け入れるイベントのkind（カンマ区切り）

> 本番環境では `SHRINE_PRIVKEY_HEX` を NIP-46 などで分離することを推奨します。

## セットアップ（Svelte 側）
このスターターは最小のページファイルのみ含みます。既存の Vite + Svelte プロジェクトに `apps/web/src` を持ち込むか、適宜組み込んでください。
