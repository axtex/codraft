import { Redis } from '@upstash/redis'

// Upstash Redis pub/sub wrapper.
//
// The installed `@upstash/redis` (1.38.0) is the REST-based client. Its
// `.publish()` is a fire-and-forget REST call and works fine. `.subscribe()`
// exists in this version's types too, but it works by opening a long-lived
// SSE connection *from this process* to Upstash — it is not the same
// battle-tested primitive as a raw Redis TCP connection (e.g. ioredis), and
// historically the REST-based SDK did not support subscriptions at all. For
// local single-instance dev this doesn't matter (there's only one server
// process, so cross-instance sync is a no-op by definition), so we wire it
// up but treat every failure as best-effort: log and continue rather than
// let a Redis hiccup take down real-time collaboration. If this is deployed
// as multiple WS server instances behind a load balancer and pub/sub proves
// unreliable over REST/SSE, swap to a Redis-protocol client (ioredis) or
// Upstash's dedicated Redis-protocol connection instead.

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

function channelFor(roomId: string, sectionId: string): string {
  return `section:${roomId}:${sectionId}`
}

export async function publishSectionUpdate(
  roomId: string,
  sectionId: string,
  update: Uint8Array
): Promise<void> {
  if (!redis) return
  try {
    // Encode as base64 — Yjs updates are binary and the REST transport is JSON.
    const payload = Buffer.from(update).toString('base64')
    await redis.publish(channelFor(roomId, sectionId), payload)
  } catch (err) {
    console.error('[redis-sync] publish failed (best-effort, ignoring):', err)
  }
}

export function subscribeToRoom(
  roomId: string,
  callback: (sectionId: string, update: Uint8Array) => void
): () => void {
  if (!redis) return () => {}

  try {
    // Pattern-subscribe to every section channel for this room.
    const subscriber = redis.psubscribe([`section:${roomId}:*`])

    subscriber.on('pmessage', ({ channel, message }) => {
      try {
        const sectionId = channel.split(':')[2]
        if (!sectionId) return
        const update = new Uint8Array(Buffer.from(message as string, 'base64'))
        callback(sectionId, update)
      } catch (err) {
        console.error('[redis-sync] failed to process pmessage (ignoring):', err)
      }
    })

    return () => {
      subscriber.unsubscribe().catch((err) => {
        console.error('[redis-sync] unsubscribe failed (ignoring):', err)
      })
    }
  } catch (err) {
    console.error('[redis-sync] subscribe failed, falling back to no-op:', err)
    return () => {}
  }
}
