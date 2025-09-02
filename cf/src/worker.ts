import { Hono } from 'hono'
import { verifyEvent as verifyNostrEvent, getEventHash } from 'nostr-tools'
import { RelayDO } from './relay-do'

type Env = {
  RATE_KV: KVNamespace
  DB: D1Database
  RELAY_DO: DurableObjectNamespace
  RELAY_URLS: string
  SHRINE_PUBKEY_HEX?: string
  SHRINE_PRIVKEY_HEX?: string
}

const ALLOW_KINDS = new Set([1, 30011, 30023])

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => c.json({ ok: true }))

app.post('/ingest', async (c) => {
  let evt: any
  try {
    evt = await c.req.json()
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }

  if (!ALLOW_KINDS.has(evt?.kind)) return c.json({ error: 'kind_not_allowed' }, 400)
  if ((evt?.content ?? '').length > 2 * 1024) return c.json({ error: 'content_too_large' }, 413)
  if ((evt?.tags ?? []).length > 64) return c.json({ error: 'too_many_tags' }, 413)

  try {
    const id = getEventHash(evt)
    if (id !== evt.id) return c.json({ error: 'bad_id' }, 400)
    if (!verifyNostrEvent(evt)) return c.json({ error: 'bad_sig' }, 400)
  } catch {
    return c.json({ error: 'bad_event_format' }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs((evt.created_at ?? 0) - now) > 600) {
    return c.json({ error: 'bad_created_at' }, 400)
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO events (id, pubkey, kind, created_at) VALUES (?,?,?,?)`
    ).bind(evt.id, evt.pubkey, evt.kind, evt.created_at).run()
  } catch {
    return c.json({ error: 'duplicate' }, 409)
  }

  const bucketKey = `rate:${evt.pubkey}:${Math.floor(Date.now()/60000)}`
  const used = Number(await c.env.RATE_KV.get(bucketKey)) || 0
  if (used > 60) return c.json({ error: 'rate_limited' }, 429)
  await c.env.RATE_KV.put(bucketKey, String(used + 1), { expirationTtl: 90 })

  const relays = (c.env.RELAY_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const routerId = c.env.RELAY_DO.idFromName('shrine-router')
  const stub = c.env.RELAY_DO.get(routerId)
  await stub.fetch('https://do/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: evt, relays })
  })

  return c.json({ ok: true, id: evt.id })
})

export default app
export { RelayDO }  // DO クラスをエクスポート（wrangler.toml の class_name と一致）
