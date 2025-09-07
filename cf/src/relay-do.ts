export class RelayDO {
  state: DurableObjectState
  env: any
  sockets: Map<string, WebSocket> = new Map()

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request) {
    try {
      const url = new URL(req.url)
      if (req.method === 'POST' && url.pathname === '/send') {
        const { event, relays } = await req.json() as { event: any, relays: string[] }
        const results = await Promise.allSettled(
          relays.map((r: string) => this.sendToRelay(r, ['EVENT', event]))
        )
        const failures = results.filter((r: PromiseSettledResult<void>) => r.status === 'rejected').length
        return new Response(JSON.stringify({ 
          ok: true, 
          sent: relays.length - failures,
          failed: failures 
        }), { headers: { 'content-type': 'application/json' } })
      }
      if (req.method === 'POST' && url.pathname === '/send-official') {
        const { event, relays } = await req.json() as { event: any, relays: string[] }
        const results = await Promise.allSettled(
          relays.map((r: string) => this.sendToRelay(r, ['EVENT', event]))
        )
        const failures = results.filter((r: PromiseSettledResult<void>) => r.status === 'rejected').length
        return new Response(JSON.stringify({ 
          ok: true, 
          sent: relays.length - failures,
          failed: failures 
        }), { headers: { 'content-type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    } catch (error) {
      console.error('Relay DO error:', error)
      return new Response(JSON.stringify({ error: 'internal_error' }), { 
        status: 500,
        headers: { 'content-type': 'application/json' } 
      })
    }
  }

  private async sendToRelay(relayUrl: string, payload: any[]) {
    let ws = this.sockets.get(relayUrl)
    if (!ws || ws.readyState > 1) {
      try {
        const res = await fetch(relayUrl, { headers: { Upgrade: 'websocket' } })
        // @ts-ignore Cloudflare runtime
        const webSocket = res.webSocket as WebSocket
        if (!webSocket) throw new Error('WebSocket upgrade failed')
        webSocket.accept()
        
        // 接続状態の監視とクリーンアップ
        webSocket.addEventListener('close', () => {
          console.log(`WebSocket closed for ${relayUrl}`)
          this.sockets.delete(relayUrl)
        })
        webSocket.addEventListener('error', (error) => {
          console.error(`WebSocket error for ${relayUrl}:`, error)
          this.sockets.delete(relayUrl)
        })
        
        this.sockets.set(relayUrl, webSocket)
        ws = webSocket
        
        // 接続確認のため少し待機
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to connect to relay ${relayUrl}:`, error)
        throw error
      }
    }
    
    try {
      ws.send(JSON.stringify(payload))
      console.log(`Sent to ${relayUrl}:`, payload[0])
    } catch (error) {
      console.error(`Failed to send to ${relayUrl}:`, error)
      this.sockets.delete(relayUrl)
      throw error
    }
  }
}
