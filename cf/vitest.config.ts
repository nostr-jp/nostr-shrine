import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    timeout: 10000,
    env: {
      NODE_ENV: 'test'
    },
    environmentOptions: {
      bindings: {
        SHRINE_PUBKEY_HEX: 'edd2671cfe9473a83a48eee5b77a399a9fbfde0644d31cffc04d23242fabdde0',
        SHRINE_PRIVKEY_HEX: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
        ALLOWED_KINDS: '1,30023'
      },
      kvNamespaces: ['RATE_KV']
    }
  }
})
