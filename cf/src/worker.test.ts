import { describe, it, expect } from 'vitest'
import app from './worker'
import { createMockEnv, createTestEvent } from './test-helpers'

describe('Health Check API', () => {
  it('should return health status', async () => {
    const env = createMockEnv()
    const req = new Request('http://localhost/health')
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.timestamp).toBeDefined()
  })
})

describe('Shrine Public Key API', () => {
  it('should return shrine public key when configured', async () => {
    const env = createMockEnv()
    const req = new Request('http://localhost/shrine/pubkey')
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.pubkey).toBe(env.SHRINE_PUBKEY_HEX)
  })

  it('should return error when shrine not configured', async () => {
    const env = { ...createMockEnv(), SHRINE_PUBKEY_HEX: undefined }
    const req = new Request('http://localhost/shrine/pubkey')
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('SHRINE_NOT_CONFIGURED')
  })
})

describe('Wrap API', () => {
  it('should wrap and sign valid event with relays', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: ['wss://relay.damus.io'],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.wrapped_event).toBeDefined()
    expect(data.wrapped_event.kind).toBe(1)
    expect(data.wrapped_event.pubkey).toBe(env.SHRINE_PUBKEY_HEX)
    expect(data.wrapped_event.content).toBe(JSON.stringify(testEvent))
    expect(data.relayed_to).toEqual([])  // WebSocket接続は実際には失敗するため空配列
  })

  it('should wrap and sign valid event without relays', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.wrapped_event).toBeDefined()
    expect(data.relayed_to).toEqual([])
  })

  it('should wrap and sign valid event with null relays', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: null,
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.wrapped_event).toBeDefined()
    expect(data.relayed_to).toEqual([])
  })

  it('should reject invalid JSON', async () => {
    const env = createMockEnv()
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json'
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_REQUEST')
  })

  it('should reject missing nostr_event field', async () => {
    const env = createMockEnv()
    
    const requestBody = {
      relays: ['wss://relay.damus.io']
      // nostr_event is missing
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_REQUEST')
    expect(data.error).toBe('Missing nostr_event field')
  })

  it('should reject event with invalid signature', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    // 署名を無効にする
    testEvent.sig = 'invalid_signature'
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_SIGNATURE')
  })

  it('should reject event with invalid ID', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    // IDを無効にする
    testEvent.id = 'invalid_id'
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_EVENT_ID')
  })

  it('should reject event with timestamp outside time window', async () => {
    const env = createMockEnv()
    
    // 10分前のタイムスタンプ（5分制限を超える）
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600
    const testEvent = createTestEvent({ created_at: oldTimestamp })
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('TIME_LIMIT_EXCEEDED')
  })

  it('should reject event with disallowed kind', async () => {
    const env = createMockEnv()
    
    // 許可されていないkind (2)
    const testEvent = createTestEvent({ kind: 2 })
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('KIND_NOT_ALLOWED')
  })

  it('should accept event with allowed kind', async () => {
    const env = createMockEnv()
    
    // 許可されているkind (30023)
    const testEvent = createTestEvent({ kind: 30023 })
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.wrapped_event.kind).toBe(1)  // ラップ後はkind 1
  })

  it('should return error when shrine not configured', async () => {
    const env = { 
      ...createMockEnv(), 
      SHRINE_PUBKEY_HEX: undefined,
      SHRINE_PRIVKEY_HEX: undefined
    }
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: [],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('SHRINE_NOT_CONFIGURED')
  })

  it('should reject invalid relay URLs (non-wss)', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: ['ws://relay.example.com', 'http://relay.example.com'],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_RELAY_URL')
    expect(data.error).toBe('Invalid relay URL. Only wss:// protocol is allowed')
  })

  it('should accept valid wss relay URLs', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: ['wss://relay.damus.io', 'wss://nos.lol'],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.wrapped_event).toBeDefined()
  })

  it('should reject non-string relay URLs', async () => {
    const env = createMockEnv()
    const testEvent = createTestEvent()
    
    const requestBody = {
      relays: [123, null, 'wss://valid.relay.com'],
      nostr_event: testEvent
    }
    
    const req = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.code).toBe('INVALID_RELAY_URL')
  })
})

describe('404 Handler', () => {
  it('should return 404 for unknown endpoints', async () => {
    const env = createMockEnv()
    const req = new Request('http://localhost/unknown')
    const res = await app.fetch(req, env)
    
    expect(res.status).toBe(404)
  })
})
