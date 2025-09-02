import { generatePrivateKey, getPublicKey, finishEvent, verifyEvent } from 'nostr-tools'

export function createKeys() {
  const sk = generatePrivateKey()
  const pk = getPublicKey(sk)
  return { sk, pk }
}

export async function signEvent(evt: any, sk: string) {
  return finishEvent(evt, sk)
}

export function verify(evt: any) {
  return verifyEvent(evt)
}
