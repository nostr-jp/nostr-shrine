import { Hono } from 'hono'
import { verifyEvent as verifyNostrEvent, getEventHash, finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools'
import { RelayDO } from './relay-do'

type Env = {
  RATE_KV: KVNamespace
  RELAY_DO: DurableObjectNamespace
  RELAY_URLS: string
  SHRINE_PUBKEY_HEX?: string
  SHRINE_PRIVKEY_HEX?: string
  ALLOWED_KINDS?: string
  RELAY_NAME?: string
  RELAY_DESCRIPTION?: string
  RELAY_CONTACT?: string
}

// OK・NGの条件チェック関数
function validateEvent(evt: any, env: Env): { ok: boolean; error?: string } {
  // 1. 署名検証
  try {
    const id = getEventHash(evt)
    if (id !== evt.id) return { ok: false, error: 'bad_id' }
    if (!verifyNostrEvent(evt)) return { ok: false, error: 'bad_sig' }
  } catch {
    return { ok: false, error: 'bad_event_format' }
  }

  // 2. Created_atの作成時間が前後5分以内
  const now = Math.floor(Date.now() / 1000)
  const timeDiff = Math.abs((evt.created_at ?? 0) - now)
  if (timeDiff > 300) { // 5分 = 300秒
    return { ok: false, error: 'bad_created_at' }
  }

  // 3. 環境変数で設定したkindsのみ
  if (env.ALLOWED_KINDS) {
    const allowedKinds = new Set(
      env.ALLOWED_KINDS.split(',').map(k => parseInt(k.trim(), 10))
    )
    if (!allowedKinds.has(evt.kind)) {
      return { ok: false, error: 'kind_not_allowed' }
    }
  }

  return { ok: true }
}

// 受け取ったイベントをcontentに設定して神社が署名するヘルパー関数
async function wrapAndSignEvent(env: Env, originalEvent: any): Promise<any> {
  if (!env.SHRINE_PRIVKEY_HEX || !env.SHRINE_PUBKEY_HEX) {
    throw new Error('Shrine keys not configured')
  }

  // 受け取ったイベントをそのままcontentに設定
  const wrappedEvent = {
    kind: 1, // テキストノート
    content: JSON.stringify(originalEvent),
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: env.SHRINE_PUBKEY_HEX
  }

  const privateKeyBytes = new Uint8Array(
    env.SHRINE_PRIVKEY_HEX.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  )

  return finalizeEvent(wrappedEvent, privateKeyBytes)
}

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => c.json({ ok: true }))

// Nostrリレー情報エンドポイント（NIP-11）
app.get('/', (c) => {
  const acceptHeader = c.req.header('Accept')
  
  // Nostrクライアントからのリクエスト（application/nostr+json）
  if (acceptHeader?.includes('application/nostr+json')) {
    const relayInfo = {
      name: c.env.RELAY_NAME || 'Nostr神社リレー',
      description: c.env.RELAY_DESCRIPTION || 'Cloudflare Workers上で動作するNostr神社リレー',
      pubkey: c.env.SHRINE_PUBKEY_HEX || '',
      contact: c.env.RELAY_CONTACT || '',
      supported_nips: [1, 11],
      software: 'nostr-shrine',
      version: '1.0.0',
      limitation: {
        max_message_length: 16384,
        max_subscriptions: 20,
        max_filters: 100,
        max_limit: 5000,
        max_subid_length: 100,
        min_prefix: 4,
        max_event_tags: 100,
        max_content_length: 8196,
        min_pow_difficulty: 0,
        auth_required: false,
        payment_required: false
      }
    }
    
    return c.json(relayInfo, 200, {
      'Content-Type': 'application/nostr+json'
    })
  }
  
  // 通常のブラウザからのアクセス
  return c.html(`
    <html>
      <head><title>Nostr神社リレー</title></head>
      <body>
        <h1>Nostr神社リレー</h1>
        <p>Cloudflare Workers上で動作するNostrリレーです。</p>
        <p>WebSocketエンドポイント: <code>wss://${c.req.header('host') || 'your-domain'}</code></p>
        <p>神社公開鍵: <code>${c.env.SHRINE_PUBKEY_HEX || 'Not configured'}</code></p>
      </body>
    </html>
  `)
})

// 神社の公開鍵を取得するエンドポイント
app.get('/shrine/pubkey', (c) => {
  if (!c.env.SHRINE_PUBKEY_HEX) {
    return c.json({ error: 'shrine_not_configured' }, 503)
  }
  return c.json({ pubkey: c.env.SHRINE_PUBKEY_HEX })
})

// 受け取ったイベントをcontentにラップして神社が署名
app.post('/wrap', async (c) => {
  if (!c.env.SHRINE_PRIVKEY_HEX) {
    return c.json({ error: 'shrine_signing_not_configured' }, 503)
  }

  let receivedEvent: any
  try {
    receivedEvent = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }

  // OK・NGの条件チェック
  const validation = validateEvent(receivedEvent, c.env)
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400)
  }

  try {
    // 受け取ったイベントをcontentにラップして署名
    const wrappedEvent = await wrapAndSignEvent(c.env, receivedEvent)
    
    // 署名を検証
    if (!verifyNostrEvent(wrappedEvent)) {
      return c.json({ error: 'signing_failed' }, 500)
    }

    // リレーに送信
    const relays = (c.env.RELAY_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (relays.length > 0) {
      const routerId = c.env.RELAY_DO.idFromName('shrine-router')
      const stub = c.env.RELAY_DO.get(routerId)
      await stub.fetch('https://do/send-official', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: wrappedEvent, relays })
      })
    }

    return c.json({ 
      ok: true, 
      wrapped_event: wrappedEvent,
      original_event: receivedEvent
    })
  } catch (error) {
    console.error('Wrapping error:', error)
    return c.json({ error: 'wrapping_failed' }, 500)
  }
})

// 受け取ったイベントをそのまま中継（OK・NG条件適用）
app.post('/ingest', async (c) => {
  let evt: any
  try {
    evt = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }

  // OK・NGの条件チェック
  const validation = validateEvent(evt, c.env)
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400)
  }

  // リレーに中継
  const relays = (c.env.RELAY_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (relays.length > 0) {
    const routerId = c.env.RELAY_DO.idFromName('shrine-router')
    const stub = c.env.RELAY_DO.get(routerId)
    await stub.fetch('https://do/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: evt, relays })
    })
  }

  return c.json({ ok: true, id: evt.id })
})

// WebSocketハンドラー（Nostrリレーとして機能）
app.get('/ws', (c) => {
  const upgradeHeader = c.req.header('upgrade')
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected websocket', 426)
  }

  const webSocketPair = new WebSocketPair()
  const [client, server] = Object.values(webSocketPair)

  server.accept()

  server.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data as string)
      const [type, ...args] = message

      switch (type) {
        case 'EVENT':
          const [eventData] = args
          
          // OK・NGの条件チェック
          const validation = validateEvent(eventData, c.env)
          if (!validation.ok) {
            server.send(JSON.stringify(['NOTICE', `rejected: ${validation.error}`]))
            return
          }

          // イベントを受け入れ
          server.send(JSON.stringify(['OK', eventData.id, true, '']))
          
          // 外部リレーにも中継
          const relays = (c.env.RELAY_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
          if (relays.length > 0) {
            const routerId = c.env.RELAY_DO.idFromName('shrine-router')
            const stub = c.env.RELAY_DO.get(routerId)
            await stub.fetch('https://do/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ event: eventData, relays })
            })
          }
          break

        case 'REQ':
          // 簡易的なクエリ対応（実装は最小限）
          const [subId] = args
          server.send(JSON.stringify(['EOSE', subId]))
          break

        case 'CLOSE':
          // サブスクリプション終了
          break

        default:
          server.send(JSON.stringify(['NOTICE', 'unsupported message type']))
      }
    } catch (error) {
      server.send(JSON.stringify(['NOTICE', 'invalid message format']))
    }
  })

  server.addEventListener('close', () => {
    console.log('WebSocket connection closed')
  })

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
})

export default app
export { RelayDO }  // DO クラスをエクスポート（wrangler.toml の class_name と一致）
