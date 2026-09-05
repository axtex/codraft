'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface JoinRoomModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Invite URLs look like `{origin}/join/{token}`. People also paste just the
 * path or the token, so accept all three rather than requiring a perfect URL.
 */
function parseInviteToken(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const fromPath = value.match(/\/join\/([^/?#\s]+)/i)
  if (fromPath?.[1]) return decodeURIComponent(fromPath[1])

  if (/^[a-z0-9_-]+$/i.test(value)) return value

  return null
}

export function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  function close() {
    setLink('')
    setError(null)
    onClose()
  }

  function handleJoin() {
    const token = parseInviteToken(link)
    if (!token) {
      setError('Paste a valid invite link')
      return
    }
    router.push(`/join/${token}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">Join a room</h2>
          <button
            type="button"
            onClick={close}
            className="-mr-1.5 -mt-1.5 rounded p-1.5 text-fg-subtle hover:bg-bg-surface hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label htmlFor="join-link" className="mt-4 block text-sm font-medium text-fg">
          Invite link
        </label>
        <input
          id="join-link"
          autoFocus
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleJoin()
          }}
          placeholder="https://codraft.app/join/…"
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-base outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="btn-primary"
            disabled={!link.trim()}
            onClick={handleJoin}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  )
}
