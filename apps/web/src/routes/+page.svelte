<script lang=\"ts\">
  import { finishEvent, getPublicKey } from 'nostr-tools'

  let shrineId: string = 'shrineA'
  let userPrivkey: string = ''
  let relayResp: string = ''
  let visitId: string = crypto.randomUUID()

  async function submit() {
    try {
      const pubkey = getPublicKey(userPrivkey as any)
      const event: any = {
        kind: 30011,
        created_at: Math.floor(Date.now()/1000),
        tags: [
          ['L', shrineId],
          ['d', visitId],
          ['visited_at', new Date().toISOString()],
          ['method', 'qr']
        ],
        content: 'checked-in',
        pubkey
      }
      const signed = await finishEvent(event, userPrivkey as any)
      const res = await fetch('/ingest', {
        method: 'POST',
        body: JSON.stringify(signed),
        headers: { 'content-type': 'application/json' }
      })
      const data = await res.json()
      relayResp = JSON.stringify(data, null, 2)
    } catch (e) {
      relayResp = String(e)
    }
  }
</script>

<h1>Nostr神社 参拝</h1>
<label>Shrine ID <input bind:value={shrineId} /></label>
<label>Visit ID <input bind:value={visitId} /></label>
<label>Privkey (demo) <input bind:value={userPrivkey} /></label>
<button on:click={submit}>送信</button>

<pre>{relayResp}</pre>
