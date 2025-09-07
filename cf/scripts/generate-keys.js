#!/usr/bin/env node

import { generateSecretKey, getPublicKey } from 'nostr-tools'

console.log('🔑 Nostr神社の鍵ペアを生成中...\n')

const privateKeyBytes = generateSecretKey()
const privateKey = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('')
const publicKey = getPublicKey(privateKeyBytes)

console.log('生成された鍵ペア:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`公開鍵: ${publicKey}`)
console.log(`秘密鍵: ${privateKey}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('.dev.vars ファイルに追加する内容:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`SHRINE_PUBKEY_HEX="${publicKey}"`)
console.log(`SHRINE_PRIVKEY_HEX="${privateKey}"`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('⚠️  注意: 秘密鍵は絶対に他人に教えないでください！')
console.log('⚠️  本番環境では NIP-46 などの安全な鍵管理システムを使用してください。')
