'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinPage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function join() {
      const res = await fetch(`/api/join/${params.token}`)
      if (cancelled) return

      if (res.status === 401) {
        const callbackUrl = encodeURIComponent(`/join/${params.token}`)
        router.replace(`/auth/signin?callbackUrl=${callbackUrl}`)
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Invite link is invalid')
        return
      }

      const data = await res.json()
      router.replace(`/room/${data.roomId}`)
    }

    join()
    return () => {
      cancelled = true
    }
  }, [params.token, router])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      {error ? (
        <>
          <div className="text-3xl">🚫</div>
          <p className="mt-4 text-sm font-medium text-fg">{error}</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="mt-4 text-sm text-fg-muted">Joining room...</p>
        </>
      )}
    </div>
  )
}
