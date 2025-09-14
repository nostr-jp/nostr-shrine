import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'
import { expect } from 'vitest'

// テスト用の固定鍵ペア
const TEST_PRIVATE_KEY = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb'
const TEST_PRIVATE_KEY_BYTES = new Uint8Array(
  TEST_PRIVATE_KEY.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
)
const TEST_PUBLIC_KEY = getPublicKey(TEST_PRIVATE_KEY_BYTES)

// テスト用のモック環境を作成
export const createMockEnv = (overrides: any = {}) => ({
  RATE_KV: {
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve()
  } as any,
  SHRINE_PUBKEY_HEX: TEST_PUBLIC_KEY,
  SHRINE_PRIVKEY_HEX: TEST_PRIVATE_KEY,
  ALLOWED_KINDS: '1,30023',
  ...overrides
})

// テスト用のNostrイベントを生成
export const createTestEvent = (overrides: any = {}) => {
  const secretKey = generateSecretKey()
  const publicKey = getPublicKey(secretKey)
  
  const event = {
    kind: 1,
    content: 'Test message',
    tags: [],
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    ...overrides
  }
  
  return finalizeEvent(event, secretKey)
}

// テスト用のリクエストを作成
export const createWrapRequest = (nostrEvent: any, relays: string[] | null = []) => ({
  relays,
  nostr_event: nostrEvent
})

// APIレスポンスの型チェック用ヘルパー
export const expectSuccessResponse = (data: any) => {
  expect(data.success).toBe(true)
  expect(data.wrapped_event).toBeDefined()
  expect(data.relayed_to).toBeDefined()
}

export const expectErrorResponse = (data: any, expectedCode: string) => {
  expect(data.success).toBe(false)
  expect(data.error).toBeDefined()
  expect(data.code).toBe(expectedCode)
}

// リレーURL検証用のテストケース
export const createInvalidRelayUrls = () => [
  'ws://insecure.relay.com',
  'http://not.websocket.com',
  'https://also.not.websocket.com',
  'wss://valid.relay.com', // この1つだけ有効
  'ftp://totally.wrong.protocol.com'
]

export const createValidRelayUrls = () => [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social'
]
