import { describe, it, expect } from 'vitest'
import { verifyEvent } from 'nostr-tools'
import app from './worker'
import { createMockEnv, createTestEvent, createWrapRequest, expectSuccessResponse } from './test-helpers'

describe('Integration Tests', () => {
  it('should complete full wrap workflow', async () => {
    const env = createMockEnv()
    
    // 1. ヘルスチェック
    const healthReq = new Request('http://localhost/health')
    const healthRes = await app.fetch(healthReq, env)
    expect(healthRes.status).toBe(200)
    
    // 2. 神社公開鍵取得
    const pubkeyReq = new Request('http://localhost/shrine/pubkey')
    const pubkeyRes = await app.fetch(pubkeyReq, env)
    expect(pubkeyRes.status).toBe(200)
    const pubkeyData = await pubkeyRes.json() as any
    expect(pubkeyData.pubkey).toBe(env.SHRINE_PUBKEY_HEX)
    
    // 3. イベントラッピング
    const testEvent = createTestEvent()
    const requestBody = createWrapRequest(testEvent, ['wss://relay.damus.io'])
    
    const wrapReq = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    const wrapRes = await app.fetch(wrapReq, env)
    expect(wrapRes.status).toBe(200)
    
    const wrapData = await wrapRes.json() as any
    expectSuccessResponse(wrapData)
    
    // 4. ラップされたイベントの検証
    const wrappedEvent = wrapData.wrapped_event
    expect(wrappedEvent.kind).toBe(1)
    expect(wrappedEvent.pubkey).toBe(env.SHRINE_PUBKEY_HEX)
    expect(wrappedEvent.content).toBe(JSON.stringify(testEvent))
    expect(wrappedEvent.tags).toEqual([])
    expect(wrappedEvent.created_at).toBeTypeOf('number')
    expect(wrappedEvent.id).toBeTypeOf('string')
    expect(wrappedEvent.sig).toBeTypeOf('string')
    
    // 5. 署名の検証
    expect(verifyEvent(wrappedEvent)).toBe(true)
  })

  it('should handle multiple events in sequence', async () => {
    const env = createMockEnv()
    
    const events = [
      createTestEvent({ content: 'First message' }),
      createTestEvent({ content: 'Second message' }),
      createTestEvent({ content: 'Third message' })
    ]
    
    const results = []
    
    for (const event of events) {
      const requestBody = createWrapRequest(event, [])
      
      const req = new Request('http://localhost/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      const res = await app.fetch(req, env)
      expect(res.status).toBe(200)
      
      const data = await res.json() as any
      expectSuccessResponse(data)
      results.push(data.wrapped_event)
    }
    
    // 全てのイベントが正しくラップされていることを確認
    expect(results).toHaveLength(3)
    results.forEach((wrappedEvent, index) => {
      expect(verifyEvent(wrappedEvent)).toBe(true)
      expect(wrappedEvent.pubkey).toBe(env.SHRINE_PUBKEY_HEX)
      
      const originalEvent = JSON.parse(wrappedEvent.content)
      expect(originalEvent.content).toBe(events[index].content)
    })
  })

  it('should handle different kinds correctly', async () => {
    const env = createMockEnv()
    
    // 許可されているkindのテスト
    const allowedKinds = [1, 30023]
    
    for (const kind of allowedKinds) {
      const testEvent = createTestEvent({ kind })
      const requestBody = createWrapRequest(testEvent, [])
      
      const req = new Request('http://localhost/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      const res = await app.fetch(req, env)
      expect(res.status).toBe(200)
      
      const data = await res.json() as any
      expectSuccessResponse(data)
      
      // 元のイベントのkindが保持されていることを確認
      const originalEvent = JSON.parse(data.wrapped_event.content)
      expect(originalEvent.kind).toBe(kind)
    }
  })

  it('should validate timestamp correctly', async () => {
    const env = createMockEnv()
    const now = Math.floor(Date.now() / 1000)
    
    // 境界値テスト
    const testCases = [
      { offset: -299, shouldPass: true, description: '4分59秒前' },
      { offset: -300, shouldPass: true, description: '5分前（境界値）' },
      { offset: -301, shouldPass: false, description: '5分1秒前' },
      { offset: 299, shouldPass: true, description: '4分59秒後' },
      { offset: 300, shouldPass: true, description: '5分後（境界値）' },
      { offset: 301, shouldPass: false, description: '5分1秒後' }
    ]
    
    for (const testCase of testCases) {
      const testEvent = createTestEvent({ created_at: now + testCase.offset })
      const requestBody = createWrapRequest(testEvent, [])
      
      const req = new Request('http://localhost/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      const res = await app.fetch(req, env)
      
      if (testCase.shouldPass) {
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expectSuccessResponse(data)
      } else {
        expect(res.status).toBe(400)
        const data = await res.json() as any
        expect(data.success).toBe(false)
        expect(data.code).toBe('TIME_LIMIT_EXCEEDED')
      }
    }
  })

  it('should validate relay URLs in integration workflow', async () => {
    const env = createMockEnv()
    
    // 無効なリレーURLでのテスト
    const testEvent = createTestEvent()
    const invalidRequestBody = createWrapRequest(testEvent, ['ws://invalid.relay.com', 'http://also.invalid.com'])
    
    const invalidReq = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidRequestBody)
    })
    
    const invalidRes = await app.fetch(invalidReq, env)
    expect(invalidRes.status).toBe(400)
    
    const invalidData = await invalidRes.json() as any
    expect(invalidData.success).toBe(false)
    expect(invalidData.code).toBe('INVALID_RELAY_URL')
    
    // 有効なリレーURLでのテスト
    const validRequestBody = createWrapRequest(testEvent, ['wss://relay.damus.io', 'wss://nos.lol'])
    
    const validReq = new Request('http://localhost/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRequestBody)
    })
    
    const validRes = await app.fetch(validReq, env)
    expect(validRes.status).toBe(200)
    
    const validData = await validRes.json() as any
    expectSuccessResponse(validData)
  })
})
