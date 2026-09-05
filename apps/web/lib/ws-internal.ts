/**
 * Notify the WebSocket server so live clients receive `section-updated`
 * without a page refresh. Best-effort: DB writes already succeeded.
 */
export async function notifySectionUpdated(payload: {
  roomId: string
  sectionId: string
  content: string
}): Promise<void> {
  const base = process.env.WS_SERVER_URL ?? process.env.NEXT_PUBLIC_WS_URL
  const secret = process.env.ADMIN_SECRET
  if (!base || !secret) {
    console.error('[ws-internal] WS_SERVER_URL/NEXT_PUBLIC_WS_URL or ADMIN_SECRET is missing')
    return
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/internal/section-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[ws-internal] section-update failed (${res.status}):`, text)
  }
}
