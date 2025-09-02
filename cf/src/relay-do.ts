export class RelayDO {
  state: DurableObjectState
  env: any
  sockets: Map<string, WebSocket> = new Map()

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/send') {
      const { event, relays } = await req.json()
      await Promise.all(relays.map((r: string) => this.sendToRelay(r, ['EVENT', event])))
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    }
    if (req.method === 'POST' && url.pathname === '/send-official') {
      const { event, relays } = await req.json()
      await Promise.all(relays.map((r: string) => this.sendToRelay(r, ['EVENT', event])))
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('not found', { status: 404 })
  }

  private async sendToRelay(relayUrl: string, payload: any[]) {
    let ws = this.sockets.get(relayUrl)
    if (!ws || ws.readyState > 1) {
      const res = await fetch(relayUrl, { headers: { Upgrade: 'websocket' } })
      // @ts-ignore Cloudflare runtime
      const webSocket = res.webSocket as WebSocket
      if (!webSocket) throw new Error('WebSocket upgrade failed')
      webSocket.accept()
      webSocket.addEventListener('close', () => this.sockets.delete(relayUrl))
      webSocket.addEventListener('error', () => this.sockets.delete(relayUrl))
      this.sockets.set(relayUrl, webSocket)
      ws = webSocket
    }
    ws.send(JSON.stringify(payload))
  }
}
