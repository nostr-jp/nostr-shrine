import { Hono } from 'hono'
import { verifyEvent as verifyNostrEvent, getEventHash, finalizeEvent } from 'nostr-tools'

type Env = {
  RATE_KV: KVNamespace
  SHRINE_PUBKEY_HEX?: string
  SHRINE_PRIVKEY_HEX?: string
  ALLOWED_KINDS?: string
}

// リクエスト型定義
interface WrapRequest {
  relays?: string[] | null
  nostr_event: {
    kind: number
    content: string
    tags: string[][]
    pubkey: string
    created_at: number
    id: string
    sig: string
  }
}

// レスポンス型定義
interface WrapResponse {
  success: boolean
  wrapped_event?: any
  relayed_to?: string[]
  error?: string
  code?: string
}

// エラーコード定義
const ERROR_CODES = {
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  INVALID_EVENT_ID: 'INVALID_EVENT_ID',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  KIND_NOT_ALLOWED: 'KIND_NOT_ALLOWED',
  SHRINE_NOT_CONFIGURED: 'SHRINE_NOT_CONFIGURED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  WRAPPING_FAILED: 'WRAPPING_FAILED',
  RELAY_ERROR: 'RELAY_ERROR',
  INVALID_RELAY_URL: 'INVALID_RELAY_URL'
} as const

// OK・NGの条件チェック関数
function validateEvent(evt: any, env: Env): { ok: boolean; error?: string; code?: string } {
  // 1. 署名検証
  try {
    const id = getEventHash(evt)
    if (id !== evt.id) {
      return { ok: false, error: 'Invalid event ID', code: ERROR_CODES.INVALID_EVENT_ID }
    }
    if (!verifyNostrEvent(evt)) {
      return { ok: false, error: 'Invalid signature', code: ERROR_CODES.INVALID_SIGNATURE }
    }
  } catch {
    return { ok: false, error: 'Invalid signature', code: ERROR_CODES.INVALID_SIGNATURE }
  }

  // 2. Created_atの作成時間が前後5分以内
  const now = Math.floor(Date.now() / 1000)
  const timeDiff = Math.abs((evt.created_at ?? 0) - now)
  if (timeDiff > 300) { // 5分 = 300秒
    return { 
      ok: false, 
      error: 'Event timestamp is outside allowed time window (±5 minutes)', 
      code: ERROR_CODES.TIME_LIMIT_EXCEEDED 
    }
  }

  // 3. 環境変数で設定したkindsのみ
  if (env.ALLOWED_KINDS) {
    const allowedKinds = new Set(
      env.ALLOWED_KINDS.split(',').map(k => parseInt(k.trim(), 10))
    )
    if (!allowedKinds.has(evt.kind)) {
      return { 
        ok: false, 
        error: 'Event kind not allowed', 
        code: ERROR_CODES.KIND_NOT_ALLOWED 
      }
    }
  }

  return { ok: true }
}

// リレーURLの検証関数
function validateRelayUrls(relays: string[] | null | undefined): { ok: boolean; error?: string; code?: string } {
  if (!relays || relays.length === 0) {
    return { ok: true }
  }

  for (const relayUrl of relays) {
    if (typeof relayUrl !== 'string' || !relayUrl.startsWith('wss://')) {
      return {
        ok: false,
        error: 'Invalid relay URL. Only wss:// protocol is allowed',
        code: ERROR_CODES.INVALID_RELAY_URL
      }
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

// リレーに送信する関数
async function sendToRelays(event: any, relays: string[]): Promise<string[]> {
  if (!relays || relays.length === 0) {
    return []
  }

  // テスト環境では実際のWebSocket接続を行わない
  if (typeof globalThis.process !== 'undefined' && globalThis.process.env?.NODE_ENV === 'test') {
    return []
  }

  const results = await Promise.allSettled(
    relays.map(async (relayUrl) => {
      try {
        // WebSocketを使ってリレーに送信
        const ws = new WebSocket(relayUrl)
        
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close()
            reject(new Error('Connection timeout'))
          }, 3000) // タイムアウトを短縮

          ws.onopen = () => {
            ws.send(JSON.stringify(['EVENT', event]))
            clearTimeout(timeout)
            // 送信後すぐに成功とみなす（テスト用）
            ws.close()
            resolve()
          }

          ws.onerror = (error) => {
            clearTimeout(timeout)
            reject(error)
          }

          ws.onmessage = (message) => {
            try {
              const response = JSON.parse(message.data as string)
              if (response[0] === 'OK' && response[2] === true) {
                ws.close()
                resolve()
              } else {
                ws.close()
                reject(new Error(`Relay rejected: ${response[3] || 'unknown error'}`))
              }
            } catch {
              ws.close()
              reject(new Error('Invalid response from relay'))
            }
          }
        })
      } catch (error) {
        throw error
      }
    })
  )

  // 成功したリレーのURLを返す
  const successfulRelays: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulRelays.push(relays[index])
    }
  })

  return successfulRelays
}

const app = new Hono<{ Bindings: Env }>()

// ヘルスチェックエンドポイント
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

// 神社の公開鍵を取得するエンドポイント
app.get('/shrine/pubkey', (c) => {
  if (!c.env.SHRINE_PUBKEY_HEX) {
    return c.json({ 
      success: false,
      error: 'Shrine not configured',
      code: ERROR_CODES.SHRINE_NOT_CONFIGURED
    }, 500)
  }
  return c.json({ pubkey: c.env.SHRINE_PUBKEY_HEX })
})

// 受け取ったイベントをcontentにラップして神社が署名
app.post('/wrap', async (c) => {
  // 神社の設定確認
  if (!c.env.SHRINE_PRIVKEY_HEX || !c.env.SHRINE_PUBKEY_HEX) {
    return c.json({ 
      success: false,
      error: 'Shrine not configured',
      code: ERROR_CODES.SHRINE_NOT_CONFIGURED
    }, 500)
  }

  // リクエストボディの解析
  let requestData: WrapRequest
  try {
    requestData = await c.req.json()
  } catch {
    return c.json({ 
      success: false,
      error: 'Invalid JSON',
      code: ERROR_CODES.INVALID_REQUEST
    }, 400)
  }

  // リクエスト形式の検証
  if (!requestData.nostr_event) {
    return c.json({ 
      success: false,
      error: 'Missing nostr_event field',
      code: ERROR_CODES.INVALID_REQUEST
    }, 400)
  }

  // リレーURLの検証
  const relayValidation = validateRelayUrls(requestData.relays)
  if (!relayValidation.ok) {
    return c.json({ 
      success: false,
      error: relayValidation.error,
      code: relayValidation.code
    }, 400)
  }

  // Nostrイベントの検証
  const validation = validateEvent(requestData.nostr_event, c.env)
  if (!validation.ok) {
    return c.json({ 
      success: false,
      error: validation.error,
      code: validation.code
    }, 400)
  }

  try {
    // 受け取ったイベントをcontentにラップして署名
    const wrappedEvent = await wrapAndSignEvent(c.env, requestData.nostr_event)
    
    // 署名を検証
    if (!verifyNostrEvent(wrappedEvent)) {
      return c.json({ 
        success: false,
        error: 'Failed to sign wrapped event',
        code: ERROR_CODES.WRAPPING_FAILED
      }, 500)
    }

    // リレーに送信（クライアントが指定したリレーのみ）
    const relayedTo = await sendToRelays(wrappedEvent, requestData.relays || [])

    const response: WrapResponse = { 
      success: true, 
      wrapped_event: wrappedEvent,
      relayed_to: relayedTo
    }

    return c.json(response)
  } catch (error) {
    console.error('Wrapping error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to wrap and sign event',
      code: ERROR_CODES.WRAPPING_FAILED
    }, 500)
  }
})

export default app
